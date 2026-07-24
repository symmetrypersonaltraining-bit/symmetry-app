#!/usr/bin/env node
// Unit tests for the nutrition-AI pure logic (no network, no Supabase, no API key):
//   src/lib/ai/meter-core.ts     — caps, pricing, kill switch, America/Chicago day math
//   src/lib/ai/nutrition-json.ts — strict-JSON extraction + response validation
//
// Usage: node scripts/test-nutrition-ai.cjs
// Compiles the two pure modules with tsc into a temp dir, then asserts.

const { execSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");

const repo = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nutrition-ai-tests-"));

execSync(
  [
    "npx tsc",
    "src/lib/ai/meter-core.ts",
    "src/lib/ai/nutrition-json.ts",
    `--outDir ${outDir}`,
    "--module commonjs --target es2020 --skipLibCheck --types node",
  ].join(" "),
  { cwd: repo, stdio: "inherit" }
);

const core = require(path.join(outDir, "meter-core.js"));
const nj = require(path.join(outDir, "nutrition-json.js"));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
}

console.log("\nmeter-core: pricing");
test("Haiku cost: $1/$5 per MTok", () => {
  // 2000 in + 1000 out = 0.002*1 + 0.001*5 = 0.007
  assert.strictEqual(core.computeCostUsd("claude-haiku-4-5", 2000, 1000), 0.007);
});
test("dated Haiku id prices the same", () => {
  assert.strictEqual(core.computeCostUsd("claude-haiku-4-5-20251001", 2000, 1000), 0.007);
});
test("Sonnet cost: $3/$15 per MTok", () => {
  // 1M in + 1M out = 3 + 15 = 18
  assert.strictEqual(core.computeCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000), 18);
});
test("unknown model priced as Sonnet (never under-counts)", () => {
  assert.strictEqual(core.computeCostUsd("mystery-model", 1_000_000, 0), 3);
});
test("negative token counts clamp to zero", () => {
  assert.strictEqual(core.computeCostUsd("claude-haiku-4-5", -5, -5), 0);
});

console.log("\nmeter-core: daily limits");
test("defaults are 15/15/20/1 (+20 verify)", () => {
  assert.strictEqual(core.resolveDailyLimit(null, "chat"), 15);
  assert.strictEqual(core.resolveDailyLimit(undefined, "parse"), 15);
  assert.strictEqual(core.resolveDailyLimit({}, "photo"), 20);
  assert.strictEqual(core.resolveDailyLimit({}, "plan_build"), 1);
  assert.strictEqual(core.resolveDailyLimit({}, "verify"), 20);
});
test("client_app_settings columns override defaults", () => {
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_chat_limit: 3 }, "chat"), 3);
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_plan_build_limit: 0 }, "plan_build"), 0);
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_photo_limit: "25" }, "photo"), 25);
});
test("garbage settings values fall back to defaults", () => {
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_chat_limit: "lots" }, "chat"), 15);
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_chat_limit: -2 }, "chat"), 15);
  assert.strictEqual(core.resolveDailyLimit({ ai_daily_chat_limit: null }, "chat"), 15);
});
test("assertUnderCap: under → ok, at/over → CapExceeded with details", () => {
  core.assertUnderCap("chat", 14, 15); // no throw
  assert.throws(() => core.assertUnderCap("chat", 15, 15), (e) => e instanceof core.CapExceeded && e.code === "CAP_EXCEEDED" && e.limit === 15 && e.used === 15);
  assert.throws(() => core.assertUnderCap("plan_build", 1, 1), core.CapExceeded);
});

console.log("\nmeter-core: kill switch");
test("trips at exactly $95 and above, not below", () => {
  assert.strictEqual(core.killSwitchTripped(94.99), false);
  assert.strictEqual(core.killSwitchTripped(95), true);
  assert.strictEqual(core.killSwitchTripped(120.5), true);
});
test("AiPaused carries the month-to-date figure", () => {
  const e = new core.AiPaused(97.25);
  assert.strictEqual(e.code, "AI_PAUSED");
  assert.strictEqual(e.monthToDateUsd, 97.25);
});

