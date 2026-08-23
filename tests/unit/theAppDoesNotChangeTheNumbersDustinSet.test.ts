// THE APP DOES NOT CHANGE THE NUMBERS DUSTIN SET.
//
// Dustin, 23 Aug, after I did exactly that: "if i set the numbers they stay. if
// i build the mealplan its based on the numbers I set, they stay the app
// doesn't change numbers."
//
// The direction of authority runs one way. He sets the macro targets. He then
// builds the meal plan TO HIT those targets. So the plan is downstream of the
// numbers, and a plan whose items sum to something else is a plan that needs
// fixing — never a reason for the app to quietly show a different target.
//
// I got this backwards and shipped it. `dailyTarget` was changed to sum the
// plan's items for every client, which moved eleven people's targets, three of
// them by 600-960 kcal. Reverted. This test is here so the next person who
// notices that "the bar and the food underneath it are two separate numbers"
// finds out why before changing it.
//
// THE ONE EXCEPTION IS NOT AN EXCEPTION TO THAT RULE. A day-group plan carries
// a `day_group` array — different menus for different weekdays — and its target
// is the menu's own total. Only Tyler Dorsett and Hassan Kareem have those, and
// they are precisely the two clients Dustin does NOT write plans for: "someone
// else does their meal plan and I imported it into there so their macro numbers
// need to match what that plan says each day even if it changes." Their menus
// are Week 23 / Week 16, tagged Days 1,4,6 · 2,5 · 3,7, and they genuinely
// differ by day:
//
//   Tyler   Mon/Thu/Sat 2,100 · Tue/Fri 2,197 · Wed/Sun 2,135
//   Hassan  Mon/Thu/Sat 2,417 · Tue/Fri 2,501
//
// So the pre-existing behaviour already satisfies both halves of what he asked
// for, and the correct change was no change at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const NUTRITION = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
const HOME_CARD = readFileSync(join(ROOT, "src/components/HomeMacrosCard.tsx"), "utf8");

test("the daily target falls back to macro_targets, not to a plan sum", () => {
  assert.match(
    NUTRITION,
    /const dailyTarget = dayGroupTarget \?\? macroTarget;/,
    "dailyTarget no longer ends at macroTarget — the app is computing a target Dustin did not set",
  );
});

test("the plan-sum path stays gated on day_group", () => {
  // Without this gate every ordinary client's target becomes a computed number.
  assert.match(NUTRITION, /const isDayGroup = Array\.isArray\(dg\) && dg\.length > 0;/);
  assert.match(NUTRITION, /if \(!isDayGroup \|\| !planMeals\.length\) return null;/);
});

test("the home ring takes its target from macro_targets alone", () => {
  assert.match(
    HOME_CARD,
    /if \(mt\) setTarget\(\{ calories: mt\.calories/,
    "the home ring is computing a target instead of reading the one on file",
  );
  assert.ok(
    !/planDayTarget/.test(HOME_CARD),
    "the home ring is summing the plan — that number is not Dustin's to overwrite",
  );
});

test("no shared helper exists that would make plan-summing easy to reach for", () => {
  // planDayTarget() was added, used, and removed on 23 Aug. Leaving it lying
  // around is an invitation to wire it back up.
  const daily = readFileSync(join(ROOT, "src/lib/nutrition/dailyTotals.ts"), "utf8");
  assert.ok(
    !/export function planDayTarget/.test(daily),
    "planDayTarget is back; the target is macro_targets unless the plan is day-grouped",
  );
});
