// Timezone-SAFE ISO weekday from a calendar date string.
//
// The app computes the viewed date as the America/Chicago CALENDAR date string
// (e.g. via toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) →
// 'YYYY-MM-DD'). To get its weekday we must read the Y-M-D components directly
// and evaluate them in UTC — NEVER `new Date('YYYY-MM-DD')` or `new Date(y,m,d)`
// which drift with the runtime's local timezone (the classic day-of-week bug).
//
// Returns ISO weekday: 1 = Monday … 7 = Sunday.

export function isoWeekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  // Date.UTC avoids any local-timezone shift: the components are anchored to
  // UTC midnight, and getUTCDay reads them back with no drift.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow; // → 1=Mon..7=Sun (ISO)
}
