// Tests for src/lib/ai/nutrition-json.ts — the strict-JSON layer every
// nutrition AI endpoint funnels through.
//
// This module had ZERO coverage until now, which is a problem for two reasons:
//
//  1. It is the module that decides whether a model reply is usable at all. A
//     silent regression here degrades to "the AI didn't understand you" rather
//     than to a crash, so nothing surfaces it.
//  2. It is compiled STANDALONE by scripts/test-nutrition-ai.cjs and required
//     as plain CommonJS, so it may only import pure leaf modules. It now
//     imports the canonical kcalOf rather than carrying its own copy — the
//     drift guard below stays anyway, because it is cheap and it is the test
//     that would catch the formula being re-inlined here in a hurry.

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractJson,
  kcalFromMacros,
  validateParseResult,
  validatePlanDraft,
  validateVerifyResult,
} from "../../src/lib/ai/nutrition-json.ts";
import { kcalOf } from "../../src/lib/nutrition/dailyTotals.ts";

// ─── the drift guard ────────────────────────────────────────────────────────

test("kcalFromMacros agrees with the canonical kcalOf for every macro triple", () => {
  // nutrition-json keeps its own 4/4/9 to stay import-free. It must still agree
  // with the shared one, or the AI path and the logger will quote different
  // calories for the same food.
  const cases: [number, number, number][] = [
    [0, 0, 0],
    [30, 40, 10],
    [26, 2, 0],
    [1.5, 0.25, 0.75],
    [200, 300, 90],
    [0.1, 0.1, 0.1],
  ];
  for (const [p, c, f] of cases) {
    assert.equal(
      kcalFromMacros(p, c, f),
      Math.round(kcalOf(p, c, f)),
      `disagreement at ${p}P/${c}C/${f}F`,
    );
  }
});

// ─── extractJson ────────────────────────────────────────────────────────────

test("extractJson parses a bare object", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("extractJson strips ``` fences", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('```\n{"a":2}\n```'), { a: 2 });
});

test("extractJson digs the object out of surrounding prose", () => {
  assert.deepEqual(
    extractJson('Sure! Here you go:\n{"a":1}\nHope that helps.'),
    { a: 1 },
  );
});

test("extractJson returns null on junk rather than throwing", () => {
  assert.equal(extractJson("no json at all"), null);
  assert.equal(extractJson(""), null);
  assert.equal(extractJson(null as unknown as string), null);
  assert.equal(extractJson("{ not: valid, json }"), null);
});

// ─── validateParseResult ────────────────────────────────────────────────────

test("validateParseResult recomputes totals from the items, ignoring supplied totals", () => {
  // The model is not trusted to add up. Any `totals` it sends are discarded and
  // rebuilt from the line items, so the displayed total can never disagree with
  // the rows above it.
  const out = validateParseResult({
    items: [
      { name: "Chicken", amount: 6, unit: "oz", p: 42, c: 0, f: 4 },
      { name: "Rice", amount: 1, unit: "cup", p: 4, c: 45, f: 0.5 },
    ],
    totals: { kcal: 1, p: 1, c: 1, f: 1 }, // deliberately wrong
  });
  assert.ok(out);
  assert.equal(out!.items.length, 2);
  assert.equal(out!.totals.p, 46);
  assert.equal(out!.totals.c, 45);
  assert.equal(out!.totals.f, 4.5);
  // With no per-item kcal supplied, each item derives its own, then they sum.
  assert.equal(
    out!.totals.kcal,
    kcalFromMacros(42, 0, 4) + kcalFromMacros(4, 45, 0.5),
  );
});

test("validateParseResult TRUSTS a positive per-item kcal over the macro maths", () => {
  // Deliberate: a label/restaurant kcal beats 4/4/9, which is wrong for alcohol,
  // fibre and sugar alcohols. Only a missing or non-positive kcal is derived.
  const out = validateParseResult({
    items: [{ name: "Stout", amount: 1, unit: "pint", kcal: 210, p: 2, c: 20, f: 0 }],
  });
  assert.ok(out);
  assert.equal(out!.items[0].kcal, 210);
  assert.notEqual(out!.items[0].kcal, kcalFromMacros(2, 20, 0));
  assert.equal(out!.totals.kcal, 210);
});

test("validateParseResult rejects shapes it cannot use", () => {
  assert.equal(validateParseResult(null), null);
  assert.equal(validateParseResult({}), null);
  assert.equal(validateParseResult({ items: "nope" }), null);
  assert.equal(validateParseResult({ items: [] }), null);
});

test("validateParseResult coerces missing/garbage numbers to 0, not NaN", () => {
  const out = validateParseResult({
    items: [{ name: "Mystery", amount: null, unit: null, p: "abc", c: undefined, f: null }],
  });
  assert.ok(out);
  assert.equal(out!.items[0].p, 0);
  assert.equal(out!.items[0].c, 0);
  assert.equal(out!.items[0].f, 0);
  assert.ok(Number.isFinite(out!.totals.kcal));
});

test("validateParseResult rejects the WHOLE reply if any item lacks a name", () => {
  // Strict on purpose: a nameless row means the model lost the thread, and a
  // partial parse would silently drop food the client said they ate. The caller
  // retries once instead.
  const out = validateParseResult({
    items: [
      { name: "Real food", p: 1, c: 1, f: 1 },
      { name: "", p: 5, c: 5, f: 5 },
    ],
  });
  assert.equal(out, null);
});

// ─── validatePlanDraft ──────────────────────────────────────────────────────

