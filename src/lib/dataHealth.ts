// Which integrity checks /settings/data-health should show.
//
// ── WHY THIS IS NOT "THE ROWS FROM THE NEWEST TIMESTAMP" ─────────────────────
//
// It was, and that is a green all-clear that can be wrong.
//
// The nightly cron runs eight check functions inside ONE transaction, so all
// twenty-three checks share a single `ran_at` and filtering on the newest
// timestamp gave the whole board. But a check function run by hand — a session
// verifying one thing, which has happened at least six times — writes one to
// three rows with a NEWER timestamp of its own. The page then showed only those
// rows, because they were the newest, and the other twenty checks vanished.
//
// On 7 Sep at 3:20pm Central a one-off run wrote three rows. Until the 6:25pm
// cron, /settings/data-health showed three checks instead of twenty-three, and
// all five criticals were among the twenty it was not showing. If those three
// had been clean it would have said "Everything passed — all 3 checks came back
// clean on the last run" with the criticals unread.
//
// So: the latest row PER CHECK, not the rows sharing the latest timestamp. The
// window is what keeps a retired check from coming back — a check the runners
// no longer emit (`scheduled_workout_null_assignment_id`, retired 3 Sep after
// all 493 of its rows turned out to be the standard shape) keeps its last row
// in the table for ever, and resurrecting it would be re-reporting a fault that
// was deliberately closed.

export type IntegrityRow = {
  check_name: string;
  severity: string;
  count: number;
  detail: unknown;
  ran_at: string;
};

/** Two runs a day, twelve hours apart. 36 hours clears a missed run and no more. */
export const DEFAULT_WINDOW_HOURS = 36;

const ORDER: Record<string, number> = { critical: 0, warn: 1, info: 2 };

/**
 * The board as it stands: one row per check — its most recent — keeping only
 * checks still being reported, sorted critical first and by size within that.
 *
 * `rows` may arrive in any order. `windowHours` is measured back from the
 * newest row present, not from the wall clock, so the page reads the same when
 * the checker itself has stopped running.
 */
export function liveChecks(rows: IntegrityRow[], windowHours = DEFAULT_WINDOW_HOURS): IntegrityRow[] {
  if (!rows.length) return [];

  const at = (r: IntegrityRow) => new Date(r.ran_at).getTime();
  const newest = Math.max(...rows.map(at));
  const cutoff = newest - windowHours * 3600_000;

  const latest = new Map<string, IntegrityRow>();
  for (const r of rows) {
    if (at(r) < cutoff) continue;
    const held = latest.get(r.check_name);
    if (!held || at(r) > at(held)) latest.set(r.check_name, r);
  }

  return [...latest.values()].sort(
    (a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3) || b.count - a.count,
  );
}

/** The last time anything was checked at all — what the page dates itself by. */
export function lastCheckedAt(rows: IntegrityRow[]): string | null {
  if (!rows.length) return null;
  return rows.reduce((mx, r) => (new Date(r.ran_at) > new Date(mx) ? r.ran_at : mx), rows[0].ran_at);
}
