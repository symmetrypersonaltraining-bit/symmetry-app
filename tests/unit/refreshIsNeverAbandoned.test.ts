// Guard: a token refresh is never abandoned part-way, because abandoning one
// destroys the session it was trying to renew.
//
// ── THE BUG THIS EXISTS FOR, WHICH I WROTE MYSELF ───────────────────────────
//
// `withAuthTimeout` races a call against a timer and returns when the timer
// wins. It cannot cancel the underlying request — the abandoned call keeps
// going.
//
// Harmless when the call is only ASKING who somebody is. Destructive when it is
// REFRESHING, because Supabase rotates the refresh token: the old one is spent
// the instant the new pair is issued, and the new pair arrives through the
// setAll callback onto a response that has already been returned. Old token
// spent, new token lost, session dead.
//
// That is precisely the fault `redirectKeepingSession` was written to fix in
// August, reintroduced from underneath by a 4-second cap added on 15 Aug to fix
// the middleware hanging. And it was not theoretical for even one night: during
// that morning's outage auth was taking 10–65s against a 4s cap, so every
// refresh attempted in those hours was abandoned mid-flight. Dustin's own
// session died of it at 06:35Z — token expired, refresh burned, next navigation
// went to /login.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// Cap hard only where there is nothing to lose (no session cookie — nothing to
// rotate). Where a refresh may be in flight, wait LONGER THAN SUPABASE ITSELF
// DOES: their deadline is ~10s (observed `context deadline exceeded` at
// 10.0–10.3s), so at 15s either the refresh landed or Supabase already gave up
// and there is no rotation to lose. Still bounded — an unbounded await is what
// produced the 504s in the first place.
//
// MUTATION-TESTED: dropping the token-dependent cap fails these.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withAuthTimeout, AUTH_TIMEOUT_MS } from "../../src/lib/authTimeout";
import { REFRESH_TIMEOUT_MS } from "../../src/lib/auth/getUserFast";

const SRC = readFileSync(join(process.cwd(), "src/lib/auth/getUserFast.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a request carrying a session cookie waits longer than Supabase's own deadline", () => {
  // The whole point. Supabase gives up around 10s; anything shorter can return
  // while a rotation is still in flight, and that rotation's new tokens are
  // then written to a response nobody is holding.
  assert.ok(
    REFRESH_TIMEOUT_MS > 10_000,
    `refresh cap is ${REFRESH_TIMEOUT_MS}ms — at or under Supabase's ~10s deadline a refresh can be abandoned mid-rotation`
  );
});

test("the refresh cap is still bounded, well under Vercel's middleware limit", () => {
  // An unbounded await is what served MIDDLEWARE_INVOCATION_TIMEOUT to every
  // client. The fix for one failure must not restore the other.
  assert.ok(
    REFRESH_TIMEOUT_MS < 25_000,
    `refresh cap is ${REFRESH_TIMEOUT_MS}ms — Vercel kills middleware at 25s, so this must leave room for the rest of the request`
  );
});

test("the short cap still applies when there is no session to lose", () => {
  // A request with no token cannot be refreshing anything, so cutting it short
  // costs nothing — and that is the common case for a signed-out visitor.
  assert.ok(AUTH_TIMEOUT_MS < REFRESH_TIMEOUT_MS, "the two caps have collapsed into one");
  assert.match(
    CODE,
    /token \? REFRESH_TIMEOUT_MS : undefined/,
    "the cap no longer depends on whether a session cookie is present — either every call is cut short (sessions die) or none is (504s come back)"
  );
});

test("the token is read ONCE, before the choice of cap depends on it", () => {
  // If the cookie were re-read after the local verification, a refactor could
  // easily leave the cap keyed off a stale value.
  const tokenAt = CODE.indexOf("const token =");
  const capAt = CODE.indexOf("token ? REFRESH_TIMEOUT_MS");
  assert.ok(tokenAt > -1, "the single token read is gone");
  assert.ok(capAt > tokenAt, "the cap is chosen before the token it depends on is read");
});

test("withAuthTimeout returns the slow value if it arrives inside the longer cap", async () => {
  // Behavioural, not structural: a refresh that takes 8s — slow, but inside
  // Supabase's own deadline — must be RETURNED, not thrown away. This is the
  // case that was being lost.
  const slowButFine = new Promise((r) => setTimeout(() => r({ data: { user: { id: "u1" } } }), 60));
  const got = await withAuthTimeout(slowButFine, 200);
  assert.equal(got.degraded, false, "a slow-but-completing refresh must not be reported as degraded");
  assert.deepEqual(got.value, { data: { user: { id: "u1" } } });
});
