import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { auditFrom } from "../../src/lib/nutrition/repriceDraft";
import type { PricedItem } from "../../src/lib/nutrition/resolveFoodOp";

/**
 * Dustin, 13 Sep 2026, before a round of testing: *"I had a session build a log
 * to be able to go back and see exactly what happens, was that built everywhere
 * or just the area I was dealing with? … when I go to test anything I want you
 * to have a log to refer to to see exactly what happens."*
 *
 * It was built for parse, act and photo — the paths that log ONE meal — and not
 * for plan_build, recipe_ai or meal_edit. plan_build writes the numbers every
 * one of those is then measured against, and it was the screen he was about to
 * test. meal_edit was worse than missing: it IMPORTED the logger and never
 * called it, so it read as wired.
 *
 * This is the guard. It walks the API directory rather than naming the six
 * routes, so a seventh pricing surface added next month is covered without
 * anyone remembering this file exists.
 */

const API = join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

/** A route that turns food into macros. The pricing pipeline is the tell. */
const PRICES_FOOD = /(priceNamedFoods|resolveFood|repricePlanDraft|repriceIngredients|priceCoachSuggestions|photoItemsFor)\b/;

test("every route that prices food writes to the audit log", () => {
  const missing: string[] = [];
  for (const file of routeFiles(API)) {
    const src = readFileSync(file, "utf8");
    if (!PRICES_FOOD.test(src)) continue;
    // Importing it is not calling it — that is exactly how meal_edit passed.
    if (!/\blogNutritionAi\(/.test(src)) missing.push(file.replace(process.cwd() + "/", ""));
  }
  assert.deepEqual(missing, [], `these price food and leave no receipt:\n  ${missing.join("\n  ")}`);
});

test("all six known surfaces are wired, by name", () => {
  const wired = (p: string) => /\blogNutritionAi\(/.test(readFileSync(join(process.cwd(), p), "utf8"));
  for (const p of [
    "src/app/api/nutrition-ai/parse/route.ts",
    "src/app/api/nutrition-ai/act/route.ts",
    "src/app/api/nutrition-ai/meal-edit/route.ts",
    "src/app/api/nutrition-ai/plan-build/route.ts",
    "src/app/api/recipes/ai/route.ts",
    "src/app/api/analyze-meal-photo/route.ts",
  ]) {
    assert.ok(wired(p), `${p} does not call the logger`);
  }
});

test("a receipt carries the name asked for AND the row that answered", () => {
  // The half meal_adherence_logs never kept. Without `requested` there is no
  // way to see that the parser asked for "bacon" separately from the burger
  // that already contained it — the 12 Sep double-count.
  const priced: PricedItem[] = [{
    requested: "bacon cheeseburger",
    name: "Texas Roadhouse Bacon Cheeseburger",
    amount: 1, unit: "burger",
    p: 48, c: 44, f: 52, kcal: 836,
    micros: null,
    food_id: null,
    verified: false,
    estimated: false,
    source_url: "https://example.com/nutrition",
  }];
  const [row] = auditFrom(priced);
  assert.equal(row.requested, "bacon cheeseburger");
  assert.equal(row.name, "Texas Roadhouse Bacon Cheeseburger");
  assert.equal(row.source_url, "https://example.com/nutrition", "the page it was read from");
  assert.equal(row.estimated, false);
  assert.equal(row.kcal, 836);
});

test("a catalogue row records its food_id, and a guess records that it guessed", () => {
  const [fromRow, fromGuess] = auditFrom([
    { requested: "banana", name: "Bananas, raw", amount: 100, unit: "g", p: 1.1, c: 23, f: 0.3, kcal: 99,
      micros: null, food_id: "abc-123", verified: true, estimated: false },
    { requested: "grandma's casserole", name: "Casserole, estimated", amount: 1, unit: "serving",
      p: 20, c: 30, f: 15, kcal: 335, micros: null, food_id: null, verified: false, estimated: true },
  ] as PricedItem[]);
  assert.equal(fromRow.food_id, "abc-123");
  assert.equal(fromRow.verified, true);
  assert.equal(fromGuess.food_id, null);
  assert.equal(fromGuess.estimated, true, "any_estimated is computed from this");
});

test("the plan log records what the FITTER did, not only what the model said", () => {
  // A plan that came back on target and one that was dragged there look
  // identical in the totals. The difference is the whole question when he asks
  // why a plan looked wrong.
  const route = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/plan-build/route.ts"), "utf8");
  assert.match(route, /surface: "plan_build"/);
  assert.match(route, /dropped \$\{fitted\.dropped\.length\}/, "how many foods were removed");
  assert.match(route, /scaled x\$\{fitted\.factor\.toFixed\(2\)\}/, "and what the rest was scaled by");
  assert.match(route, /STILL OFF after fitting/, "and when it could not be brought on target at all");
  assert.match(route, /unresolved: removed/, "unpriced AND dropped foods, together");
});

test("the recipe log is written BEFORE the failure response, not after it", () => {
  // "Nothing could be priced" is the most useful row this table holds. Logging
  // only the happy path hides exactly the cases the log exists for.
  const route = readFileSync(join(process.cwd(), "src/app/api/recipes/ai/route.ts"), "utf8");
  const logAt = route.indexOf('surface: "recipe_ai"');
  const failAt = route.indexOf("Couldn't price ${unpriced");
  assert.ok(logAt > 0 && failAt > logAt, "the 422 must not skip the receipt");
});

test("a failed receipt is reported, not silently swallowed", () => {
  // On 13 Sep the table was found EMPTY — zero rows on every surface, a day
  // after the log shipped, with a schema that accepted a manual insert fine.
  // "Nothing has run" and "every write has failed" looked identical, which is
  // the one thing an audit trail must never do.
  //
  // supabase-js RESOLVES with { error } rather than throwing, so the original
  // `await insert(...)` in a bare try/catch could not have noticed a rejected
  // write at all — the same shape as the sync card that showed a green tick
  // for a run it never recorded.
  const src = readFileSync(join(process.cwd(), "src/lib/ai/nutritionAudit.ts"), "utf8");
  assert.match(src, /const \{ error \} = await createAdminClient\(\)/, "the result is read");
  assert.match(src, /if \(error\) throw new Error\(error\.message\)/, "and a rejected write is a failure");
  assert.match(src, /console\.error\("\[ai-audit\] receipt not written"/, "reported to the server log");
  assert.match(src, /from\("app_error_log"\)\.insert/, "and to the table he can query");
  assert.match(src, /scope: "ai-audit"/, "under a scope that can be filtered");
});

test("reporting the failure can itself fail without escaping", () => {
  // Two levels and no more. A reporter that throws must not become the thing
  // that fails a client's dinner.
  const src = readFileSync(join(process.cwd(), "src/lib/ai/nutritionAudit.ts"), "utf8");
  const outer = src.indexOf("} catch (e) {");
  const inner = src.indexOf("} catch {", outer);
  assert.ok(inner > outer, "the app_error_log write is itself wrapped");
});
