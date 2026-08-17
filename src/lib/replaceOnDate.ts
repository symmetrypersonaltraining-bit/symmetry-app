// Replacing a workout has to actually REMOVE the one it replaces.
//
// Dustin, 17 Aug: "if I replace the workout it should change the entire workout
// including the name... swap the workout should literally swap the entire
// workout."
//
// What his 17 Aug looked like when he said it:
//
//   Deload — Upper Push + Corrective        scheduled   claude
//   Deload — Cardio (20 min Walk)           scheduled   claude          ← left behind
//   Fat Loss Cardio Phase 3: Stair Master   scheduled   client_self_assign
//
// Two things were wrong and only one of them was the one in the bug report.
//
// 1. He had not used the swap picker at all — he could not have. That picker
//    only ever listed `client_owner_id is null` days, and the Stair Master is
//    one of HIS OWN saved workouts. The row's position (2, i.e. "one past the
//    busiest slot on the day") is AddWorkoutButton's signature, not doSwap's.
//    So the button he reached for was "Add a workout", which is add-only by
//    design and has no notion of replacing anything.
//
// 2. The path that DOES replace could not prove it had. It fired an update and
//    ignored the outcome. PostgREST returns its error rather than throwing, and
//    an update matching ZERO rows is not an error at all — so "replaced" was
//    reported on the strength of a request having been sent, never on a row
//    having changed. Same shape as most of the bugs found this week.
//
// This module is the decision and the proof, kept out of the components so both
// callers share one answer and the guard can be tested without a database.

/** The part of a scheduled_workouts row this decision needs. */
export interface DateOccupant {
  id: string;
  day_id: string | null;
  label?: string | null;
  position?: number | null;
  status?: string | null;
  deleted_at?: string | null;
}

/**
 * Of everything already sitting on this date, which sessions would a newly
 * added workout be replacing?
 *
 * Only outstanding work. A session already finished is history and replacing it
 * would quietly erase something the client actually did — deliberately not
 * eligible, no matter what they pick.
 *
 * The same session added onto itself is excluded too: that is a duplicate, not
 * a replacement, and skipping the original to re-add it identical would leave
 * the day looking abandoned in the log while nothing changed on screen.
 */
export function sessionsReplacedBy(occupants: DateOccupant[], newDayId: string): DateOccupant[] {
  return occupants
    .filter((o) => !o.deleted_at)
    .filter((o) => o.status === "scheduled")
    .filter((o) => o.day_id !== newDayId);
}

/**
 * Which slot the replacement takes.
 *
 * The lowest slot it is displacing, so the new session lands where the old one
 * was in the day's order instead of at the bottom. Falls back to 1 when there
 * is nothing to displace.
 */
export function slotForReplacement(replaced: DateOccupant[]): number {
  const slots = replaced
    .map((r) => r.position)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  return slots.length ? Math.min(...slots) : 1;
}

/**
 * THE GUARD. Did the skip actually skip what it was supposed to?
 *
 * Callers must chain `.select("id")` onto the update so PostgREST hands back
 * the rows it really changed, then pass those ids here. Returns null when the
 * replacement is honest, or a sentence fit to show a human when it is not.
 *
 * The zero case is called out separately because it is the exact failure that
 * shipped: every row missed, nothing said, and a screen that claims the old
 * workout is gone while the database still has it scheduled.
 */
export function skipVerdict(expected: DateOccupant[], skippedIds: string[]): string | null {
  if (expected.length === 0) return null;

  const got = new Set(skippedIds);
  const missed = expected.filter((e) => !got.has(e.id));
  if (missed.length === 0) return null;

  const name = (o: DateOccupant) => o.label || "your other session";
  if (missed.length === expected.length) {
    return `Your new workout is on the schedule, but ${missed.map(name).join(" and ")} is still there too — nothing was replaced. Refresh, and if it is still doubled up say so in a message.`;
  }
  return `Your new workout is on the schedule, but ${missed.map(name).join(" and ")} is still there as well. Refresh, and if it is still doubled up say so in a message.`;
}

/**
 * How to name what is about to be replaced, for the prompt that asks whether
 * the client means "replace" or "add as well".
 *
 * Dustin, 17 Aug, choosing this over always-replace: he wants to be ASKED,
 * because doubling up on a day and swapping a day out are both things he does
 * and the app cannot tell them apart from the tap alone.
 */
export function describeReplaced(replaced: DateOccupant[]): string {
  const names = replaced.map((r) => r.label).filter((l): l is string => !!l);
  if (names.length === 0) return "what's already scheduled";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
