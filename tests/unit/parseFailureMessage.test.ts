// What the app TELLS you when AI does not answer.
//
// This matters more than it looks. On 8 Aug ANTHROPIC_API_KEY went missing from
// Vercel and every AI feature in the app stopped. The server said exactly that:
//
//   503 { error: "AI is not configured yet. Ask Dustin to add ANTHROPIC_API_KEY to Vercel." }
//
// The client discarded that message and rendered "AI estimating isn't reachable
// right now" — indistinguishable from a flaky connection. Dustin spent two and
// a half days believing the food parser was broken, and clients could not log
// meals with AI the whole time.
//
// A wrong diagnosis costs more than a crash. These tests keep the four failure
// modes distinguishable, because each one needs a DIFFERENT action:
//   cap        → wait until midnight
//   paused     → the kill switch is on
//   config     → someone has to fix the server; retrying will never work
//   unavailable→ genuinely try again

import test from "node:test";
import assert from "node:assert/strict";
import { parseFailureMessage } from "../../src/lib/nutrition/parseClient.ts";

test("a daily cap tells you it resets, and that manual entry still works", () => {
  const m = parseFailureMessage("cap");
  assert.match(m, /midnight/i);
  assert.match(m, /by hand/i);
});

test("a paused kill switch says paused, not broken", () => {
  assert.match(parseFailureMessage("paused"), /paused/i);
});

test("a configuration failure does NOT read like a network blip", () => {
  // The exact confusion that cost two days: "isn't reachable" invites a retry.
  // A 503 will never come good on a retry — it needs someone to fix the server.
  const m = parseFailureMessage("config");
  assert.doesNotMatch(m, /isn't reachable/i);
  assert.ok(m.trim().length > 0);
});

test("a genuine outage still says try again later, and offers manual entry", () => {
  const m = parseFailureMessage("unavailable");
  assert.match(m, /by hand/i);
});

test("the four failure modes do not share a message", () => {
  // If two of these ever collapse to the same words, the person reading it
  // cannot tell which action to take — which is the whole bug.
  const msgs = (["cap", "paused", "config", "unavailable"] as const).map(parseFailureMessage);
  assert.equal(new Set(msgs).size, msgs.length, "each failure mode needs its own message");
});

test("an unknown/absent reason falls back to something actionable", () => {
  const m = parseFailureMessage(null);
  assert.ok(m.trim().length > 0);
  assert.match(m, /by hand|plainly/i);
});
