// POST /api/ai-nudges
//
// The re-engagement engine: segments every active client from real data, drafts
// what would be worth saying to each of them, and gives Dustin the list.
//
// ── IT DOES NOT MESSAGE CLIENTS. AT ALL. ──────────────────────────────────
// Dustin, 13 Aug: "go ahead and kill client dm from ai path completely. keep
// engine."
//
// The engine stays because the segmentation is genuinely good — it is right
// about who is slipping, and that is the hard part. The DELIVERY is gone, by
// deletion rather than by a flag, because a flag is a thing somebody flips back
// on a quiet evening without re-reading why it was off.
//
// It went for two reasons, and the second is the one that settled it:
//
//   1. It was signed as Dustin. Bobbie Page, reading one in her own thread with
//      him: "Is this ai or Dustin chatting?" Labelling it as the bot fixed the
//      honesty and left the rest untouched.
//
//   2. It is the wrong CHANNEL. A DM arrives uninvited, lands in the same
//      thread as his real coaching, and — once it is honestly labelled a bot —
//      amounts to software texting somebody to point out they have not logged.
//      Every other AI surface in this app talks to a person who has already
//      opened it: the coach on each screen, the go-quiet check-in, the weigh-in
//      nudge, the cards on Home, Nutrition and Progress. Those arrive when
//      somebody is receptive. A push into a private thread does the opposite,
//      and spends his credibility doing it.
//
// So the copy is still written, still logged to ai_nudge_log, and still reaches
// HIM in the digest — where he can send it in his own words if he wants to,
// which was always the version worth having.
//
// ── GUARDRAILS (kept; they shape what the digest recommends) ──────────────
//  - one per client per 48h, max 3 per rolling 7 days
//  - client kill switch: client_app_settings.nudges_enabled
//  - rehab / pain-relief clients only ever get the gentle tone
//  - thriving clients get nothing at all
//  - clients silent 10+ days are flagged for a personal text, not a draft
//  - never mentions body weight, body fat or appearance (prompt + review)
//
// Auth: trainer-only, or a scheduled task. Never callable by a client.

