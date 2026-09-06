// A GRAM IS NOT A PORTION OF ANYTHING.
//
// The foods generated from Dustin's own meal plans carry a per-unit basis: "1
// tbsp" for butter, "1 oz" for salmon, "1 g" for everything he weighs. The
// arithmetic is right at that basis, but the amount box opened on 1 g — one
// gram of chicken breast, 1.1 calories — and he has to clear it before typing
// the number he actually programmes.
//
// These fail against the old code, which opened on whatever the basis said.

import test from "node:test";
import assert from "node:assert/strict";
import { weighedDefaultAmount } from "../../src/lib/servingOptions.ts";

test("a per-gram food opens on a weight a person would actually weigh", () => {
  assert.equal(weighedDefaultAmount("g", 1), 100);
});

test("millilitres get the same treatment", () => {
  assert.equal(weighedDefaultAmount("ml", 1), 100);
});

test("a real portion is left exactly as it was", () => {
  // 1 tbsp of butter, 1 oz of salmon, 1 scoop of whey: all answers already.
  assert.equal(weighedDefaultAmount("tbsp", 1), 1);
  assert.equal(weighedDefaultAmount("oz", 1), 1);
  assert.equal(weighedDefaultAmount("scoop", 1), 1);
  assert.equal(weighedDefaultAmount("cup", 1), 1);
});

test("a row that already states a real weight keeps it", () => {
  // 30 g of almonds is somebody's answer, not an artefact of the basis.
  assert.equal(weighedDefaultAmount("g", 30), 30);
  assert.equal(weighedDefaultAmount("g", 100), 100);
  assert.equal(weighedDefaultAmount("g", 2.5), 2.5);
});

test("nothing is invented out of a missing or nonsensical amount", () => {
  assert.equal(weighedDefaultAmount("g", 0), 0);
  assert.equal(weighedDefaultAmount("", 1), 1);
});

test("the unit is matched however it was cased or spaced", () => {
  assert.equal(weighedDefaultAmount(" G ", 1), 100);
  assert.equal(weighedDefaultAmount("mL", 1), 100);
});
