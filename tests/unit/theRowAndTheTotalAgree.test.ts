// Three places where one number contradicted another on the same screen.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customMealMacros, itemKcal, kcalOf, type CustomMeta } from "../../src/lib/nutrition/dailyTotals";
import { validateActReply } from "../../src/lib/ai/nutrition-json";

// ─── #54 the item card and the day total ────────────────────────────────────
//
// Every item card prints `(it.k ?? kcalOf(p, c, f)) * fac` — the catalogue's
// own label kcal. The total beneath those cards ignored `k` and recomputed
// Atwater 4/4/9 from the macros. Label kcal and 4/4/9 disagree routinely
// (fibre, sugar alcohols, the manufacturer's rounding), so a client read 100
// cal on a row and watched 118 land in the day.

const meal = (items: CustomMeta["items"]): CustomMeta => ({ name: "Lunch", items } as CustomMeta);

test("the day total is the sum of the rows the client can see", () => {
  // A label that does not match 4/4/9: 20P 30C 5F is 245 by Atwater.
  const m = meal([{ n: "Protein bar", p: 20, c: 30, f: 5, k: 210 }]);
  assert.equal(customMealMacros(m).kcal, 210, "the total ignored the row's own label kcal");
  assert.notEqual(kcalOf(20, 30, 5), 210, "fixture must actually differ from Atwater");
});

test("a food with no label kcal still falls back to 4/4/9", () => {
  const m = meal([{ n: "Chicken", p: 31, c: 0, f: 4 }]);
  assert.equal(customMealMacros(m).kcal, kcalOf(31, 0, 4));
});

test("the multiplier applies to calories as well as macros", () => {
  const m = meal([{ n: "Protein bar", p: 20, c: 30, f: 5, k: 210, fac: 2 }]);
  const t = customMealMacros(m);
  assert.equal(t.kcal, 420);
  assert.equal(t.protein, 40);
});

test("itemKcal is the one definition both surfaces use", () => {
  assert.equal(itemKcal({ k: 210, p: 20, c: 30, f: 5 }), 210);
  assert.equal(itemKcal({ k: null, p: 20, c: 30, f: 5 }), kcalOf(20, 30, 5));
});

// ─── #24 the prompt asked for exactly what the validator threw away ─────────

test("an empty reply is accepted when nothing was promised", () => {
  // ACT_SYSTEM_PROMPT: for a training-worded message, answer intent "none"
  // with clarify:false and an EMPTY reply, "never a clarifying question".
  const r = validateActReply({ intent: "none", params: { clarify: false }, reply: "" });
  assert.ok(r, "the model obeyed the prompt and was rejected for it");
  assert.equal(r!.intent, "none");
  assert.equal(r!.reply, "");
});

test("a clarifying question still has to say something", () => {
  assert.equal(validateActReply({ intent: "none", params: { clarify: true }, reply: "" }), null,
    "a blank clarifying question is genuinely useless");
});

test("a reply is still carried through when there is one", () => {
  const r = validateActReply({ intent: "none", params: { clarify: false }, reply: "Logged." });
  assert.equal(r!.reply, "Logged.");
});

// ─── #27 one meaning of "the model did not say" ─────────────────────────────

test("the photo route records a missing macro as unknown, not as zero", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "..", "src/app/api/analyze-meal-photo/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /const protein = nutOrNull\(result\.protein_g, 1\)/);
  assert.match(src, /const fats = nutOrNull\(result\.fat_g \?\? result\.fats_g, 1\)/);
  assert.ok(!/Number\(result\.protein_g\) \|\| 0/.test(src),
    "a missing protein is still being stored as a real 0 g beside a null fibre");
});
