// Moving a workout to another day. One implementation, two surfaces.
//
// Jennifer, 2026-08-01: "Need to be able to move added workouts."
//
// She was right, and the reason was not permissions. A workout you add yourself
// is written COMPLETED (28 of 33 client-added rows are), and the day sheet —
// the only move control on the client home screen — hid its Move button for
// anything completed. Every programmed workout on the same day showed one. So
// from the outside: added workouts can't be moved, programmed ones can.
//
// A completed session is exactly WHEN you need to move it. You logged the walk,
// then realised it was sitting on Thursday instead of Wednesday. The schedule
// board already allowed this (56078e3, 1 Aug); the day sheet did not.
//
// THE PART BOTH SURFACES GOT WRONG: scheduled_workouts.scheduled_date is not
// the only date a logged session has. workout_logs.log_date is what the
// consistency calendar, the streak, the challenge board and roughly two hundred
// other reads use. Moving one without the other makes the app disagree with
// itself — the session shows on Wednesday in the schedule and Thursday in the
// streak. So the log moves with the workout, here, once, for everyone.

import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleWriteError } from "./scheduleConflict";

/**
 * What actually happened. `moved` is the ordinary case. `copied` means the
 * session had already been trained, so it stayed where it was and a fresh one
 * was put on the target date instead. Callers MUST tell the client which they
 * got — a move that silently leaves the card behind reads as a failure.
 */
export type MoveOutcome =
  | { ok: true; kind: "moved" }
  | { ok: true; kind: "copied"; fromDate: string | null }
  | { ok: false; message: string };

export interface MovableWorkout {
  id: string;
  /**
   * The session's log, when the caller already knows it. Left undefined it is
   * looked up here — four call sites reach the day sheet and none of them carry
   * workout_log_id, and one extra select is a better trade than plumbing the
   * field through all of them and getting it wrong in one.
   */
  workoutLogId?: string | null;
}

/**
 * Move a scheduled workout to `toDate`, or — when the session has already been
 * trained — leave it alone and put a copy on `toDate` instead.
 *
 * Deliberately does NOT enforce the window or the Peak Week lock: those differ
 * per surface and are checked by the caller before we touch anything.
 */
