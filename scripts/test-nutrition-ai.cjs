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

console.log("\nnutrition-json: /act validation (validateActReply)");
test("valid swap_meal: items normalized, kcal derived, name defaulted from new_name", () => {
  const r = nj.validateActReply({
    intent: "swap_meal",
    params: { position: 4, new_name: "Salmon + rice", items: [
      { name: "salmon", amount: 6, unit: "oz", p: 34, c: 0, f: 11 },
      { name: "jasmine rice", amount: 1, unit: "cup", p: 4, c: 45, f: 0, kcal: 205 },
    ] },
    confirmation: "Swap M3 → Salmon + rice (est 520 kcal · 38P/45C/11F)?",
    reply: "Good call — salmon is an easy protein swap.",
  });
  assert.ok(r);
  assert.strictEqual(r.intent, "swap_meal");
  assert.strictEqual(r.params.meal.position, 4);
  assert.strictEqual(r.params.name, "Salmon + rice");
  assert.strictEqual(r.params.items[0].kcal, Math.round(34 * 4 + 0 * 4 + 11 * 9)); // derived
  assert.strictEqual(r.params.items[1].kcal, 205);
  assert.ok(r.confirmation && r.reply);
});
test("valid move_meal by names only (positions null, refs kept for fuzzy resolution)", () => {
  const r = nj.validateActReply({
    intent: "move_meal",
    params: { from_name: "snack", to_name: "dinner" },
    confirmation: "Move Snack after Dinner?",
    reply: "Sure.",
  });
  assert.ok(r);
  assert.deepStrictEqual(r.params.from, { position: null, name: "snack" });
  assert.deepStrictEqual(r.params.to, { position: null, name: "dinner" });
});
test("log_meal: adherence defaults to Full; 'half' normalizes to 1/2", () => {
  const base = { intent: "log_meal", confirmation: "Log M2 as eaten?", reply: "Logging it." };
  assert.strictEqual(nj.validateActReply({ ...base, params: { position: 2 } }).params.adherence, "Full");
  assert.strictEqual(nj.validateActReply({ ...base, params: { position: 2, adherence: "half" } }).params.adherence, "1/2");
  assert.strictEqual(nj.validateActReply({ ...base, params: { position: 2, adherence: "nonsense" } }).params.adherence, "Full");
});
test("add_snack: items required + normalized, name defaults to item join", () => {
  const r = nj.validateActReply({
    intent: "add_snack",
    params: { items: [{ name: "oreo", p: 0.5, c: 8.3, f: 2.3 }] },
    confirmation: "Add 1 Oreo (est 55 kcal) as an extra?",
    reply: "No stress — one cookie logged honestly beats a perfect fake day.",
  });
  assert.ok(r);
  assert.strictEqual(r.params.name, "oreo");
  assert.strictEqual(r.params.items[0].kcal, Math.round(0.5 * 4 + 8.3 * 4 + 2.3 * 9));
});
test("intent none passes through with clarify flag; confirmation forced null", () => {
  const r = nj.validateActReply({ intent: "none", params: { clarify: true }, confirmation: "ignored", reply: "Which meal do you mean?" });
  assert.ok(r);
  assert.strictEqual(r.intent, "none");
  assert.strictEqual(r.params.clarify, true);
  assert.strictEqual(r.confirmation, null);
});
test("malformed replies return null (→ callClaudeJson retries once)", () => {
  assert.strictEqual(nj.validateActReply(null), null);
  assert.strictEqual(nj.validateActReply("swap it"), null);
  assert.strictEqual(nj.validateActReply({ intent: "eat_meal", params: {}, confirmation: "x", reply: "y" }), null); // unknown intent
  assert.strictEqual(nj.validateActReply({ intent: "swap_meal", params: { position: 4 }, confirmation: "x", reply: "y" }), null); // no items
  assert.strictEqual(nj.validateActReply({ intent: "swap_meal", params: { position: 4, items: [{ amount: 1 }] }, confirmation: "x", reply: "y" }), null); // item w/o name
  assert.strictEqual(nj.validateActReply({ intent: "delete_meal", params: { position: 4 }, reply: "y" }), null); // action without confirmation
  assert.strictEqual(nj.validateActReply({ intent: "delete_meal", params: {}, confirmation: "x", reply: "y" }), null); // no meal reference
  assert.strictEqual(nj.validateActReply({ intent: "move_meal", params: { from_position: 1 }, confirmation: "x", reply: "y" }), null); // move without a target
  assert.strictEqual(nj.validateActReply({ intent: "none", params: {} }), null); // none without reply
});

