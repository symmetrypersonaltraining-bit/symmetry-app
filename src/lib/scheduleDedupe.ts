// Stops the schedule from growing copies of itself.
//
// Backlog item 2. Six duplicate (client, day, date) groups existed across a
// 60-day window, and four of them shared a created_at to the MICROSECOND —
// meaning one insert batch wrote the same session twice. That is the
// copy-week path: `copyCurrentWeek` reads whatever the calendar is showing
// and `pasteWeekBulk` writes it back, so a week that already held a duplicate
// pastes two rows forward, and every subsequent paste doubles again. Bobbie
// Page carried four of the six groups, which is what that looks like.
//
// Two separate leaks, both closed here:
//   1. the same (day, date) appearing twice inside ONE pasted batch, and
//   2. pasting over a date that already carries that session.
//
// Deliberately NOT handled here: a database-level unique constraint. That
// would also forbid legitimately doing the same session twice in one day,
// which is Dustin's call, not mine.

export type SlotKey = { day_id: string | null; scheduled_date: string };

export type ExistingSlot = SlotKey & { deleted_at?: string | null };

function key(s: SlotKey): string {
  return `${s.day_id ?? ""}|${s.scheduled_date}`;
}

/**
 * Rows already on the calendar that a paste must not duplicate.
 * Soft-deleted rows do not count — a deleted session is gone, and blocking a
 * paste because of one would look like the paste silently failing.
 */
export function occupiedKeys(existing: ExistingSlot[]): Set<string> {
  const out = new Set<string>();
  for (const e of existing) {
    if (e.deleted_at) continue;
    out.add(key(e));
  }
  return out;
}

/**
 * Filter candidate insert rows down to the ones that are genuinely new.
 * Order is preserved, and the first occurrence of a repeated key wins so the
 * surviving row is the one the trainer saw first.
 */
export function dedupeInsertRows<T extends SlotKey>(
  candidates: T[],
  existing: ExistingSlot[] = []
): T[] {
  const seen = occupiedKeys(existing);
  const out: T[] = [];
  for (const c of candidates) {
    // A row with no day_id is a one-off custom session; it has no identity to
    // collide on, so it always inserts.
    if (!c.day_id) { out.push(c); continue; }
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
