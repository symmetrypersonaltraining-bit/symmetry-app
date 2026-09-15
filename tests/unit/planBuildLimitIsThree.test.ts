import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LIMITS, defaultLimitFor, resolveDailyLimit } from "../../src/lib/ai/meter-core";

/**
 * THREE PLANS A DAY, AND THE TEST WINDOW IS GONE FOR GOOD.
 *
 * Dustin, 11 Sep 2026: *"let's do three times per day permanently. But
 * temporarily we need to bump it to ten times a day so I can test this out
 * from every angle… put a reminder somewhere that we cannot miss in maybe
 * three days to bring it back down."*
 *
 * The reminder worked exactly as built. PLAN_BUILD_TEST_WINDOW expired by
 * calendar on 14 Sep, this file went red on main on the 15th, and the block was
 * deleted that morning. What was a five-test file is these four: the temporary
 * half is gone and the permanent rule it was protecting is still here, because
 * deleting the reminder should not delete the thing it was reminding us about.
 */
const SRC = readFileSync(join(process.cwd(), "src/lib/ai/meter-core.ts"), "utf8");

test("the permanent limit is three a day", () => {
  assert.equal(DEFAULT_LIMITS.plan_build, 3, "it was 1; he ruled 3");
});

test("and no date can change it any more", () => {
  for (const d of ["2026-09-11", "2026-09-14", "2026-09-15", "2027-01-01"]) {
    assert.equal(defaultLimitFor("plan_build", d), 3, `${d} must be three like every other day`);
  }
  assert.ok(!SRC.includes("PLAN_BUILD_TEST_WINDOW"), "the temporary window is back in meter-core.ts");
});

test("a per-client column still wins over the default", () => {
  // This is the one that matters in practice: on 15 Sep every real client
  // carried ai_daily_plan_build_limit = 1, set back when 1 WAS the rule, so the
  // ruling to 3 reached nobody and the ten-a-day window reached nobody either.
  // The column is the answer, not the default.
  assert.equal(resolveDailyLimit({ ai_daily_plan_build_limit: 10 }, "plan_build", "2026-10-01"), 10);
  assert.equal(resolveDailyLimit({ ai_daily_plan_build_limit: 1 }, "plan_build", "2026-10-01"), 1);
  assert.equal(resolveDailyLimit({}, "plan_build", "2026-10-01"), 3);
});

test("the plan builder is not special in any other way", () => {
  assert.equal(defaultLimitFor("coach_action", "2026-09-12"), DEFAULT_LIMITS.coach_action);
});
