// ============================================================================
// Unit tests — src/lib/nutrition/off.ts (Open Food Facts → food_catalog map).
// Run: npm run test:unit   (node --import tsx --test)
// Pure node, no browser, no network — the OFF JSON is mocked inline.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapOffProduct } from "../../src/lib/nutrition/off";

// Trimmed OFF API v2 response for 3017620422003 (Nutella, Ferrero) — the fields
// mapOffProduct reads, with realistic label values per 100 g.
const NUTELLA = {
  status: 1,
  code: "3017620422003",
  product: {
    product_name: "Nutella",
    brands: "Ferrero, Nutella",
    serving_size: "15 g",
    serving_quantity: 15,
    nutriments: {
      "energy-kcal_100g": 539,
      "energy_100g": 2252,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      fiber_100g: 0,
      sugars_100g: 56.3,
      "saturated-fat_100g": 10.6,
      sodium_100g: 0.0428, // grams → 43 mg
    },
  },
};

describe("mapOffProduct — Nutella 3017620422003", () => {
  const row = mapOffProduct(NUTELLA, "3017620422003");

  it("maps identity + provenance", () => {
    assert.ok(row);
    assert.equal(row!.name, "Nutella");
    assert.equal(row!.brand, "Ferrero"); // first brand only
    assert.equal(row!.barcode, "3017620422003");
    assert.equal(row!.source, "off");
    assert.equal(row!.verified, false);
  });

  it("maps per-100g macros", () => {
    assert.equal(row!.kcal, 539);
    assert.equal(row!.protein, 6.3);
    assert.equal(row!.carbs, 57.5);
    assert.equal(row!.fats, 30.9);
    assert.equal(row!.fiber, 0);
    assert.equal(row!.sugar, 56.3);
    assert.equal(row!.sat_fat, 10.6);
  });

  it("converts sodium grams → milligrams", () => {
    assert.equal(row!.sodium, 43); // round(0.0428 * 1000)
  });

  it("builds serving_options: 100 g, 1 oz, then the OFF serving", () => {
    assert.deepEqual(row!.serving_desc, "100 g");
    assert.equal(row!.serving_grams, 100);
    assert.deepEqual(row!.serving_options, [
      { desc: "100 g", grams: 100 },
      { desc: "1 oz", grams: 28.35 },
      { desc: "15 g", grams: 15 },
    ]);
  });
});

describe("mapOffProduct — edge cases", () => {
  it("returns null when OFF has no product (status 0)", () => {
    assert.equal(mapOffProduct({ status: 0 }, "0000000000000"), null);
    assert.equal(mapOffProduct(null, "0000000000000"), null);
    assert.equal(mapOffProduct(undefined, "0000000000000"), null);
  });

  it("returns null when the product has no usable name", () => {
    assert.equal(mapOffProduct({ status: 1, product: { nutriments: {} } }, "123"), null);
  });

  it("omits the OFF serving option when serving data is missing", () => {
    const row = mapOffProduct(
      { status: 1, product: { product_name: "Plain Rice", nutriments: { proteins_100g: 7 } } },
      "111",
    );
    assert.ok(row);
    assert.deepEqual(row!.serving_options, [
      { desc: "100 g", grams: 100 },
      { desc: "1 oz", grams: 28.35 },
    ]);
    // Missing macros default to 0; missing micros stay null.
    assert.equal(row!.kcal, 0);
    assert.equal(row!.carbs, 0);
    assert.equal(row!.sodium, null);
    assert.equal(row!.sat_fat, null);
  });

  it("falls back to kJ (energy_100g) when kcal is absent", () => {
    const row = mapOffProduct(
      { status: 1, product: { product_name: "X", nutriments: { energy_100g: 2252 } } },
      "222",
    );
    assert.equal(row!.kcal, Math.round(2252 / 4.184)); // 538
  });

  it("uses generic_name / product_name_en fallbacks", () => {
    const en = mapOffProduct({ status: 1, product: { product_name_en: "Oat Milk", nutriments: {} } }, "1");
    assert.equal(en!.name, "Oat Milk");
    const generic = mapOffProduct({ status: 1, product: { generic_name: "Tomato Paste", nutriments: {} } }, "2");
    assert.equal(generic!.name, "Tomato Paste");
  });
});
