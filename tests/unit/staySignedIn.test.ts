import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// "Can we add a stay signed in function to that app so that I don't have to
// keep logging in every time." — Dustin, 2026-08-13.
//
// There was nothing to add. Being signed out was a bug in this file.
//
// supabase.auth.getUser() refreshes the access token when it is due, and
// Supabase ROTATES the refresh token when it does: the old one is spent the
// instant the new one is issued. The new pair is written onto `supabaseResponse`
// by the setAll callback — and every redirect here built a fresh response and
// returned that instead, throwing the new cookies away.
//
// So any navigation that both refreshed AND redirected left the browser holding
// a refresh token that had already been consumed. The next refresh failed and
// the app bounced them to /login. Roughly hourly, and worse for clients, whose
// every navigation can hit the onboarding redirects.
//
// This is invisible in testing: a fresh session has an access token good for an
// hour, so nothing looks wrong until an hour in, and then it looks like "the
// app randomly logs me out".

const SRC = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no redirect in middleware discards the refreshed session cookies", () => {
  // A bare NextResponse.redirect is only safe inside the helper itself.
  const helperAt = CODE.indexOf("function redirectKeepingSession");
  const helperEnd = CODE.indexOf("\n}", helperAt);
  const outside = CODE.slice(0, helperAt) + CODE.slice(helperEnd);

  const bare = [...outside.matchAll(/NextResponse\.redirect\(/g)];
  assert.equal(
    bare.length,
    0,
    `${bare.length} redirect(s) bypass redirectKeepingSession — each one can spend a refresh token and ` +
      `never hand the replacement to the browser, which signs the user out at the next refresh`
  );
});

test("the helper actually copies the cookies across", () => {
  const helperAt = CODE.indexOf("function redirectKeepingSession");
  assert.ok(helperAt > -1, "redirectKeepingSession is gone");
  const body = CODE.slice(helperAt, CODE.indexOf("\n}", helperAt));
  assert.match(body, /carrying\.cookies\.getAll\(\)/, "the helper no longer reads the refreshed cookies");
  assert.match(body, /res\.cookies\.set\(/, "the helper no longer writes them onto the redirect");
});

test("every redirect target is still covered", () => {
  // If a new redirect is added it must appear here too, or the test above is
  // the only thing standing between it and a silent sign-out.
  for (const target of ["/home", "/login", "/welcome", "/onboarding"]) {
    assert.match(
      CODE,
      new RegExp(`redirectKeepingSession\\(new URL\\("${target}"`),
      `the ${target} redirect no longer preserves the session`
    );
  }
});

test("auth is resolved before any redirect decision", () => {
  // The refresh is a side effect of resolving auth. Deciding to redirect before
  // that runs means the session never gets its chance to refresh on those
  // requests.
  //
  // UPDATED 15 Aug 2026. This used to look for `supabase.auth.getUser()`
  // literally. The middleware now calls getUserFast, which verifies the token
  // locally when it can and only calls getUser when it cannot — so the literal
  // is no longer on the hot path and the test failed against correct code.
  // The property it was protecting is unchanged, so it is the SEARCH that
  // moved, not the rule.
  const authAt = CODE.indexOf("getUserFast(");
  const firstRedirect = CODE.indexOf("redirectKeepingSession(new URL");
  assert.ok(authAt > -1, "middleware no longer resolves auth through getUserFast");
  assert.ok(firstRedirect > -1);
  assert.ok(authAt < firstRedirect, "a redirect is decided before the token gets its chance to refresh");
});

test("the fast path still leaves a window in which the token gets refreshed", () => {
  // THE HAZARD THIS FILE EXISTS FOR, in its new form.
  //
  // Local verification skips the network call, and the refresh is a side effect
  // of that call. So a token verified locally right up to the moment it expires
  // would never be refreshed, and the person would be signed out — the exact
  // symptom Dustin reported on 13 Aug, reintroduced by the fix for a different
  // problem.
  //
  // REFRESH_MARGIN_SECONDS is what prevents it: inside that window,
  // verification deliberately declines and the request falls through to
  // getUser(), which refreshes and rotates the cookie. If that margin is ever
  // removed or set to zero, sessions stop refreshing.
  const VERIFY = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/verifyJwt.ts"), "utf8");
  const m = VERIFY.match(/REFRESH_MARGIN_SECONDS\s*=\s*(\d+)/);
  assert.ok(m, "REFRESH_MARGIN_SECONDS is gone — nothing forces a refresh any more");
  assert.ok(
    Number(m[1]) >= 60,
    `refresh margin is ${m[1]}s; too small a window and a token can expire before anything refreshes it`
  );
  assert.match(
    VERIFY,
    /claims\.exp - REFRESH_MARGIN_SECONDS <= now/,
    "the refresh margin is declared but no longer applied to the expiry check"
  );
});
