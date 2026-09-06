// THE AUTHORITATIVE CORE IS REAL USDA DATA, NOT A GUESS.
//
// Dustin, after three failed attempts to infer serving sizes from a scraped
// catalogue: *"verify every food in database to real data... we need proper
// units on every food that calculate proper macros for each unit and defaults
// to standard serving."*
//
// He is right that the catalogue could not answer that. 511,555 of its rows are
// Open Food Facts, and for 127,847 of them OFF simply has no serving size - it
// was never collected, so no amount of re-fetching produces one. Checked
// directly against the OFF API before concluding it.
//
// data/usda-sr28.tsv is USDA Standard Reference 28: 8,789 foods with lab-
// measured macros AND USDA's own household measures ("1 tbsp" = 14.2 g). It is
// the authoritative core every generic food resolves against. These tests hold
// the shipped file to values anyone can check against USDA's own publication.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TSV = readFileSync(join(process.cwd(), "data/usda-sr28.tsv"), "utf8");
const lines = TSV.trim().split("\n");
const header = lines[0].split("\t");
const rows = lines.slice(1).map((l) => {
  const f = l.split("\t");
  return Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""])) as Record<string, string>;
});
const byNdb = new Map(rows.map((r) => [r.ndb, r]));

test("the core carries the whole of SR28", () => {
  assert.equal(rows.length, 8789);
  assert.deepEqual(header, [
    "ndb","name","kcal","protein","carbs","fats","fiber","sugar","sodium","sat_fat",
    "p1","p1g","p2","p2g",
  ]);
});

test("butter is USDA's butter, to the number", () => {
  const b = byNdb.get("01001")!;
  assert.equal(b.name, "Butter, salted");
  assert.equal(b.kcal, "717");
  assert.equal(b.protein, "0.85");
  assert.equal(b.carbs, "0.06");
  assert.equal(b.fats, "81.11");
  // The tablespoon this whole saga was about, from USDA rather than inferred.
  assert.equal(b.p2, "1 tbsp");
  assert.equal(b.p2g, "14.2");
});

test("nearly every food carries a real household measure", () => {
  const withPortion = rows.filter((r) => r.p1 && r.p1g);
  assert.ok(withPortion.length > 8000, `only ${withPortion.length} have a portion`);
});

test("every portion weighs something, and nothing weighs absurdly", () => {
  for (const r of rows) {
    for (const [d, g] of [[r.p1, r.p1g], [r.p2, r.p2g]]) {
      if (!d) continue;
      const grams = Number(g);
      assert.ok(Number.isFinite(grams) && grams > 0, `${r.name}: "${d}" has no weight`);
      // A whole raw turkey really is 5,002 g under "1 bird". The cap is here
      // to catch a parse slip, not to argue with USDA about poultry.
      assert.ok(grams < 20000, `${r.name}: "${d}" = ${grams} g`);
    }
  }
});

test("the macros are physically possible for every food", () => {
  for (const r of rows) {
    const kcal = Number(r.kcal), p = Number(r.protein), c = Number(r.carbs), f = Number(r.fats);
    if (![kcal, p, c, f].every(Number.isFinite)) continue;
    assert.ok(kcal >= 0 && kcal <= 902, `${r.name}: ${kcal} kcal`);
    assert.ok(p + c + f <= 101, `${r.name}: macros sum to ${p + c + f} g per 100 g`);
  }
});
