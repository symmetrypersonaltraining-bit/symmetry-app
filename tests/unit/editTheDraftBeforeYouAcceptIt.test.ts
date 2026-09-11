import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planTargetDrift } from "../../src/lib/ai/nutrition-json";
import { kcalOf } from "../../src/lib/nutrition/dailyTotals";

/**
 * AN AI DRAFT IS A PROPOSAL, NOT A VERDICT.
 *
 * Dustin, 11 Sep 2026: *"Once it spits out a recommended plan and numbers, we
 * need to put in a way to manually change these numbers and edit this entire
 * plan before you accept it to make an ongoing plan. Even though this is run by
 * AI, the client needs the ability to override those numbers and edit this plan
 * before they actually accept it."* And: *"Same issue from the build from my
 * targets and build it from the foods I eat."*
 *
 * The draft screen had told people to "adjust the amounts before you save it"
 * since it was built, with nothing to adjust them with.
 */
const NUT = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
const CODE = NUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SHEET = CODE.slice(CODE.indexOf("function AiPlanSheet("));

test("one editor serves all three modes, because they share this sheet", () => {
  // targets / consult / foods all render through AiPlanSheet. If the draft
  // block is ever forked per mode, two of them will quietly lose editing.
  assert.match(CODE, /mode: "targets" \| "consult" \| "foods"/);
  assert.equal(CODE.split("Draft total").length - 1, 1, "one draft block, not one per mode");
});

test("the targets are editable, through the one shared control", () => {
  // Was four bare inputs with a 4/4/9 refill. Dustin, 11 Sep: "we need to be
  // able to change the macros and the calories, and they all need to follow
  // each other… set the macros by percentages and give a number in grams at
  // each percentage." That is TargetEditor, shared with the entry form, and
  // the arithmetic is macroSplit.ts — see macrosAndCaloriesFollowEachOther.
  assert.match(SHEET, /<TargetEditor title="Targets — yours to change"/);
  assert.match(SHEET, /onChange=\{\(t\) => \{ setEdited\(true\); setDraft\(\(d\) => d && recomputeDraft\(\{ \.\.\.d, targets: t \}\)\); \}\}/,
    "an override recomputes the target check against the meals below it");
});

test("every part of a meal can be changed or removed", () => {
  for (const label of ["meal \\$\\{i \\+ 1\\} name", "meal \\$\\{i \\+ 1\\} time", "item \\$\\{j \\+ 1\\} food", "item \\$\\{j \\+ 1\\} amount"]) {
    assert.match(SHEET, new RegExp(`aria-label=\\{\`${label}\`\\}`), `${label} is editable`);
  }
  assert.match(SHEET, /function removeItem/);
  assert.match(SHEET, /function removeMeal/);
});

test("accepting saves what is on screen, not what the model first said", () => {
  // onAccept takes the CURRENT draft state. If it ever captured the original
  // response, every edit would be silently discarded at the last step.
  assert.match(SHEET, /onClick=\{\(\) => onAccept\(draft, label\)\}/);
  assert.match(SHEET, /Accepting saves exactly what you see/, "and the screen says so");
});

test("the editor never lets anyone type a macro directly", () => {
  // The whole complaint behind this screen is invented numbers. A portion is
  // the honest handle; grams follow it. Nothing here edits p/c/f by hand.
  for (const bad of [/aria-label="item \d+ protein"/, /patchItem\([^)]*p: Number\(/]) {
    assert.doesNotMatch(SHEET, bad);
  }
  assert.match(SHEET, /scaleItemTo\(base,/, "an amount change scales the macros instead");
});

// ── the arithmetic, exercised rather than asserted about ──────────────────

/** The component's scaling rule, reimplemented here to pin its behaviour. */
function scale(base: { amount: number | null; p: number; c: number; f: number; kcal: number }, amount: number | null) {
  const from = base.amount;
  if (from == null || from === 0 || amount == null) return { ...base, amount };
  const r = amount / from;
  return {
    ...base, amount,
    p: Math.round(base.p * r * 10) / 10,
    c: Math.round(base.c * r * 10) / 10,
    f: Math.round(base.f * r * 10) / 10,
    kcal: Math.round((base.kcal || kcalOf(base.p, base.c, base.f)) * r),
  };
}

test("halving a portion halves its macros", () => {
  const base = { amount: 170, p: 53, c: 0, f: 6, kcal: 266 };
  const half = scale(base, 85);
  assert.equal(half.p, 26.5);
  assert.equal(half.kcal, 133);
});

test("scaling always runs from the ORIGINAL, so typing cannot drift the numbers", () => {
  // 170 → 1 → 17 → 170 is what happens when someone clears a field and retypes
  // it. Compounding from the current value loses the numbers; scaling from the
  // base returns them exactly.
  const base = { amount: 170, p: 53, c: 0, f: 6, kcal: 266 };
  let cur = scale(base, 1); cur = scale(base, 17); cur = scale(base, 170);
  assert.deepEqual(cur, base);
});

test("an item with no amount to scale from keeps its macros", () => {
  const base = { amount: null, p: 10, c: 2, f: 1, kcal: 57 };
  assert.deepEqual(scale(base, 3), { ...base, amount: 3 }, "no baseline means no division by nothing");
});

test("the target check after an edit is the SERVER's, not a looser one", () => {
  // 3% on calories, 5g per macro — planTargetDrift, imported by the component
  // rather than reimplemented. A tolerance invented in the UI is how "within
  // 3%" becomes 24%.
  assert.match(CODE, /import \{[^}]*planTargetDrift[^}]*\} from "@\/lib\/ai\/nutrition-json"/);
  const onTarget = planTargetDrift({ targets: { kcal: 2200, p: 180, c: 230, f: 55 }, totals: { kcal: 2210, p: 182, c: 231, f: 56 } } as never);
  assert.equal(onTarget.ok, true, "small drift is on target");
  const off = planTargetDrift({ targets: { kcal: 2200, p: 180, c: 230, f: 55 }, totals: { kcal: 2357, p: 242, c: 239, f: 49 } } as never);
  assert.equal(off.ok, false, "his real draft — +157 kcal, +62g protein — is not");
});
