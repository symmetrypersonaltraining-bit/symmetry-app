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
  const { error } = await sb
    .from("scheduled_workouts")
    .update({ scheduled_date: toDate })
    .eq("id", w.id);
  if (error) return "Couldn't move that workout. Try again.";

  // Best effort, and never fatal: the workout has already moved, and a stale
  // log_date is a smaller problem than telling someone the move failed when it
  // did not.
  let logId = w.workoutLogId ?? null;
  if (w.workoutLogId === undefined) {
    try {
      const { data } = await sb.from("scheduled_workouts").select("workout_log_id").eq("id", w.id).maybeSingle();
      logId = (data as { workout_log_id: string | null } | null)?.workout_log_id ?? null;
    } catch { /* no log to move, or not readable — the move itself stands */ }
  }
  if (logId) {
    try {
      await sb.from("workout_logs").update({ log_date: toDate }).eq("id", logId);
    } catch { /* schedule is authoritative for where the session sits */ }
  }
  return null;
}

/** How far back a workout may be dragged. Seven days, same on every surface. */
export const MOVE_BACK_DAYS = 7;
