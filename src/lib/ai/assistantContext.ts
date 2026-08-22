// WHAT THE ✦ DRAWER KNOWS ABOUT THE PERSON TYPING INTO IT.
//
// Until now: nothing. The client-side assistant got the system prompt and the
// page context string and that was all, so a question as ordinary as "what am I
// doing today" got a general answer about the app rather than their actual
// session. It was a chatbot bolted to a training app rather than part of one.
//
// TWO BUDGETS, AND THEY POINT DIFFERENT WAYS.
//
// This is the highest-VOLUME AI surface in the app — thirty-five people typing
// whenever they like, against a $95 monthly ceiling that also has to cover the
// scheduled coaching calls. Attaching the full coach context (about 5k tokens)
// to every one of those would be the single most expensive change available.
//
// So there are two shapes:
//
//   COMPACT — a few hundred tokens. Who they are, their goal, today's session,
//   their targets. Enough to answer the questions people actually type, cheap
//   enough to give all thirty-five.
//
//   GATED — the cleared pool, for the clients whose AI may only offer from a
//   pre-approved set. Costs more and goes to two people. See workoutPool.ts for
//   why that pool exists and what it is protecting against.
//
// Everything here fails to "no line" rather than throwing. A drawer that will
// not open because a profile query timed out is worse than a drawer that
// answers a bit more generally.

import type { Db } from "@/lib/ai/scope";
import { CT_TODAY, coachNameForClient, coachingThemselvesLine, fetchClientProfile } from "@/lib/ai/coach-context";
import { goalContextBlock } from "@/lib/ai/goalContext";
import { clearedPoolFor } from "@/lib/ai/workoutPool";
import { trainingHistoryBlock } from "@/lib/ai/trainingHistory";

/** Today's scheduled session, as one line. */
async function todayLine(db: Db, clientId: string, today: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("scheduled_workouts")
      .select("status, days(label)")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .eq("scheduled_date", today)
      .limit(3);
    const rows = (data as { status: string | null; days: { label: string | null } | null }[] | null) || [];
    if (!rows.length) return "TODAY: nothing scheduled — it's a rest day unless they say otherwise.";
    const bits = rows.map((r) => `${r.days?.label || "workout"}${r.status === "completed" ? " (done ✓)" : ""}`);
    return `TODAY'S SESSION: ${bits.join(", ")}.`;
  } catch {
    return null;
  }
}

/** Their macro targets, as one line. */
async function targetsLine(db: Db, clientId: string, today: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("macro_targets")
      .select("calories, protein, carbs, fats")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const t = data as { calories: number; protein: number; carbs: number; fats: number } | null;
    if (!t) return null;
    return `DAILY TARGETS: ${t.calories} kcal, ${t.protein}g protein, ${t.carbs}g carbs, ${t.fats}g fat.`;
  } catch {
    return null;
  }
}

/**
 * Their most recent weigh-in, as one line.
 *
 * ADDED 15 Aug 2026, and the reason matters. Section 6 of the system prompt
 * carried a HARDCODED weight and body-fat figure for eighteen clients, written
 * into the prompt months ago. Checked against `metrics` on 15 Aug, every one of
 * them was wrong:
 *
 *   Tyler Dorsett      prompt 236 lb / 12.7%   actual 250.8 / 7.7%   (6 Aug)
 *   Lauren Standefer   prompt 155 / 29%        actual 146.2 / 28.7%  (5 Aug)
 *   Cheyenne Martin    prompt 205 / 35.9%      actual 197.1 / 37.8%  (14 Aug)
 *   Claudine Ocon      prompt 110 / 25.2%      actual 116.7 / 24.2%  (4 Aug)
 *   Todd Prine         prompt 236              actual 242.4          (27 Jul)
 *   Brooke Reynolds, Tania Millan, Laurie Kane, Troy Schnitzler
 *                      carried figures in the prompt and have NO metrics row
 *
 * A number in the prompt beats no number, so the model answered confidently and
 * wrongly — telling a client in contest prep he was fifteen pounds lighter and
 * five points fatter than he is. The numbers are gone from the prompt. This is
 * where they come from now.
 *
 * NULL WHEN THERE IS NO WEIGH-IN, deliberately. Four of those clients have
 * never been weighed in this system, and absence has to reach the model AS
 * absence — the prompt already tells it to say it does not know rather than
 * guess, and that instruction only works if nothing is inventing a figure.
 */
