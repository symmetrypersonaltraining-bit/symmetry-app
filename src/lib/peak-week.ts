// THE ONE PLACE PEAK WEEK IS DEFINED.
//
// This lived as a pair of module-level constants in TWO components —
// ScheduleBoard and WorkoutDaySheet — each with its own copy of the dates and
// neither aware of whose week it was. Every client on the roster got Dustin's
// peak week: padlocks on every day of 2026-08-03 → 08-09, and no way to move a
// session. Tyler Dorsett hit it on the schedule board at 5:17 AM ("My workouts
// are locked and it won't let me access them"), and Todd could not pull a
// missed workout forward to today because the day sheet enforced the same
// range from its own copy.
//
// Fixing one component left the other broken, which is the whole argument for
// this file: one definition, one scope check, and adding a third surface means
// importing this rather than retyping a date.
//
// If a real per-client freeze is ever wanted, it belongs in the database next
// to the client it applies to. This constant is a stopgap for one person's
// shoot week and should be deleted after it, not extended.

export const PEAK_WEEK = {
  clientId: "69021074-1708-4d73-9245-918862048709", // Dustin
  start: "2026-08-03",
  end: "2026-08-09",
} as const;

/**
 * Is `date` frozen for the client whose schedule is being shown?
 *
 * `ownerClientId` is REQUIRED and unforgiving on purpose: an empty or unknown
 * owner returns false (nothing locked) rather than falling back to locking
 * everyone, which is exactly the failure this replaces. The safe default for a
 * freeze is "off".
 */
export function isPeakWeekLocked(date: string, ownerClientId: string | null | undefined): boolean {
  if (!ownerClientId || ownerClientId !== PEAK_WEEK.clientId) return false;
  return date >= PEAK_WEEK.start && date <= PEAK_WEEK.end;
}
