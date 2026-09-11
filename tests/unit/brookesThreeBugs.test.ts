// THREE THINGS A NEW TRAINER HIT IN HER FIRST HOUR.
//
// Brooke Orton was given a login on 23 Aug and found all of these before lunch.
// Two of the three had been broken for every user, all along.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromGrams, setKcal } from "../../src/lib/nutrition/macroSplit";
import { join } from "node:path";
import {
  validatePlanOnTarget,
  validatePlanAcceptingDrift,
  planTargetDrift,
  type PlanDraft,
} from "../../src/lib/ai/nutrition-json.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const PROGRAM = readFileSync(join(ROOT, "src/app/(app)/clients/[clientId]/program/page.tsx"), "utf8");

// ---------------------------------------------------------------------------
// 1. "Couldn't create the workout — value "1787510016343" is out of range for
//    type integer"
//
// `days.position` is a 32-bit integer; Date.now() is a millisecond timestamp
// roughly 800x the maximum. Creating a workout from the programming engine
// therefore failed for EVERY trainer, every time, with an error that reads like
// a database fault rather than "put it last".
// ---------------------------------------------------------------------------

test("a new workout's position is not a timestamp", () => {
  assert.ok(
    !/position:\s*Date\.now\(\)/.test(PROGRAM),
    "Date.now() is back in a position column — days.position is a 32-bit int and this fails every save",
  );
});

