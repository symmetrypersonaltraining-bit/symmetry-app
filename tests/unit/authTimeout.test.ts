// Guard: Supabase Auth being slow degrades the app, it does not kill it.
//
// Written 15 Aug 2026 during a live incident — `GET /user` on Supabase auth was
// taking 10–65s and 504ing about half the time, and because the middleware
// awaited it with no cap, Vercel served MIDDLEWARE_INVOCATION_TIMEOUT instead
// of a page.
//
// The distinction these tests exist to protect is `degraded` vs `value: null`.
// "Auth said nobody is signed in" and "auth did not answer" look identical if
// you only check the value, and collapsing them signs real users out at random
// whenever the service is unwell.
//
// MUTATION-TESTED. Each assertion was confirmed to fail against a broken
// implementation before being trusted:
//   - returning {value:null, degraded:false} on timeout → "timeout is degraded" fails
//   - rethrowing instead of catching                    → "a rejection is degraded" fails
//   - dropping the clearTimeout                         → "the timer is cleared" fails
//   - resolving the race with the timeout first         → "a fast answer wins" fails

import { test } from "node:test";
import assert from "node:assert/strict";
import { withAuthTimeout, AUTH_TIMEOUT_MS } from "../../src/lib/authTimeout";

const tick = (ms: number, v?: unknown) => new Promise((r) => setTimeout(() => r(v), ms));

test("withAuthTimeout: a fast answer is returned, not degraded", async () => {
  const got = await withAuthTimeout(Promise.resolve({ data: { user: { id: "u1" } } }), 50);
  assert.equal(got.degraded, false);
  assert.deepEqual(got.value, { data: { user: { id: "u1" } } });
});

test("withAuthTimeout: a slow answer is degraded, and does not wait for it", async () => {
  const started = Date.now();
  const got = await withAuthTimeout(tick(5000, { data: { user: { id: "u1" } } }), 40);
  const waited = Date.now() - started;
  assert.equal(got.degraded, true);
  assert.equal(got.value, null);
  // The point of the cap: it returns on ITS schedule, not the slow call's.
  assert.ok(waited < 1000, `waited ${waited}ms, expected to give up near 40ms`);
});

test("withAuthTimeout: a rejection is degraded, never thrown", async () => {
  // A network error reaching auth is the same situation as a slow one from the
  // caller's side. Throwing here would take the page down, which is the exact
  // outcome this whole file exists to prevent.
  const got = await withAuthTimeout(Promise.reject(new Error("ECONNRESET")), 50);
  assert.equal(got.degraded, true);
  assert.equal(got.value, null);
});

test("withAuthTimeout: 'auth answered: nobody' is NOT degraded", async () => {
  // THE important one. Supabase returns {data:{user:null}} for a signed-out
  // visitor. That is an answer, and the middleware must still redirect them to
  // /login. Only a non-answer may pass through.
  const got = await withAuthTimeout(Promise.resolve({ data: { user: null } }), 50);
  assert.equal(got.degraded, false);
  assert.equal((got.value as { data: { user: unknown } }).data.user, null);
});

test("withAuthTimeout: the timer is cleared on the fast path", async () => {
  // An uncleared setTimeout holds the serverless invocation open. On a path
  // that runs for every navigation that is a leak, not a one-off.
  const real = global.setTimeout;
  const realClear = global.clearTimeout;
  let created = 0;
  let cleared = 0;
  try {
    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms: number) => {
      created++;
      return real(fn, ms);
    }) as unknown as typeof setTimeout;
    (global as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = ((h: number) => {
      cleared++;
      return realClear(h);
    }) as unknown as typeof clearTimeout;

    await withAuthTimeout(Promise.resolve("fast"), 5000);
  } finally {
    global.setTimeout = real;
    global.clearTimeout = realClear;
  }
  assert.equal(created, 1);
  assert.equal(cleared, 1, "the timeout must be cleared when the call answers first");
});

test("withAuthTimeout: the default cap is well under Supabase's own deadline", () => {
  // Supabase's auth service gives up around 10s. Waiting longer than that only
  // delays a failure that has already happened.
  assert.ok(AUTH_TIMEOUT_MS < 10_000, "must give up before the upstream does");
  assert.ok(AUTH_TIMEOUT_MS >= 1_000, "must not be so tight that a healthy-but-busy call is cut off");
});
