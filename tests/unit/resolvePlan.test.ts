// ============================================================================
// Unit tests — src/lib/nutrition/resolvePlan.ts (day-group plan selection).
// Run: npm run test:unit   (node --import tsx --test)
//
// SAFETY-critical: verifies the resolver is additive. A client with one
// null-day_group live plan gets that plan for every weekday (unchanged), while
// a day-group client (Tyler: {1,4,6}/{2,5}/{3,7}) gets the right menu per day.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickPlanForDate } from "../../src/lib/nutrition/resolvePlan";

type P = { id: string; day_group?: number[] | null; effective_date?: string };

// Mon..Sun span used throughout (2026-07-27 Mon .. 2026-08-02 Sun).
const WEEK = {
  1: "2026-07-27", 2: "2026-07-28", 3: "2026-07-29",
  4: "2026-07-30", 5: "2026-07-31", 6: "2026-08-01", 7: "2026-08-02",
} as Record<number, string>;

describe("(a) single null-day_group plan → unchanged for every weekday", () => {
  const everyday: P[] = [{ id: "everyday", day_group: null }];
  it("returns it for wd 1..7", () => {
    for (let wd = 1; wd <= 7; wd++) {
      assert.equal(pickPlanForDate(everyday, WEEK[wd])?.id, "everyday", `wd ${wd}`);
    }
  });
});

describe("(b) three day-group plans {1,4,6}/{2,5}/{3,7} (Tyler)", () => {
  // Candidate order = effective_date desc, created_at desc (as fetched).
  const plans: P[] = [
    { id: "A", day_group: [1, 4, 6] },
    { id: "B", day_group: [2, 5] },
    { id: "C", day_group: [3, 7] },
  ];
  const expected: Record<number, string> = { 1: "A", 4: "A", 6: "A", 2: "B", 5: "B", 3: "C", 7: "C" };
  it("returns the correct plan for each of wd 1..7", () => {
    for (let wd = 1; wd <= 7; wd++) {
      assert.equal(pickPlanForDate(plans, WEEK[wd])?.id, expected[wd], `wd ${wd}`);
    }
  });
  it("returns null on a weekday no group covers (no everyday fallback)", () => {
    const partial: P[] = [{ id: "A", day_group: [1, 4, 6] }];
    assert.equal(pickPlanForDate(partial, WEEK[2]), null); // Tue not covered, no null plan
  });
});

describe("(c) mixed: day-group plans + an everyday fallback", () => {
  const plans: P[] = [
    { id: "gym146", day_group: [1, 4, 6] },
    { id: "gym25", day_group: [2, 5] },
    { id: "fallback", day_group: null },
  ];
  it("uses the day-group when it matches", () => {
    assert.equal(pickPlanForDate(plans, WEEK[1])?.id, "gym146");
    assert.equal(pickPlanForDate(plans, WEEK[5])?.id, "gym25");
  });
  it("falls back to the everyday plan when no group matches (wd 3,7)", () => {
    assert.equal(pickPlanForDate(plans, WEEK[3])?.id, "fallback");
    assert.equal(pickPlanForDate(plans, WEEK[7])?.id, "fallback");
  });
  it("treats an empty day_group array as everyday", () => {
    const withEmpty: P[] = [{ id: "empty", day_group: [] }];
    assert.equal(pickPlanForDate(withEmpty, WEEK[4])?.id, "empty");
  });
});

describe("(d) effective_date filtering is the caller's job; picker respects order", () => {
  // fetchLivePlans applies `effective_date <= date`, so a FUTURE-dated plan is
  // never in the candidate list. Simulate that: a future plan excluded upstream
  // means only the current one is passed → it is chosen, not the future one.
  const currentOnly: P[] = [{ id: "current", day_group: [1, 4, 6] }];
  it("chooses the in-effect plan for its weekday", () => {
    assert.equal(pickPlanForDate(currentOnly, WEEK[4])?.id, "current");
  });
  it("first matching candidate wins when two cover the same weekday (newest first)", () => {
    const dup: P[] = [
      { id: "newer", day_group: [1] },
      { id: "older", day_group: [1] },
    ];
    assert.equal(pickPlanForDate(dup, WEEK[1])?.id, "newer");
  });
});