console.log("\nmeter-core: America/Chicago day math");
test("UTC evening is still the same Chicago day (CDT, UTC-5)", () => {
  // 2026-07-24 03:30Z = 2026-07-23 22:30 in Chicago
  assert.strictEqual(core.chicagoDateOf(new Date("2026-07-24T03:30:00Z")), "2026-07-23");
  assert.strictEqual(core.chicagoDateOf(new Date("2026-07-24T05:01:00Z")), "2026-07-24");
});
test("day start (summer / CDT): midnight Chicago = 05:00Z", () => {
  const start = core.chicagoDayStartUtc(new Date("2026-07-24T12:00:00Z"));
  assert.strictEqual(start.toISOString(), "2026-07-24T05:00:00.000Z");
});
test("day start (winter / CST): midnight Chicago = 06:00Z", () => {
  const start = core.chicagoDayStartUtc(new Date("2026-01-15T12:00:00Z"));
  assert.strictEqual(start.toISOString(), "2026-01-15T06:00:00.000Z");
});
test("a 04:59Z row belongs to yesterday's Chicago day (the caps reset at 05:00Z in summer)", () => {
  const dayStart = core.chicagoDayStartUtc(new Date("2026-07-24T12:00:00Z")).getTime();
  assert.ok(new Date("2026-07-24T04:59:00Z").getTime() < dayStart);
  assert.ok(new Date("2026-07-24T05:00:00Z").getTime() >= dayStart);
});
test("month start uses the Chicago month (July 1 midnight Chicago)", () => {
  const ms = core.chicagoMonthStartUtc(new Date("2026-07-01T04:00:00Z")); // still Jun 30 in Chicago
  assert.strictEqual(ms.toISOString(), "2026-06-01T05:00:00.000Z");
  const ms2 = core.chicagoMonthStartUtc(new Date("2026-07-15T12:00:00Z"));
  assert.strictEqual(ms2.toISOString(), "2026-07-01T05:00:00.000Z");
});

console.log("\nnutrition-json: extractJson");
test("plain JSON parses", () => {
  assert.deepStrictEqual(nj.extractJson('{"a":1}'), { a: 1 });
});
test("markdown-fenced JSON parses", () => {
  assert.deepStrictEqual(nj.extractJson('```json\n{"a":1}\n```'), { a: 1 });
});
test("JSON with surrounding prose parses", () => {
  assert.deepStrictEqual(nj.extractJson('Here you go: {"a":1} hope that helps!'), { a: 1 });
});
test("garbage returns null", () => {
  assert.strictEqual(nj.extractJson("sorry, I cannot do that"), null);
  assert.strictEqual(nj.extractJson(""), null);
});

console.log("\nnutrition-json: parse-response validation");
const goodParse = {
  items: [
    { name: "chicken breast", amount: 8, unit: "oz", kcal: 374, p: 70.3, c: 0, f: 8.2 },
    { name: "jasmine rice", amount: 1, unit: "cup", kcal: 205, p: 4.2, c: 44.5, f: 0.4 },
    { name: "olive oil", amount: 1, unit: "tbsp", kcal: 119, p: 0, c: 0, f: 13.5 },
  ],
  totals: { kcal: 999, p: 1, c: 1, f: 1 }, // deliberately wrong — must be recomputed
};
test("valid reply normalizes and RECOMPUTES totals from items", () => {
  const r = nj.validateParseResult(goodParse);
  assert.ok(r);
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.totals.kcal, 374 + 205 + 119);
  assert.strictEqual(r.totals.p, 74.5);
  assert.strictEqual(r.totals.f, 22.1);
});
test("missing kcal is derived from macros (4/4/9)", () => {
  const r = nj.validateParseResult({ items: [{ name: "egg", amount: 1, unit: "large", p: 6, c: 0.5, f: 5 }] });
  assert.ok(r);
  assert.strictEqual(r.items[0].kcal, Math.round(6 * 4 + 0.5 * 4 + 5 * 9));
});
test("alt macro key names (protein/carbs/fat) are accepted", () => {
  const r = nj.validateParseResult({ items: [{ name: "yogurt", protein: 15, carbs: 7, fat: 0, calories: 90 }] });
  assert.ok(r);
  assert.strictEqual(r.items[0].p, 15);
  assert.strictEqual(r.items[0].kcal, 90);
});
test("rejects: empty items, missing name, non-object, null", () => {
  assert.strictEqual(nj.validateParseResult({ items: [] }), null);
  assert.strictEqual(nj.validateParseResult({ items: [{ amount: 1, p: 1, c: 1, f: 1 }] }), null);
  assert.strictEqual(nj.validateParseResult("nope"), null);
  assert.strictEqual(nj.validateParseResult(null), null);
});
test("non-numeric amounts become null; units trimmed", () => {
  const r = nj.validateParseResult({ items: [{ name: "salad", amount: "a bowl", unit: "  ", p: 2, c: 8, f: 4 }] });
  assert.ok(r);
  assert.strictEqual(r.items[0].amount, null);
  assert.strictEqual(r.items[0].unit, null);
});

