// ============================================================================
// "AS WRITTEN" MEANS THE PLAN, NOT THE DAY.
//
// Dustin, 11 Sep 2026, on his own Nutrition tab: *"there's a little warning
// thing saying this plan does not reach the target. Eating exactly as written
// comes to 3,553 calories. My actual calorie set is 4,462 … I've been eating
// on this plan exactly what it says."*
//
// The live plan, summed from meal_items, comes to 4,462.5 kcal. The 909 kcal
// the warning could not find is exactly Lunch — which he had swapped for
// restaurant fajitas that day. The check walked the DAY'S ROWS and skipped
// every slot that was not `kind: "plan"`, so a swapped or custom meal fell
// out of a total whose sentence begins "Eaten exactly as written".
//
// The plan as written is planMeals, one meal per position. The day's rows are
// what he did with it. The warning is about the first and must never read the
// second. Asserted against the source; pure node.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);

function memoBody(): string {
  const start = SRC.indexOf("const planDrift = useMemo(");
  assert.ok(start >= 0, "planDrift memo not found");
  const end = SRC.indexOf("}, [", start);
  const deps = SRC.slice(end, SRC.indexOf("]);", end) + 3);
  return SRC.slice(start, end) + deps;
}

describe("as written means the plan, not the day", () => {
  it("the drift check totals planMeals, one meal per position", () => {
    const body = memoBody();
    assert.match(body, /planMeals/, "the plan as written is planMeals");
    assert.match(body, /\.position/, "one meal per position, not every option of a rotating slot");
  });

  it("the drift check never reads the day's rows", () => {
    const body = memoBody();
    assert.doesNotMatch(body, /of rows\)/, "walking the day's rows drops a swapped slot from an as-written total");
    assert.doesNotMatch(body, /row\.kind/, "a slot's kind is what he did today, not what was written");
    assert.doesNotMatch(body, /row\.chosen/);
  });

  it("it recomputes when the plan changes, not when the day's logs change", () => {
    const body = memoBody();
    assert.match(body, /\}, \[planMeals, tg\]\);/, "dependencies are the plan and the target");
  });
});
