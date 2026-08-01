/**
 * Workout-logger draft staleness — one definition, two consumers.
 *
 * The logger writes a localStorage draft (`symmetry_wl_{clientId}_{dayId}_{t|c}`) on every
 * state change so a client can close the app mid-session and pick up where they left off.
 * SessionDock reads those same drafts to decide whether to show the "workout in progress"
 * resume banner.
 *
 * Those two disagreed: SessionDock aged a draft out after 8h, the logger's own hydration
 * ignored `savedAt` completely and restored `sessionMode: true` forever. The result (7/31,
 * Gerard) was a client permanently re-entering the full-screen session view on every launch
 * with the dock offering no way back in either — an unclearable lock. Both sides now call
 * this, so the window can only ever be changed in one place.
 */

/** A draft older than this is "yesterday's session", not one in progress. */
export const DRAFT_STALE_MS = 8 * 60 * 60 * 1000;

/**
 * True when a draft is too old to still count as an active session.
 *
 * A missing or non-finite `savedAt` (drafts written before the field existed, or corrupted
 * ones) is treated as STALE: the safe direction is to hand the client back to the overview
 * with their data intact, never to trap them in a session view they cannot leave.
 * A `savedAt` in the future (device clock skew) is not stale — it just isn't old yet.
 */
export function isDraftStale(savedAt: unknown, now: number = Date.now()): boolean {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return true;
  return now - savedAt > DRAFT_STALE_MS;
}
