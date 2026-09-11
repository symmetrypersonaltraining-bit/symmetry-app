import test from "node:test";
import assert from "node:assert/strict";
import { fromGrams, fromPct, gramsAtPct, pctOf, setGrams, setKcal, splitAddsUp } from "../../src/lib/nutrition/macroSplit";
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
  const ways = [T, setGrams(T, "c", 190), setKcal(T, 1800), fromPct(T.kcal, { p: 35, c: 40, f: 25 }),
    setKcal(fromPct(setGrams(T, "p", 200).kcal, { p: 30, c: 45, f: 25 }), 2400)];
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

test("a percentage split holds the calories and is applied as a whole", () => {
  // Dustin, 11 Sep 2026: *"when I change one, it should not change the others.
  // It should just show that the others do not match up to a hundred percent
  // until I adjust them manually."*
  //
  // It used to rebalance the other two on every keystroke, which kept the
  // numbers valid and made a custom split impossible to type: reach for
  // protein and carbs had already moved. So a split is now entered as a set
  // and only applied when it IS one — the editor holds the boxes and colours
  // them red until then.
  const split = fromPct(T.kcal, { p: 30, c: 40, f: 30 });
  assert.ok(Math.abs(split.kcal - T.kcal) <= 6, "the calories are what stayed put");
  const got = pctOf(split);
  for (const [k, want] of [["p", 30], ["c", 40], ["f", 30]] as const) {
    assert.ok(Math.abs(got[k] - want) <= 1, `${k} came out ${got[k]}%, asked for ${want}%`);
  }
});

test("a split that does not total 100 is never applied", () => {
  const now = pctOf(T);
  assert.equal(splitAddsUp(now), true, "what is on screen is a real split");
  assert.equal(splitAddsUp({ ...now, p: now.p + 5 }), false, "one box moved on its own is not");
  assert.equal(splitAddsUp({ p: 0, c: 0, f: 0 }), false, "and neither is nothing");
  assert.equal(splitAddsUp({ p: 30, c: 45, f: 25 }), true);
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
  assert.deepEqual(fromPct(0, { p: 30, c: 45, f: 25 }), empty, "no calories to take a percentage of");
});

test("a split says what all three are, so a zero elsewhere is not a special case", () => {
  // The old setPct had to guess what to do when the other two were zero. A
  // whole split never needs to: he typed all three.
  const half = fromPct(800, { p: 50, c: 25, f: 25 });
  assert.equal(half.p, 100);
  assert.equal(half.c, 50);
  assert.equal(half.f, 22);
  assert.ok(Math.abs(half.kcal - 800) <= 10);
});

test("nothing can be driven negative", () => {
  assert.equal(setGrams(T, "f", -40).f, 0);
  assert.equal(setKcal(T, -100).kcal, 0);
  assert.deepEqual(fromPct(-2000, { p: 30, c: 45, f: 25 }), fromGrams(0, 0, 0));
  assert.equal(fromPct(2000, { p: 30, c: 45, f: -25 }).f, 0);
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
