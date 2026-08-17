// Guard: moving AWAY from a goal is not progress toward it.
//
// ── WHAT DUSTIN SAW, 17 AUG ────────────────────────────────────────────────
//
// He changed his weight goal from a cut (185 lb) to a gain (235 lb by 29 Nov).
// His goal row kept its original start_value of 212 from the cut. He is at
// 207.2. The card read:
//
//     21% of the way there        27.8 lb to go
//
// He has not gained an ounce toward 235. He is 4.8 lb FURTHER from it than the
// day the goal started, and the bar said a fifth done.
//
// The cause was one call:
//
//     const done = Math.abs(start - now);
//
// Absolute distance answers "how far have you moved", which is only the same
// question as "how far along are you" while you are moving the right way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseGoal, type Goal, type Reading } from "../../src/lib/goals";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1", metric: "weight", targetValue: 235, targetDate: "2026-11-29",
  startValue: 212, startDate: "2026-05-04", setBy: "client", status: "active", ...over,
});

/** Daily readings ending at `end`, enough to clear the thin-data guard. */
const series = (values: number[], startIso = "2026-06-01"): Reading[] => {
  const base = new Date(`${startIso}T12:00:00`).getTime();
  return values.map((v, i) => ({
    date: new Date(base + i * 7 * 86400000).toISOString().slice(0, 10),
    value: v,
  }));
};

test("moving the wrong way is 0%, not a fifth of the way there", () => {
  // Exactly his numbers: start 212, now 207.2, target 235.
  const a = analyseGoal(goal(), series([212, 210, 208, 207.2]), "2026-08-17");
  assert.ok(a);
  assert.equal(a!.percent, 0, "going backwards is still being counted as progress");
  assert.equal(a!.remaining, 27.8, "the distance left is unchanged by this");
});

test("a gain goal credits actual gains", () => {
  const a = analyseGoal(goal(), series([212, 216, 219, 221]), "2026-08-17");
  assert.ok(a);
  // start 212 → now 221 of 23 lb total = 39%
  assert.equal(a!.percent, 39);
});

test("a cut still counts down the way it always did", () => {
  // The case every existing goal is: start above target, moving down.
  const a = analyseGoal(
    goal({ targetValue: 185, startValue: 212 }),
    series([212, 208, 204, 203]),
    "2026-08-17",
  );
  assert.ok(a);
  // 212 → 203 of 27 = 33%
  assert.equal(a!.percent, 33);
});

test("a cut that gains weight is 0%, the mirror of the first case", () => {
  const a = analyseGoal(
    goal({ targetValue: 185, startValue: 212 }),
    series([212, 214, 216, 218]),
    "2026-08-17",
  );
  assert.ok(a);
  assert.equal(a!.percent, 0);
});

test("percent never exceeds 100 when they overshoot", () => {
  const a = analyseGoal(goal(), series([212, 225, 238, 240]), "2026-08-17");
  assert.ok(a);
  assert.equal(a!.percent, 100);
});

test("the goal-setting sheet says above or below to match the direction", () => {
  const src = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "src/components/GoalSetSheet.tsx"), "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /\$\{goingDown \? "below" : "above"\} maintenance/,
    "the sheet still hard-codes 'below maintenance' — it told him to eat under to gain 28 lb");
  assert.doesNotMatch(src, /kcal a day below maintenance`/, "the hard-coded wording is still there");
});
