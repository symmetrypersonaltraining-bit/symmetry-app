// GET/POST /api/cron/weekly-ai — the weekly sweep.
//
// Dustin: "Ai needs to auto update weeky focus, coaches read weekly and food
// logger weekly, food logger one base numbers on how they did last week and
// what to work on this week. i dont want to have to check on these."
//
// And 21 Aug, retiring the approval step: "correct i dont need to approve if
// the ai is set up to be accurate based on real numbers."
//
// So this runs itself, and what it writes goes straight to the client. Late
// SATURDAY night (vercel.json, 03:00 UTC Sunday = 22:00 CT Saturday) — after
// the Sun-Sat week has completely finished, so the model grades seven whole
// days rather than the Sunday-to-Friday stub the old 6 AM Saturday slot gave
// it, and the new focus is waiting when the client opens the app on Sunday.
//
// For every active client, it derives last week vs this week from real logs
// (fetchWeeklyComparison — the same summariser the client's own screen uses),
// hands those pre-computed numbers to one Sonnet call, and stores three pieces
// of copy:
//   clients.weekly_focus     → the Focus line on the client's week card
//   clients.ai_focus         → seeds the home "Coach's Read" for the new week
//   clients.ai_food_focus    → the weekly read on the food-logger coach card
//
// Two non-negotiables:
//  1. It NEVER clobbers a focus Dustin wrote himself for the current week
//     (weekly_focus_source = 'trainer' + weekly_focus_week = this Sunday).
//  2. The model does no arithmetic. Every number and direction is computed in
//     weekly-numbers.ts and stated to it as fact.
//
// One failing client never stops the sweep — each is caught individually and
// reported in the response so a bad row is visible rather than silent.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelFor, callClaudeJson } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import { logUsage } from "@/lib/ai/meter";
import { fetchWeeklyComparison } from "@/lib/ai/weekly-context";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import { isCronRequest } from "@/lib/cron-auth";
import { WEEKLY_WRITER_RULES, weekStartOf } from "@/lib/ai/weekly-numbers";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { coachFirstNameForClient } from "@/lib/trainerResolve";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** ISO date + 1 day, no timezone arithmetic beyond the calendar. */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// A function of the coach's name. As a module constant it was built at import
// time from one build-time environment variable, so every client of every
// trainer got a line written as the owner.
const WEEKLY_SYSTEM_PROMPT = (coachFirstName: string = COACH_FIRST_NAME) => `You are the coach inside the Symmetry Personal Training app (trainer: ${coachFirstName}), writing this client's week. You are handed their real numbers for last week and this week so far, already computed.

${WEEKLY_WRITER_RULES(coachFirstName)}

You write THREE things:
1. "focus" — the one thing this client should aim at this week. It appears as "Focus: ..." on their week card. It must come out of what actually happened last week: if adherence slipped, the focus addresses that; if they logged only two days, the focus is logging; if they crushed it, the focus protects the win and adds one notch. Concrete and doable in a week, not a slogan.
2. "coachRead" — the training-side read for the home screen: consistency, sessions completed, weigh-in cadence, body-composition movement. Warm, specific, honest about slips without scolding, light humor when it fits.
3. "foodFocus" — the nutrition read for their food logger. Start from how they actually ate last week (the given averages, adherence and the signed vs-target deltas), then say what to work on this week. Name real numbers from the context. Never set a new macro target — that is ${coachFirstName}'s call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"focus":string,"coachRead":string,"foodFocus":string,"programmingQuestion":string}

Rules:
- "focus": ONE sentence, under 120 characters, no leading "Focus:".
- "coachRead": 2-4 sentences, plain text, no question at the end.
- "foodFocus": TWO sentences, plain text. The first states how last week actually went using the given numbers (averages, adherence, signed vs-target deltas) — a real figure, not an adjective. The second is the one thing to work on this week. It shares a screen with the nutrition coach card, so anything longer is a wall of text above their food logger.
- "programmingQuestion": ONE question, under 140 characters, asking this client whether anything about their PROGRAMMING should change — exercises, volume, session length, days, an area they want more or less of, something that has been bothering them physically. Ground it in what actually happened in their last two weeks so it does not read as a form letter: if they skipped legs twice, ask about that; if every session ran long, ask about session length. Never ask about weight, diet or body composition. Never ask a yes/no question they can dismiss with one word.`;

