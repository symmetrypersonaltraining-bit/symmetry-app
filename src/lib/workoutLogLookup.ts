// Which workout_log a resuming session should attach to.
//
// Lauren Standefer, 11 Aug 2026, 10:04am, mid-session:
//   "Couldn't finish the workout: duplicate key value violates unique
//    constraint uq_workout_log_one_completed."
//
// Her workout had completed successfully thirty-four seconds before that
// message appeared. The logger then created a SECOND log row for the same
// client / day / date, copied all 24 of her sets into it, and tried to mark
// that one complete. The partial unique index
//
//   CREATE UNIQUE INDEX uq_workout_log_one_completed
//     ON workout_logs (client_id, day_id, log_date) WHERE completed = true
//
// refused, correctly — and the refusal was reported to her as the workout
// failing to save, at the exact moment the database was protecting the
// workout that had saved.
//
// The root cause was an assumption, not a race: holding no log id was treated
// as proof that no log existed. The draft is cleared when a session completes,
// so any remount after finishing arrives with empty state and a finished
// session sitting in the database, and the old code went straight to INSERT.
//
// This module answers the question the old code never asked.

export interface ExistingLog {
  id: string;
  completed?: boolean | null;
  created_at?: string | null;
}

/**
 * Pick the log a session should resume into, from every log already recorded
 * for one client + day + date. Returns null when there is genuinely none and
 * the caller should insert.
 *
 * A COMPLETED log always wins, even over a newer incomplete one. The unique
 * index guarantees there is at most one, and it is the row that owns the
 * session — attaching to anything else is how a finished workout ends up with
 * a duplicate set of sets hanging off a second row, which is exactly what
 * happened to Lauren.
 */
export function pickExistingLog(rows: ExistingLog[]): ExistingLog | null {
  if (!rows || rows.length === 0) return null;
  const completed = rows.find((r) => r.completed === true);
  if (completed) return completed;
  // Otherwise the most recent one, so a session resumed twice keeps building on
  // the same row rather than leaving a trail of empty logs.
  const sorted = [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return sorted[0] ?? null;
}
