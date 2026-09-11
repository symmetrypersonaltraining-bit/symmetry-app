import test from "node:test";
import assert from "node:assert/strict";
import { fromGrams, gramsAtPct, pctOf, setGrams, setKcal, setPct } from "../../src/lib/nutrition/macroSplit";
import { kcalOf } from "../../src/lib/nutrition/dailyTotals";

/**
 * Dustin, 11 Sep 2026: *"We need to be able to change the macros and the
 * calories, and they all need to follow each other. If I lower my carbs by
 * grams, it needs to drop the calories down — or it may make more sense to set
 * the macros by percentages and then give a number in grams at each percentage
 * based off of the calories right next to it."*
 *
 * The invariant under all of it: the calories are ALWAYS 4/4/9 of the grams.
 * A target whose calories and macros disagree is one nothing can hit.
 */

const T = fromGrams(180, 230, 55); // 2,135 kcal — his own draft's shape

test("calories are always 4/4/9 of the grams, whatever route you took", () => {
  const ways = [T, setGrams(T, "c", 190), setKcal(T, 1800), setPct(T, "p", 35), setKcal(setPct(setGrams(T, "p", 200), "f", 25), 2400)];
  for (const t of ways) assert.equal(t.kcal, Math.round(kcalOf(t.p, t.c, t.f)), JSON.stringify(t));
});

test("lowering carbs in grams drops the calories — his exact sentence", () => {
  const lower = setGrams(T, "c", 180);
  assert.equal(lower.c, 180);
  assert.equal(lower.kcal, T.kcal - 50 * 4, "fifty grams of carbs is two hundred calories");
  assert.equal(lower.p, T.p, "and nothing else moved");
  assert.equal(lower.f, T.f);
});

test("asking for fewer calories keeps the split and rescales the grams", () => {
  // "Same diet, less of it" — which is what dropping a calorie number means.
  const before = pctOf(T);
  const cut = setKcal(T, 1800);
  assert.ok(Math.abs(cut.kcal - 1800) <= 4, `landed on ${cut.kcal} — integer grams, so within a few`);
  const after = pctOf(cut);
  for (const k of ["p", "c", "f"] as const) {
    assert.ok(Math.abs(after[k] - before[k]) <= 1, `${k}: ${before[k]}% → ${after[k]}%`);
  }
});

test("setting one macro's percentage holds the calories and rebalances the rest", () => {
  const carbs40 = setPct(T, "c", 40);
  assert.ok(Math.abs(carbs40.kcal - T.kcal) <= 4, "the calories are what stayed put");
  assert.ok(Math.abs(pctOf(carbs40).c - 40) <= 1, "carbs are 40% of them");
  // Protein and fat kept their ratio to each other while absorbing the rest.
  const rBefore = (T.p * 4) / (T.f * 9);
  const rAfter = (carbs40.p * 4) / (carbs40.f * 9);
  assert.ok(Math.abs(rBefore - rAfter) < 0.05, `protein:fat held — ${rBefore.toFixed(2)} → ${rAfter.toFixed(2)}`);
});

test("the percentages read out of the grams, and sum to about 100", () => {
  const p = pctOf(T);
  assert.ok(Math.abs(p.p + p.c + p.f - 100) <= 1, `${p.p}+${p.c}+${p.f}`);
  assert.equal(p.p, Math.round((180 * 4 * 100) / 2135));
});

test("the grams beside each percentage are what that percentage comes to", () => {
  // The number he asked to see next to the box.
  assert.equal(gramsAtPct(2000, "p", 30), 150, "30% of 2000 kcal as protein is 150g");
  assert.equal(gramsAtPct(2000, "f", 30), 67, "the same 30% as fat is 67g — nine calories a gram");
});

test("a zero or empty target never divides by nothing", () => {
  const empty = fromGrams(0, 0, 0);
  assert.deepEqual(pctOf(empty), { p: 0, c: 0, f: 0 });
  assert.equal(setKcal(empty, 2000).kcal, 2000, "no split to keep, so the grams are left alone");
  assert.deepEqual(setPct(empty, "p", 40), empty, "no calories to take a percentage of");
});

test("a percentage on a target whose other two are zero splits the rest evenly", () => {
  const onlyProtein = fromGrams(200, 0, 0); // 800 kcal
  const half = setPct(onlyProtein, "p", 50);
  assert.ok(Math.abs(half.kcal - 800) <= 8);
  assert.ok(half.c > 0 && half.f > 0, "no ratio to keep, so neither is picked as a favourite");
});

test("nothing can be driven negative", () => {
  assert.equal(setGrams(T, "f", -40).f, 0);
  assert.equal(setKcal(T, -100).kcal, 0);
  assert.ok(setPct(T, "c", 140).c > 0);
});

test("typing a calorie number keystroke by keystroke does NOT zero the macros", () => {
  // Dustin, 11 Sep: *"If I change the calories, it immediately zeros out all
  // of the protein, carbs, and fat."* Typing 2000 into a 2,135 kcal target
  // sends 2, 20, 200, 2000 through setKcal. Scaling from the LAST value makes
  // the first keystroke round every macro to zero, and from then on there is
  // no split left to keep.
  const base = fromGrams(180, 230, 55);
  let t = base;
  for (const k of [2, 20, 200, 2000]) t = setKcal(t, k, base);
  assert.ok(Math.abs(t.kcal - 2000) <= 6, `landed on ${t.kcal}`);
  assert.ok(t.p > 150 && t.c > 190 && t.f > 45, `macros survived: ${JSON.stringify(t)}`);
  // And the split is the one he started with.
  const a = pctOf(base), b = pctOf(t);
  for (const k of ["p", "c", "f"] as const) assert.ok(Math.abs(a[k] - b[k]) <= 1, `${k}: ${a[k]}% → ${b[k]}%`);
});

test("without a baseline it still behaves — `from` defaults to the current target", () => {
  // One call, no typing: the old signature's behaviour is unchanged.
  const once = setKcal(fromGrams(180, 230, 55), 1800);
  assert.ok(Math.abs(once.kcal - 1800) <= 4);
});
