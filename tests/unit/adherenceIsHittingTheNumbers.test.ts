import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { summariseLogRange } from "@/lib/nutrition/rangeAverages";

/**
 * ADHERENCE IS HITTING THE NUMBERS. LOGGING IS THE OTHER NUMBER.
 *
 * Dustin, 9 Sep 2026: *"the adherence i want to be based on hitting numbers
 * alone so cal and macros, not logging since we have the logging rate. the
 * adherence needs to be based on hitting the numbers on daily average for that
 * week up to that day within that week."*
 *
 * This supersedes his 31 Jul call (consistency × accuracy). The reason the old
 * one had to go is visible on the card itself: adherence and logging rate sit
 * side by side, so folding logging into adherence charged a missed day twice,
 * once in each column — and someone who logged five days and hit target on all
 * five read 71%, which says they missed their numbers when they missed none.
 *
 * `rangeAverages.summariseLogRange` is the ONE implementation. The client card,
 * the averages strip, the home tile and the AI's weekly context all read it, so
 * the formula tests below are what stop those four disagreeing.
 */

const PLAN = [{
  id: "m1", name: "M1", timing: null, position: 1,
  meal_items: [{ id: "i1", food: "chicken", amount: 200, unit: "g", is_unlimited: false,
                 protein: 60, carbs: 0, fats: 8, position: 1 }],
}];
const TARGET = { calories: 312, protein: 60, carbs: 0, fats: 8 }; // 60*4 + 8*9
const log = (d: string) => ({
  id: d, client_id: "c", log_date: d, meal_position: 1, meal_id: "m1",
  adherence: "Full", item_overrides: null,
} as never);

test("hitting target every day you ate reads 100%, however many days you ate", () => {
  const s = summariseLogRange([log("2026-09-01"), log("2026-09-03")], PLAN as never,
    { target: TARGET, windowDays: 7 });
  assert.equal(Math.round(s.adherence!), 100, "they hit their numbers on every day they ate");
  assert.equal(Math.round(s.consistency!), 29, "2 of 7 — true, and said by the OTHER number");
});

test("logging is never folded back in", () => {
  // The old formula multiplied. If it ever comes back, these two diverge.
  const few = summariseLogRange([log("2026-09-01")], PLAN as never, { target: TARGET, windowDays: 7 });
  const many = summariseLogRange(
    ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map(log), PLAN as never,
    { target: TARGET, windowDays: 7 });
  assert.equal(Math.round(few.adherence!), Math.round(many.adherence!),
    "adherence must not move just because more days were logged");
  assert.ok(many.consistency! > few.consistency!, "the logging rate is what moves");
});

test("the day in progress is not scored as a miss", () => {
  // At 8am today's totals are near zero against a whole day's target. Left in,
  // that scores ~0% and drags the week down until dinner. `excludeDates` has
  // existed for this since the module was written.
  const withToday = summariseLogRange([log("2026-09-01"), log("2026-09-02")], PLAN as never,
    { target: TARGET, windowDays: 7 });
  const partial = { ...log("2026-09-02"), meal_id: null, adherence: "1/4" } as never;
  const s = summariseLogRange([log("2026-09-01"), partial], PLAN as never,
    { target: TARGET, windowDays: 7, excludeDates: ["2026-09-02"] });
  assert.equal(s.loggedDays, 2, "today still counts toward the logging rate — they did log");
  assert.equal(s.avgDays, 1, "but only the finished day is scored");
  assert.equal(Math.round(s.adherence!), Math.round(withToday.adherence!));
});

test("the client's card excludes the in-progress day, like the AI's context always did", () => {
  // The divergence this closes: weekly-context.ts passed excludeDates from the
  // beginning; the hook drawing the number the CLIENT reads never did. The
  // coach was briefed on one adherence figure and the client shown another for
  // the same week.
  const hook = readFileSync(join(process.cwd(), "src/components/nutrition/useNutritionAverages.ts"), "utf8");
  assert.match(hook, /excludeDates:\s*\[today\]/,
    "the client-facing hook must leave the in-progress day out of the average");
  const ctx = readFileSync(join(process.cwd(), "src/lib/ai/weekly-context.ts"), "utf8");
  assert.match(ctx, /excludeDates:/, "and the AI context must keep doing the same");
});

test("nothing anywhere still calls adherence a logging score", () => {
  // Copy in four places used to say "logging × macros". Whatever the number is
  // called on one screen, it is called on all of them.
  const stale = /logging × macros|consistency × accuracy|logging consistency × macro/;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const body = readFileSync(full, "utf8");
      // The one legitimate mention is the comment in rangeAverages recording
      // which ruling was superseded, and why.
      if (full.endsWith("rangeAverages.ts")) continue;
      if (stale.test(body)) hits.push(full);
    }
  };
  walk(join(process.cwd(), "src"));
  assert.deepEqual(hits, [], `still describing adherence as logging: ${hits.join(", ")}`);
});
