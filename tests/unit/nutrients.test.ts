// Tests for the canonical nutrient registry.
//
// The registry is on-disk data: its keys are what lands in the `micros` jsonb
// columns. A renamed or duplicated key silently orphans real client data, so
// the structural tests below matter as much as the arithmetic ones.

import test from "node:test";
import assert from "node:assert/strict";
import {
  NUTRIENTS,
  NUTRIENT_BY_KEY,
  NUTRIENT_KEYS,
  LEGACY_NUTRIENT_KEYS,
  isNutrientKey,
  sanitizeNutrients,
  readNutrients,
  scaleNutrients,
  addNutrients,
  sumNutrients,
  hasAnyNutrient,
  countKnownNutrients,
  roundNutrient,
  groupedNutrients,
  nutrientPromptSpec,
  pctOfDaily,
  formatNutrient,
} from "../../src/lib/nutrition/nutrients.ts";

// ─── structure ──────────────────────────────────────────────────────────────

test("every key is unique", () => {
  const seen = new Set<string>();
  for (const n of NUTRIENTS) {
    assert.ok(!seen.has(n.key), `duplicate nutrient key: ${n.key}`);
    seen.add(n.key);
  }
  assert.equal(seen.size, NUTRIENTS.length);
});

test("keys are storage-safe snake_case", () => {
  // These become jsonb keys and AI-facing field names. Anything else invites
  // quoting bugs and model typos.
  for (const n of NUTRIENTS) {
    assert.match(n.key, /^[a-z][a-z0-9_]*$/, `bad key: ${n.key}`);
  }
});

test("every nutrient has a label and a real unit", () => {
  for (const n of NUTRIENTS) {
    assert.ok(n.label && n.label.trim().length > 0, `${n.key} has no label`);
    assert.ok(["g", "mg", "mcg"].includes(n.unit), `${n.key} has bad unit ${n.unit}`);
  }
});

test("the four legacy column-backed nutrients are exactly the ones that predate the registry", () => {
  // food_catalog.{fiber,sugar,sodium,sat_fat} and
  // meal_adherence_logs.est_{fiber,sugar,sodium,sat_fat} already existed.
  // If this set changes, the storage rule in nutrients.ts is out of date and
  // readNutrients() will start missing or double-counting values.
  assert.deepEqual([...LEGACY_NUTRIENT_KEYS].sort(), ["fiber", "sat_fat", "sodium", "sugar"]);
});

test("NUTRIENT_BY_KEY and NUTRIENT_KEYS agree with NUTRIENTS", () => {
  assert.equal(NUTRIENT_KEYS.length, NUTRIENTS.length);
  for (const n of NUTRIENTS) assert.equal(NUTRIENT_BY_KEY[n.key], n);
  assert.ok(isNutrientKey("vitamin_b12"));
  assert.ok(!isNutrientKey("unobtainium"));
});

test("the registry actually covers the full panel, not just the old four", () => {
  // Dustin asked for full micros, explicitly not fibre/sugar/sodium only.
  for (const k of ["vitamin_a", "vitamin_c", "vitamin_d", "vitamin_b12", "iron", "calcium", "potassium", "magnesium", "zinc", "folate", "cholesterol", "trans_fat"]) {
    assert.ok(isNutrientKey(k), `expected ${k} in the registry`);
  }
  assert.ok(NUTRIENTS.length >= 30, `expected a full panel, got ${NUTRIENTS.length}`);
});

// ─── sanitizeNutrients ──────────────────────────────────────────────────────

test("sanitizeNutrients drops unknown keys rather than storing them", () => {
  const out = sanitizeNutrients({ iron: 4, unobtainium: 99, vitamin_c: 12 });
  assert.deepEqual(out, { iron: 4, vitamin_c: 12 });
});

test("sanitizeNutrients treats null, empty and non-numeric as unknown", () => {
  const out = sanitizeNutrients({ iron: null, zinc: "", calcium: "abc", folate: undefined, vitamin_c: "12" });
  // Only the coercible number survives; the rest are absent (= unknown).
  assert.deepEqual(out, { vitamin_c: 12 });
});

test("sanitizeNutrients rejects negative values", () => {
  assert.deepEqual(sanitizeNutrients({ sodium: -5, iron: 3 }), { iron: 3 });
});

test("sanitizeNutrients survives junk input", () => {
  assert.deepEqual(sanitizeNutrients(null), {});
  assert.deepEqual(sanitizeNutrients("nope"), {});
  assert.deepEqual(sanitizeNutrients([1, 2]), {});
});

// ─── readNutrients: the storage rule ────────────────────────────────────────

test("readNutrients merges jsonb micros with legacy flat columns", () => {
  const out = readNutrients({ iron: 4, vitamin_c: 20 }, { fiber: 8, sodium: 400 });
  assert.deepEqual(out, { iron: 4, vitamin_c: 20, fiber: 8, sodium: 400 });
});

test("readNutrients lets the flat column win — it is authoritative on those tables", () => {
  // If a stray value ever lands in micros for a legacy key, the real column
  // must still be what the app reports.
  const out = readNutrients({ fiber: 99 }, { fiber: 8 });
  assert.equal(out.fiber, 8);
});