console.log("\nnutrition-json: /act meal resolution (finalizeAct / resolveMealRef)");
const actDay = [
  { position: 1, label: "M1", name: "Oats & eggs", logged: true },
  { position: 3, label: "M2", name: "Chicken & rice", logged: false },
  { position: 4, label: "M3", name: "Greek yogurt bowl", logged: false },
  { position: 5, label: "M4", name: "Chicken salad", logged: false },
];
const mkAct = (intent, params) => ({ intent, params, confirmation: "Do it?", reply: "ok" });
test("exact position resolves as-is", () => {
  const r = nj.finalizeAct(mkAct("delete_meal", { meal: { position: 4, name: null } }), actDay);
  assert.strictEqual(r.intent, "delete_meal");
  assert.strictEqual(r.params.meal.position, 4);
});
test("unique fuzzy name resolves ('greek yogurt' → position 4)", () => {
  assert.strictEqual(nj.resolveMealRef({ position: null, name: "greek yogurt" }, actDay).position, 4);
  const r = nj.finalizeAct(mkAct("log_meal", { meal: { position: null, name: "greek yogurt" }, adherence: "Full" }), actDay);
  assert.strictEqual(r.intent, "log_meal");
  assert.strictEqual(r.params.meal.position, 4);
});
test("label refs resolve by display order ('M2' / 'meal 2' → 2nd meal, position 3)", () => {
  assert.strictEqual(nj.resolveMealRef({ position: null, name: "M2" }, actDay).position, 3);
  assert.strictEqual(nj.resolveMealRef({ position: null, name: "meal 2" }, actDay).position, 3);
});
test("ambiguous name ('chicken' matches two) → intent none + clarify listing both", () => {
  const res = nj.resolveMealRef({ position: null, name: "chicken" }, actDay);
  assert.strictEqual(res.position, null);
  assert.strictEqual(res.ambiguous.length, 2);
  const r = nj.finalizeAct(mkAct("unlog_meal", { meal: { position: null, name: "chicken" } }), actDay);
  assert.strictEqual(r.intent, "none");
  assert.strictEqual(r.params.clarify, true);
  assert.ok(r.reply.includes("Chicken & rice") && r.reply.includes("Chicken salad"));
  assert.strictEqual(r.confirmation, null); // nothing confirmable — never guesses
});
test("unknown position with no name → clarify with today's meal list", () => {
  const r = nj.finalizeAct(mkAct("delete_meal", { meal: { position: 9, name: null } }), actDay);
  assert.strictEqual(r.intent, "none");
  assert.strictEqual(r.params.clarify, true);
  assert.ok(r.reply.includes("M1 Oats & eggs"));
});
test("copy_meal: missing 'to' stays null (end of day); resolvable 'to' resolves", () => {
  const r = nj.finalizeAct(mkAct("copy_meal", { from: { position: 1, name: null }, to: null }), actDay);
  assert.strictEqual(r.intent, "copy_meal");
  assert.strictEqual(r.params.to, null);
  const r2 = nj.finalizeAct(mkAct("copy_meal", { from: { position: 1, name: null }, to: { position: null, name: "chicken salad" } }), actDay);
  assert.strictEqual(r2.params.to.position, 5);
});
test("move_meal onto itself → clarify instead of a no-op write", () => {
  const r = nj.finalizeAct(mkAct("move_meal", { from: { position: 3, name: null }, to: { position: null, name: "chicken & rice" } }), actDay);
  assert.strictEqual(r.intent, "none");
  assert.strictEqual(r.params.clarify, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
