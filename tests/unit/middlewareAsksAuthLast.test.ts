// Guard: the middleware does not ask Supabase who you are for requests it is
// about to wave through anyway.
//
// Until 15 Aug 2026 the `auth.getUser()` call sat ABOVE the public-path
// allowlist, so every allow-listed request paid a network round trip to
// Supabase Auth and then discarded the answer. `/api/` is on that list and is
// NOT excluded by the matcher, so every API call the app made — every meal
// logged, every set saved, every poll — spent an extra GoTrue request before
// its own route handler authenticated properly. Same for /sw.js,
// /manifest.webmanifest and every icon fetch.
//
// Found while diagnosing an auth outage. It was not the cause, but a service
// that was already failing half its requests was being asked several times as
// many questions as it needed to answer.
//
// This is a SOURCE-ORDER test, in the same spirit as dbWrites.test.ts: it reads
// the file rather than running it, because the property being protected is
// "which line comes first" and that is exactly what a well-meaning refactor
// undoes. MUTATION-TESTED: moving the getUser call back above the allowlist
// makes it fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

test("middleware: the public-path allowlist is checked BEFORE auth is asked", () => {
  const allowlistAt = SRC.indexOf('pathname === "/manifest.webmanifest"');
  // The CALL, not the several comments that mention it by name — matching the
  // prose here is how this test passed against the broken order on first run.
  const getUserAt = SRC.search(/withAuthTimeout\(\s*supabase\.auth\.getUser\(\)\s*\)/);

  assert.ok(allowlistAt > -1, "could not find the public-path allowlist");
  assert.ok(getUserAt > -1, "could not find the capped auth.getUser() call");
  assert.ok(
    allowlistAt < getUserAt,
    "auth.getUser() runs before the allowlist, so every /api/, /sw.js and /icons/ " +
      "request pays a Supabase Auth round trip it does not use"
  );
});

test("middleware: /api/ is on the allowlist", () => {
  // If this ever comes off the list, every API request starts paying for auth
  // twice again — once here and once in the route handler.
  assert.match(SRC, /pathname\.startsWith\("\/api\/"\)/);
});

test("middleware: the auth call is capped, not awaited indefinitely", () => {
  // A bare `await supabase.auth.getUser()` is what turned a slow dependency
  // into MIDDLEWARE_INVOCATION_TIMEOUT and a white screen for every client.
  assert.match(SRC, /withAuthTimeout\(\s*supabase\.auth\.getUser\(\)\s*\)/);
  assert.ok(
    !/[^d]await supabase\.auth\.getUser\(\)/.test(SRC),
    "found an uncapped await on auth.getUser()"
  );
});

test("middleware: a degraded auth result passes through, it does not redirect", () => {
  // A timeout is not a signed-out user. Redirecting on one signs people out at
  // random whenever the auth service is unwell.
  // Read the STATEMENT, not the surrounding lines. Slicing a fixed number of
  // characters swept in the "// Login page" block that follows and failed on
  // correct code — a test that cries wolf gets deleted, which is worse than
  // not having it.
  const stmt = SRC.match(/if \(auth\.degraded\)[^\n]*/);
  assert.ok(stmt, "the degraded branch is gone");
  assert.ok(
    stmt[0].includes("return supabaseResponse"),
    `a degraded auth result must pass through, never redirect — found: ${stmt[0]}`
  );
  assert.ok(
    !stmt[0].includes("/login"),
    `a degraded auth result must not be sent to /login — found: ${stmt[0]}`
  );
});