test("readNutrients works with no flat columns at all", () => {
  // meal_items / foods / recipes store everything in micros.
  assert.deepEqual(readNutrients({ fiber: 8, iron: 2 }), { fiber: 8, iron: 2 });
  assert.deepEqual(readNutrients(null, null), {});
});

test("readNutrients ignores a null flat column instead of zeroing the nutrient", () => {
  // NULL means unknown. A row with est_fiber NULL must not report 0 g fibre.
  const out = readNutrients({ iron: 3 }, { fiber: null, sodium: null });
  assert.deepEqual(out, { iron: 3 });
  assert.equal(out.fiber, undefined);
});

// ─── arithmetic ─────────────────────────────────────────────────────────────

test("scaleNutrients prorates every known value", () => {
  assert.deepEqual(scaleNutrients({ fiber: 10, iron: 4 }, 0.5), { fiber: 5, iron: 2 });
});

test("addNutrients sums shared keys and carries unshared ones", () => {
  assert.deepEqual(addNutrients({ fiber: 5, iron: 2 }, { fiber: 3, zinc: 1 }), { fiber: 8, iron: 2, zinc: 1 });
});

test("adding a partially-known meal does not blank the day", () => {
  // The judgement call: an unlabelled snack contributes what it knows rather
  // than poisoning every total to unknown.
  const day = sumNutrients([{ fiber: 10, iron: 5 }, { fiber: 4 }, {}]);
  assert.equal(day.fiber, 14);
  assert.equal(day.iron, 5);
});

test("hasAnyNutrient / countKnownNutrients", () => {
  assert.equal(hasAnyNutrient({}), false);
  assert.equal(hasAnyNutrient(null), false);
  assert.equal(hasAnyNutrient({ iron: null }), false);
  assert.equal(hasAnyNutrient({ iron: 1 }), true);
  assert.equal(countKnownNutrients({ iron: 1, zinc: null, fiber: 3 }), 2);
});

// ─── rounding, grouping, formatting ─────────────────────────────────────────

test("roundNutrient keeps precision for sub-milligram nutrients", () => {
  // Copper's reference is 0.9 mg — rounding to 1dp would destroy it.
  assert.equal(roundNutrient("copper", 0.1234), 0.123);
  assert.equal(roundNutrient("fiber", 12.34), 12.3);
  assert.equal(roundNutrient("sodium", 480.06), 480.1);
});

test("groupedNutrients returns every nutrient exactly once, in group order", () => {
  const groups = groupedNutrients({ iron: 4 });
  const flat = groups.flatMap((g) => g.rows.map((r) => r.def.key));
  assert.equal(flat.length, NUTRIENTS.length);
  assert.equal(new Set(flat).size, NUTRIENTS.length);
  // Unknown nutrients still appear, as null — the panel shows what is missing.
  const iron = flat.indexOf("iron");
  assert.ok(iron >= 0);
  const ironRow = groups.flatMap((g) => g.rows).find((r) => r.def.key === "iron")!;
  assert.equal(ironRow.value, 4);
  const zincRow = groups.flatMap((g) => g.rows).find((r) => r.def.key === "zinc")!;
  assert.equal(zincRow.value, null);
});

test("pctOfDaily only reports where there is both a value and a reference", () => {
  assert.equal(Math.round(pctOfDaily("fiber", 14)!), 50);
  assert.equal(pctOfDaily("fiber", null), null);
  assert.equal(pctOfDaily("sugar", 10), null); // total sugars has no reference on purpose
  assert.equal(pctOfDaily("unobtainium", 10), null);
});

test("formatNutrient renders the unit and shows unknown as a dash", () => {
  assert.equal(formatNutrient("sodium", 480), "480 mg");
  assert.equal(formatNutrient("fiber", 12.34), "12.3 g");
  assert.equal(formatNutrient("vitamin_d", 20), "20 mcg");
  assert.equal(formatNutrient("fiber", null), "—");
  assert.equal(formatNutrient("unobtainium", 5), "—");
});

// ─── the prompt contract ────────────────────────────────────────────────────

test("the generated prompt names EVERY key the validator accepts", () => {
  // The failure this prevents: a nutrient is added to the registry, the model
  // is never told about it, and the field silently stays empty forever. Or the
  // reverse - the prompt asks for a key sanitizeNutrients() drops on the floor,
  // so the model's answer is discarded and nobody notices.
  const spec = nutrientPromptSpec();
  const missing = NUTRIENT_KEYS.filter((k) => !spec.includes(k));
  assert.deepEqual(missing, [], `keys absent from the prompt: ${missing.join(", ")}`);

  const everything = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1]));
  assert.equal(Object.keys(sanitizeNutrients(everything)).length, NUTRIENT_KEYS.length);
});

test("the prompt states the null-not-zero rule", () => {
  // This is the rule that keeps daily totals honest; losing it from the prompt
  // would quietly turn every unknown into a 0.
  const spec = nutrientPromptSpec();
  assert.match(spec, /NEVER write 0/);
  assert.match(spec, /OMIT any nutrient you do not actually know/);
});

test("the prompt carries the unit for every nutrient", () => {
  const spec = nutrientPromptSpec();
  for (const n of NUTRIENTS) {
    assert.ok(spec.includes(`${n.key} (${n.unit})`), `${n.key} missing its unit in the prompt`);
  }
});
