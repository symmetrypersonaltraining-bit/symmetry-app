// Deleting a workout must remove the one you tapped, and must not quietly
// throw away a session you already finished.
//
// Dustin, 17 Aug: "I tried to add one to tomorrow, it popped up on today as a
// 3rd then I deleted that one. my logged one unlogged after that."
//
// The timestamps say he is right. The 3rd Stair Master he tapped delete on was
// still alive; his COMPLETED Upper Push — 70 minutes, a real log behind it —
// was soft-deleted 2.5 minutes later. The write was `removeWorkout`: it sets
// `deleted_at` and leaves `updated_at` alone, and nothing else in the app does
// that.
//
// The mechanism is NOT established. `removeWorkout` targets `.eq("id", w.id)`,
// the row's own id, and the list keys are `w.id`, so the two obvious causes are
// ruled out. This module does not pretend to know the cause. It removes the
// HARM, which is worth doing on its own and does not depend on the diagnosis:
//
//   1. A finished session is not thrown away on one tap.
//   2. A delete that did not remove what it named says so, instead of
//      optimistically clearing a row off the screen and moving on.
//
// Rule 2 is the one that would have caught this on the night. The delete
// removes the row from the list first and only then writes; if the write hits a
// different row — or no row — the screen still shows exactly what you asked
// for, and the damage is somewhere you are not looking.

export interface RemovableWorkout {
  id: string;
  label?: string | null;
  date?: string | null;
  status?: string | null;
  /** Set when a real workout_log is attached — i.e. it was actually trained. */
  workoutLogId?: string | null;
}

/**
 * A second confirmation, when one is warranted.
 *
 * Returns null for an ordinary scheduled session — those delete on the normal
 * single confirm, because removing a session you have not done yet is routine
 * and making it a two-step would be noise.
 *
 * Returns a sentence for a session that has been COMPLETED. Deleting one of
 * those is not tidying a calendar, it is erasing training that happened: the
 * week's adherence drops, the streak breaks, and the log is orphaned.
 */
export function extraConfirmFor(w: RemovableWorkout): string | null {
  const done = w.status === "completed" || !!w.workoutLogId;
  if (!done) return null;
  const name = w.label || "That session";
  return `${name} is already logged as DONE. Deleting it removes the workout you completed and your week's adherence will drop. Are you sure?`;
}

/**
 * Did the delete remove the row it named?
 *
 * The caller must chain `.select("id")` so PostgREST hands back the rows it
 * really changed. An update matching zero rows is not an error, and this
 * function exists because a delete that silently misses looks identical on
 * screen to one that worked — the row is filtered out of the list either way.
 *
 * Returns null when honest, or a sentence fit to show someone.
 */
export function removalVerdict(expectedId: string, changedIds: string[]): string | null {
  if (changedIds.length === 0) {
    return "Nothing was removed — that workout is still on your schedule. Pull down to refresh and try again.";
  }
  if (!changedIds.includes(expectedId)) {
    return "Something else was removed instead of the one you picked. Refresh and check your schedule, and say what you tapped in a message.";
  }
  if (changedIds.length > 1) {
    return "More than one workout was removed. Refresh and check your schedule.";
  }
  return null;
}
