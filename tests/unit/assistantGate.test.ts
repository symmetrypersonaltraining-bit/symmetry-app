import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelFor, HAIKU_MODEL, SONNET_MODEL } from "../../src/lib/ai/anthropic";

/**
 * THE ✦ DRAWER IS THE SURFACE GERARD AND SHARON USE AS THE APP.
 *
 * Dustin: "I need their AI to be able to do anything they need to do in that app
 * for them so they don't have to figure it out... That AI bot for them across
 * the entire app needs to be a lot higher model."
 *
 * And, in the same breath: "I don't wanna go over that ninety five dollars a
 * month... use a better model than everybody else, but don't take it too far."
 *
 * Those two constraints meet on this route. It is the highest-VOLUME AI surface
 * in the app — thirty-five people typing whenever they like — so it cannot go
 * to Sonnet wholesale, and it is the one those two navigate by, so it cannot
 * stay on Haiku for them.
 *
 * The third thing this file guards is the one that matters most. Gerard is
 * missing roughly an inch and a half of tibia and has a surgically rebuilt
 * pelvis; Sharon has post-mastectomy shoulder limits and medication-induced
 * dizziness. Both are ZERO spinal loading, and their contraindications do not
 * overlap. Until now the cleared pool was built and enforced nowhere — and this
 * free-text box is precisely where somebody types "what else could I do
 * instead?"
 */

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(readFileSync(join(ROOT, "src/app/api/ai-assistant/route.ts"), "utf8"));
const CTX = strip(readFileSync(join(ROOT, "src/lib/ai/assistantContext.ts"), "utf8"));

test("chat is Haiku for the roster and Sonnet for the advanced tier", () => {
  assert.equal(modelFor("chat"), HAIKU_MODEL, "every client just moved to the expensive model");
  assert.equal(modelFor("chat", "standard"), HAIKU_MODEL);
  assert.equal(modelFor("chat", "advanced"), SONNET_MODEL, "the advanced tier does nothing on the surface they live in");
});

test("the other two jobs did not shift underneath this", () => {
  assert.equal(modelFor("extract"), HAIKU_MODEL);
  assert.equal(modelFor("extract", "advanced"), SONNET_MODEL);
  assert.equal(modelFor("coach"), SONNET_MODEL);
  assert.equal(modelFor("coach", "advanced"), SONNET_MODEL);
});

test("the drawer no longer hard-codes a model", () => {
  assert.ok(
    !/model:\s*"claude-/.test(ROUTE),
    "a literal model id is back in the route — the tier is bypassed and Gerard is on Haiku again",
  );
  assert.match(ROUTE, /modelFor\("chat", await aiTierFor\(/);
  // And the usage log records what actually ran, not what used to.
  assert.match(ROUTE, /"client_assistant",[\s\S]{0,160}\n\s*model,/);
});

test("a gated client's cleared list is the only thing the model is handed", () => {
  assert.match(CTX, /clearedPoolFor/);
  assert.match(CTX, /if \(pool\?\.gated\)/);
  assert.match(CTX, /pool\.workouts\.map/);
  assert.match(CTX, /pool\.exerciseNames\.join/);
  assert.match(ROUTE, /assistantContext\(supabase, scoped\.scope\.clientId\)/);
});

test("an empty pool refuses everything rather than falling back to general advice", () => {
  // The failure that would matter: the pool query dies, the gate quietly stops
  // applying, and a free-text box starts describing movements to a man with a
  // rebuilt pelvis. clearedPoolFor already fails closed; this is the other half
  // — what the prompt does with a closed-but-empty pool.
  const empty = CTX.slice(CTX.indexOf("if (!pool.workouts.length)"), CTX.indexOf("} else {"));
  assert.match(empty, /Do NOT suggest, describe, swap or invent ANY workout or movement/);
  assert.match(empty, /not even if they insist/);
  // ...and still helps with everything else. A drawer that goes dark is a
  // drawer they stop opening.
  assert.match(empty, /help with anything else they ask/);
});

test("the refusal names their real options instead of stonewalling", () => {
  assert.match(CTX, /isn't one of their options, name the ones that are/);
  assert.match(CTX, /offer to pass the request to their coach/);
  // Explicitly NOT "assess whether it looks safe" — that is the model
  // second-guessing a medical decision it does not have the facts for.
  assert.match(CTX, /do NOT judge whether it seems safe/);
});

test("context assembly can never take the drawer down", () => {
  assert.match(CTX, /catch \{\s*\n?\s*return ""/);
  // Every sub-query is individually guarded too, so one slow table cannot lose
  // the rest of the context — the inline ones as `.catch(() => null)` on the
  // Promise.all, the local helpers with their own try/catch.
  const guards = (CTX.match(/catch \{/g) || []).length + (CTX.match(/\.catch\(\(\) => null\)/g) || []).length;
  assert.ok(guards >= 6, `only ${guards} guards — one slow table can lose the whole context block`);
});

test("the drawer stays metered", () => {
  // It was authenticated but entirely uncapped until 12 Aug — no per-client cap
  // and no kill switch, on the biggest call volume in the app.
  assert.match(ROUTE, /enforceMeter\(scoped\.scope\.clientId, "client_assistant"\)/);
});
