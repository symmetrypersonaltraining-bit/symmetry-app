// POST /api/celebration
// Body: { clientId?: string, dayId?: string }
//
// Returns the data behind a workout-complete celebration:
//   { stats, prs, line, coachWeight }
// - stats       : today's sets / volume / streak / sessions this week
// - prs         : movements where today beat every previous session's best weight
// - line        : ONE personal sentence written by Haiku from those numbers
// - coachWeight : Dustin's most recent logged body weight, so the celebration
//                 screen can express volume as "how many coach Dustins you
//                 lifted" (feedback 80f43c91). Read live from metrics rather
//                 than hardcoded — he's mid-cut, and a stale number would make
//                 the joke quietly wrong. null if he hasn't weighed in.
//
// Everything degrades safely. If the model call fails, is metered out, or the
// API key is missing, `line` comes back null and the celebration screen falls
// back to its existing written headlines — a celebration must never break
// because an AI call did.
//
// Auth-checked and client-scoped via the shared resolveAiScope, metered under
// the existing "chat" feature so it shares the same daily cap and kill switch.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { Db, enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { compareLoads, isBetterLoad, looksLikeAssistance } from "@/lib/loadDirection";
import { TRAINER_EMAIL, COACH_FIRST_NAME } from "@/lib/trainer";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const COACH_EMAIL = TRAINER_EMAIL;
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

const SYSTEM = `You write ONE sentence that appears on the workout-complete screen of the Symmetry Personal Training app. You are ${COACH_FIRST_NAME}, the trainer: warm, direct, specific, never corny, never a motivational poster.

Respond with ONLY valid JSON, no markdown, no fences:
{"line": string}

Rules:
- ONE sentence. Under 100 characters. No emoji unless it genuinely earns it.
- Ground it in the numbers you are given. NEVER invent a number.
- If they set a personal record, that is the story — name the lift and the weight.
- If they are training a lot but not logging food, you may mention it once, lightly.
- If their session count this week is unusually high, telling them to rest IS good coaching.
- Never comment on body weight, body fat or appearance. Behaviour only.
- Do not repeat any of the "recent lines" you are shown.`;

type Body = { clientId?: string | null; dayId?: string | null };

interface Stats {
  sets: number;
  volume: number;
  streakDays: number;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  daysSinceMealLog: number | null;
  goal: string | null;
  firstName: string | null;
  dayLabel: string | null;
}
interface Pr {
  movement: string;
  weight: number;
  reps: number;
  previous: number | null;
  /** Assisted machine: the weight came DOWN, and the screen has to say so. */
  assistance?: boolean;
}

function validate(raw: unknown): { line: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const l = (raw as { line?: unknown }).line;
  if (typeof l !== "string" || !l.trim()) return null;
  return { line: l.trim().slice(0, 160) };
}