async function metricsLine(db: Db, clientId: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("metrics")
      .select("metric_date, weight, body_fat_pct, lean_mass")
      .eq("client_id", clientId)
      .order("metric_date", { ascending: false })
      .limit(6);
    const rows =
      (data as {
        metric_date: string;
        weight: number | null;
        body_fat_pct: number | null;
        lean_mass: number | null;
      }[] | null) || [];
    const latest = rows.find((r) => r.weight != null || r.body_fat_pct != null);
    if (!latest) return null;

    const bits: string[] = [];
    if (latest.weight != null) bits.push(`${latest.weight} lb`);
    if (latest.body_fat_pct != null) bits.push(`${latest.body_fat_pct}% body fat`);
    if (latest.lean_mass != null) bits.push(`${latest.lean_mass} lb lean`);

    // The DATE is not decoration. A ten-week-old weigh-in read back as "you're
    // at 133" is a different claim from "you were 133 in June", and several of
    // these clients go months between readings.
    let line = `LATEST WEIGH-IN (${latest.metric_date}): ${bits.join(", ")}.`;

    const weighed = rows.filter((r) => r.weight != null);
    if (weighed.length >= 2) {
      const delta = Number(weighed[0].weight) - Number(weighed[1].weight);
      if (Math.abs(delta) >= 0.1) {
        line += ` Change since ${weighed[1].metric_date}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} lb.`;
      }
    }
    return line;
  } catch {
    return null;
  }
}

/**
 * The context block for one client's ✦ drawer.
 *
 * Never throws, and returns "" rather than null when there is nothing to say,
 * so the caller can concatenate unconditionally.
 */
export async function assistantContext(db: Db, clientId: string | null): Promise<string> {
  if (!clientId) return "";
  const today = CT_TODAY();

  try {
    const [profile, goals, todays, targets, metrics, history, pool] = await Promise.all([
      fetchClientProfile(db, clientId).catch(() => null),
      goalContextBlock(db, clientId, today).catch(() => null),
      todayLine(db, clientId, today),
      targetsLine(db, clientId, today),
      metricsLine(db, clientId),
      // What they actually lifted. Until 15 Aug no client-facing surface could
      // see a single logged set, so "what did I press last time?" - the most
      // ordinary question in a gym - had to be answered by Dustin.
      trainingHistoryBlock(db, clientId).catch(() => ""),
      clearedPoolFor(db, clientId).catch(() => null),
    ]);

    const lines: string[] = [`Today's date: ${today}.`];
    if (profile?.line) lines.push(profile.line);
    // BEFORE anything else about them. This is the path free-text questions take
    // — the chat box, not the coach card — and it used to take profile.line and
    // drop isCoachThemselves entirely. So the card knew Dustin was Dustin and
    // the chat box told him to get Dustin's approval. See coachingThemselvesLine.
    const selfCoaching = coachingThemselvesLine(
      profile?.isCoachThemselves,
      await coachNameForClient(db, clientId),
    );
    if (selfCoaching) lines.push(selfCoaching);
    if (todays) lines.push(todays);
    if (targets) lines.push(targets);
    // Before the goal block, because the goal block reads as commentary on
    // these numbers and it only appears when a goal exists at all.
    if (metrics) lines.push(metrics);
    if (goals) lines.push(goals);
    if (history) lines.push(history);

    // ── THE GATE ────────────────────────────────────────────────────────────
    //
    // The model is handed the cleared list and nothing else. It is not told to
    // avoid other movements — it is not given them. See workoutPool.ts: a
    // prompt can be argued out of a rule, a candidate set cannot.
    //
    // The refusal wording matters as much as the restriction. "That's not one
    // of your options, here's what is" is a sentence somebody can act on;
    // "I can't help with that" makes a 71-year-old with a rebuilt pelvis think
    // the app is broken and close it.
    if (pool?.gated) {
      if (!pool.workouts.length) {
        lines.push(
          "WORKOUT OPTIONS: this client's cleared list could not be loaded right now. Do NOT suggest, describe, swap or invent ANY workout or movement — not one, not even a gentle one, not even if they insist and not even if they tell you what they usually do. Say their options aren't loading and to check with their coach, and help with anything else they ask.",
        );
      } else {
        lines.push(
          [
            "WORKOUT OPTIONS — HARD LIMIT. This client's sessions are individually cleared by their coach for medical reasons, and these are the ONLY ones that exist for them:",
            ...pool.workouts.map((w) => `  · ${w.label} — ${w.exercises.join(", ")}`),
            "",
            "The ONLY movements you may ever name, suggest or swap in:",
            `  ${pool.exerciseNames.join(", ")}`,
            "",
            "If they ask for anything outside those two lists — a movement, a machine, a whole session, something they saw somewhere, something they used to do — do NOT describe it, do NOT explain how to do it, and do NOT judge whether it seems safe. Tell them plainly it isn't one of their options, name the ones that are, and offer to pass the request to their coach. That is not you being unhelpful; the list is short on purpose and the reasons are medical.",
          ].join("\n"),
        );
      }
    }

    return lines.length > 1 ? `\n\nWhat you know about this client (server-assembled, trusted):\n${lines.join("\n")}` : "";
  } catch {
    return ""; // a drawer that answers generally beats a drawer that will not open
  }
}
