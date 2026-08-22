// AN EMPTY BOX IS NOT A TARGET OF ZERO.
//
// Dustin, 22 Aug, opening "Set a body weight goal" at 116.7 lb:
//
//   "That's 9.72 lb a week for 12 weeks — roughly 4850 kcal a day below
//    maintenance."
//
// 116.7 / 12 = 9.725. The target it used was ZERO, because `value` starts as
// "" for a new goal, Number("") is 0, and Number.isFinite(0) is true. So the
// sheet did the arithmetic on a goal of nothing and printed a four-figure daily
// deficit as though it were a plan — before he had typed a single character.
//
// Two rules come out of it, and this file holds both:
//   1. say nothing until there is a real number to say it about
//   2. there is a pace past which the honest answer is "the date is wrong",
//      not a bigger number
//
// The arithmetic is reproduced here rather than imported because it lives
// inside a useMemo in a client component. The last test pins the component to
// these rules so the copy cannot drift away from them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kcalPerDayFor } from "../../src/lib/goals.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SHEET = "src/components/GoalSetSheet.tsx";

/** The guard as it now stands: does this input produce a line at all? */
function saysSomething(value: string, now: number | null): boolean {
  if (!value.trim()) return false;
  const tv = Number(value);
  if (!Number.isFinite(tv) || tv <= 0) return false;
  if (now == null) return false;
  return true;
}

test("the sheet says nothing before a target is typed", () => {
  assert.equal(saysSomething("", 116.7), false, "this is the 4850 kcal line");
  assert.equal(saysSomething("   ", 116.7), false);
});

test("zero and negatives are not goals", () => {
  assert.equal(saysSomething("0", 116.7), false);
  assert.equal(saysSomething("-10", 116.7), false);
  assert.equal(saysSomething("abc", 116.7), false);
});

test("a real target still speaks", () => {
  assert.equal(saysSomething("107", 116.7), true);
});

test("the number that was printed is what a zero target produces", () => {
  // Pinning the arithmetic so the diagnosis stays legible: this is where
  // "9.72 lb a week" and "4850 kcal" came from.
  const need = Math.abs(116.7 - 0) / 12;
  assert.equal(Math.round(need * 100) / 100, 9.73);
  assert.equal(kcalPerDayFor(need), 4875);
  // …versus the goal he was actually setting.
  const real = Math.abs(116.7 - 107) / 12;
  assert.equal(Math.round(real * 100) / 100, 0.81);
  assert.equal(kcalPerDayFor(real), 400);
});

test("there is a ceiling on the pace, and it names the date as the problem", () => {
  const c = read(SHEET);
  assert.match(c, /const ceiling = metric === "weight"/,
    "no upper bound on the required rate — any date produces a number, however absurd");
  assert.match(c, /faster than anyone should be asked to go/,
    "an impossible pace is reported as a bigger number rather than as a problem");
  assert.match(c, /Give it more time, or pick a smaller change/,
    "the warning does not say what to do about it");
});

test("the guards are in the component, not just in this test", () => {
  const c = read(SHEET);
  assert.match(c, /if \(!value\.trim\(\)\) return null;/,
    "an empty box is being treated as a number again");
  assert.match(c, /tv <= 0/, "a target of zero or less is being accepted again");
});