export async function POST(req: NextRequest) {
  // Scope + auth first. A failure here is a real error, not a soft fallback.
  const scoped = await resolveAiScope((await req.json().catch(() => ({}) as Body))?.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  const clientId = scoped.scope.clientId;
  if (!clientId) return NextResponse.json({ stats: null, prs: [], line: null, coachWeight: null });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ stats: null, prs: [], line: null, coachWeight: null });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const today = CT_TODAY();

  // Dustin's latest weigh-in, for the "coach Dustins lifted" unit. Looked up by
  // email so it survives any client-row rebuild, and wrapped so a miss here can
  // never take the celebration down with it.
  const coachWeight = await (async (): Promise<number | null> => {
    try {
      const { data: coach } = await admin
        .from("clients")
        .select("id")
        .eq("email", COACH_EMAIL)
        .maybeSingle();
      const coachId = (coach as { id?: string } | null)?.id;
      if (!coachId) return null;
      const { data: m } = await admin
        .from("metrics")
        .select("weight")
        .eq("client_id", coachId)
        .not("weight", "is", null)
        .order("metric_date", { ascending: false })
        .limit(1);
      const w = Number(((m as { weight?: number | string }[]) || [])[0]?.weight);
      return Number.isFinite(w) && w > 0 ? Math.round(w * 10) / 10 : null;
    } catch {
      return null;
    }
  })();

  try {
    const [clientRes, logRes, weekRes, monthRes, mealRes] = await Promise.all([
      admin.from("clients").select("name, primary_goal").eq("id", clientId).maybeSingle(),
      admin
        .from("workout_logs")
        .select("id, day_id, days(label)")
        .eq("client_id", clientId)
        .eq("log_date", today)
        .eq("completed", true)
        .order("completed_at", { ascending: false })
        .limit(1),
      admin
        .from("workout_logs")
        .select("log_date")
        .eq("client_id", clientId)
        .eq("completed", true)
        .gte("log_date", shiftDays(today, -6)),
      admin
        .from("workout_logs")
        .select("log_date")
        .eq("client_id", clientId)
        .eq("completed", true)
        .gte("log_date", shiftDays(today, -29)),
      admin
        .from("meal_adherence_logs")
        .select("log_date")
        .eq("client_id", clientId)
        .order("log_date", { ascending: false })
        .limit(1),
    ]);

    const client = clientRes.data as { name: string | null; primary_goal: string | null } | null;
    const logRow = ((logRes.data as { id: string; days?: { label?: string } | null }[]) || [])[0] || null;

    // Today's sets for this session
    let sets = 0;
    let volume = 0;
    // "Best" is not always "most". On an assisted dip or pull-up the stack
    // counterweights the lifter, so the improvement is taking weight OFF — and
    // a PR check written as `w > previous` can never fire on one. Tim Yancey
    // went 140 -> 110 on assisted dips over a month and was never once
    // congratulated for it. See lib/loadDirection.
    const todayBest = new Map<string, { w: number; r: number; name: string; assist: boolean }>();
    if (logRow?.id) {
      const { data: sl } = await admin
        .from("set_logs")
        .select("weight_lbs, reps, exercise_id, completed, exercises(name, load_is_assistance)")
        .eq("workout_log_id", logRow.id)
        .eq("completed", true);
      for (const s of ((sl as Record<string, unknown>[]) || [])) {
        sets++;
        const w = Number(s.weight_lbs) || 0;
        const r = Number(s.reps) || 0;
        volume += w * r;
        const exId = s.exercise_id as string | null;
        const nm = ((s.exercises as { name?: string } | null)?.name) || "";
        const assist = ((s.exercises as { load_is_assistance?: boolean } | null)?.load_is_assistance)
          ?? looksLikeAssistance(nm);
        if (exId && w > 0) {
          const cur = todayBest.get(exId);
          if (!cur || isBetterLoad(w, cur.w, assist)) todayBest.set(exId, { w, r, name: nm, assist });
        }
      }
    }

    // PR detection: today's best per movement vs every PRIOR session's best
    const prs: Pr[] = [];
    if (todayBest.size && logRow?.id) {
      const ids = Array.from(todayBest.keys());
      const { data: prior } = await admin
        .from("set_logs")
        .select("exercise_id, weight_lbs")
        .eq("client_id", clientId)
        .in("exercise_id", ids)
        .neq("workout_log_id", logRow.id)
        .gt("weight_lbs", 0);
      const best = new Map<string, number>();
      for (const p of ((prior as Record<string, unknown>[]) || [])) {
        const id = p.exercise_id as string;
        const w = Number(p.weight_lbs) || 0;
        const assist = todayBest.get(id)?.assist ?? false;
        if (!best.has(id) || isBetterLoad(w, best.get(id) as number, assist)) best.set(id, w);
      }
      for (const [id, t] of todayBest) {
        const prev = best.get(id);
        // A first-ever logged weight is not a "record" — needs something to beat.
        if (prev != null && isBetterLoad(t.w, prev, t.assist)) {
          prs.push({ movement: t.name, weight: t.w, reps: t.r, previous: prev, assistance: t.assist });
        }
      }
      prs.sort(compareLoads);
    }

    // Streak: consecutive days back from today with a completed workout
    const monthDates = new Set(((monthRes.data as { log_date: string }[]) || []).map((r) => r.log_date));
    let streakDays = 0;
    for (let i = 0; i < 30; i++) {
      if (monthDates.has(shiftDays(today, -i))) streakDays++;
      else break;
    }

    const lastMeal = ((mealRes.data as { log_date: string }[]) || [])[0]?.log_date || null;
    const daysSinceMealLog = lastMeal
      ? Math.round((Date.parse(today) - Date.parse(lastMeal)) / 86400000)
      : null;

    const stats: Stats = {
      sets,
      volume: Math.round(volume),
      streakDays,
      sessionsThisWeek: new Set(((weekRes.data as { log_date: string }[]) || []).map((r) => r.log_date)).size,
      sessionsThisMonth: monthDates.size,
      daysSinceMealLog,
      goal: client?.primary_goal || null,
      firstName: (client?.name || "").split(" ")[0] || null,
      dayLabel: logRow?.days?.label || null,
    };

    // ── the AI line. Everything from here is best-effort. ──
    let line: string | null = null;
    if (process.env.ANTHROPIC_API_KEY) {
      const gate = await enforceMeter(clientId, "chat");
      if (!gate) {
        try {
          // NOTE: deliberately does NOT persist generated lines anywhere.
          // trainer_notes was the obvious place, but that table feeds the
          // Command Center's programming notes by client — writing celebration
          // copy into it would pollute real coaching notes. Repetition risk is
          // low because the facts (volume, PRs, streak) change every session.
          const facts = {
            firstName: stats.firstName,
            workout: stats.dayLabel,
            setsCompleted: stats.sets,
            totalVolumeLb: stats.volume,
            personalRecords: prs.map((p) => ({ lift: p.movement, weight: p.weight, reps: p.reps, previousBest: p.previous })),
            currentStreakDays: stats.streakDays,
            sessionsThisWeek: stats.sessionsThisWeek,
            sessionsThisMonth: stats.sessionsThisMonth,
            daysSinceLastMealLog: stats.daysSinceMealLog,
            goal: stats.goal,
          };

          const { value, tokensIn, tokensOut } = await callClaudeJson<{ line: string }>({
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: HAIKU_MODEL,
            system: SYSTEM,
            maxTokens: 160,
            messages: [
              {
                role: "user",
                content: `FACTS:\n${JSON.stringify(facts)}\n\nWrite the line as strict JSON.`,
              },
            ],
            validate,
          });
          line = value?.line ?? null;
          try {
            await logUsage(clientId, "chat", tokensIn, tokensOut, HAIKU_MODEL);
          } catch {
            /* metering must not break the celebration */
          }
        } catch {
          line = null; // fall back to the built-in headlines
        }
      }
    }

    return NextResponse.json({ stats, prs, line, coachWeight });
  } catch {
    // Never surface an error to a celebration screen.
    return NextResponse.json({ stats: null, prs: [], line: null, coachWeight });
  }
}
