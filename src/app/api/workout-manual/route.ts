// POST /api/workout-manual — build a workout BY HAND. No model, no tokens.
//
// Dustin: "is there a way for plp to just manually enter a custom workout
// without using ai?"
//
// The honest answer was "half". A client could TYPE what they did as free text
// in two places, but there was no way to build a real workout — exercises,
// sets, reps — and then log it set by set. Every structured path went through
// /api/workout-ai. So anyone who already knew exactly what they wanted to do
// had to describe it to a model and hope it came back with the same thing.
//
// And the typed path had a broken promise attached to it. "I did something
// else" wrote a row into offplan_workout_logs with status 'pending' and told
// the client "it becomes a library workout tonight". Nothing has processed one
// of those since 2026-07-29 — whatever used to roll them up is gone, there is
// no function in the database and no route in this codebase that reads the
// table. Thirteen rows went through; anything typed after that would have sat
// there forever while the UI claimed otherwise.
//
// This route does the thing directly instead of promising it for later:
// it creates a client-owned day, sections and prescribed exercises, and
// optionally marks it done. Same shapes /api/workout-ai writes, so the logger,
// history, progress and the client's library all treat it identically — a
// manual workout is not a second-class one.
//
// WHY A ROUTE AND NOT A CLIENT-SIDE INSERT. It writes to five tables and has to
// be all-or-nothing; a half-created day with no exercises is worse than a
// failure, because it looks like a workout until you open it.

import { NextResponse } from "next/server";
import { resolveAiScope } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CT_TODAY,
  createManualWorkout,
  type ManualExercise,
} from "@/lib/workouts/manualWorkout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: {
    clientId?: string;
    title?: string;
    date?: string;
    exercises?: ManualExercise[];
    markDone?: boolean;
    /** Free text for an already-finished session with no structured exercises. */
    note?: string;
    replaceDayId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // resolveAiScope already enforces the rule we need: a trainer may act for any
  // client, a client only for themselves, and anyone else gets a 403. Passing
  // the requested id through it is the check — re-implementing it here would be
  // a second copy that can drift, which is the shape of most of tonight's bugs.
  const scoped = await resolveAiScope(body.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  const clientId = scoped.scope.clientId;
  if (!clientId) return NextResponse.json({ error: "No client" }, { status: 400 });

  const title = (body.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Give the workout a name." }, { status: 400 });

  const exercises = (body.exercises || []).filter((e) => e && typeof e.name === "string" && e.name.trim());
  const note = (body.note || "").trim().slice(0, 2000);

  // A FINISHED session may have no structured exercises, and that is the whole
  // point of the "just type what I did" path.
  //
  // Dustin, 14 Aug: "when they add a custom workout it needs to add as logged
  // on schedule. this has been an ongoing issue. if they add a workout through
  // any route it needs to show up period."
  //
  // Free text used to go to offplan_workout_logs, which nothing on the schedule
  // reads and nothing has processed since 2026-07-29. Todd Prine typed a run
  // into it and reasonably concluded it had not saved. Routing that text
  // through HERE instead gives it the same day / workout_log /
  // scheduled_workouts shape as every other way of adding a workout, so it
  // lands on the calendar like anything else.
  //
  // Still required for a workout that has NOT happened yet: a plan with no
  // movements in it is not a plan, and would open to an empty logger.
  if (!exercises.length && !(body.markDone && note)) {
    return NextResponse.json({ error: "Add at least one exercise." }, { status: 400 });
  }
  if (exercises.length > 40) return NextResponse.json({ error: "That's more than 40 exercises." }, { status: 400 });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? (body.date as string) : CT_TODAY();

  // ⚠️ A SESSION CANNOT HAVE BEEN COMPLETED ON A DAY THAT HAS NOT HAPPENED.
  //
  // The picker allows 35 days ahead, which is right for SCHEDULING a workout
  // and wrong the moment "mark completed on this date" is ticked. One live
  // instance: a completed log dated 2026-08-28, created on 25 Aug, duration
  // 0.19 seconds, zero sets. Celeste has used the same button five times this
  // month, so it is a path people actually take.
  //
  // Guarded on the SERVER, not only in the picker. A max= attribute is a
  // courtesy to the person typing; it is not a rule, and anything that posts to
  // this route directly never sees it.
  if (body.markDone && date > CT_TODAY()) {
    return NextResponse.json(
      { error: "That date hasn't happened yet, so the workout can't already be done. Schedule it instead, or pick a date up to today." },
      { status: 400 },
    );
  }

  // THE WRITE LIVES IN lib/workouts/manualWorkout.ts.
  //
  // Extracted 13 Sep 2026 when the ✦ Coach needed the same thing: "log a 3 mile
  // hike for my cardio today" had no tool behind it, so the coach said "Done."
  // and wrote nothing. A second copy of how a typed workout is stored is how
  // two paths end up disagreeing about what a logged session is — which is
  // exactly what offplan_workout_logs already did to Todd Prine's run.
  //
  // Everything above this line is REQUEST validation and stays here. Everything
  // below it is the write, and it is shared.
  const result = await createManualWorkout(createAdminClient(), clientId, {
    title,
    date,
    exercises,
    markDone: !!body.markDone,
    note,
    replaceDayId: body.replaceDayId ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, dayId: result.dayId, date: result.date, markedDone: result.markedDone });
}
