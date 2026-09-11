import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summariseLogRange } from "../../src/lib/nutrition/rangeAverages";
import { EMPTY_WEEK, weekFactsLines } from "../../src/lib/ai/weekly-numbers";
import type { LogRow, PlanMeal } from "../../src/lib/nutrition/dailyTotals";

/**
 * AN UNLOGGED DAY IS A ZERO, AND THE AI IS TOLD WHICH DAYS THOSE WERE.
 *
 * Dustin, 11 Sep 2026: *"I want it to go by all fourteen days. That way there's
 * a lot more incentive to never skip logging no matter what. We need to know the
 * average even if they forgot to log. That's their problem. They screwed up. It
 * needs to be an actual true average of the last fourteen days of everything
 * that's in the app."*
 *
 * And the half that keeps it honest: *"Let's say there's two days that had
 * nothing logged and it drops their average way down. The AI for Dustin's
 * assistant and for Your Week needs to be able to reference that and say there
 * was nothing logged on these two days. The AI needs to be aware of that as a
 * possibility always."*
 *
 * Four things, each pinned: the divisor, the in-progress day, the window the
 * tile asks for, and the sentence the model reads.
 */

const ROOT = process.cwd();
const PLAN: PlanMeal[] = [{
  id: "m1", name: "Meal", timing: null, position: 1,
  meal_items: [{ id: "i1", food: "x", amount: 1, unit: "serving", is_unlimited: false, protein: 50, carbs: 50, fats: 10, position: 1 }],
}];
const MEAL_KCAL = 50 * 4 + 50 * 4 + 10 * 9; // 490
const full = (d: string): LogRow & { log_date: string } => ({ log_date: d, meal_id: "m1", meal_position: 1, adherence: "Full" });

test("two logged days in a seven-day window average over seven, not two", () => {
  const week = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
  const s = summariseLogRange([full("2026-09-01"), full("2026-09-04")], PLAN, { windowDates: week });
  assert.equal(s.windowDays, 7);
  assert.equal(Math.round(s.kcal), Math.round((2 * MEAL_KCAL) / 7), "490 × 2 ÷ 7 = 140, not 490");
  assert.equal(s.unloggedDays, 5);
  assert.deepEqual(s.unloggedDates, ["2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06", "2026-09-07"]);
});

test("the in-progress day is neither a zero nor a data point", () => {
  // Wednesday 8am, nothing eaten yet. Window Sun–Wed, today excluded. The
  // divisor is the three FINISHED days; today is not counted as an unlogged
  // zero, because it has not had the chance to be logged.
  const win = ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"];
  const s = summariseLogRange([full("2026-09-06"), full("2026-09-07")], PLAN, { windowDates: win, excludeDates: ["2026-09-09"] });
  assert.equal(s.windowDays, 3, "Sun, Mon, Tue — Wed is still in progress");
  assert.equal(Math.round(s.kcal), Math.round((2 * MEAL_KCAL) / 3));
  assert.deepEqual(s.unloggedDates, ["2026-09-08"], "only Tuesday is a real zero");
});

test("a window with nothing logged on any day is zero, not a division by nothing", () => {
  const s = summariseLogRange([], PLAN, { windowDates: ["2026-09-01", "2026-09-02"] });
  assert.equal(s.loggedDays, 0);
  assert.equal(s.kcal, 0);
  assert.equal(s.unloggedDays, 2);
});

test("the fixed ranges on the tile are the last N FINISHED days, today excluded", () => {
  // "2W" used to be today plus the 13 days before it, minus today: thirteen
  // finished days labelled as two weeks. Now it is the fourteen that finished.
  const src = readFileSync(join(ROOT, "src/components/nutrition/useNutritionAverages.ts"), "utf8");
  assert.match(src, /start = shiftDate\(today, -rg\.days\);/, "the window starts N days back");
  assert.match(src, /end = shiftDate\(today, -1\);/, "and ends yesterday — today is never in it");
  assert.match(src, /windowDates,/, "and the dates go to the rule, so the unlogged ones come back by name");
});

test("the tile says what the average is over", () => {
  const src = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(src, /avg per day over all \$\{avgResult\.totalDays\} days/, "the divisor is stated where the number is read");
  assert.match(src, /unlogged day\$\{avgResult\.unloggedDays === 1 \? "" : "s"\} counted as 0/, "and so are the zeros");
});

test("the AI is told the divisor, the zero days by date, and what NOT to conclude", () => {
  const window = { start: "2026-09-06", end: "2026-09-12", days: 7, complete: true };
  const f = {
    ...EMPTY_WEEK(window),
    loggedDays: 5, avgDays: 5, unloggedDays: 2, unloggedDates: ["2026-09-08", "2026-09-10"],
    avg: { kcal: 1800, p: 150, c: 180, f: 60 },
    adherence: 90, consistency: 71, accuracy: 90, adherenceBasis: "logging+macros" as const,
  };
  const lines = weekFactsLines(f, "This week", { calories: 2500, protein: 200, carbs: 250, fats: 80 }).join("\n");
  assert.match(lines, /averages over ALL 7 finished days/, "the model is told the divisor is the window");
  assert.match(lines, /2 of those days had NOTHING logged \(2026-09-08, 2026-09-10\) and COUNT AS ZERO/, "and which days are zeros");
  assert.match(lines, /true average is HIGHER than shown/, "and what that means");
  assert.match(lines, /do NOT coach a deficit/, "and what it must not conclude from a low number");
  assert.doesNotMatch(lines, /averages per logged day/, "the old basis sentence is gone");
});

test("with every day logged, the AI gets no zero-day warning to misapply", () => {
  const window = { start: "2026-09-06", end: "2026-09-12", days: 7, complete: true };
  const f = { ...EMPTY_WEEK(window), loggedDays: 7, avgDays: 7, unloggedDays: 0, avg: { kcal: 2400, p: 190, c: 240, f: 75 } };
  const lines = weekFactsLines(f, "This week", null).join("\n");
  assert.doesNotMatch(lines, /COUNT AS ZERO/);
});