export async function moveScheduledWorkout(
  sb: SupabaseClient,
  w: MovableWorkout,
  toDate: string,
): Promise<MoveOutcome> {
  // Read BEFORE the update, because the date we are about to overwrite is the
  // thing worth keeping. Seven code paths in this app move a scheduled workout;
  // the other six all set moved_from_date and this one did not, which had two
  // consequences.
  //
  // The small one: a move made from the schedule board or the day sheet left no
  // trace it had ever been moved.
  //
  // The one that matters: `sync_supervised_workouts_to_appointments()` runs on
  // cron three times a day and pulls a supervised session onto its linked
  // appointment's date. Its guard against undoing somebody's deliberate move is
  // `moved_from_date is null` — a guard this path never armed. Move a supervised
  // session off its appointment date from the schedule board, and the job was
  // free to drag it straight back within hours, silently.
  //
  // Latent rather than observed: all 29 rows carrying a moved_from_date today
  // came from the six paths that set it, and no case of the job reversing a
  // board move has been found in the data. The guard simply was not connected.
  const { data: before } = await sb
    .from("scheduled_workouts")
    .select(
      "scheduled_date, workout_log_id, client_id, assignment_id, day_id, published_workout_id, position, source, workout_logs(completed, completed_at)",
    )
    .eq("id", w.id)
    .maybeSingle();
  const row = before as {
    scheduled_date?: string;
    workout_log_id?: string | null;
    client_id?: string;
    assignment_id?: string | null;
    day_id?: string | null;
    published_workout_id?: string | null;
    position?: number | null;
    source?: string | null;
    workout_logs?: { completed?: boolean } | null;
  } | null;
  const fromDate = row?.scheduled_date ?? null;

  // A TRAINED SESSION IS NOT MOVED. IT IS COPIED.
  //
  // Agreed with Dustin, 3 Sep. The earlier fix stopped the LOG following a
  // completed session to its new date — right, because a log records something
  // that happened and moving it made the streak and the calendar disagree. But
  // it left the schedule row free to walk off on its own, so the day you
  // actually trained went blank and the log sat there with nothing on the
  // calendar to explain it.
  //
  // You cannot move history. What people want when they drag a finished
  // session forward is the workout on the new day as well — so that is what
  // they get: the trained one stays put with its log, and a fresh copy lands on
  // the target date. No dialog: there is one right answer and asking every time
  // is friction, not safety.
  const completed = Boolean(row?.workout_logs?.completed);
  if (completed) {
    if (!row?.client_id) return { ok: false, message: "Couldn't copy that workout. Try again." };
    const { error: copyErr } = await sb.from("scheduled_workouts").insert({
      client_id: row.client_id,
      assignment_id: row.assignment_id ?? null,
      day_id: row.day_id ?? null,
      published_workout_id: row.published_workout_id ?? null,
      scheduled_date: toDate,
      position: row.position ?? 1,
      status: "scheduled",
      source: row.source ?? "trainer",
      // Provenance, and the same cron guard the move path arms below.
      moved_from_date: fromDate,
      // Deliberately NOT carried over: `workout_log_id` belongs to the session
      // that was trained, and `supervised` / `appointment_id` belong to the
      // appointment on the ORIGINAL date. Copying those would let
      // sync_supervised_workouts_to_appointments() haul the copy straight back.
    });
    if (copyErr) {
      const message = scheduleWriteError(copyErr, "copy");
      if (message) return { ok: false, message };
    }
    return { ok: true, kind: "copied", fromDate };
  }

  const { error } = await sb
    .from("scheduled_workouts")
    // Same shape as the other six paths: moved_from_date records the date this
    // move left, not the original programmed date. Omitted entirely when the
    // row could not be read, so a failed lookup cannot blank a real one.
    .update(fromDate ? { scheduled_date: toDate, moved_from_date: fromDate } : { scheduled_date: toDate })
    .eq("id", w.id);
  // A move can now collide with uq_scheduled_workout_one_per_day: the target
  // day may already hold this exact session. "Try again" would be bad advice —
  // retrying cannot work — so say what actually happened.
  if (error) {
    const message = scheduleWriteError(error, "move");
    if (message) return { ok: false, message };
  }

  // Best effort, and never fatal: the workout has already moved, and a stale
  // log_date is a smaller problem than telling someone the move failed when it
  // did not.
  let logId = w.workoutLogId ?? null;
  if (w.workoutLogId === undefined) {
    // Already fetched above, in the same round trip that got the old date.
    logId = row?.workout_log_id ?? null;
  }
  // A FINISHED SESSION NEVER REACHES HERE — see the copy branch above.
  //
  // A FINISHED SESSION'S LOG DOES NOT MOVE.
  //
  // Jenn Day, 1 Sep: "Still can't view previous weeks."
  //
  // She moved her completed 26 Aug workout to 5 Sep, and this line dragged the
  // LOG to 5 Sep with it — so the record of a session she had actually trained,
  // completed_at 2026-08-26 11:12 CT, claimed to be a week in the future. The
  // calendar and the history disagreed, last week showed a gap where a workout
  // she had done used to be, and she reported it as the app being broken.
  //
  // The schedule and the log answer different questions. The schedule is a plan
  // and Dustin and his clients move it wherever they like — that is not in
  // question and never was. The log is a record of something that happened, and
  // when it happened is not a scheduling decision. completed_at already knows.
  //
  // So: an unfinished log still follows the move (it is a shell for work not yet
  // done, and its date is part of the plan). A completed one stays put.
  if (logId) {
    try {
      // Still never fatal — the schedule has already moved and a stale log_date
      // on an unfinished shell is a smaller problem than telling someone the
      // move failed when it did not. This call returns its error rather than
      // throwing, so the catch below has never seen one and a log left on the
      // old date was completely silent.
      const { error: logErr } = await sb.from("workout_logs").update({ log_date: toDate }).eq("id", logId);
      if (logErr) console.error("moveScheduledWorkout: schedule moved, log left on the old date —", logErr.message);
    } catch { /* schedule is authoritative for where an unfinished session sits */ }
  }
  return { ok: true, kind: "moved" };
}

/** How far back a workout may be dragged. Seven days, same on every surface. */
export const MOVE_BACK_DAYS = 7;