test("validatePlanDraft accepts a well-formed draft", () => {
  const out = validatePlanDraft({
    targets: { kcal: 2200, p: 190, c: 210, f: 60 },
    reasoning: "cut",
    meals: [
      { name: "M1", timing: "7am", items: [{ food: "Eggs", amount: 3, unit: "whole", p: 18, c: 1, f: 15 }] },
      { name: "M2", timing: "12pm", items: [{ food: "Chicken", amount: 6, unit: "oz", p: 42, c: 0, f: 4 }] },
    ],
  });
  assert.ok(out);
  assert.equal(out!.meals.length, 2);
  assert.equal(out!.meals[0].items[0].food, "Eggs");
});

test("validatePlanDraft rejects a draft with no meals", () => {
  assert.equal(validatePlanDraft(null), null);
  assert.equal(validatePlanDraft({ targets: {}, meals: [] }), null);
  assert.equal(validatePlanDraft({ targets: {}, meals: "no" }), null);
});

// ─── validateVerifyResult ───────────────────────────────────────────────────

const CORRECTED = { protein: 30, carbs: 10, fats: 5 };

test("validateVerifyResult keeps the three known confidence levels", () => {
  for (const c of ["high", "medium", "low"]) {
    const out = validateVerifyResult({ plausible: true, confidence: c, corrected: CORRECTED });
    assert.ok(out, `${c} should be accepted`);
    assert.equal(out!.confidence, c);
  }
});

test("validateVerifyResult downgrades an unknown confidence to low, never passes it through", () => {
  const out = validateVerifyResult({ plausible: true, confidence: "extremely", corrected: CORRECTED });
  assert.ok(out);
  assert.equal(out!.confidence, "low");
});

test("validateVerifyResult requires a corrected/macros object", () => {
  // No corrected block means there is nothing to act on, so the reply is unusable.
  assert.equal(validateVerifyResult({ plausible: true, confidence: "high", corrected: null }), null);
  assert.equal(validateVerifyResult({ plausible: true, confidence: "high" }), null);
  // `macros` is accepted as an alias for `corrected`.
  assert.ok(validateVerifyResult({ plausible: true, confidence: "high", macros: CORRECTED }));
});

test("validateVerifyResult derives kcal only when none was supplied", () => {
  const derived = validateVerifyResult({ plausible: true, confidence: "high", corrected: CORRECTED });
  assert.ok(derived);
  assert.equal(derived!.corrected.kcal, kcalFromMacros(30, 10, 5));

  const supplied = validateVerifyResult({
    plausible: true, confidence: "high", corrected: { ...CORRECTED, kcal: 400 },
  });
  assert.ok(supplied);
  assert.equal(supplied!.corrected.kcal, 400);
});

test("validateVerifyResult rejects unusable input", () => {
  assert.equal(validateVerifyResult(null), null);
  assert.equal(validateVerifyResult("nope"), null);
});

// ─── micronutrients through the AI layer ────────────────────────────────────

test("validateParseResult keeps known micros and drops invented ones", () => {
  const out = validateParseResult({
    items: [{
      name: "Salmon", amount: 6, unit: "oz", p: 40, c: 0, f: 14,
      micros: { sodium: 90, vitamin_d: 14, unobtainium: 999, iron: -3 },
    }],
  });
  assert.ok(out);
  assert.deepEqual(out!.items[0].micros, { sodium: 90, vitamin_d: 14 });
});

test("validateParseResult sums micros across items, carrying partial knowledge", () => {
  const out = validateParseResult({
    items: [
      { name: "Salmon", p: 40, c: 0, f: 14, micros: { sodium: 90, vitamin_d: 14 } },
      { name: "Broccoli", p: 3, c: 6, f: 0, micros: { sodium: 30, vitamin_c: 81 } },
      { name: "Olive oil", p: 0, c: 0, f: 14 }, // no micros at all
    ],
  });
  assert.ok(out);
  // sodium known on two items sums; each single-item nutrient carries through;
  // the item with no micros does not blank the totals.
  assert.equal(out!.totals.micros.sodium, 120);
  assert.equal(out!.totals.micros.vitamin_d, 14);
  assert.equal(out!.totals.micros.vitamin_c, 81);
});

test("an item with no micros omits the key entirely rather than storing {}", () => {
  const out = validateParseResult({ items: [{ name: "Water", p: 0, c: 0, f: 0 }] });
  assert.ok(out);
  assert.equal("micros" in out!.items[0], false);
});

test("validatePlanDraft carries micros onto plan items", () => {
  const out = validatePlanDraft({
    targets: { kcal: 2000, p: 180, c: 200, f: 55 },
    meals: [{
      name: "M1", timing: "7am",
      items: [{ food: "Eggs", amount: 3, unit: "whole", p: 18, c: 1, f: 15, micros: { choline: 440, vitamin_d: 2 } }],
    }],
  });
  assert.ok(out);
  assert.deepEqual(out!.meals[0].items[0].micros, { choline: 440, vitamin_d: 2 });
});

test("validateVerifyResult can now correct micros, not just macros", () => {
  // A food used to be markable 'verified' while its micronutrients stayed wrong.
  const out = validateVerifyResult({
    plausible: false, confidence: "high",
    corrected: { protein: 30, carbs: 10, fats: 5, micros: { sodium: 610, potassium: 300 } },
  });
  assert.ok(out);
  assert.deepEqual(out!.corrected.micros, { sodium: 610, potassium: 300 });
});
