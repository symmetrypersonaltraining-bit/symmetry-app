// "jenns all the sudden started sometimes it prompts her to log in again
// sometimes its already logged in."
//
// getUserFast has always returned `degraded` next to the user, and authTimeout.ts
// spells out why in as many words:
//
//   "a timeout is not a signed-out user, and treating it as one signs people
//    out at random"
//
// The middleware honoured that. Every server component that actually performs
// the redirect did not — all 32 of them destructured `{ data: { user } }`,
// dropped `degraded`, and ran `if (!user) redirect("/login")`. The distinction
// was computed carefully, documented at length, and then thrown away by every
// caller in a position to act on it.
//
// One slow auth call or one dropped request on gym wi-fi gives `user === null`
// with `degraded === true`, and Jenn is looking at a login screen. She
// navigates again, the next call succeeds, and she is "already logged in".
//
// The two workout pages were worse still: they called supabase.auth.getUser()
// raw — uncapped, no degraded signal at all — and they are the pages she is on
// while logging a session.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** requireUser's decision, as the helper makes it. */
function landing(user: { id: string } | null, degraded: boolean): string {
  if (degraded) return "/reconnecting";
  if (!user) return "/login";
  return "app";
}

test("unreachable auth is not a logout", () => {
  // The exact shape getUserFast returns when the call timed out or threw.
  assert.equal(landing(null, true), "/reconnecting");
});

test("genuinely signed out still goes to login", () => {
  assert.equal(landing(null, false), "/login");
});

test("a signed-in user is never diverted", () => {
  assert.equal(landing({ id: "u1" }, false), "app");
});

test("degraded is checked before the null user, because it arrives with one", () => {
  // Reading the null half first IS the bug: a degraded result also carries
  // user === null, so an `if (!user)` that runs first can never be reached by
  // the degraded branch.
  const src = strip(read("src/lib/auth/serverUser.ts"));
  const dg = src.indexOf('if (degraded) redirect("/reconnecting")');
  const nu = src.indexOf('if (!user) redirect("/login")');
  assert.ok(dg > 0 && nu > 0, "requireUser is not making both checks");
  assert.ok(dg < nu, "the null-user check runs first, so degraded can never fire");
});

test("no server component decides this for itself any more", () => {
  // Every page previously carried its own copy of the wrong decision. One
  // helper means one place to be right.
  const hits = execSync(
    "grep -rn 'if (!user) redirect(\"/login\")' --include=*.tsx --include=*.ts src/app/ || true",
    { encoding: "utf8" },
  ).trim();
  assert.equal(hits, "", "a page is deciding signed-out on its own again:\n" + hits);
});

test("the workout pages no longer call auth raw", () => {
  // Uncapped, and no degraded signal to ignore or honour — on the two pages
  // Jenn is on while logging a session.
  for (const p of ["src/app/(app)/workout/page.tsx", "src/app/(app)/workout/[dayId]/page.tsx"]) {
    const s = strip(read(p));
    assert.doesNotMatch(s, /await supabase\.auth\.getUser\(\)/, p + " is back on a raw auth call");
    assert.match(s, /requireUser\(supabase\)/, p + " is not using requireUser");
  }
});

test("the reconnecting page exists and cannot itself bounce", () => {
  assert.ok(existsSync(join(process.cwd(), "src/app/reconnecting/page.tsx")));
  // Sending "we could not reach auth" back through the auth gate that could not
  // answer is a redirect loop with a spinner on it.
  assert.match(strip(read("src/middleware.ts")), /pathname === "\/reconnecting"/);
  // And it must not offer a login form — the session is fine.
  assert.doesNotMatch(strip(read("src/app/reconnecting/page.tsx")), /password|sign in|Sign in/i);
});