test("the position comes from the highest one already there", () => {
  assert.match(PROGRAM, /order\("position",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(PROGRAM, /nextPosition/);
});

test("no position column anywhere is fed a millisecond timestamp", () => {
  // The same mistake is available in five tables that all have an int position.
  const src = readFileSync(join(ROOT, "src/app/(app)/clients/[clientId]/program/page.tsx"), "utf8");
  assert.ok(!/position:\s*Date\.now/.test(src));
  assert.ok(!/position:\s*new Date\(\)\.getTime/.test(src));
});

// ---------------------------------------------------------------------------
// 2. "There's also not a way (that I can see) to delete the empty row"
// ---------------------------------------------------------------------------

test("an exercise row can be removed, not only added", () => {
  assert.match(PROGRAM, /function removeExercise\(/, "Add Exercise still has no opposite");
  assert.match(PROGRAM, /onClick=\{\(\) => removeExercise\(si, ei\)\}/, "the remove button is not wired to a row");
});

test("the remove control is reachable without a mouse", () => {
  const idx = PROGRAM.indexOf("removeExercise(si, ei)");
  assert.ok(idx > 0);
  const around = PROGRAM.slice(idx - 400, idx + 400);
  assert.match(around, /aria-label=/, "the remove button has no accessible name");
});

// ---------------------------------------------------------------------------
// 3. "AI told me 160g of protein but is giving me 198g protein total meal plans."
//
// The system prompt has always demanded the totals land within 3% on kcal and
// 5g on each macro. Nothing checked. The validator recomputed the totals from
// the items and returned them next to the targets without ever comparing them.
// ---------------------------------------------------------------------------

function draftOf(perMealProtein: number[], target: { kcal: number; p: number; c: number; f: number }) {
  return {
    targets: target,
    meals: perMealProtein.map((p, i) => ({
      name: `Meal ${i + 1}`,
      timing: null,
      items: [(() => {
        const c = target.c / perMealProtein.length;
        const f = target.f / perMealProtein.length;
        return { food: "chicken breast", amount: 150, unit: "g", p, c, f, kcal: p * 4 + c * 4 + f * 9 };
      })()],
    })),
  };
}

test("a plan that misses its own protein target is rejected", () => {
  // Brooke's exact numbers: told 160g, handed 198g.
  const raw = draftOf([28, 48, 29, 38, 55], { kcal: 1800, p: 160, c: 170, f: 55 });
  assert.equal(validatePlanOnTarget(raw), null, "a 38g protein overshoot came back as a valid plan");
});

test("a plan that hits its targets passes", () => {
  const raw = draftOf([32, 32, 32, 32, 32], { kcal: 160 * 4 + 170 * 4 + 55 * 9, p: 160, c: 170, f: 55 });
  const ok = validatePlanOnTarget(raw);
  assert.ok(ok, "a plan landing on its targets was rejected");
  assert.equal(ok!.targetsMet, undefined, "a matching plan should not be flagged");
});

test("a drifting plan can be salvaged, but never silently", () => {
  const raw = draftOf([28, 48, 29, 38, 55], { kcal: 1800, p: 160, c: 170, f: 55 });
  const salvaged = validatePlanAcceptingDrift(raw);
  assert.ok(salvaged, "the salvage path should still return the plan");
  assert.equal(salvaged!.targetsMet, false, "the mismatch is not recorded");
  assert.ok(salvaged!.drift, "the size of the miss is not recorded");
  assert.ok(salvaged!.drift!.p > 30, `expected a large protein overshoot, got ${salvaged!.drift!.p}`);
});

test("the tolerance is the one the prompt promises", () => {
  const base = { kcal: 2000, p: 150, c: 200, f: 60 };
  const within: PlanDraft = { targets: base, reasoning: null, meals: [], totals: { kcal: 2050, p: 154, c: 196, f: 62 } };
  const beyond: PlanDraft = { targets: base, reasoning: null, meals: [], totals: { kcal: 2050, p: 162, c: 196, f: 62 } };
  assert.equal(planTargetDrift(within).ok, true, "4g of protein is inside the promised 5g");
  assert.equal(planTargetDrift(beyond).ok, false, "12g of protein is not");
});

test("the draft screen prints what the plan actually comes to", () => {
  // The target was shown; the total never was. That is the whole reason a
  // 38g miss could sit on screen looking authoritative.
  //
  // It arrived as a banner over the target boxes. On 11 Sep 2026 it moved INTO
  // them, one number per target — Dustin: *"nineteen hundred calories out of
  // eighteen fifty calories… And then we don't need that banner at all."*
  const ui = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(ui, /actual=\{draft\.totals\}/, "the draft no longer shows what it comes to");
  const editor = readFileSync(join(ROOT, "src/components/nutrition/TargetEditor.tsx"), "utf8");
  assert.match(editor, /\{Math\.round\(actual\[key\]\)[^\n]*of \{Math\.round\(value\[key\]\)/,
    "each box reads as what it is, then what it is aiming at");
  assert.match(editor, /onTarget\(key, actual\[key\], value\[key\]\)/, "a mismatch is not called out");
});

// ---------------------------------------------------------------------------
// 4. "Would be cool if when you're putting in macros it auto calculated
//    calories" — Brooke Orton, same hour.
//
// Not a bug, but the same root as the one above: a target typed with calories
// that disagree with its own macros is one nothing can hit, and it was the
// human's job to keep them in step.
// ---------------------------------------------------------------------------

test("typing macros fills in the calories", () => {
  // Brooke Orton, 23 Aug: "Would be cool if when you're putting in macros it
  // auto calculated calories." Still true, and now more so — on 11 Sep 2026
  // the four bare inputs became TargetEditor, where grams, calories AND
  // percentages all follow each other. Dustin: "we need to be able to change
  // the macros and the calories, and they all need to follow each other."
  // The arithmetic moved to macroSplit.ts; this asserts the screen uses it.
  const ui = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(ui, /<TargetEditor value=\{tgIn\} onChange=\{setTgIn\} \/>/, "the entry form uses the shared control");
  assert.doesNotMatch(ui, /setTgIn\(\{ \.\.\.tgIn, \[k\]: e\.target\.value/, "never straight to state — calories would not follow");
  const editor = readFileSync(join(ROOT, "src/components/nutrition/TargetEditor.tsx"), "utf8");
  assert.match(editor, /setGrams\(from, k, n\)/, "a gram edit goes through the shared rule, from the focus baseline");
  // And the rule itself: grams in, calories out, 4/4/9.
  assert.equal(fromGrams(180, 230, 55).kcal, 180 * 4 + 230 * 4 + 55 * 9);
});

test("the calories field can still be typed into directly", () => {
  // Deriving it is a convenience, not a lock. Someone working to a prescribed
  // calorie number needs to set it — and since 11 Sep the macros FOLLOW it,
  // rescaled at the same split, rather than being left to disagree with it.
  const editor = readFileSync(join(ROOT, "src/components/nutrition/TargetEditor.tsx"), "utf8");
  assert.match(editor, /aria-label="target calories"/, "the calories box is still there to type in");
  assert.match(editor, /setKcal\(value, n, from\)/, "and typing in it rescales the grams from the focus baseline, not the last keystroke");
  const cut = setKcal(fromGrams(180, 230, 55), 1800);
  assert.ok(Math.abs(cut.kcal - 1800) <= 4, `asked 1800, landed ${cut.kcal}`);
  assert.ok(cut.p < 180 && cut.c < 230 && cut.f < 55, "every macro came down with it");
});