import { NextRequest, NextResponse } from "next/server";
import { modelFor, callClaudeJson } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import { logUsage } from "@/lib/ai/meter";
import { Db, enforceMeter } from "@/lib/ai/scope";
import { ownerAuthUid } from "@/lib/trainerResolve";
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
  // There is no `send` parameter any more, and that is the point. This route
  // cannot deliver to a client whatever it is passed — see the note above the
  // (deleted) insert below. A caller still passing { send: true } gets a
  // digest, silently and correctly.

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

    // Who the nightly digest is addressed to (from_id = to_id, so it is a
    // private note to that account and RLS shows it to nobody else).
    //
    // This used to find the trainer by looking up TRAINER_EMAIL in the CLIENTS
    // table, which works only because Dustin also trains himself. It reads the
    // trainers table now. The OWNER is deliberate: the digest covers the whole
    // roster, and splitting it per trainer is a decision for Dustin, not a
    // default to slide in — noted in the backlog.
    const trainerAuth = await ownerAuthUid(admin);

    const previews: { name: string; segment: string; tone: string; body: string; sent: boolean }[] = [];

    // Ledger rows that did not land. Surfaced in the digest rather than
    // swallowed: a missing row is a guardrail that will not hold next run.
    const ledgerErrors: string[] = [];
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
        // ai_nudge_log IS the guardrail state — "one per client per 48h, max 3
        // per rolling 7 days" is computed by reading this table back. A silent
        // insert failure does not lose a log line, it defeats a stated rule:
        // the same client comes round again on the next run as though nothing
        // had happened.
        const { error: escErr } = await admin.from("ai_nudge_log").insert({
          client_id: r.id, segment: seg, tone, body: null, sent: false, suppressed: "escalated_to_trainer",
        });
        if (escErr) { ledgerErrors.push(`${r.name || r.id}: ${escErr.message}`); }
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
        const { error: supErr } = await admin
          .from("ai_nudge_log")
          .insert({ client_id: r.id, segment: seg, tone, sent: false, suppressed });
        if (supErr) { ledgerErrors.push(`${r.name || r.id}: ${supErr.message}`); }
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
          model: modelFor("coach", await aiTierFor(admin, r.id)),
          system: SYSTEM,
          maxTokens: 220,
          messages: [{ role: "user", content: `CLIENT FACTS:\n${JSON.stringify(facts)}\n\nWrite the message as strict JSON.` }],
          validate,
        });
        // This route writes messages to clients and never logged a token, so
        // its spend did not count toward the $95 ceiling. It runs per client
        // per sweep, which is exactly the shape that adds up unnoticed.
        await logUsage(r.id, "nudge_sweep", tokensIn, tokensOut, modelFor("coach", await aiTierFor(admin, r.id)));
        text = value?.body ?? null;
      } catch {
        text = null;
      }
      if (!text) continue;

      // ── NOTHING IS SENT TO A CLIENT FROM HERE. EVER. ───────────────────
      //
      // Dustin, 13 Aug: "go ahead and kill client dm from ai path completely.
      // keep engine."
      //
      // The engine is genuinely good — the segmentation is right about who is
      // slipping, and it stays. What is gone is the delivery, and it is gone by
      // DELETION rather than by a flag, because a flag is a thing someone flips
      // back on a quiet evening without re-reading why it was off.
      //
      // Two reasons it had to go, and the second is the one that killed it:
      //
      //   1. It was signed as Dustin. Bobbie Page, reading one: "Is this ai or
      //      Dustin chatting?" Marking it as the bot fixed the honesty, but
      //      left the second problem untouched.
      //
      //   2. It is the wrong channel. A DM arrives uninvited, sits in the same
      //      thread as his real coaching, and — once it is honestly labelled as
      //      a bot — amounts to software texting somebody to say they have not
      //      logged. Every other AI surface in this app speaks to a person who
      //      has already opened it: the coach on each screen, the go-quiet
      //      check-in, the weigh-in nudge, the cards on Home, Nutrition and
      //      Progress. Those reach people at the moment they are receptive. A
      //      push into a private thread does the opposite and spends his
      //      credibility to do it.
      //
      // So the copy is still written, still logged to ai_nudge_log, and still
      // reaches HIM in the digest below — where he can send it in his own words
      // if he wants to, which was always the version worth having.
      const didSend = false;

      const { error: logErr } = await admin.from("ai_nudge_log").insert({
        client_id: r.id, segment: seg, tone, body: text, sent: didSend,
        suppressed: "digest_only",
      });
      // The cooldown for THIS client. Unrecorded, they are eligible again in
      // 24 hours instead of 48 and the weekly cap undercounts them.
      if (logErr) { ledgerErrors.push(`${r.name || r.id}: ${logErr.message}`); }
      previews.push({ name: r.name || "?", segment: seg, tone, body: text, sent: didSend });
    }

    // ── digest to ${COACH_FIRST_NAME} ──
    if (trainerAuth) {
      const lines: string[] = [
        "Who's drifting — nothing was sent to anyone:",
        ...previews.map((p) => `• ${p.name} [${p.segment}/${p.tone}] — "${p.body}"`),
      ];
      if (escalations.length) {
        lines.push("", "⚑ Gone quiet past the point automated messages help — worth a personal text:");
        lines.push(...escalations.map((e) => `• ${e}`));
      }
      if (!previews.length && !escalations.length) lines.push("• Nobody needs a nudge tonight. Roster's healthy.");
      if (skipped) lines.push("", `(${skipped} held back by cooldown / weekly cap / opt-out)`);

      if (ledgerErrors.length) {
        lines.push("", `⚠ ${ledgerErrors.length} nudge-log rows could not be written, so their cooldowns are not recorded:`);
        lines.push(...ledgerErrors.slice(0, 10).map((e) => `• ${e}`));
      }

      // The digest IS the output of this run. Unchecked, a failed insert left
      // the response reporting `generated: N` to a caller nobody reads while
      // the one person it was written for was told nothing at all.
      const { error: digestErr } = await admin.from("messages").insert({
        from_id: trainerAuth,
        to_id: trainerAuth,
        client_id: null,
        is_group: false,
        // The digest is the app talking to Dustin about itself. Same rule.
        sender_kind: "coachbot",
        body: lines.join("\n").slice(0, 4000),
      });
      if (digestErr) {
        return NextResponse.json(
          { error: "Nudges were computed but the digest could not be delivered", detail: digestErr.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      mode: "digest_only",
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
