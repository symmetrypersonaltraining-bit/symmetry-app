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
import type { Database } from "@/lib/database.types";
import { modelFor, callClaudeJson } from "@/lib/ai/anthropic";
import { weeklyClientPicture } from "@/lib/ai/weekly-picture";
import { aiTierFor } from "@/lib/ai/tier";
import { logUsage } from "@/lib/ai/meter";
import { fetchWeeklyComparison } from "@/lib/ai/weekly-context";
import { ASKS_ABOUT_SCHEDULE, CLAIMS_THIS_WEEK, trimToWord } from "@/lib/ai/weekly-copy-guards";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import { isCronRequest } from "@/lib/cron-auth";
import { WEEKLY_WRITER_RULES, weekStartOf } from "@/lib/ai/weekly-numbers";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { coachFirstNameForClient } from "@/lib/trainerResolve";
import { trainerFeatureOn } from "@/lib/trainerFeatures";
import * as roster from "@/lib/auth/roster";
import { fetchAllRowsSafe } from "@/lib/fetchAllRows";

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

/** ISO date shifted by n days, same calendar-only arithmetic as nextDay. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// A function of the coach's name. As a module constant it was built at import
// time from one build-time environment variable, so every client of every
// trainer got a line written as the owner.
// THE SIX THINKING STEPS below exist because of one instruction, 5 Sep 2026:
// "any ai needs a very detailed way of thinking to make sure its accurate to
// each client and relevant to them." They are not decoration — step 3 is what
// stops the model inventing a training pattern it was never shown, and step 6
// is the bar itself, made into a question the model has to answer before it
// writes. See lib/ai/weekly-picture.ts for the context they read.
const WEEKLY_SYSTEM_PROMPT = (coachFirstName: string = COACH_FIRST_NAME) => `You are the coach inside the Symmetry Personal Training app (trainer: ${coachFirstName}), writing this client's week. You are handed their real numbers for last week and this week so far, already computed.

${WEEKLY_WRITER_RULES(coachFirstName)}

HOW TO THINK, BEFORE YOU WRITE ANYTHING. Work through these in order. Do not
write a word until you have. None of this reasoning appears in the output — only
its results do.

1. WHO IS THIS. Read the WHO THIS CLIENT IS block. Their goal, their experience,
   and above all their injuries and limitations. Everything you write this week
   has to be compatible with that list.
2. WHAT ACTUALLY CHANGED. Find the ONE number that moved most between last week
   and this week so far, and hold on to it. It is the spine of what you write.
   Use the figures exactly as given; the signed deltas are the source of truth.
3. WHAT THEY WERE ACTUALLY PROGRAMMED. Read the session list line by line. That
   list is the ONLY thing you know about their training. A session marked "not
   classified" is a session you know nothing about — never guess what it worked.
   If the sessions show a real pattern (the same focus missed twice, a whole
   region absent, every session of one kind completed and another kind not),
   name it. If they do not, THERE IS NO PATTERN, and saying there is one is the
   worst thing you can do here.
4. WHAT THEY HAVE SAID. Read what they have told the coach. Do not write
   anything that contradicts it, and do not tell them to do something they have
   already said they cannot or will not.
5. WHAT YOU TOLD THEM LAST TIME. Judge last week's focus against this week's
   numbers and decide whether it was met. If it was, protect it and add one
   notch. If it was not, the focus is that same thing again in a smaller, more
   doable form — said differently, never word for word.
6. NOW CHECK YOURSELF. Could every sentence you are about to write have been
   written about a different client? If yes, it is not good enough — go back and
   anchor it to something only true of this person. Is every claim pointable at
   a number or a session in the context above? If a sentence is not, delete it.

You write THREE things:
1. "focus" — the one thing this client should aim at this week. It appears as "Focus: ..." on their week card. It must come out of what actually happened last week: if adherence slipped, the focus addresses that; if they logged only two days, the focus is logging; if they crushed it, the focus protects the win and adds one notch. Concrete and doable in a week, not a slogan.
2. "coachRead" — the training-side read for the home screen: consistency, sessions completed, weigh-in cadence, body-composition movement. Warm, specific, honest about slips without scolding, light humor when it fits.
3. "foodFocus" — the nutrition read for their food logger. Start from how they actually ate last week (the given averages, adherence and the signed vs-target deltas), then say what to work on this week. Name real numbers from the context. Never set a new macro target — that is ${coachFirstName}'s call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"focus":string,"coachRead":string,"foodFocus":string,"programmingQuestion":string}

Rules:
- "focus": ONE sentence, under 120 characters, no leading "Focus:".
- "coachRead": 2-4 sentences, plain text, no question at the end. On a week where the context grants a GENERAL TIP, one extra sentence at the very end for it, and no more — the tip never replaces anything personal, it follows it. On every other week there is no general advice in here at all: nothing that would be equally true of a stranger.
- "foodFocus": TWO sentences, plain text. The first states how last week actually went using the given numbers (averages, adherence, signed vs-target deltas) — a real figure, not an adjective. The second is the one thing to work on this week. It shares a screen with the nutrition coach card, so anything longer is a wall of text above their food logger.
- "programmingQuestion": ONE short question — under 140 characters, one sentence, plain words, no jargon — about the TRAINING ITSELF.

  ⛔ NEVER ASK ABOUT THE SCHEDULE. Not which days they train, not how many days, not whether a different day would suit them better, not session length or timing, not "would fewer days fit your life". ${coachFirstName} sets the schedule; it is not the client's to negotiate, and inviting them to renegotiate it creates a conversation he did not ask for. This is the single most important rule on this field — five of six questions written the week of 30 Aug were some version of "what's getting in the way of the other days", and that is exactly the question that must never be asked again.

  ASK ABOUT THE WORK. Rotate the angle so a client is not asked the same shape of question twice in a row — pick whichever the session list actually supports:
  • a movement or a session that keeps going unfinished — what about it
  • something that felt off, tweaky or achy in a specific lift
  • whether a lift is getting easier, or still feels like the same weight
  • an exercise they would happily never see again, or one they want more of
  • which part of a session they dread, and which they look forward to
  • whether a body part is getting more or less than they want
  • how a specific movement FEELS now compared with a month ago
  • anything physical that has been bothering them that he should know about

  It must be grounded in something you can point to in the SESSION LIST — a session not completed, a focus that appears twice, a region absent from the week entirely. Quote what you are pointing at, in their own everyday words. Never describe the week they are about to start, in which they have done nothing. Never ask about weight, diet, body composition or logging. Never ask a yes/no question they can dismiss with one word.

  ⛔ AND THIS IS THE IMPORTANT PART: if the session list does not contain something specific enough to point at — every session completed and nothing notable, or the sessions are unclassified so you cannot tell what they worked — return an EMPTY STRING for this field. An empty string is a correct and expected answer. A plausible-sounding question you had to invent is worse than no question at all: the client reads it as their coach having noticed something, and nobody noticed anything. Do not stretch to fill this field.`;

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
  // A question is one sentence a person reads on a phone. 200 was tight enough
  // that the model's own overrun got chopped mid-word; the prompt asks for
  // under 140, so this is headroom for a long one rather than a licence.
  const question = trimToWord(s("programmingQuestion"), 320);
  return {
    focus: trimToWord(focus, 200),
    coachRead: trimToWord(coachRead, 900),
    foodFocus: trimToWord(foodFocus, 900),
    // Optional on purpose. A missing question costs one skipped fortnightly
    // prompt; failing validation over it would cost the whole client's week.
    // Dropped outright when it describes a week that has not happened -- no
    // question at all beats one whose first clause the client can see is wrong.
    programmingQuestion: (() => {
      if (!question) return "";
      // Two drops, both loud. If either fires often the prompt needs work, and
      // a question quietly disappearing is exactly the kind of thing that goes
      // unnoticed for a month.
      if (CLAIMS_THIS_WEEK.test(question)) {
        console.error("weekly-ai: dropped a question that described the coming week:", question);
        return "";
      }
      // The schedule is the trainer's, not the client's — and "what's getting
      // in the way of the other days?" is what the model reaches for whenever
      // it has nothing specific to point at. Five of six questions written for
      // the week of 30 Aug were that question. The prompt forbids it now; this
      // is the check that does not depend on the prompt still saying so.
      if (ASKS_ABOUT_SCHEDULE.test(question)) {
        console.error("weekly-ai: dropped a question that invited a schedule change:", question);
        return "";
      }
      return question;
    })(),
  };
}

interface ClientRow {
  id: string;
  name: string | null;
  primary_goal: string | null;
  weekly_focus: string | null;
  weekly_focus_week: string | null;
  weekly_focus_source: string | null;
  trainer_id: string | null;
  /** The coach's read, and the day it was written. Refresh mode needs both. */
  ai_focus: string | null;
  ai_focus_date: string | null;
}

