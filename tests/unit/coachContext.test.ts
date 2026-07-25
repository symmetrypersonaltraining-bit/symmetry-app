// ============================================================================
// Unit test — nutrition coach context: today (in-progress) vs completed days.
// Run: npm run test:unit   (node --import tsx --test)
//
// The coach must judge averages/trends/consistency ONLY on FINISHED days. A
// partial current day (e.g. 515 of 1963 kcal logged this morning) must land in
// todaySoFar (inProgress) and NEVER in completedDays — otherwise it gets scored
// as a big deficit and drags averages down.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitTodayFromCompleted, DayTotal } from "../../src/lib/ai/coach-context";

const TODAY = "2026-07-24";

// Ascending by date (as fetchDailyTotals returns), most recent = today.
const totals: DayTotal[] = [
  { date: "2026-07-21", kcal: 1980, p: 175, c: 190, f: 60, logged: 5 },
  { date: "2026-07-22", kcal: 1920, p: 168, c: 185, f: 58, logged: 5 },
  { date: "2026-07-23", kcal: 2010, p: 180, c: 195, f: 61, logged: 5 },
  { date: "2026-07-24", kcal: 515, p: 40, c: 55, f: 12, logged: 1 }, // TODAY, partial
];

describe("splitTodayFromCompleted", () => {
  const { todaySoFar, completedDays } = splitTodayFromCompleted(totals, TODAY);

  it("puts the partial current day in todaySoFar with inProgress:true", () => {
    assert.ok(todaySoFar);
    assert.equal(todaySoFar!.date, TODAY);
    assert.equal(todaySoFar!.kcal, 515);
    assert.equal(todaySoFar!.inProgress, true);
  });

  it("EXCLUDES today from completedDays", () => {
    assert.equal(completedDays.length, 3);
    assert.ok(!completedDays.some((d) => d.date === TODAY));
  });

  it("completed-day averages are NOT dragged down by today's partial", () => {
    const avg = completedDays.reduce((s, d) => s + d.kcal, 0) / completedDays.length;
    assert.equal(Math.round(avg), 1970); // (1980+1920+2010)/3, not diluted by 515
  });

  it("returns null todaySoFar when nothing is logged today", () => {
    const past = totals.filter((d) => d.date !== TODAY);
    const res = splitTodayFromCompleted(past, TODAY);
    assert.equal(res.todaySoFar, null);
    assert.equal(res.completedDays.length, 3);
  });

  it("does not mutate the input rows", () => {
    const before = JSON.stringify(totals);
    splitTodayFromCompleted(totals, TODAY);
    assert.equal(JSON.stringify(totals), before);
  });
});
