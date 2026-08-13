// NOTHING CAPS HOW FAR AHEAD PROGRAMMING CAN BE READ.
//
// Dustin, 12 Aug: "we did have that problem w workouts. it happened w my peak
// week I could not look at it ahead of time bc it was 'locked'... there is no
// limit to me looking ahead at programking scheduled thats ridiculous it was
// ever set up that way on meal plsn or workouts."
//
// Three separate mechanisms produced that, and each one has cost a session:
//
//   1. the Peak Week freeze — Tyler Dorsett, 5:17am: "My workouts are locked
//      and it won't let me access them"; Todd could not pull a missed workout
//      forward through it.
//   2. the workout calendar's 90-day window — 26 sessions for one client were
//      scheduled past it, working but invisible.
//   3. the meal plan's 56-day fetch cap — the original "flip it live on the
//      morning" complaint.
//
// If it is scheduled, it can be looked at. These assertions are the guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPeakWeekLocked } from "../../src/lib/peak-week.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("no date is ever locked, for anybody", () => {
  // Including the original peak week itself, and any client id.
  for (const d of ["2026-08-03", "2026-08-06", "2026-08-09", "2026-11-28", "2027-01-01"]) {
    assert.equal(isPeakWeekLocked(d, "69021074-1708-4d73-9245-918862048709"), false, `${d} must not lock`);
    assert.equal(isPeakWeekLocked(d, "any-other-client"), false, `${d} must not lock`);
    assert.equal(isPeakWeekLocked(d, null), false);
  }
});

test("the workout calendar has no forward limit", () => {
  const src = read("src/app/(app)/workout/page.tsx");
  assert.ok(
    !/\.lte\("scheduled_date"/.test(src),
    "the workout calendar must not cap how far ahead it reads — 26 real sessions sat past the old 90-day window",
  );
  assert.ok(
    /\.gte\("scheduled_date", backStr\)/.test(src),
    "the backward window should stay — it is the forward one that was wrong",
  );
});

test("the meal plan fetch has no forward limit", () => {
  const src = read("src/lib/nutrition/resolvePlan.ts");
  assert.ok(
    !/\.lte\("effective_date"/.test(src),
    "fetchLivePlans must not cap effective_date — that cap is what forced flipping plans live on the morning",
  );
  // The protection that actually matters must still be there: a plan that has
  // not started cannot show on an earlier day. That was never the cap's job.
  assert.ok(
    /p\.effective_date <= dateStr/.test(src),
    "pickPlanForDate must still compare effective_date against the VIEWED date",
  );
});
