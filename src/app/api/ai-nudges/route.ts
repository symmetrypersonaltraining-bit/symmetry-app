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
// out. Nothing reaches a client until the caller passes send:true. This is
// deliberate — these messages go out in Dustin's name.
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
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { Db, TRAINER_EMAIL } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

const SYSTEM = `You write short re-engagement messages from Dustin, a personal trainer, to his client inside the Symmetry app. They arrive in the client's message inbox and look like Dustin wrote them.

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
- Sound like a person texting, not a marketing email.`;

type Tone = "warm" | "push" | "direct" | "gentle";
type Seg = "thriving" | "overtraining" | "nutrition_gap" | "slipping" | "quiet" | "escalate" | "never_started";

interface Row {
  id: string;
  name: string | null;
  goal: string | null;
  w7: number;
  w30: number;
  daysSinceWorkout: number | null;
  mealDays7: number;
  daysSinceMeal: number | null;
  everTrained: boolean;
  everLoggedMeal: boolean;
}

function isRehab(goal: string | null): boolean {
  const g = (goal || "").toLowerCase();
  return g.includes("rehab") || g.includes("pain") || g.includes("injur");
}

function segment(r: Row): { seg: Seg; tone: Tone } {
  if (isRehab(r.goal)) {
    // Rehab clients never get the hard track, whatever the numbers say.
    if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 10) return { seg: "escalate", tone: "gentle" };
    if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 3) return { seg: "quiet", tone: "gentle" };
    return { seg: "thriving", tone: "gentle" };
  }
  if (!r.everTrained) return { seg: "never_started", tone: "warm" };
  if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 10) return { seg: "escalate", tone: "direct" };
  if (r.w7 >= 10) return { seg: "overtraining", tone: "warm" };
  if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 5) return { seg: "quiet", tone: "warm" };
  if (r.w7 <= 3 && r.w30 <= 10) return { seg: "slipping", tone: "push" };
  // Training well but nutrition dark — the biggest coachable gap.
  if (r.w7 >= 4 && (r.daysSinceMeal == null || r.daysSinceMeal >= 5)) return { seg: "nutrition_gap", tone: "push" };
  return { seg: "thriving", tone: "warm" };
}

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

  // ── auth: trainer session OR the cron secret ──
  const secret = req.headers.get("x-cron-secret");
  const cronOk = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
  if (!cronOk) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.email !== TRAINER_EMAIL) {
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

  const today = CT_TODAY();
  const since30 = shiftDays(today, -29);
  const since7 = shiftDays(today, -6);

  try {
    const [clientsRes, wlRes, mealRes, settingsRes, recentRes] = await Promise.all([
      admin.from("clients").select("id, name, primary_goal, auth_user_id").not("auth_user_id", "is", null),
      admin.from("workout_logs").select("client_id, log_date").eq("completed", true).gte("log_date", since30),
      admin.from("meal_adherence_logs").select("client_id, log_date").gte("log_date", since30),
      admin.from("client_app_settings").select("client_id, nudges_enabled"),
      admin.from("ai_nudge_log").select("client_id, created_at, sent").gte("created_at", shiftDays(today, -7)),
    ]);

    const clients = (clientsRes.data as { id: string; name: string | null; primary_goal: string | null; auth_user_id: string }[]) || [];
    const nudgesOff = new Set(
      ((settingsRes.data as { client_id: string; nudges_enabled: boolean }[]) || [])
        .filter((s) => s.nudges_enabled === false)
        .map((s) => s.client_id),
    );

    // Frequency caps come from what we actually SENT, not previews.
    const recent = ((recentRes.data as { client_id: string; created_at: string; sent: boolean }[]) || []).filter((r) => r.sent);
    const lastSent = new Map<string, string>();
    const weekCount = new Map<string, number>();
    for (const r of recent) {
      weekCount.set(r.client_id, (weekCount.get(r.client_id) ?? 0) + 1);
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

      // Escalation: stop messaging, tell Dustin a human should step in.
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
        daysSinceLastMealLog: r.daysSinceMeal,
        hasNeverLoggedNutrition: !r.everLoggedMeal,
        hasNeverTrained: !r.everTrained,
        situation: seg,
        requestedTone: tone,
        isRehabClient: isRehab(r.goal),
      };

      let text: string | null = null;
      try {
        const { value } = await callClaudeJson<{ body: string }>({
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: HAIKU_MODEL,
          system: SYSTEM,
          maxTokens: 220,
          messages: [{ role: "user", content: `CLIENT FACTS:\n${JSON.stringify(facts)}\n\nWrite the message as strict JSON.` }],
          validate,
        });
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

    // ── digest to Dustin ──
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
