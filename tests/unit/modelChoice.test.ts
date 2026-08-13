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
  "coach/focus/route.ts",          // the weekly focus / Coach's Read
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

test("everything a person reads as coaching runs on Sonnet", () => {
  const wrong: string[] = [];
  for (const rel of COACHING) {
    const src = read(rel);
    if (/\bHAIKU_MODEL\b/.test(src)) wrong.push(rel);
    if (!/\bSONNET_MODEL\b/.test(src)) wrong.push(`${rel} (no model at all)`);
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

test("the coach chat extracts on Haiku and answers on Sonnet, in that order", () => {
  const src = read("nutrition-ai/act/route.ts");
  const haiku = src.indexOf("model: HAIKU_MODEL");
  const sonnet = src.indexOf("model: SONNET_MODEL");
  assert.ok(haiku > -1, "the action extractor is no longer on Haiku — every message now waits on the slower model");
  assert.ok(sonnet > -1, "the coach's answer dropped back to Haiku; this is the one call where the model is the product");
  assert.ok(
    haiku < sonnet,
    "the order flipped: extraction must come first so a simple 'log M2' never pays for a reasoning call"
  );
});

test("the reasoning behind the split is written down where the constants are", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/ai/anthropic.ts"), "utf8");
  const head = src.slice(0, src.indexOf("export const HAIKU_MODEL"));
  assert.match(head, /HAIKU/, "the model-choice policy has been deleted from anthropic.ts");
  assert.match(head, /SONNET/);
});
