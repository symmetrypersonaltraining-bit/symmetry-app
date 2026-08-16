// Guard: the nutrient panel never renders "unknown" as zero.
//
// Dustin, app_feedback 4 Aug: "Need to track full nutrients on everywhere in
// food logger." Nothing in the DATA was missing — the registry, the readers,
// the scalers, and both `planMealNutrientMap` and `logConsumedNutrientMap`
// already existed and were tested. Those two were called from NOWHERE. Every
// micronutrient the app captured was stored and never shown to anybody.
//
// ── Why the zero rule is the load-bearing one ─────────────────────────────
//
// The registry says it in as many words: "NULL MEANS UNKNOWN, NEVER ZERO… a
// food we have no vitamin K figure for must not report 0 mcg, or every daily
// total silently understates."
//
// That is not theoretical right now. The micronutrient backfill is at ~9% and
// roughly 180 hours from finishing, so MOST foods have no micros at all today.
// A panel that renders unknown as 0 would tell clients they ate none of a
// dozen nutrients, every day, for months — and it would look completely
// normal while doing it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatNutrient, percentOfReference } from "../../src/components/NutrientPanel";
import { NUTRIENTS, NUTRIENT_BY_KEY } from "../../src/lib/nutrition/nutrients";

const SRC = readFileSync(join(process.cwd(), "src/components/NutrientPanel.tsx"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sodium = NUTRIENT_BY_KEY["sodium"];

test("an unknown value formats as null, so the UI can show a dash", () => {
  assert.equal(formatNutrient(sodium, null), null);
  assert.equal(formatNutrient(sodium, undefined), null);
  assert.equal(formatNutrient(sodium, NaN), null);
  // …and zero is a REAL measurement, which must still render.
  assert.equal(formatNutrient(sodium, 0), "0 mg");
});

test("the unit comes from the registry, never from the caller", () => {
  // Sodium is mg and fibre is g. A number without its unit is how a wrong
  // target gets built.
  assert.match(formatNutrient(NUTRIENT_BY_KEY["sodium"], 500) || "", /mg$/);
  assert.match(formatNutrient(NUTRIENT_BY_KEY["fiber"], 12) || "", /g$/);
});

test("percent of reference is null when there is no reference or no value", () => {
  assert.equal(percentOfReference(sodium, null), null);
  const noRef = NUTRIENTS.find((n) => !n.dailyReference);
  if (noRef) assert.equal(percentOfReference(noRef, 10), null);
});

test("percent of reference is the honest arithmetic", () => {
  const withRef = NUTRIENTS.find((n) => (n.dailyReference ?? 0) > 0);
  assert.ok(withRef, "the registry should have at least one reference value");
  const ref = withRef!.dailyReference!;
  assert.equal(percentOfReference(withRef!, ref), 100);
  assert.equal(percentOfReference(withRef!, ref / 2), 50);
});

test("the component renders a dash for unknown, and never a bare 0 fallback", () => {
  // The specific bug shape: `value ?? 0` or `|| 0` anywhere near the render.
  assert.match(code, /shown \?\? "—"/, "unknown must render as an em dash");
  assert.doesNotMatch(code, /\?\?\s*0\b/, "a ?? 0 fallback turns unknown into zero");
  assert.doesNotMatch(code, /\|\|\s*0\b/, "a || 0 fallback turns unknown into zero");
});

test("nothing-known is explained, not shown as 33 dashes", () => {
  // Most foods have no micros today. A wall of dashes reads as "this meal
  // contains nothing", which is a different and wrong claim.
  assert.match(code, /known === 0/);
  assert.match(SRC, /No nutrient data for these foods yet/);
  assert.match(SRC, /the macros above are unaffected/, "reassure that the real numbers still work");
});

test("the panel says what a dash means, in the panel", () => {
  // A legend somewhere else is a legend nobody reads.
  assert.match(SRC, /A dash\s+means the food database has no figure for it — not zero/);
});

test("percentages are not presented as personal targets", () => {
  // Dustin sets real targets per client in macro_targets. A general adult RDA
  // shown without that caveat reads as coaching, and it is not.
  assert.match(SRC, /general adult reference, not your targets/);
});

test("groups and labels come from the registry, not re-listed here", () => {
  // 33 nutrients hand-listed in a component is a second source of truth that
  // drifts the first time one is added.
  assert.match(code, /NUTRIENT_GROUP_ORDER\.map/);
  assert.match(code, /NUTRIENTS\.filter\(\(n\) => n\.group === group\)/);
  assert.doesNotMatch(code, /"vitamin_?c"|"sodium":/i, "nutrient keys should not be hardcoded in the UI");
});

test("every registry nutrient has a group the panel actually renders", () => {
  // A nutrient in a group the panel does not iterate would be invisible with
  // no error anywhere — the same failure class as the invisible recipes.
  const { NUTRIENT_GROUP_ORDER } = require("../../src/lib/nutrition/nutrients");
  for (const n of NUTRIENTS) {
    assert.ok(
      (NUTRIENT_GROUP_ORDER as string[]).includes(n.group),
      `${n.key} is in group "${n.group}", which the panel never renders`
    );
  }
});