interface WeeklyReply {
  focus: string;
  coachRead: string;
  foodFocus: string;
  programmingQuestion: string;
}

// Fortnightly, anchored to a fixed Sunday so the cadence is stable whatever
// happens to run history. Asking every week turns into noise people stop
// reading; asking on a "every other run" counter drifts the moment a run is
// missed or replayed.
const FORTNIGHT_ANCHOR = Date.parse("2026-08-02T00:00:00Z"); // a Sunday
function isQuestionWeek(weekStart: string): boolean {
  const wk = Date.parse(weekStart + "T00:00:00Z");
  if (Number.isNaN(wk)) return false;
  const weeks = Math.round((wk - FORTNIGHT_ANCHOR) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 0;
}

function validateWeekly(raw: unknown): WeeklyReply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const focus = s("focus").replace(/^focus:\s*/i, "");
  const coachRead = s("coachRead");
  const foodFocus = s("foodFocus");
  if (!focus || !coachRead || !foodFocus) return null;
  return {
    focus: focus.slice(0, 200),
    coachRead: coachRead.slice(0, 900),
    foodFocus: foodFocus.slice(0, 900),
    // Optional on purpose. A missing question costs one skipped fortnightly
    // prompt; failing validation over it would cost the whole client's week.
    programmingQuestion: s("programmingQuestion").slice(0, 200),
  };
}

interface ClientRow {
  id: string;
  name: string | null;
  primary_goal: string | null;
  weekly_focus: string | null;
  weekly_focus_week: string | null;
  weekly_focus_source: string | null;
}

interface RunResult {
  clientId: string;
  name: string;
  status: "written" | "focus-kept" | "skipped" | "failed";
  detail?: string;
}

