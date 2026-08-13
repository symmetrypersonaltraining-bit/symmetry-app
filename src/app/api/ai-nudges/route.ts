// POST /api/ai-nudges   body: { send?: boolean }
//
// The re-engagement engine. Segments every active client from real data,
// writes one personal message per client who needs one, and sends Dustin a
// digest of anyone past the point where automated messages help.
//
// ── SAFETY: PREVIEW BY DEFAULT ────────────────────────────────────────────
// send defaults to FALSE. In preview mode it does everything except deliver to
// clients: it generates the copy, logs it to ai_nudge_log with sent=false, and
// still sends Dustin the digest so he can read exactly what WOULD have gone
// out. Nothing reaches a client until the caller passes send:true.
//
// ── THESE ARE SIGNED AS THE BOT, NOT AS DUSTIN (changed 13 Aug) ───────────
// This header used to say the messages "go out in Dustin's name" as though it
// were a safety property. It was the defect. Bobbie Page, reading one in her
// own thread: "Is this ai or Dustin chatting?"
//
// If a client cannot tell a message Dustin wrote from one a model wrote, then
// every message he actually writes loses its weight — and a client who works
// it out later does not just discount the nudge, they discount the last real
// one too. So every insert below carries sender_kind:'coachbot' and renders as
// Coach Bot. Do not remove it to make the nudges feel "more personal"; that
// trade is exactly backwards.
//
// ── GUARDRAILS (all enforced here, not left to the prompt) ────────────────
//  - one nudge per client per 48h, max 3 per rolling 7 days
//  - client kill switch: client_app_settings.nudges_enabled
//  - rehab / pain-relief clients only ever get the gentle tone
//  - thriving clients get nothing at all
//  - clients silent 10+ days are NOT messaged; they go to the trainer digest
//  - never mentions body weight, body fat or appearance (prompt + review)
//
// Auth: trainer-only, or a scheduled task using the service role via
// x-cron-secret. Never callable by a client.

