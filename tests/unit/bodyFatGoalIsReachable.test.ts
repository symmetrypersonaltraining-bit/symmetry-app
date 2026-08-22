// YOU CAN SET A BODY FAT GOAL WITHOUT SETTING A WEIGHT GOAL FIRST.
//
// Dustin, 22 Aug: "we need to be able to set bf goals."
//
// The goal machinery has carried three metrics for a while — weight,
// body_fat_pct, lean_mass — and GoalSetSheet handles any of them. The UI did
// not. There were two controls:
//
//   the big invitation      shown only when NO goals exist, and it hard-codes
//                           metric: "weight"
//   the "+ … goal" chips    shown only when at least ONE goal already exists
//
// So the first goal anybody sets is a weight goal, necessarily, and body fat is
// reachable only as a second one. Somebody who wants to track body fat and not
// weight had no way in at all — and the panel gave no hint that the other two
// metrics existed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/GoalsPanel.tsx"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the metric chips are not gated on already having a goal", () => {
  assert.ok(!/canSet && \(active\.length > 0 \|\| proposed\.length > 0\) && \(\(\) =>/.test(code),
    "the chips are still hidden until a goal exists, so the first goal can only be weight");
  assert.match(code, /\{canSet && \(\(\) => \{/,
    "the chips should render whenever there is a metric with readings and no goal on it");
});

test("all three metrics are offered, and only where there is data to hang them on", () => {
  assert.match(code, /\["weight", "body_fat_pct", "lean_mass"\]/, "a metric was dropped");
  assert.match(code, /\(readingsByMetric\[m\] \|\| \[\]\)\.length > 0/,
    "offering a goal for a metric never measured asks the person to guess");
});

test("weight is not offered twice when the invitation is on screen", () => {
  assert.match(code, /invitationShowing/, "no guard against two controls doing the same thing");
  assert.match(code, /!\(invitationShowing && m === "weight"\)/,
    "the weight chip and the weight invitation would both show");
});

test("the sheet itself was always metric-agnostic — the gate was the panel", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/GoalSetSheet.tsx"), "utf8");
  assert.match(sheet, /metric: GoalMetric/, "the sheet takes whichever metric it is given");
  assert.match(sheet, /UNITS\[metric\]/, "the units follow the metric");
});
