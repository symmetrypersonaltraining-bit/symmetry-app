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

test("getUser is called before any redirect decision", () => {
  // The refresh is a side effect of this call. Deciding to redirect before it
  // runs means the session never gets refreshed at all on those requests.
  const getUserAt = CODE.indexOf("supabase.auth.getUser()");
  const firstRedirect = CODE.indexOf("redirectKeepingSession(new URL");
  assert.ok(getUserAt > -1 && firstRedirect > -1);
  assert.ok(getUserAt < firstRedirect, "a redirect is decided before the token gets its chance to refresh");
});
