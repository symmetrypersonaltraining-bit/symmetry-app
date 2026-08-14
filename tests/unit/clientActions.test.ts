import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_TOOLS } from "../../src/lib/ai/clientActions";

/**
 * WHAT A CLIENT'S CHAT BOX IS ALLOWED TO DO.
 *
 * Dustin: "I need their AI to be able to do anything they need to do in that
 * app for them so they don't have to figure it out."
 *
 * The risk in granting that is not the model being unhelpful. It is a free-text
 * box, reachable by thirty-five people, sitting on top of a service-role-
 * adjacent set of write paths. So the rules this file pins are the ones that
 * make the grant safe rather than the ones that make it useful.
 */

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SRC = strip(readFileSync(join(ROOT, "src/lib/ai/clientActions.ts"), "utf8"));
const ROUTE = strip(readFileSync(join(ROOT, "src/app/api/ai-assistant/route.ts"), "utf8"));
// The loop moved into a shared module on 14 Aug so the ✦ Coach — the AI clients
// can actually open — runs the SAME code. These properties did not change; the
// file they live in did, so they are asserted where they now are.
const RUNNER = strip(readFileSync(join(ROOT, "src/lib/ai/clientAssistantRun.ts"), "utf8"));

test("no client tool takes a client_id", () => {
  // The one that matters most. The id is resolved from the session and passed
  // as an argument; there is no parameter for a model to get wrong or a user to
  // talk it into changing.
  for (const t of CLIENT_TOOLS) {
    const props = Object.keys((t.input_schema as { properties?: object }).properties || {});
    assert.ok(!props.includes("client_id"), `${t.name} accepts a client_id`);
    assert.ok(!props.some((p) => /client/i.test(p)), `${t.name} has a client-ish parameter: ${props.join(", ")}`);
  }
});

test("the trainer's tools are not reachable from here", () => {
  // CLIENT_TOOLS is a separate list rather than a filtered view of the agent's,
  // so these are names this route could not utter even if something talked it
  // into trying.
  const forbidden = ["send_message", "set_macro_targets", "assign_program", "update_client", "query_table", "advance_phase", "book_session", "cancel_session"];
  const names = CLIENT_TOOLS.map((t) => t.name);
  for (const f of forbidden) assert.ok(!names.includes(f), `${f} is exposed to clients`);
  assert.equal(names.length, 5, `the client toolset grew to ${names.length}: ${names.join(", ")}`);
});

test("every write re-checks ownership at the moment of writing", () => {
  // Ids come from the model, which got them from a read that was correct then.
  // A stale id, or one echoed out of an earlier turn, has to fail at the write.
  for (const guard of [
    /row\.client_id !== clientId/,
    /\.eq\("id", swId\)\s*\n\s*\.eq\("client_id", clientId\)/,
  ]) {
    assert.match(SRC, guard);
  }
  // Both mutating tools carry it, not just one.
  assert.equal((SRC.match(/row\.client_id !== clientId/g) || []).length, 2);
});

test("a gated client's swap is checked against the pool at write time", () => {
  // Barrier two. The model was only ever shown the cleared list; this checks
  // the id anyway, immediately before the update. The cost of the two
  // disagreeing is a movement somebody's body cannot take.
  assert.match(SRC, /const pool = await clearedPoolFor\(db, clientId\);/);
  assert.match(SRC, /const allowed = await isDayInPool\(db, clientId, dayId\);/);
  assert.match(SRC, /isn't one of this client's cleared options\. Do NOT swap it in/);
});

test("an ungated client still cannot be given another client's day", () => {
  assert.match(SRC, /\.eq\("client_owner_id", clientId\)\.eq\("swappable", true\)/);
});

test("a completed workout cannot be moved or swapped", () => {
  assert.equal((SRC.match(/row\.status === "completed"/g) || []).length, 2);
});

test("a misheard weight cannot land in the metrics table", () => {
  assert.match(SRC, /WEIGHT_RANGE: \[number, number\] = \[60, 600\]/);
  assert.match(SRC, /BF_RANGE: \[number, number\] = \[3, 60\]/);
  assert.match(SRC, /doesn't look right — read it back to them/);
  // Future-dated weigh-ins are a typo, not a plan.
  assert.match(SRC, /if \(date > today\)/);
  // Upsert, not insert: "actually it was 188.6" must correct the day rather
  // than create a second row for it. metrics has a unique (client_id,
  // metric_date) index, so an insert would 23505 instead.
  assert.match(SRC, /onConflict: "client_id,metric_date"/);
});

test("nothing here deletes anything", () => {
  assert.ok(!/\.delete\(\)/.test(SRC), "a client tool can now delete rows");
});

test("tools are offered only to a resolved client, never the trainer", () => {
  // Still gated on the route: a trainer goes to /api/agent and its larger
  // toolset, and never gets CLIENT_TOOLS here.
  assert.match(ROUTE, /const canAct = !isTrainer && !!scoped\.scope\.clientId;/);
  assert.match(ROUTE, /if \(canAct\) \{/, "the route no longer gates the tool loop on canAct");
  // And the runner is only ever entered with a resolved client id, which is
  // what it hands to every tool.
  assert.match(RUNNER, /clientId: string;/, "the shared runner no longer requires a client id");
  assert.match(RUNNER, /opts\.clientId,/, "the runner stopped passing the resolved id to runClientTool");
});

test("the tool loop is bounded and bills what it actually used", () => {
  assert.match(RUNNER, /opts\.maxRounds \?\? 4/, "the tool loop lost its default bound");
  assert.match(RUNNER, /round < rounds/, "the tool loop is unbounded");
  assert.match(RUNNER, /tokensIn \+= response\.usage/, "rounds are no longer individually billed");
  assert.match(RUNNER, /tokensOut \+= response\.usage/, "rounds are no longer individually billed");
  // Every round's tokens are counted, not just the last call's — otherwise a
  // four-round conversation logs as one and the $95 cap stops meaning anything.
  assert.match(ROUTE, /logUsage\(scoped\.scope\.clientId \?\? null, "client_assistant", totalIn, totalOut, model\)/);
});
