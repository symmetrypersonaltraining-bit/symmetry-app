// Guard: the gate every AI route goes through never waits forever on auth,
// and never fails OPEN.
//
// `resolveAiScope` is the single authorisation gate for every AI feature in the
// app — the coach, food parsing, photo analysis, the workout builder, recipes,
// the trainer agent. Until 15 Aug 2026 it awaited `supabase.auth.getUser()`
// with no time limit.
//
// During that morning's Supabase auth outage this was measured live: a call to
// /api/nutrition-ai/coach was still waiting at 28 seconds and never answered,
// while the app's own pages were serving in 150ms — because the page path had
// already been converted to local token verification and this had not. Every
// AI feature in the product was down and nothing said so.
//
// TWO PROPERTIES, and they pull in opposite directions:
//
//   1. Do not hang. Resolve auth through getServerUser, which verifies locally
//      when it can and caps the fallback.
//   2. FAIL CLOSED. Unlike the middleware — which passes a non-answer through
//      because the page behind it re-checks — an API route has nothing
//      downstream to defer to. "I could not establish who you are" must return
//      401, not proceed.
//
// MUTATION-TESTED: reverting to a bare getUser fails; deleting the 401 fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/lib/ai/scope.ts"), "utf8");
// Comments name these calls when explaining them, and a source-order test that
// matches prose measures nothing. Strip them first.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("resolveAiScope does not await auth without a cap", () => {
  assert.ok(
    !/await supabase\.auth\.getUser\(\)/.test(CODE),
    "resolveAiScope is back to an uncapped auth call — one slow dependency takes every AI feature down"
  );
});

test("resolveAiScope resolves auth through getServerUser", () => {
  assert.match(
    CODE,
    /await getServerUser\(supabase\)/,
    "the gate no longer goes through getServerUser, so it gets neither local verification nor the cap"
  );
});

test("resolveAiScope FAILS CLOSED when it cannot establish who you are", () => {
  // The whole point of the distinction from the middleware. If this ever
  // becomes a pass-through, an auth outage turns into every caller being
  // treated as authorised.
  const gate = CODE.slice(CODE.indexOf("getServerUser(supabase)"));
  const decision = gate.slice(0, gate.indexOf("isTrainer"));
  assert.match(decision, /if \(!user\)/, "the no-user check is gone");
  assert.match(decision, /status:\s*401/, "a missing user no longer returns 401");
});

test("the authorisation rules after the gate are untouched", () => {
  // Changing HOW we learn who someone is must not change WHAT they may do.
  // A client acting as another client is still 403.
  assert.match(CODE, /!isTrainer && requestedClientId !== ownClientId/);
  assert.match(CODE, /status:\s*403/);
});
