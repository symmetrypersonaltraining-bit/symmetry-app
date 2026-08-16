import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Which model each route uses is a product decision, not an implementation
// detail, and it is the kind that gets quietly reverted by whoever copies an
// existing route as a starting point. See the header in lib/ai/anthropic.ts for
// the reasoning; this pins the outcome.
//
// The short version: Haiku pulls a fixed shape out of short text while the
// client waits. Sonnet writes anything a person reads as coaching. Thirty days
// of every AI call in the app cost $2.84 against a $95 cap, so cost is not what
// decides it — the job is.

const ROOT = process.cwd();
const API = path.join(ROOT, "src/app/api");

/** Routes whose output a client or trainer reads as coaching. */
const COACHING = [
  "nutrition-ai/coach/route.ts",   // the food-logger coach card
  // "coach/focus/route.ts" was here. Deleted 16 Aug along with CoachFocusCard —
  // the card was unmounted on 1 Aug because it restated the Focus line
  // ClientWeekSummary already showed, and the route sat uncalled for a
  // fortnight afterwards. The rule it was asserted against is unchanged and
  // still covers every surface that survives.
  "cron/weekly-ai/route.ts",       // the Sunday sweep that writes both
  "weekly-brief/route.ts",         // the pre-session brief
  "ai-nudges/route.ts",            // the Monday nudge, sent to a real person
  "celebration/route.ts",          // one sentence on their best moment of the week
];

/** Routes that extract a validated shape from short text, with someone waiting. */
const EXTRACTION = [
  "nutrition-ai/parse/route.ts",
  "nutrition-ai/verify-food/route.ts",
  "nutrition-ai/barcode-lookup/route.ts",
  "feedback/describe/route.ts",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(API, rel), "utf8");
}

test("everything a person reads as coaching runs on the coaching model", () => {
  // These used to name SONNET_MODEL directly. They now go through
  // modelFor("coach", tier), which returns Sonnet for every tier — the doctrine
  // is unchanged, the indirection exists so a per-client tier can raise a job
  // without each route having to know about tiers. What still must never happen
  // is a coaching route reaching for the fast model.
  const wrong: string[] = [];
  for (const rel of COACHING) {
    const src = read(rel);
    if (/\bHAIKU_MODEL\b/.test(src)) wrong.push(`${rel} (on the fast model)`);
    const declared = /\bSONNET_MODEL\b/.test(src) || /modelFor\(\s*"coach"/.test(src);
    if (!declared) wrong.push(`${rel} (no model at all)`);
  }
  assert.deepEqual(
    wrong,
    [],
    `these write copy a client reads and are back on the fast model:\n  ${wrong.join("\n  ")}`
  );
});

test("extraction stays on Haiku, because the client is waiting on it", () => {
  const wrong: string[] = [];
  for (const rel of EXTRACTION) {
    const src = read(rel);
    if (/\bSONNET_MODEL\b/.test(src)) wrong.push(rel);
  }
  assert.deepEqual(
    wrong,
    [],
    `these pull a validated shape out of one short message and were slowed down for no gain:\n  ${wrong.join("\n  ")}`
  );
});

test("the coach chat extracts first, then answers — in that order", () => {
  // Both calls now resolve through modelFor, because an advanced-tier client
  // gets a stronger EXTRACTOR (see lib/ai/anthropic.ts). What the order
  // protects is unchanged and is the thing that keeps this route cheap: a
  // simple "log M2" must be settled by the extraction pass and never reach the
  // reasoning call at all.
  const src = read("nutrition-ai/act/route.ts");
  const extract = src.indexOf('model: modelFor("extract"');
  const coach = src.indexOf('model: modelFor("coach"');
  assert.ok(extract > -1, "the action extractor no longer routes through modelFor('extract')");
  assert.ok(coach > -1, "the coach's answer no longer routes through modelFor('coach')");
  assert.ok(
    extract < coach,
    "the order flipped: extraction must come first so a simple 'log M2' never pays for a reasoning call"
  );
});

test("the reasoning behind the split is written down where the constants are", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/ai/anthropic.ts"), "utf8");
  const head = src.slice(0, src.indexOf("export const HAIKU_MODEL"));
  assert.match(head, /HAIKU/, "the model-choice policy has been deleted from anthropic.ts");
  assert.match(head, /SONNET/);
});
