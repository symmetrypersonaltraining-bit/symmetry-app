// Doing a planned session EARLY should use up its slot, not add a new one.
//
// Sara Prince, 11 Aug: "Did hip and ankle mobility Sunday to get a head start.
// The app added additional sessions to Sunday instead of giving me credit for
// two week mobility sessions."
//
// She was right. "+ Add workout" inserted a new scheduled_workouts row every
// time, and the sessions she had actually just done were still sitting on the
// calendar later in the week. Her week went from 7 planned sessions to 9, three
// of them done, and her adherence read 30% for getting ahead of schedule.
//
// So before inserting, look for the same session already scheduled later and
// MOVE it to the day she did it.
//
// THE BOUND THAT MATTERS: only within the same 7 days. Someone who does an
// extra mobility session on top of their plan should get an extra session —
// stealing a slot from next week would be Sara's complaint in reverse, with the
// app quietly deleting work she still owes. Near enough in time to be plainly
// "the session I was going to do anyway"; far enough away and it is a bonus.

/** The subset of a scheduled_workouts row this decision needs. */
export interface SlotCandidate {
  id: string;
  day_id: string | null;
  scheduled_date: string; // YYYY-MM-DD
  status: string | null;
  deleted_at?: string | null;
}

/** Days ahead a planned session can be pulled from. One week, deliberately. */
export const PULL_FORWARD_WINDOW_DAYS = 7;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/**
 * Which already-scheduled slot should this session consume, if any?
 *
 * Returns the row to move, or null to insert a new one.
 *
 * Only ever picks a row that is:
 *   - the same session (same day_id),
 *   - still outstanding (status 'scheduled' — never steals a completed one),
 *   - not soft-deleted,
 *   - dated AFTER the day being logged (you cannot pull something forward from
 *     the past; a missed session is a different problem),
 *   - within PULL_FORWARD_WINDOW_DAYS.
 *
 * When several qualify it takes the SOONEST, so the calendar stays dense at the
 * front and the client is never left with a gap they did not choose.
 */
export function findSlotToPullForward(
  candidates: SlotCandidate[],
  dayId: string | string[],
  pickedDate: string,
): SlotCandidate | null {
  // `dayId` accepts the whole swap FAMILY, not just one id. A swap forks the
  // shared day into a private copy (`days.swapped_from_day_id`) and repoints
  // the scheduled row at the copy — so "the same session" stops being one id
  // the moment anybody swaps. Matching on identity here is what let a session
  // done early insert a second card instead of consuming its own slot, which is
  // Sara Prince's complaint arriving through the fork door.
  const family = new Set(Array.isArray(dayId) ? dayId : [dayId]);
  const eligible = candidates
    .filter((c) => !!c.day_id && family.has(c.day_id))
    .filter((c) => !c.deleted_at)
    .filter((c) => c.status === "scheduled")
    .filter((c) => {
      const delta = daysBetween(pickedDate, c.scheduled_date);
      return delta > 0 && delta <= PULL_FORWARD_WINDOW_DAYS;
    })
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  return eligible[0] ?? null;
}
