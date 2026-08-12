// Claudine Ocon, 11 Aug 2026, mid-recipe:
//   "Recipe works but cant type decimals in weight for each ingredient"
//
// She wanted 1.5 lbs of ground beef and could only ever get "1". The field was
// controlled off a NUMBER, so Number("1.") came back as 1 and React re-rendered
// the box as "1" — deleting the decimal point on the very keystroke that typed
// it. It reads as a broken keyboard rather than a bug, which is why it took a
// photo of a screen to report.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeNumericText, parseNumericText, formatNumericValue,
} from "../../src/lib/numericField.ts";

test("a decimal point survives being typed — the whole bug", () => {
  // The exact keystroke sequence for 1.5 lbs of ground beef.
  let text = "";
  for (const ch of "1.5") text = sanitizeNumericText(text + ch);
  assert.equal(text, "1.5");
  assert.equal(parseNumericText(text), 1.5);
});

test("a half-typed number reports nothing rather than a wrong number", () => {
  // "1." must NOT commit as 1: that is what erased the point. Holding null lets
  // the caller keep the previous value until the entry is finished.
  assert.equal(parseNumericText("1."), null);
  assert.equal(parseNumericText("."), null);
  assert.equal(parseNumericText(""), null);
});

test("letters and symbols never reach the value", () => {
  assert.equal(sanitizeNumericText("1.5 lbs"), "1.5");
  assert.equal(sanitizeNumericText("abc"), "");
  assert.equal(sanitizeNumericText("-3"), "3");
});

test("a second decimal point cannot be typed", () => {
  assert.equal(sanitizeNumericText("1.5.2"), "1.52");
  assert.equal(sanitizeNumericText(".."), ".");
});

test("a leading point is allowed on the way to .5", () => {
  assert.equal(sanitizeNumericText(".5"), ".5");
  assert.equal(parseNumericText(".5"), 0.5);
});

test("clearing the box gives empty, not zero", () => {
  // The P/C/F fields used `|| 0`, so deleting the contents to retype snapped
  // straight back to 0 and you had to fight it.
  assert.equal(parseNumericText(""), null);
  assert.equal(formatNumericValue(null), "");
});

test("zero is a real value and displays as 0", () => {
  assert.equal(formatNumericValue(0), "0");
  assert.equal(parseNumericText("0"), 0);
});

test("trailing zeros survive while typing 1.50", () => {
  let text = "";
  for (const ch of "1.50") text = sanitizeNumericText(text + ch);
  assert.equal(text, "1.50");
  assert.equal(parseNumericText(text), 1.5);
});

test("formatting a stored value round-trips", () => {
  for (const n of [1, 1.5, 0.25, 784, 0]) {
    assert.equal(parseNumericText(formatNumericValue(n)), n);
  }
});

test("nothing usable is never presented as a number", () => {
  assert.equal(formatNumericValue(undefined), "");
  assert.equal(formatNumericValue(NaN), "");
});