console.log("\nnutrition-json: coach + plan + verify validation");
test("coach reply: message required, suggestions normalized", () => {
  const r = nj.validateCoachReply({ message: "Protein has averaged 40g under target.", suggestions: [{ label: "Add a shake", delta: { p: 25, c: 2, f: 1, kcal: 117 } }, { bogus: true }] });
  assert.ok(r);
  assert.strictEqual(r.suggestions.length, 1);
  assert.deepStrictEqual(r.suggestions[0].delta, { p: 25, c: 2, f: 1, kcal: 117 });
  assert.strictEqual(nj.validateCoachReply({ suggestions: [] }), null);
  assert.strictEqual(nj.validateCoachReply({ message: "   " }), null);
});
test("plan draft: subtotals/totals recomputed; bad shapes rejected", () => {
  const draft = {
    targets: { kcal: 2470, p: 300, c: 229, f: 50 },
    reasoning: null,
    meals: Array.from({ length: 5 }, (_, i) => ({
      name: `Meal ${i + 1}`,
      timing: "7:00 AM",
      items: [{ food: "chicken", amount: 150, unit: "g", p: 46, c: 0, f: 5, kcal: 229 }, { food: "rice", amount: 180, unit: "g", p: 4, c: 45, f: 0, kcal: 205 }],
    })),
    totals: { kcal: 0, p: 0, c: 0, f: 0 },
  };
  const r = nj.validatePlanDraft(draft);
  assert.ok(r);
  assert.strictEqual(r.meals.length, 5);
  assert.strictEqual(r.meals[0].subtotal.kcal, 229 + 205);
  assert.strictEqual(r.totals.kcal, (229 + 205) * 5);
  assert.strictEqual(nj.validatePlanDraft({ targets: { kcal: 2000, p: 1, c: 1, f: 1 }, meals: [] }), null);
  assert.strictEqual(nj.validatePlanDraft({ meals: [{ name: "M1", items: [{ food: "x", p: 1, c: 1, f: 1 }] }] }), null); // no targets
});
test("verify result: corrected macros normalized, kcal derived when absent", () => {
  const r = nj.validateVerifyResult({ plausible: false, confidence: "high", corrected: { protein: 25, carbs: 9, fats: 2 }, notes: "Label says 25g protein." });
  assert.ok(r);
  assert.strictEqual(r.corrected.kcal, Math.round(25 * 4 + 9 * 4 + 2 * 9));
  assert.strictEqual(r.confidence, "high");
  const low = nj.validateVerifyResult({ plausible: true, confidence: "very sure", corrected: { protein: 1, carbs: 1, fats: 1 } });
  assert.strictEqual(low.confidence, "low"); // unknown confidence downgraded, never trusted
  assert.strictEqual(nj.validateVerifyResult({ plausible: true }), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
