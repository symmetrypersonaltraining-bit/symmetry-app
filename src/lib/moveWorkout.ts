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
 * Move a scheduled workout to `toDate`. Returns null on success, or a message
 * fit to show the client.
 *
 * Deliberately does NOT enforce the window or the Peak Week lock: those differ
 * per surface and are checked by the caller before we touch anything.
 */
export async function moveScheduledWorkout(
  sb: SupabaseClient,
  w: MovableWorkout,
  toDate: string,
): Promise<string | null> {
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
    .select("scheduled_date, workout_log_id")
    .eq("id", w.id)
    .maybeSingle();
  const fromDate = (before as { scheduled_date?: string } | null)?.scheduled_date ?? null;

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
  if (error) return scheduleWriteError(error, "move");

  // Best effort, and never fatal: the workout has already moved, and a stale
  // log_date is a smaller problem than telling someone the move failed when it
  // did not.
  let logId = w.workoutLogId ?? null;
  if (w.workoutLogId === undefined) {
    // Already fetched above, in the same round trip that got the old date.
    logId = (before as { workout_log_id?: string | null } | null)?.workout_log_id ?? null;
  }
  if (logId) {
    try {
      // Still never fatal — the reasoning above holds, the schedule is
      // authoritative and a stale log_date is the smaller problem. But this
      // call returns its error rather than throwing, so the catch below has
      // never seen one and a log left on the old date was completely silent.
      const { error: logErr } = await sb.from("workout_logs").update({ log_date: toDate }).eq("id", logId);
      if (logErr) console.error("moveScheduledWorkout: schedule moved, log left on the old date —", logErr.message);
    } catch { /* schedule is authoritative for where the session sits */ }
  }
  return null;
}

/** How far back a workout may be dragged. Seven days, same on every surface. */
export const MOVE_BACK_DAYS = 7;
