// Turning a unique-index violation into something a person can act on.
//
// 11 Aug 2026, Dustin: "yes add the unique index, shouldn't be doing same
// session twice." So `uq_scheduled_workout_one_per_day` now enforces one row
// per (client_id, day_id, scheduled_date) WHERE deleted_at IS NULL.
//
// A database constraint only improves things if what the user SEES improves
// too. The lesson is fresh: Lauren's workout saved fine and the raw text of
// uq_workout_log_one_completed was shown to her as a failure. A constraint
// doing its job must never read as the app breaking.
//
// So every path that writes a scheduled session runs its error through here.

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

export function isDuplicateScheduleError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; details?: string };
  if (err.code === UNIQUE_VIOLATION) {
    // Only OUR index. Another unique violation on this table is a different
    // bug and must not be dressed up as a friendly no-op.
    const hay = `${err.message ?? ""} ${err.details ?? ""}`;
    return hay.includes("uq_scheduled_workout_one_per_day") || hay.includes("scheduled_workouts");
  }
  return (err.message ?? "").includes("uq_scheduled_workout_one_per_day");
}

/**
 * What to show. `verb` is what the user was trying to do, so the sentence fits
 * the button they pressed: "add", "move", "paste", "schedule".
 */
export function duplicateScheduleMessage(verb = "add"): string {
  return `That session is already on the calendar for that day, so there's nothing to ${verb}.`;
}

/**
 * The whole treatment in one call. Returns null when the write succeeded OR
 * when it failed only because the session was already there — both mean the
 * calendar now says what the user wanted it to say, which is the only thing
 * they care about. Returns a message for anything else.
 */
export function scheduleWriteError(e: unknown, verb = "add"): string | null {
  if (!e) return null;
  if (isDuplicateScheduleError(e)) return duplicateScheduleMessage(verb);
  const msg = (e as { message?: string })?.message;
  return msg ? `Couldn't ${verb} that workout: ${msg}` : `Couldn't ${verb} that workout. Try again.`;
}
