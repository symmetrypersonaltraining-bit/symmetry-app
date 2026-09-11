import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE CONSULT ASKS FOR WHAT IT IS MISSING, AND NEVER GUESSES IT.
 *
 * Dustin, 11 Sep 2026: *"If the AI does not have all the information it needs
 * to accurately get the daily calorie expenditure — if it doesn't have their
 * age, their weight, their body fat, their height, anything that's missing for
 * it to figure out those numbers accurately — it needs to stop and ask them
 * for it."* And: *"If those numbers are not already in my profile, it needs to
 * ask for them and put them in my profile for future use, and then it needs to
 * get an accurate number to build the plan off of that."*
 */
const R = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(R("src/app/api/nutrition-ai/plan-build/route.ts"));
const UI = strip(R("src/app/(app)/nutrition/v3/NutritionV3Client.tsx"));

test("a missing input stops the build — it is a 422, not a default", () => {
  assert.match(ROUTE, /const missing = missingForExpenditure\(inputs\);/);
  assert.match(ROUTE, /if \(missing\.length\) \{[\s\S]*?needsProfile: missing[\s\S]*?status: 422/);
});

test("the targets are computed here, and the model is told not to touch them", () => {
  assert.match(ROUTE, /recommended = recommendTargets\(/);
  assert.match(ROUTE, /the targets are ALREADY DECIDED/i, "the prompt says so");
  assert.match(ROUTE, /Do NOT recompute them/);
});

test("and the computed targets WIN, whatever the model returned", () => {
  // Telling a model not to do something is a hope. This is the guarantee.
  assert.match(ROUTE, /plan = \{ \.\.\.plan, targets: recommended\.targets, reasoning: recommended\.reasoning \}/);
  assert.match(ROUTE, /planTargetDrift\(plan\)/, "and the target check is redone against them");
});

test("weight comes from the newest weigh-in, not a stale onboarding figure", () => {
  assert.match(ROUTE, /metrics\.find\(\(m\) => m\.weight != null\)\?\.weight \?\? null/);
  assert.match(ROUTE, /latestWeight \?\? num\(c\.current_weight\)/, "the profile figure is the fallback, not the source");
});

test("the sheet asks for exactly what came back, and saves it to the profile", () => {
  assert.match(UI, /res\.status === 422 && Array\.isArray\(json\?\.needsProfile\)/);
  assert.match(UI, /setNeeds\(json\.needsProfile as MissingInput\[\]\)/);
  assert.match(UI, /db\.from\("clients"\)\.update\(patch\)\.eq\("id", clientId\)/, "saved for future use, as he asked");
  for (const f of ["sex", "date_of_birth", "height_in", "current_weight"]) {
    assert.ok(UI.includes(`patch.${f}`), `${f} is saved`);
  }
});

test("a weight typed here becomes today's weigh-in too", () => {
  // bodyInputsFor reads the newest metric first, so without this row an older
  // weigh-in would keep winning over what they typed thirty seconds ago.
  assert.match(UI, /db\.from\("metrics"\)\.insert\(\{[\s\S]*?weight: w,/);
  assert.match(UI, /metric_date: centralToday\(\)/, "Central, never UTC — imported, not copied");
});

test("the build resumes where it left off — the chips are not re-answered", () => {
  assert.match(UI, /setLastRun\(\(\) => body\)/);
  assert.match(UI, /if \(lastRun\) await run\(lastRun\)/);
});

test("the shortcut card runs the SAME engine as the plan menu", () => {
  // Dustin, 11 Sep, on the "turn this into my plan" card an open-plan client
  // sees: *"make sure those do the exact same thing as those same options from
  // the actual build my own plan with AI menu… the exact same AI, everything
  // works exactly the same. Anything we're updating on those other ones needs
  // to be updated on these two buttons as well."*
  //
  // They already do — both open the one AiPlanSheet at the same mode, so every
  // change to the builder reaches both by construction. This is what stops
  // someone "helpfully" giving the shortcut its own lighter path later.
  const shortcuts = UI.slice(UI.indexOf("TURN THIS INTO MY PLAN"), UI.indexOf("TURN THIS INTO MY PLAN") + 2500);
  assert.match(shortcuts, /openSheet\(\{ kind: "aiplan", mode: "targets" \}\)/, "Build me a plan from targets");
  assert.match(shortcuts, /openSheet\(\{ kind: "aiplan", mode: "consult" \}\)/, "Recommend my targets");
  // And the menu reaches the same two modes, so there is one of each.
  const menu = UI.slice(UI.indexOf("function BuildPlanSheetView("));
  assert.match(menu, /kind: "aiplan", mode: "consult"/);
  assert.match(menu, /kind: "aiplan", mode: "targets"/);
  // Six references: the sheet's own type, then the five buttons that open it
  // (two on the shortcut card, three in the build menu). If this climbs,
  // somebody added an entry point — check it opens THIS sheet and is not a
  // lighter path of its own.
  assert.equal(UI.split('kind: "aiplan"').length - 1, 6, "one sheet, five doors into it");
});