interface RunResult {
  clientId: string;
  name: string;
  status: "written" | "focus-kept" | "skipped" | "failed";
  detail?: string;
}

/**
 * WHY THERE ARE TWO MODES.
 *
 * Dustin, 5 Sep, looking at his own home screen: *"its reading weight from the
 * wrong place. im at 205."* It was not. `clients.current_weight` said 205 and
 * his latest weigh-in said 205. The coach's read said 207 because it had been
 * WRITTEN ON 29 AUGUST, when 207.2 (17 Aug) was the most recent weigh-in he
 * had. Seven days later it was still on screen, beside live tiles it now
 * contradicted — the tiles said 4/8 and 61%, the paragraph said "5 of 8" and
 * "100%". Every figure in it was true for the week it was written in and wrong
 * for the week it was being read in.
 *
 * "weekly" is unchanged: the Saturday-night sweep that writes the week's focus,
 * coach's read and food focus for the week beginning tomorrow.
 *
 * "refresh" is the fix he chose over rewriting daily: rewrite the READ, and
 * only the read, for the clients whose numbers have actually moved since it was
 * written. A weigh-in is the trigger, because a weigh-in is the number the
 * paragraph quotes and the one that dates it. The week's focus, food focus and
 * programming question are deliberately NOT touched — those are the week's
 * copy, chosen once, and rewriting them mid-week would move the target a client
 * is working towards.
 */