import { NextRequest, NextResponse } from "next/server";
import { SONNET_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { Db, TRAINER_EMAIL, enforceMeter } from "@/lib/ai/scope";
import { isTrainerEmail, COACH_FIRST_NAME } from "@/lib/trainer";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cron-auth";
import {
  segment,
  isRehab,
  NUTRITION_HABIT_DAYS,
  NUTRITION_MAX_PER_LAPSE,
  type Row,
  type Tone,
  type Seg,
} from "./segment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

const SYSTEM = `You are the Symmetry app's coach assistant, writing a short re-engagement message to one of ${COACH_FIRST_NAME}'s clients inside the app. It arrives in their inbox clearly labelled as coming from the app, NOT from ${COACH_FIRST_NAME} — so never write as though you are him, never sign as him, and never say "I" about something only he would know or do. Refer to him in the third person, and hand anything that needs his judgement to him by name.

Respond with ONLY valid JSON, no markdown, no fences:
{"body": string}

HARD RULES:
- 1-3 sentences. Under 320 characters.
- ALWAYS lead with something genuinely true and positive from their data before any ask. Never open with criticism.
- Ground every claim in the numbers provided. NEVER invent a number.
- NEVER mention body weight, body fat, size or appearance. Behaviour only — logging, showing up, consistency.
- Never guilt-trip. Never shame. You are on their side.
- No emoji unless it clearly earns its place. At most one.
- Ask for the SMALLEST possible next step, not a big commitment.
- Sound like a person texting, not a marketing email.

BE USEFUL, NOT JUST ENCOURAGING (${COACH_FIRST_NAME}, 10 Aug: "be more helpful with tips
based on their real data and what they are actually using"):
- Where the data supports it, give ONE concrete, specific tip they could act on
  today — tied to what they are actually doing, not generic advice. A tip they
  could have got from any fitness article is wasted space.
- CONGRATULATE real wins by name and number: a streak, a return after a gap, a
  session count that beat last week. Say what they did, not "great job".
- Someone who has fallen off gets a way BACK IN, not a scolding. Name the
  smallest re-entry point — one meal logged, one session on the calendar.
- Use what they actually use. If they train hard and never touch the food
  logger, coach the training. Do not sell them a feature they have opted out of
  by behaviour.
- If the numbers do not support a specific tip, say less. A short honest
  message beats a padded one with invented advice.

ASK, DO NOT ONLY TELL:
- Where it fits naturally, end with ONE short question that invites a reply —
  whether the last change helped, what is actually getting in the way, where
  they want help next, what would keep them on track. One question, never a
  survey, and only when it does not make the message longer than it should be.
- The point of the question is to LEARN this specific client: what they
  respond to, what they ignore, what they are really trying to do. Their answer
  goes to ${COACH_FIRST_NAME}, so ask something whose answer he could act on.`;

function validate(raw: unknown): { body: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = (raw as { body?: unknown }).body;
  if (typeof b !== "string" || !b.trim()) return null;
  const t = b.trim();
  // Belt-and-braces: reject anything that slipped past the prompt rules.
  if (/\b(body fat|bodyfat|overweight|skinny|fat loss goal is failing|your weight)\b/i.test(t)) return null;
  return { body: t.slice(0, 400) };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { send?: boolean };
  // Two locks, both must be open. The caller has to ASK to send, and the
  // trainer-controlled master switch (Settings → Experience → Automation) has
  // to be on. Either one off means preview.
  let wantSend = body?.send === true;

  // ── auth: a scheduler invocation OR a signed-in trainer ──
  // This one was already correct (it failed closed on an unset secret); it now
  // shares the definition so there is one answer to "is this the scheduler?"
  // and it also recognises Vercel's own x-vercel-cron header.
  if (!isCronRequest(req)) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isTrainerEmail(user.email)) {
      return NextResponse.json({ error: "Trainer only" }, { status: 403 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  // Master switch. Absent or false => preview, whatever the caller asked for.
  if (wantSend) {
    try {
      const { data: flag } = await admin.from("app_flags").select("enabled").eq("key", "nudges_live").maybeSingle();
      if ((flag as { enabled: boolean } | null)?.enabled !== true) wantSend = false;
    } catch {
      wantSend = false;
    }
  }

  // Kill switch. This was the ONLY route in the app that never checked it at
  // all — a weekly sweep across the whole roster, unattended, able to spend
  // after every client-facing feature had already paused. No per-client cap:
  // the sweep decides for itself who gets a message and how often.
  const paused = await enforceMeter(null, "nudge_sweep");
  if (paused) return paused;

  const today = CT_TODAY();
  const since30 = shiftDays(today, -29);
  const since7 = shiftDays(today, -6);

  try {
    const [clientsRes, wlRes, mealRes, settingsRes, recentRes] = await Promise.all([
      // Test accounts are excluded outright. A dry run of the segmentation on
      // 11 Aug had "Test Client" queued for a real message in ${COACH_FIRST_NAME}'s name.
      admin.from("clients").select("id, name, primary_goal, auth_user_id").not("auth_user_id", "is", null).is("archived_at", null).not("name", "ilike", "%test%"),
      admin.from("workout_logs").select("client_id, log_date").eq("completed", true).gte("log_date", since30),
      admin.from("meal_adherence_logs").select("client_id, log_date").gte("log_date", since30),
      admin.from("client_app_settings").select("client_id, nudges_enabled"),
      // 60 days, with the segment: the weekly cap needs 7 days, but the
      // nutrition per-lapse cap counts back to the client's last meal log,
      // which can be well outside a week.
      admin.from("ai_nudge_log").select("client_id, created_at, sent, segment").gte("created_at", shiftDays(today, -59)),
    ]);

    const clients = (clientsRes.data as { id: string; name: string | null; primary_goal: string | null; auth_user_id: string }[]) || [];
    const nudgesOff = new Set(
      ((settingsRes.data as { client_id: string; nudges_enabled: boolean }[]) || [])
        .filter((s) => s.nudges_enabled === false)
        .map((s) => s.client_id),
    );

    // Frequency caps come from what we actually SENT, not previews.
    const allSent = ((recentRes.data as { client_id: string; created_at: string; sent: boolean; segment: string | null }[]) || []).filter((r) => r.sent);
    const weekAgoIso = shiftDays(today, -6);
    const lastSent = new Map<string, string>();
    const weekCount = new Map<string, number>();
    for (const r of allSent) {
      if (r.created_at.slice(0, 10) >= weekAgoIso) {
        weekCount.set(r.client_id, (weekCount.get(r.client_id) ?? 0) + 1);
      }
      const prev = lastSent.get(r.client_id);
      if (!prev || r.created_at > prev) lastSent.set(r.client_id, r.created_at);
    }

    const woDates = new Map<string, string[]>();
    for (const r of ((wlRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!woDates.has(r.client_id)) woDates.set(r.client_id, []);
      woDates.get(r.client_id)!.push(r.log_date);
    }
    const mealDates = new Map<string, string[]>();
    for (const r of ((mealRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!mealDates.has(r.client_id)) mealDates.set(r.client_id, []);
      mealDates.get(r.client_id)!.push(r.log_date);
    }
    const lastMealDate = new Map<string, string>();
    for (const [cid, ds] of mealDates) {
      const last = ds.slice().sort().at(-1);
      if (last) lastMealDate.set(cid, last);
    }
    // Nutrition nudges already sent during the CURRENT lapse, i.e. since the
    // client last logged a meal. Logging again empties this by definition.
    const nutritionSentThisLapse = new Map<string, number>();
    for (const r of allSent) {
      if (r.segment !== "nutrition_gap") continue;
      const lastMeal = lastMealDate.get(r.client_id);
      if (lastMeal && r.created_at.slice(0, 10) < lastMeal) continue;
      nutritionSentThisLapse.set(r.client_id, (nutritionSentThisLapse.get(r.client_id) ?? 0) + 1);
    }

    const rows: Row[] = clients.map((c) => {
      const w = woDates.get(c.id) || [];
      const m = mealDates.get(c.id) || [];
      const lastW = w.length ? w.slice().sort().at(-1)! : null;
      const lastM = m.length ? m.slice().sort().at(-1)! : null;
      return {
        id: c.id,
        name: c.name,
        goal: c.primary_goal,
        w7: new Set(w.filter((d) => d >= since7)).size,
        w30: new Set(w).size,
        daysSinceWorkout: lastW ? daysBetween(lastW, today) : null,
        mealDays7: new Set(m.filter((d) => d >= since7)).size,
        mealDays30: new Set(m).size,
        daysSinceMeal: lastM ? daysBetween(lastM, today) : null,
        everTrained: w.length > 0,
        everLoggedMeal: m.length > 0,
      };
    });

    // Trainer auth id — needed as the message sender.
    const { data: tr } = await admin
      .from("clients")
      .select("auth_user_id")
      .eq("email", TRAINER_EMAIL)
      .not("auth_user_id", "is", null)
      .limit(1)
      .maybeSingle();
    const trainerAuth = (tr as { auth_user_id: string } | null)?.auth_user_id ?? null;

    const previews: { name: string; segment: string; tone: string; body: string; sent: boolean }[] = [];
    const escalations: string[] = [];
    let skipped = 0;

    for (const r of rows) {
      const { seg, tone } = segment(r);
      const first = (r.name || "").split(" ")[0] || "there";

      if (seg === "thriving") continue;

      // Escalation: stop messaging, tell ${COACH_FIRST_NAME} a human should step in.
      if (seg === "escalate") {
        escalations.push(
          `${r.name} — ${r.daysSinceWorkout ?? "?"} days since training, ${r.w30} sessions in 30d${
            r.everLoggedMeal ? "" : ", never logged nutrition"
          }`,
        );
        await admin.from("ai_nudge_log").insert({
          client_id: r.id, segment: seg, tone, body: null, sent: false, suppressed: "escalated_to_trainer",
        });
        continue;
      }

      // Guardrails
      let suppressed: string | null = null;
      if (nudgesOff.has(r.id)) suppressed = "client_opted_out";
      else if (seg === "nutrition_gap" && (nutritionSentThisLapse.get(r.id) ?? 0) >= NUTRITION_MAX_PER_LAPSE)
        suppressed = "nutrition_lapse_cap";
      else if ((weekCount.get(r.id) ?? 0) >= 3) suppressed = "weekly_cap";
      else {
        const last = lastSent.get(r.id);
        if (last && Date.now() - Date.parse(last) < 48 * 3600 * 1000) suppressed = "cooldown_48h";
      }
      if (suppressed) {
        skipped++;
        await admin.from("ai_nudge_log").insert({ client_id: r.id, segment: seg, tone, sent: false, suppressed });
        continue;
      }

      if (!process.env.ANTHROPIC_API_KEY) break;

      const facts = {
        firstName: first,
        goal: r.goal,
        sessionsLast7Days: r.w7,
        sessionsLast30Days: r.w30,
        daysSinceLastWorkout: r.daysSinceWorkout,
        daysWithMealsLoggedLast7: r.mealDays7,
        daysWithMealsLoggedLast30: r.mealDays30,
        daysSinceLastMealLog: r.daysSinceMeal,
        hasNeverLoggedNutrition: !r.everLoggedMeal,
        hasNeverTrained: !r.everTrained,
        // What they actually engage with, so the message coaches THAT and
        // stops pushing a part of the app they have never chosen to use.
        usesNutritionLogging: r.mealDays30 >= NUTRITION_HABIT_DAYS,
        trainingIsTheirStrength: r.w30 >= 8,
        sessionsThisWeekVsAverage:
          r.w30 > 0 ? Number((r.w7 - r.w30 / 4.3).toFixed(1)) : null,
        situation: seg,
        requestedTone: tone,
        isRehabClient: isRehab(r.goal),
      };

      let text: string | null = null;
      try {
        const { value, tokensIn, tokensOut } = await callClaudeJson<{ body: string }>({
          meter: { clientId: r.id, feature: "nudge_sweep" },
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: SONNET_MODEL,
          system: SYSTEM,
          maxTokens: 220,
          messages: [{ role: "user", content: `CLIENT FACTS:\n${JSON.stringify(facts)}\n\nWrite the message as strict JSON.` }],
          validate,
        });
        // This route writes messages to clients and never logged a token, so
        // its spend did not count toward the $95 ceiling. It runs per client
        // per sweep, which is exactly the shape that adds up unnoticed.
        await logUsage(r.id, "nudge_sweep", tokensIn, tokensOut, SONNET_MODEL);
        text = value?.body ?? null;
      } catch {
        text = null;
      }
      if (!text) continue;

      let didSend = false;
      if (wantSend && trainerAuth) {
        const c = clients.find((x) => x.id === r.id);
        if (c?.auth_user_id) {
          const { error } = await admin.from("messages").insert({
            from_id: trainerAuth,
            to_id: c.auth_user_id,
            client_id: r.id,
            is_group: false,
            // MARKED AS THE BOT. Bobbie Page, 13 Aug, replying in her own
            // thread: "Is this ai or Dustin chatting?"
            //
            // She was right to ask, and that she had to is the bug. The header
            // of this file used to say these "go out in Dustin's name" as
            // though it were a safety note; it was the defect. A client cannot
            // tell a written-by-Dustin message from a generated one, so every
            // message he actually writes loses its weight — and a client who
            // works out later that the warm personal check-in was automatic
            // does not just distrust the nudge, they distrust the last real
            // one too.
            //
            // sender_kind takes precedence over from_id in MessagesClient, so
            // this alone makes it render as Coach Bot with the AI face.
            sender_kind: "coachbot",
            body: text,
          });
          didSend = !error;
        }
      }

      await admin.from("ai_nudge_log").insert({
        client_id: r.id, segment: seg, tone, body: text, sent: didSend,
        suppressed: didSend ? null : wantSend ? "send_failed" : "preview_mode",
      });
      previews.push({ name: r.name || "?", segment: seg, tone, body: text, sent: didSend });
    }

    // ── digest to ${COACH_FIRST_NAME} ──
    if (trainerAuth) {
      const lines: string[] = [
        wantSend ? "🤖 Nudges sent tonight:" : "🤖 Nudge PREVIEW (nothing was sent to clients):",
        ...previews.map((p) => `• ${p.name} [${p.segment}/${p.tone}] — "${p.body}"`),
      ];
      if (escalations.length) {
        lines.push("", "⚑ Gone quiet past the point automated messages help — worth a personal text:");
        lines.push(...escalations.map((e) => `• ${e}`));
      }
      if (!previews.length && !escalations.length) lines.push("• Nobody needs a nudge tonight. Roster's healthy.");
      if (skipped) lines.push("", `(${skipped} held back by cooldown / weekly cap / opt-out)`);

      await admin.from("messages").insert({
        from_id: trainerAuth,
        to_id: trainerAuth,
        client_id: null,
        is_group: false,
        // The digest is the app talking to Dustin about itself. Same rule.
        sender_kind: "coachbot",
        body: lines.join("\n").slice(0, 4000),
      });
    }

    return NextResponse.json({
      mode: wantSend ? "sent" : "preview",
      considered: rows.length,
      generated: previews.length,
      escalated: escalations.length,
      suppressed: skipped,
      previews,
    });
  } catch (e) {
    return NextResponse.json({ error: "Nudge run failed", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

/**
 * The scheduled entry point.
 *
 * vercel.json has scheduled this route since it was written — Mondays at 15:00
 * UTC — and it has NEVER ONCE RUN. Vercel Cron issues a GET; this route
 * exported only POST, so Next answered 405 before a line of it executed. Every
 * other cron route in the app exports both verbs; this one was the exception
 * and nothing surfaced it, because a job that never runs and a job with nothing
 * to do look identical from the outside.
 *
 * A GET carries no body, so `send` is absent, so it is a PREVIEW run: it
 * segments the roster, writes the drafts to ai_nudge_log with sent=false, and
 * digests them to the trainer. Nothing reaches a client. That is the correct
 * default for a job whose first-ever execution is happening unattended — and
 * `nudges_live` still has to be on before send:true means anything at all.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
