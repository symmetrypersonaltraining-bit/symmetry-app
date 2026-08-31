// A meal the totals can count and nothing can explain.
//
// est_kcal/protein/carbs/fats are four numeric columns the app adds up.
// off_plan_macros is the structured record, WITH A DESCRIPTION, that the
// nightly rollup and the coach read to know what was actually eaten. A row
// carrying one and not the other is half a log.
//
// 266 such rows were backfilled by hand across 15 clients on 5 Aug. The write
// path was never fixed, so it kept making more. Measured 31 Aug — off-plan rows
// with est_* and no off_plan_macros:
//
//   w/c 27 Jul and earlier     0 of 162
//   w/c  3 Aug                36 of 113
//   w/c 10 Aug                60 of  86
//   w/c 17 Aug                85 of 120
//   w/c 24 Aug                88 of  91
//
// Not a legacy scar. An active fault, getting worse, because the v3 screen
// replaced MealPlanClient in early August and never inherited the six lines
// that mirror these.

import { test } from "node:test";
import assert from "node:assert/strict";

type Payload = Record<string, unknown>;

/** The rule upsertLog applies before writing. */
function mirror(payload: Payload): Payload {
  const p = { ...payload };
  if (p.adherence === "Off-plan" && p.est_kcal != null && p.off_plan_macros == null) {
    p.off_plan_macros = {
      kcal: Number(p.est_kcal) || 0,
      protein: Number(p.est_protein) || 0,
      carbs: Number(p.est_carbs) || 0,
      fats: Number(p.est_fats) || 0,
      description: (p.off_plan_details as string) || "Off-plan meal",
      estimated: true,
    };
    if (p.analysis_status == null) p.analysis_status = "client";
  }
  return p;
}

test("an off-plan log never lands with macros and no record of what they were", () => {
  const out = mirror({
    adherence: "Off-plan",
    est_kcal: 923, est_protein: 55, est_carbs: 85, est_fats: 40,
    off_plan_details: "Sirloin 170 g, potato 180 g, rice 150 g",
  });
  assert.deepEqual(out.off_plan_macros, {
    kcal: 923, protein: 55, carbs: 85, fats: 40,
    description: "Sirloin 170 g, potato 180 g, rice 150 g",
    estimated: true,
  });
  assert.equal(out.analysis_status, "client");
});

test("a richer record from the AI or photo path is never flattened", () => {
  const rich = { kcal: 900, protein: 50, carbs: 80, fats: 38, description: "Five Guys", items: [1, 2] };
  const out = mirror({ adherence: "Off-plan", est_kcal: 900, off_plan_macros: rich, analysis_status: "ai" });
  assert.equal(out.off_plan_macros, rich, "an explicit record was overwritten");
  assert.equal(out.analysis_status, "ai", "an explicit status was overwritten");
});

test("on-plan meals are untouched", () => {
  // Full / partial adherence carries no est_* and no off_plan_macros. Writing
  // one here would invent an off-plan record for a meal eaten as prescribed.
  const out = mirror({ adherence: "Full", meal_id: "m1", est_kcal: null });
  assert.equal(out.off_plan_macros, undefined);
  assert.equal(out.analysis_status, undefined);
});

test("a pending row waits rather than recording zeroes", () => {
  // macros_pending means the numbers are not known yet. est_kcal is null, so
  // nothing is mirrored — a record reading 0 cal would be worse than none.
  const out = mirror({ adherence: "Off-plan", est_kcal: null, macros_pending: true });
  assert.equal(out.off_plan_macros, undefined);
});

test("no description recorded still produces an honest one", () => {
  const out = mirror({ adherence: "Off-plan", est_kcal: 400, est_protein: 20, est_carbs: 40, est_fats: 15 });
  assert.equal((out.off_plan_macros as { description: string }).description, "Off-plan meal");
});