export type SweepMode = "weekly" | "refresh";

async function runSweep(opts: {
  onlyClientId?: string | null;
  today?: string;
  mode?: SweepMode;
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
  //
  // A refresh runs DURING the week it is describing, so its week is the one
  // containing today and its windows are "now" rather than "nextWeek". Reusing
  // the Saturday shift here would tell a client on Wednesday how a week that
  // has not started is going — the exact complaint that produced the shift.
  const mode: SweepMode = opts.mode || "weekly";
  const week = mode === "refresh" ? weekStartOf(today) : weekStartOf(nextDay(today));
  const db = createAdminClient();

  let q = db
    .from("clients")
    .select("id, name, primary_goal, weekly_focus, weekly_focus_week, weekly_focus_source, trainer_id, ai_focus, ai_focus_date")
    .is("archived_at", null);
  if (opts.onlyClientId) q = q.eq("id", opts.onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let clients = (data as ClientRow[]) || [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const results: RunResult[] = [];

  if (mode === "refresh") {
    // ONE query for the whole roster, not one per client. 60 days is well past
    // any read worth refreshing and keeps this far under the 1,000-row cap that
    // PostgREST applies whatever .limit() asks for — the cap that has silently
    // truncated three other reads in this app.
    const since = addDays(today, -60);
    const rows = await fetchAllRowsSafe<{ client_id: string; metric_date: string }>(
      () => db.from("metrics").select("client_id, metric_date")
        .not("weight", "is", null).gte("metric_date", since)
        .order("metric_date", { ascending: false }) as never,
      { label: "weekly-ai refresh: recent weigh-ins" },
    );
    const lastWeighIn = new Map<string, string>();
    for (const r of rows) {
      const seen = lastWeighIn.get(r.client_id);
      if (!seen || r.metric_date > seen) lastWeighIn.set(r.client_id, r.metric_date);
    }
    clients = clients.filter((c) => {
      // Nothing written yet is the weekly sweep's job, not this one.
      if (!c.ai_focus || !c.ai_focus_date) return false;
      const w = lastWeighIn.get(c.id);
      return !!w && w > c.ai_focus_date;
    });
    if (!clients.length) {
      return { week, today, results: [{ clientId: "", name: "(roster)", status: "skipped", detail: "no read has been overtaken by a weigh-in" }] };
    }
  }

  // A trainer can decline the sweep for their own clients. Cached per trainer
  // rather than asked per client: 34 clients across a handful of trainers is
  // 34 round trips for the same few answers, and this runs inside a cron with
  // a time budget.
  const featureCache = new Map<string, boolean>();
  async function sweepOnFor(trainerId: string | null | undefined): Promise<boolean> {
    if (!trainerId) return true;   // unassigned client: behave as before
    const hit = featureCache.get(trainerId);
    if (hit !== undefined) return hit;
    const on = await trainerFeatureOn(db, trainerId, "weekly_focus");
    featureCache.set(trainerId, on);
    return on;
  }

  for (const c of clients) {
    const name = c.name || "(unnamed)";
    try {
      if (!(await sweepOnFor(c.trainer_id))) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "their trainer has the weekly focus off" });
        continue;
      }
      if (!apiKey) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "ANTHROPIC_API_KEY not set" });
        continue;
      }

      // "nextWeek": this sweep runs late on a Saturday and its copy is read
      // from Sunday onwards, so the window labels are shifted by one. Without
      // it the client is told how "this week" is going before their week has
      // begun — Dustin, Monday 31 Aug: "5 out of 8?? its Monday the week
      // starts today..."
      const cmp = await fetchWeeklyComparison(db, c.id, today, mode === "refresh" ? "now" : "nextWeek");

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
      // WHO they are, WHAT they were programmed session by session, WHAT they
      // have told the coach, and WHAT they were told last week. The numbers
      // block above is excellent and was, until 5 Sep, the entire context: the
      // model knew this client's adherence to the decimal and did not know they
      // had a repaired rotator cuff. See lib/ai/weekly-picture.ts.
      //
      // Best-effort. It returns "" on any failure and the week is still written
      // from the numbers, which is exactly what shipped before it existed.
      const picture = await weeklyClientPicture(db, c.id, {
        lastStart: cmp.last.window.start,
        lastEnd: cmp.last.window.end,
        currentStart: cmp.current.window.start,
        currentEnd: cmp.current.window.end,
        week,
      });

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
              (picture ? `${picture}\n\n` : "") +
              `Write this client's focus, coach's read and food focus for the week beginning ${week}, per your instructions. Work through the six thinking steps first.`,
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

      // The clients Update type, not an untyped record. This runs unattended
      // on a cron across the whole roster, which is the worst place for a
      // mistyped column to fail silently.
      const update: Database["public"]["Tables"]["clients"]["Update"] = {
        ai_focus: result.value.coachRead,
        ai_focus_date: today,
      };
      // The week's copy is chosen once and left alone. A refresh that also
      // rewrote the focus would move the target a client is working towards,
      // mid-week, because they stepped on a scale.
      if (mode === "weekly") {
        update.ai_food_focus = result.value.foodFocus;
        update.ai_food_focus_week = week;
      }
      if (mode === "weekly" && !trainerOwnsFocus) {
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
      if (mode === "weekly" && result.value.programmingQuestion && isQuestionWeek(week)) {
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
    const out = await runSweep({
      onlyClientId: sp.get("clientId"),
      mode: sp.get("mode") === "refresh" ? "refresh" : "weekly",
    });
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
  const body = await req.json().catch(() => ({}));
  const onlyClientId = typeof body?.clientId === "string" ? body.clientId : null;
  if (!authorised(req)) {
    const scope = await resolveAiScope(null);
    if (!scope.ok || !scope.scope.isTrainer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // A MANUAL SWEEP IS ONE MODEL CALL PER CLIENT, AND IT WRITES THEIR WEEK.
    //
    // Unscoped, a second trainer tapping this ran the sweep over every client
    // in the business and rewrote the owner's weekly focus copy for all of
    // them. The whole-roster form stays with cron and the owner; anyone else
    // sweeps one client at a time, and only their own.
    const me = await roster.rosterScopeFor(
      createAdminClient() as never,
      { id: scope.scope.userId, email: scope.scope.email },
    );
    if (!me.isOwner) {
      if (!onlyClientId) {
        return NextResponse.json(
          { error: "Run this one client at a time — open the client and sweep from there." },
          { status: 403 },
        );
      }
      if (!(await roster.trainerMaySeeClient(createAdminClient() as never, { id: scope.scope.userId, email: scope.scope.email }, onlyClientId))) {
        return NextResponse.json({ error: "Not your client" }, { status: 403 });
      }
    }
  }
  // Same gate as the scheduled GET. A manual sweep is one model call per client
  // — the most expensive single action in the app — so it respects the cap for
  // exactly the same reason the cron does.
  const paused = await enforceMeter(null, "weekly_sweep");
  if (paused) return paused;
  try {
    const out = await runSweep({
      onlyClientId,
      today: typeof body?.today === "string" ? body.today : undefined,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("weekly-ai sweep failed:", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
