import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LIMITS, defaultLimitFor, resolveDailyLimit, chicagoToday } from "../../src/lib/ai/meter-core";

/**
 * THREE PLANS A DAY, TEN WHILE HE TESTS — AND A REMINDER THAT CANNOT BE MISSED.
 *
 * Dustin, 11 Sep 2026: *"let's do three times per day permanently. But
 * temporarily we need to bump it to ten times a day so I can test this out
 * from every angle… put a reminder somewhere that we cannot miss in maybe
 * three days to bring it back down."*
 *
 * The number comes back down by itself on 15 Sep — the date does that. This
 * file is the reminder to delete the temporary code afterwards: the last test
 * goes RED on main from 15 Sep until PLAN_BUILD_TEST_WINDOW is gone.
 */
const SRC = readFileSync(join(process.cwd(), "src/lib/ai/meter-core.ts"), "utf8");

test("the permanent limit is three a day", () => {
  assert.equal(DEFAULT_LIMITS.plan_build, 3, "it was 1; he ruled 3");
});

test("inside the test window it is ten, and the day after it is three again", () => {
  assert.equal(defaultLimitFor("plan_build", "2026-09-11"), 10);
  assert.equal(defaultLimitFor("plan_build", "2026-09-14"), 10, "the 14th is the last day");
  assert.equal(defaultLimitFor("plan_build", "2026-09-15"), 3, "the 15th needs no human");
});

test("a per-client column still wins over either default", () => {
  assert.equal(resolveDailyLimit({ ai_daily_plan_build_limit: 10 }, "plan_build", "2026-10-01"), 10);
  assert.equal(resolveDailyLimit({}, "plan_build", "2026-10-01"), 3);
});

test("the window only touches the plan builder", () => {
  assert.equal(defaultLimitFor("coach_action", "2026-09-12"), DEFAULT_LIMITS.coach_action);
});

test("⏳ THE REMINDER: after 14 Sep 2026 the temporary window must be deleted", () => {
  // This is the thing he asked for — a reminder nobody can miss. It fails on
  // main from 15 Sep until the block in meter-core.ts is removed. When it
  // fires: delete PLAN_BUILD_TEST_WINDOW and the plan_build branch in
  // defaultLimitFor, set Test Client's client_app_settings.ai_daily_plan_build_limit
  // back to NULL, delete this test, and tell Dustin it is back to three.
  if (chicagoToday() > "2026-09-14") {
    assert.ok(!SRC.includes("PLAN_BUILD_TEST_WINDOW"),
      "The plan-builder test window ended on 14 Sep 2026. Delete PLAN_BUILD_TEST_WINDOW from meter-core.ts, "
      + "reset Test Client's ai_daily_plan_build_limit to NULL, and remove this test.");
  }
});
