import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Two routes let a CLIENT's message reach the action tools: /api/ai-assistant
// (the ✦ drawer) and /api/nutrition-ai/act (the Coach). They run the same loop
// over the same seven tools — my_schedule, move_my_workout, swap_my_workout,
// add_my_workout, log_my_weight and the rest.
//
// Both ran that pass on Haiku for everybody except Gerard and Sharon, who are
// on the advanced tier. Dustin, 5 Sep: "go."
//
// The reasoning is the one that already moved EXTRACTION to Sonnet for those
// two, and it turns out to apply to the whole roster. A weak coaching paragraph
// is a paragraph the client can push back on in their next message. A wrong
// TOOL CALL is the app doing something to their week — a session moved to the
// wrong day, the wrong workout swapped in — and nobody re-reads their own
// schedule to check the app got it right. Silent, and durable.
//
// This does NOT put chat on Sonnet: chat is thirty-five people typing whenever
// they like, metered by volume, and it stays where it was. Only the turns
// holding a tool move.

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("modelFor('tools') is Sonnet regardless of tier", () => {
  const src = read("src/lib/ai/anthropic.ts");
  assert.ok(
    /if \(kind === "tools"\) return SONNET_MODEL;/.test(src),
    "the tools job no longer pins Sonnet — a tier lookup can now decide whether a workout is moved correctly",
  );
});

test("the Coach's tool pass asks for the tools model, not the chat model", () => {
  const src = read("src/app/api/nutrition-ai/act/route.ts");
  assert.ok(
    /const toolModel = modelFor\("tools", tier\);/.test(src),
    "the Coach's tool pass is back on the chat model — this is the pass that can move a session",
  );
});

test("the ✦ drawer uses the tools model exactly when the tools are granted", () => {
  const src = read("src/app/api/ai-assistant/route.ts");
  // Both halves matter. Using it always would put plain chat on Sonnet for the
  // whole roster; using it never re-opens the split this closed.
  assert.ok(
    /modelFor\("tools"/.test(src),
    "the drawer never reaches for the tools model, so the same request answers differently depending on which door the client came through",
  );
  assert.ok(
    /canAct\s*\n?\s*\?\s*modelFor\("tools"/.test(src),
    "the drawer's model is no longer conditional on canAct — either plain chat got expensive or the tools got cheap",
  );
});
