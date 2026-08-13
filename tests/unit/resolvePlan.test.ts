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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_LOOKAHEAD_DAYS, pickPlanForDate, shiftDate } from "../../src/lib/nutrition/resolvePlan";

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

describe("(d) a plan that has not started yet cannot govern an earlier day", () => {
  /**
   * Dustin, 2026-08-05: "If we set up a meal plan that changes, it needs to be
   * scheduled ahead of time. And I need to be able to see it days ahead of
   * time, instead of having you flip it on live day-by-day, like we did with my
   * peak. That did not work."
   *
   * fetchLivePlans used to stop at today, so paging forward showed the CURRENT
   * menu for a day it would not actually govern, and the only way to make a
   * scheduled plan appear was to flip it live that morning. It reaches eight
   * weeks forward now — which means the candidate list contains plans that have
   * not started, and the effective_date comparison had to move in here, against
   * the date being VIEWED.
   *
   * The failure this guards against is the expensive direction: next week's
   * menu showing up on today's screen.
   */
  const set: P[] = [
    { id: "peak", day_group: null, effective_date: "2026-08-10" },   // starts Monday
    { id: "current", day_group: null, effective_date: "2026-07-01" },
  ];

  it("shows the current plan the day before the new one starts", () => {
    assert.equal(pickPlanForDate(set, "2026-08-09")?.id, "current");
  });
  it("shows the scheduled plan on its first day", () => {
    assert.equal(pickPlanForDate(set, "2026-08-10")?.id, "peak");
  });
  it("and every day after", () => {
    assert.equal(pickPlanForDate(set, "2026-08-14")?.id, "peak");
  });
  it("a plan with no start date is always in force", () => {
    assert.equal(pickPlanForDate([{ id: "legacy", day_group: null }], "2026-01-01")?.id, "legacy");
  });
  it("a scheduled day-group plan still only governs its own weekdays", () => {
    // Mon/Thu/Sat plan starting 10 Aug (a Monday). 12 Aug is a Wednesday.
    const mixed: P[] = [
      { id: "peak-mts", day_group: [1, 4, 6], effective_date: "2026-08-10" },
      { id: "everyday", day_group: null, effective_date: "2026-07-01" },
    ];
    assert.equal(pickPlanForDate(mixed, "2026-08-10")?.id, "peak-mts");
    assert.equal(pickPlanForDate(mixed, "2026-08-12")?.id, "everyday");
  });
  it("first matching candidate wins when two cover the same weekday (newest first)", () => {
    const dup: P[] = [
      { id: "newer", day_group: [1] },
      { id: "older", day_group: [1] },
    ];
    assert.equal(pickPlanForDate(dup, WEEK[1])?.id, "newer");
  });
});

describe("(e) the fetch window", () => {
  it("shiftDate walks the calendar, including across months and leap days", () => {
    assert.equal(shiftDate("2026-08-05", 56), "2026-09-30");
    assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
    assert.equal(shiftDate("2026-08-05", 0), "2026-08-05");
  });
  it("reaches far enough to lay out a whole prep block", () => {
    assert.ok(PLAN_LOOKAHEAD_DAYS >= 28, "a month of look-ahead is the minimum that answers the request");
  });
});

describe("(f) the call sites", () => {
  /**
   * The look-ahead only helps if the screen that pages through days actually
   * asks for it, and only stays cheap if the screens that show one day do not.
   */
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the nutrition screen fetches with the default look-ahead", () => {
    const src = read("src/app/(app)/nutrition/page.tsx");
    assert.match(src, /fetchLivePlans\(supabase, clientId, today\)/);
  });

  it("today-only surfaces do not pull eight weeks of plans", () => {
    for (const p of ["src/components/HomeMacrosCard.tsx", "src/app/(app)/client-preview/nutrition/page.tsx"]) {
      assert.match(read(p), /fetchLivePlans\(supabase, clientId, today, undefined, 0\)/, p);
    }
  });

  it("there is NO query window — nothing caps how far ahead a plan can be read", () => {
    // Was: "the query window is built from the look-ahead." Dustin, 12 Aug:
    // "there is no limit to me looking ahead at programming scheduled thats
    // ridiculous it was ever set up that way on meal plan or workouts."
    //
    // The cap was never what stopped a not-yet-started plan showing early —
    // pickPlanForDate does that, against the VIEWED date, and is asserted
    // throughout this file. So removing the cap costs nothing and fixes the
    // original complaint properly.
    const src = read("src/lib/nutrition/resolvePlan.ts");
    assert.ok(
      !/\.lte\("effective_date"/.test(src),
      "fetchLivePlans must not filter effective_date at all",
    );
  });

  it("a scheduled menu is labelled as scheduled, not shown as if it were live", () => {
    // Paging into next week and seeing a different menu with no explanation is
    // how you end up trusting the wrong one.
    const src = read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx");
    assert.match(src, /const planStartsLater = /);
    assert.match(src, /`scheduled — \$\{planLabel\(activePlan as never\)\}`/);
  });
});
