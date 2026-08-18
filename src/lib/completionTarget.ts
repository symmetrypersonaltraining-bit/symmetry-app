// Finishing a workout must credit the session you actually opened.
//
// Dustin, 17 Aug: "I logged both workouts today..." — with a screenshot showing
// both still on Start and the week at 0% adherence.
//
// WHAT THE DATABASE SAID
//
//   workout_logs   Deload — Upper Push + Corrective   started 16:15  done 17:25 ✅
//   scheduled_workouts 2026-08-17  Upper Push   status 'scheduled'   ← today, untouched
//   scheduled_workouts 2026-08-10  Upper Push   status 'completed', workout_log_id = today's log
//
// It closed LAST MONDAY'S session with today's workout and left today open.
//
// WHY. At 17:02, while he was mid-session, the day was FORKED: a personal copy
// of the shared day was created (`origin: 'library_fork'`, owner Dustin) and
// today's scheduled row was repointed at the copy. The logger had loaded the
// ORIGINAL day at 16:15 and still held that id.
//
// completeWorkout looked for today's row by `day_id` — the id it was holding,
// which nothing pointed at any more — found nothing, and fell through to the
// make-up fallback: "the most recent still-scheduled instance of this workout
// on or before today". That was 10 August.
//
// The fallback is not wrong. Logging a session you missed last week SHOULD
// credit last week; that behaviour was built deliberately. What is wrong is
// reaching it at all, because the day moved underneath a screen that was
// already open.
//
// THE FIX, and it needs no new data: the page already resolves the exact
// scheduled_workouts row when it opens the session, and hands it to the logger
// as `scheduledWorkoutId`. completeWorkout never looked at it. A row id does
// not change when a fork repoints day_id, so preferring it makes the whole
// class of problem go away — the fork, the swap, anything that rewrites day_id
// while somebody is lifting.

/** The subset of a scheduled_workouts row this decision needs. */
export interface CompletionCandidate {
  id: string;
  day_id?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

export type CompletionSource =
  /** The exact row the session was opened from. Immune to a day_id rewrite. */
  | "opened-row"
  /** Rows matching this day on the session's own date. */
  | "today"
  /** A missed session being made up. Real, and deliberately kept. */
  | "past"
  /** Nothing to complete — the caller inserts a row. */
  | "none";

export interface CompletionChoice {
  ids: string[];
  source: CompletionSource;
  /** True when the choice credits a date other than the session's own. */
  crossesDate: boolean;
}

/**
 * Which scheduled rows should this finished workout mark complete?
 *
 * `openedRow` is the row the logger was opened from, when there was one. It
 * wins whenever it is still live, because it is the only identifier that
 * survives the day being forked mid-session.
 *
 * `todayRows` are the live rows for this day on the session's own date, and are
 * returned WHOLE rather than first-one-wins: two rows for the same session is a
 * real state in this data, and completing one leaves the other saying "not
 * done" on the home screen.
 */
export function chooseCompletionTargets(
  openedRow: CompletionCandidate | null | undefined,
  todayRows: CompletionCandidate[],
  sessionDate: string,
): CompletionChoice {
  const live = (r: CompletionCandidate | null | undefined) =>
    !!r && !r.deleted_at && r.status !== "completed";

  // 1. The row this session was actually opened from.
  if (live(openedRow)) {
    const r = openedRow as CompletionCandidate;
    return {
      ids: [r.id],
      source: "opened-row",
      crossesDate: !!r.scheduled_date && r.scheduled_date !== sessionDate,
    };
  }

  // 2. Everything live on this day, on the session's own date.
  const today = todayRows.filter((r) => !r.deleted_at && r.scheduled_date === sessionDate);
  if (today.length) {
    return { ids: today.map((r) => r.id), source: "today", crossesDate: false };
  }

  return { ids: [], source: "none", crossesDate: false };
}

/**
 * Did the completion actually land?
 *
 * The caller must chain `.select("id")` so PostgREST returns the rows it really
 * changed. An update matching zero rows is not an error — the same shape that
 * has produced most of this week's bugs, and the reason a workout can be
 * "finished" on screen while the schedule still says otherwise.
 *
 * Returns null when honest, or a sentence fit to show someone mid-session.
 */
export function completionVerdict(expectedIds: string[], changedIds: string[]): string | null {
  if (expectedIds.length === 0) return null;
  const got = new Set(changedIds);
  const missed = expectedIds.filter((id) => !got.has(id));
  if (missed.length === 0) return null;
  return missed.length === expectedIds.length
    ? "Your sets are saved, but the schedule still shows this workout as not done. Refresh, and tell your coach if it stays that way."
    : "Your sets are saved, but part of today's schedule still shows as not done. Refresh, and tell your coach if it stays that way.";
}

// ─── THE SAME HOLE, ONE DAY LATER ────────────────────────────────────────────
//
// Hassan Kareem, 18 Aug: "hassan has 2 workouts today, I logged one but 2nd one
// is showing." Identical shape to Dustin's the day before, and the fix above
// did not catch it:
//
//   days              d89af543  'library_fork'  swapped_from f344828c  created 13:38:31
//   workout_logs      P2 A — Lower / Posterior Chain   day_id f344828c  done 13:57
//   scheduled_workouts 2026-08-18  day_id d89af543  'scheduled'   <- today, untouched
//   scheduled_workouts 2026-08-11  day_id f344828c  'completed', workout_log_id = today's
//
// The opened-row preference above only helps while the logger HAS the opened
// row. `scheduledWorkoutId` is resolved server-side by (day_id, date) when the
// page renders. Render the page after the swap has repointed today's row at the
// fork, holding the original day id, and that lookup finds nothing — the prop
// is null, the day_id lookup for today is empty, and the make-up fallback
// reaches back to 11 August exactly as before.
//
// So the day_id itself has to stop being treated as an identity. A swap does
// not create a different session; it creates a private copy of the same one,
// and `days.swapped_from_day_id` records that. Completion now matches on the
// whole FAMILY — the day, whatever it was forked from, and every fork of that
// root — so the original and the copy are one session for the purpose of
// deciding what today's workout closes.
//
// The point is not that the family lookup finds the row. It is that finding it
// means the past and future fallbacks are never reached, which is where both
// wrong credits came from.

/** A `days` row, reduced to what lineage needs. */
export interface DayKin {
  id: string;
  swapped_from_day_id?: string | null;
}

/**
 * The root of a day's swap lineage: the shared day it was forked from, or
 * itself when it is the shared day.
 */
export function lineageRoot(openedDayId: string, kin: DayKin[]): string {
  const self = kin.find((d) => d.id === openedDayId);
  return self?.swapped_from_day_id || openedDayId;
}

/**
 * Every day id that means "the session the client is actually doing".
 *
 * The opened day always comes first and is always present, so a caller that
 * cannot read `days` at all degrades to today's behaviour rather than to an
 * empty `IN ()` that would silently match nothing.
 */
export function dayFamilyIds(openedDayId: string, root: string, kin: DayKin[]): string[] {
  const out = [openedDayId, root];
  for (const d of kin) {
    if (d.id === root || d.swapped_from_day_id === root) out.push(d.id);
  }
  return [...new Set(out.filter(Boolean))];
}
