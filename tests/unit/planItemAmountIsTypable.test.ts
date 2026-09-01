// Going 300 g -> 170 g took thirteen taps.
//
// A plan item's amount was a read-only label between a minus and a plus, and
// grams step by ten. Dustin: "13 taps to go 300 g -> 170 g". An added food had
// had a typed box and a unit picker for a while; the plan items it sat beside
// did not.
//
// This is a rendered control, so what can be asserted without a browser is that
// the control exists, that it is a number input, and that the amount is no
// longer read-only. The arithmetic it feeds is covered by planEdit.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(import.meta.dirname, "..", "..", "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);

// The block that renders one plan item's amount control.
const sheet = src.slice(src.indexOf("function PlanAdjustSheet"));
const planRow = sheet.slice(0, sheet.indexOf("AN ADDED FOOD IS EDITABLE TOO"));

test("a plan item's amount can be typed, not only stepped", () => {
  assert.match(planRow, /type="number"/, "no number input in the plan item row");
  assert.match(planRow, /setAmounts\(\(p\) => \(\{ \.\.\.p, \[it\.id\]/,
    "the typed value must write back to the same state the steppers use");
});

test("the steppers survive alongside it", () => {
  // A small nudge is still a tap, and removing them would trade one complaint
  // for another.
  assert.ok(planRow.includes("stepFor(it.unit)"), "the +/- steppers were removed");
});

test("the amount input is labelled for screen readers", () => {
  assert.match(planRow, /aria-label=\{`\$\{it\.food\} amount/,
    "a bare number box beside a food name says nothing on its own");
});

test("an empty box is not read as zero", () => {
  // Zero means "take this item out of the meal" — resolveEditedItems drops it.
  // Clearing the box to type a new number must not delete the item.
  assert.match(planRow, /if \(raw === ""\) return;/,
    "clearing the box would have removed the item mid-keystroke");
});
