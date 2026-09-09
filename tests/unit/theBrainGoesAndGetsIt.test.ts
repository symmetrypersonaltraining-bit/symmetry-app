import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheUsdaFood, type UsdaOnlineFood } from "@/lib/nutrition/usdaOnline";

/**
 * THE BRAIN GOES AND GETS IT — and it still never states a number.
 *
 * Dustin, 9 Sep 2026: *"ai needs to be involved here, if it's not in the data
 * base they need a way to search in online through ai and get real numbers.
 * again this is the whole point of having a 'brain' in the app."*
 *
 * The line this file guards is the one that makes it safe. "AI goes and gets
 * it" must mean the model IDENTIFIES the food and CHOOSES between real measured
 * rows fetched from USDA. It must never mean the model recites macros — that
 * failure is undetectable, because a recited number is self-consistent by
 * construction. The `banana` row in this database reads 242 kcal, 2P, 27C, 14F,
 * and 2×4 + 27×4 + 14×9 is exactly 242.
 */

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ONLINE = SRC("src/lib/nutrition/usdaOnline.ts");
const RESOLVE = SRC("src/lib/nutrition/resolveFoodOp.ts");
// Comments AND the import block come off. Every name checked below also appears
// in an import at the top of the file, so an indexOf over the whole source finds
// the import and reports the steps in the wrong order — which is exactly what
// the first run of this file did.
const code = (s: string) => {
  const bare = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const body = bare.lastIndexOf("\nimport ");
  const afterImports = body < 0 ? 0 : bare.indexOf("\n", bare.indexOf(";", body));
  return bare.slice(afterImports);
};

const food = (over: Partial<UsdaOnlineFood> = {}): UsdaOnlineFood => ({
  fdcId: 12345, description: "Bagels, cinnamon-raisin", dataType: "SR Legacy", brand: null,
  kcal: 274, protein: 9.8, carbs: 55.2, fats: 1.7,
  fiber: 2.3, sugar: 5.1, sodium: 310, satFat: 0.3,
  servingGrams: null, servingLabel: null, ...over,
});

/** The smallest thing that behaves like the query builder this uses. */
function fakeDb(existing: Record<string, unknown> | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const api = {
    inserted,
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle() { return Promise.resolve({ data: api._pending ?? existing }); },
    insert(row: Record<string, unknown>) { inserted.push(row); api._pending = row; return api; },
    _pending: null as Record<string, unknown> | null,
  };
  return api;
}

test("a measured USDA row is written verified; a manufacturer label is not", async () => {
  // Branded is the manufacturer-submitted half of FoodData Central — the same
  // data that put a 336 kcal "Banana" with zero protein in this catalogue.
  const lab = fakeDb();
  await cacheUsdaFood(lab, food({ dataType: "SR Legacy" }));
  assert.equal(lab.inserted[0].verified, true);

  const label = fakeDb();
  await cacheUsdaFood(label, food({ dataType: "Branded", brand: "THOMAS'" }));
  assert.equal(label.inserted[0].verified, false,
    "a manufacturer label must not be stamped verified");
});

test("what it writes is per 100 g, and it says so", async () => {
  const db = fakeDb();
  await cacheUsdaFood(db, food());
  const row = db.inserted[0];
  assert.equal(row.serving_grams, 100);
  assert.equal(row.serving_desc, "100 g");
  assert.equal(row.protein, 9.8);
  assert.equal(row.fdc_id, "12345", "the FDC id travels with the row, so any number can be traced");
  assert.equal(row.source, "usda_online");
});

test("a label serving rides along as a real portion", async () => {
  const db = fakeDb();
  await cacheUsdaFood(db, food({ dataType: "Branded", servingGrams: 81, servingLabel: "1 BAGEL" }));
  // {desc, grams} — the shape every other row in this column uses. A row full
  // of `label` keys resolves to no portions at all, silently.
  assert.deepEqual(db.inserted[0].serving_options,
    [{ desc: "100 g", grams: 100 }, { desc: "1 BAGEL", grams: 81 }]);
});

test("a food already cached is read back, not fetched and written again", async () => {
  const db = fakeDb({ id: "existing", name: "Bagels, cinnamon-raisin" });
  const got = await cacheUsdaFood(db, food());
  assert.equal((got as { id: string }).id, "existing");
  assert.equal(db.inserted.length, 0, "the second client to eat it must not re-insert it");
});

test("nothing in the online module asks a model for a number", () => {
  assert.doesNotMatch(ONLINE, /callClaudeJson|anthropic|HAIKU/i,
    "this module fetches measured rows — it has no business calling a model at all");
  // And the nutrient ids are read from the response, not inferred from names.
  assert.match(ONLINE, /nutrientId/, "nutrients come from FDC's stable numeric ids");
});

test("a USDA row missing any macro is skipped, not patched with a zero", () => {
  // A partial row looks identical to a complete one once it is on a plate.
  assert.match(code(ONLINE), /if \(protein == null \|\| carbs == null \|\| fats == null\) continue;/);
});

test("the catalogue is still tried first, and the guess is still last", () => {
  const c = code(RESOLVE);
  const online = c.indexOf("searchUsdaOnline");
  const estimate = c.indexOf("ESTIMATE_SYSTEM");
  const firstSearch = c.indexOf("let rows = await search(term)");
  assert.ok(firstSearch > 0 && online > firstSearch,
    "a real catalogue row beats a network call, every time");
  assert.ok(estimate > online,
    "the model's own guess must be the LAST thing tried, after USDA has been asked");
});

test("the online candidates go through the same pick, so no macro is ever requested", () => {
  const c = code(RESOLVE);
  const step = c.slice(c.indexOf("searchUsdaOnline"), c.indexOf("ESTIMATE_SYSTEM"));
  assert.match(step, /await pick\(asRows\)/,
    "the model chooses between rows it can see — it is never asked for a figure");
  assert.match(step, /verified: f\.dataType !== "Branded"/,
    "the candidate list must tell the model which rows are measured");
  assert.match(step, /online\[asRows\.indexOf\(chosen\)\]/,
    "the cached row must be the one that was actually picked");
});

test("only the chosen row is cached", () => {
  // Caching all ten fills the catalogue with near-misses that the next search
  // then has to reject.
  const c = code(RESOLVE);
  const step = c.slice(c.indexOf("searchUsdaOnline"), c.indexOf("ESTIMATE_SYSTEM"));
  const calls = step.match(/cacheUsdaFood\(/g) ?? [];
  assert.equal(calls.length, 1);
});