async function runSweep(opts: {
  onlyClientId?: string | null;
  today?: string;
}): Promise<{
  week: string;
  today: string;
  results: RunResult[];
}> {
  const today = opts.today || CT_TODAY();
  // `week` is the SUNDAY this copy is FOR — always the week containing
  // tomorrow, never the one containing today.
  //
  // This used to be weekStartOf(today) outside draft mode, which was only ever
  // right for a run that happened during the week it was describing. On the
  // Saturday-night schedule it would have stamped every line with the Sunday
  // of the week that had just ENDED, so a focus written for the coming week
  // would have been filtered out as stale the moment it was published.
  //
  // Deriving it from tomorrow is correct for both a late-Saturday run (tomorrow
  // is that Sunday) and an early-Sunday one (tomorrow is Monday, whose week
  // starts on the same Sunday), so the schedule can move without this breaking.
  const week = weekStartOf(nextDay(today));
  const db = createAdminClient();

  let q = db
    .from("clients")
    .select("id, name, primary_goal, weekly_focus, weekly_focus_week, weekly_focus_source")
    .is("archived_at", null);
  if (opts.onlyClientId) q = q.eq("id", opts.onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const clients = (data as ClientRow[]) || [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const results: RunResult[] = [];

  for (const c of clients) {
    const name = c.name || "(unnamed)";
    try {
      if (!apiKey) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "ANTHROPIC_API_KEY not set" });
        continue;
      }

      const cmp = await fetchWeeklyComparison(db, c.id, today);

      // Nothing to write about at all. Leaving last week's copy up would be
      // worse than leaving it blank — it would read as a comment on a week
      // that never happened.
      if (!cmp.last.loggedDays && !cmp.current.loggedDays && !cmp.last.workoutsScheduled && !cmp.current.workoutsScheduled) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "no activity in either week" });
        continue;
      }

  // Tier-aware. "Across the entire app" means this surface too — a client who
  // gets the higher model in the coach chat and the standard one here
  // experiences an assistant that is inconsistently clever, which is more
  // confusing than one that is consistently ordinary.
      const sweepModel = modelFor("coach", await aiTierFor(db, c.id));
      const result = await callClaudeJson({
        meter: { clientId: c.id, feature: "weekly_sweep" },
        apiKey,
        model: sweepModel,
        system: WEEKLY_SYSTEM_PROMPT(await coachFirstNameForClient(db, c.id, COACH_FIRST_NAME)),
        maxTokens: 800,
        messages: [
          {
            role: "user",
            content:
              `CLIENT: ${name}${c.primary_goal ? ` — goal: ${c.primary_goal}` : ""}\n` +
              `TODAY (Central): ${today}\n\n` +
              `${cmp.block}\n\n` +
              `Write this client's focus, coach's read and food focus for the week beginning ${week}, per your instructions.`,
          },
        ],
        validate: validateWeekly,
      });

      await logUsage(c.id, "weekly_sweep", result.tokensIn, result.tokensOut, sweepModel, { latencyMs: result.latencyMs, startedAt: result.startedAt });

      if (!result.value) {
        results.push({ clientId: c.id, name, status: "failed", detail: "model returned no usable JSON" });
        continue;
      }

      // Dustin's own words win. If he set the focus by hand for THIS week, the
      // sweep leaves it alone and still refreshes everything else.
      const trainerOwnsFocus =
        c.weekly_focus_source === "trainer" && c.weekly_focus_week === week && !!c.weekly_focus;

      const update: Record<string, string | null> = {
        ai_focus: result.value.coachRead,
        ai_focus_date: today,
        ai_food_focus: result.value.foodFocus,
        ai_food_focus_week: week,
      };
      if (!trainerOwnsFocus) {
        update.weekly_focus = result.value.focus;
        update.weekly_focus_week = week;
        update.weekly_focus_source = "ai";
      }

      const { error: upErr } = await db.from("clients").update(update).eq("id", c.id);
      if (upErr) throw new Error(upErr.message);

      // Fortnightly programming question. Its own try/catch: a failure here
      // must not cost this client their focus, which is already written.
      // upsert on (client_id, week_start) makes a replayed sweep a no-op
      // rather than a second question, and ignoreDuplicates means an answer
      // already given is never overwritten by a re-run.
      if (result.value.programmingQuestion && isQuestionWeek(week)) {
        try {
          // Still best-effort — the reasoning above holds. But it has to be
          // able to SAY so: a PostgREST call returns its error rather than
          // throwing, so this catch has never seen a failed question and the
          // console line it exists to produce has never fired.
          const { error: qErr } = await db
            .from("client_program_feedback")
            .upsert(
              { client_id: c.id, week_start: week, question: result.value.programmingQuestion },
              { onConflict: "client_id,week_start", ignoreDuplicates: true },
            );
          if (qErr) console.error("weekly-ai: programming question failed for", c.id, qErr.message);
        } catch (qe) {
          console.error("weekly-ai: programming question threw for", c.id, qe);
        }
      }

      results.push({ clientId: c.id, name, status: trainerOwnsFocus ? "focus-kept" : "written" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`weekly-ai failed for ${name} (${c.id}):`, msg);
      results.push({ clientId: c.id, name, status: "failed", detail: msg.slice(0, 200) });
    }
  }

  return { week, today, results };
}

// Scheduler auth lives in one place now — see src/lib/cron-auth.ts for why all
// four cron-gated routes had four different (and two wrong) answers to it.
const authorised = isCronRequest;

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sp = new URL(req.url).searchParams;
    // Kill switch. This route could spend after every client-facing feature had
    // already paused — the cap meant nothing here.
    const paused = await enforceMeter(null, "weekly_sweep");
    if (paused) return paused;
    const out = await runSweep({ onlyClientId: sp.get("clientId") });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("weekly-ai sweep failed:", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}

/**
 * Manual run. Cron auth, OR a signed-in trainer — so Dustin can force a sweep
 * from the app without holding a secret or waiting for Saturday night.
 */
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    const scope = await resolveAiScope(null);
    if (!scope.ok || !scope.scope.isTrainer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const body = await req.json().catch(() => ({}));
  // Same gate as the scheduled GET. A manual sweep is one model call per client
  // — the most expensive single action in the app — so it respects the cap for
  // exactly the same reason the cron does.
  const paused = await enforceMeter(null, "weekly_sweep");
  if (paused) return paused;
  try {
    const out = await runSweep({
      onlyClientId: typeof body?.clientId === "string" ? body.clientId : null,
      today: typeof body?.today === "string" ? body.today : undefined,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("weekly-ai sweep failed:", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
