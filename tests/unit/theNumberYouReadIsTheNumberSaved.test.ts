// ============================================================================
// THE NUMBER YOU READ IS THE NUMBER SAVED.
//
// Dustin, 13 Sep: *"This must be fixed anywhere in the app ai gets macros n
// cal. Do not miss any paths in the app!"*
//
// The sweep that followed found three ways a recalled figure still reached a
// person, after the logging, plan and recipe paths were all sourced:
//
//   1. THE CONFIRMATION CARD. `/nutrition-ai/act` forbids the model from
//      stating a figure in one line of its prompt and then demands one in
//      another: *"Swap M4 → Salmon + rice (est 520 kcal · 42P/45C/16F)?"*.
//      That sentence was passed through untouched while the numbers actually
//      written came from the catalogue. The client reads one number and the
//      log keeps a different one, silently.
//
//   2. THE COACH'S SUGGESTION CHIPS. `{"label":"Add a scoop of whey at
//      breakfast","delta":{"p":25,...}}` — pure recall, and tapping the chip
//      writes that delta straight to `meal_adherence_logs.est_*` without ever
//      touching the resolver.
//
//   3. THE PHOTO'S "restaurant_official" CLAIM. Nothing checked that a reply
//      claiming official nutrition carried the page it came from, while the
//      restaurant lookup drops exactly that on sight.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { confirmationWithRealTotals } from "@/lib/ai/nutrition-json";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const priced = [
  { kcal: 263, p: 52.2, c: 0, f: 6 },
  { kcal: 251, p: 5.4, c: 56.3, f: 0.5 },
];

describe("the number you read is the number saved", () => {
  it("the confirmation carries the priced total, not the model's", () => {
    const out = confirmationWithRealTotals(
      "Swap M4 → Salmon + rice (est 520 kcal · 42P/45C/16F)?",
      priced,
    );
    assert.ok(!out.includes("520"), "the model's calorie figure must be gone");
    assert.ok(!out.includes("42P"), "…and its macros with it");
    assert.match(out, /514 kcal/, "263 + 251, from the rows");
    assert.match(out, /57\.6P/);
    assert.match(out, /Swap M4 → Salmon \+ rice/, "the sentence itself survives");
  });

  it("a confirmation with no figure in it just gains the real one", () => {
    const out = confirmationWithRealTotals("Add Greek yogurt to Friday?", priced);
    assert.match(out, /Add Greek yogurt to Friday/);
    assert.match(out, /514 kcal/);
  });

  it("nothing to price leaves the sentence alone", () => {
    assert.equal(confirmationWithRealTotals("Log M2 as eaten?", []), "Log M2 as eaten?");
  });

  it("the act route runs every confirmation through it", () => {
    assert.match(SRC("src/app/api/nutrition-ai/act/route.ts"), /confirmationWithRealTotals/);
  });

  it("a coach suggestion names a food, and the server prices it", () => {
    const ctx = SRC("src/lib/ai/coach-context.ts");
    assert.match(ctx, /"food":string/, "the chip must name what to eat, not what it contains");
    assert.match(ctx, /never state the macros/i);
    const json = SRC("src/lib/ai/nutrition-json.ts");
    assert.match(json, /food\?: string/, "CoachSuggestion must carry the food");
    for (const p of ["src/app/api/nutrition-ai/coach/route.ts", "src/app/api/nutrition-ai/act/route.ts"]) {
      assert.match(SRC(p), /priceCoachSuggestions/, `${p} must price its chips`);
    }
  });

  it("an official claim without a page is not an official claim", () => {
    assert.match(
      SRC("src/app/api/analyze-meal-photo/route.ts"),
      /restaurant_official['"]? && sourceUrl/,
      "a reply claiming official nutrition with no URL must fall back to visual_estimate",
    );
  });
});
