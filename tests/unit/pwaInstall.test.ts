import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE MANIFEST THAT WASN'T THERE.
 *
 * `layout.tsx` has told every phone to fetch a web app manifest since the app
 * was built. The file never existed — it 404'd. The cost was invisible and
 * large:
 *
 *   Android — Chrome will not offer "Install app" without a valid manifest AND
 *             a service worker with a fetch handler. It never offered it, so
 *             the only way in was sideloading a debug APK past a Play Protect
 *             warning that calls the app unsafe.
 *   iPhone  — Add to Home Screen worked, but with a screenshot of the page as
 *             the icon.
 *
 * Dustin: "the flow is currently very sloppy for new clients." This was most of
 * it, and it is the kind of thing that stays broken for a year because nothing
 * errors — it just quietly doesn't happen.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("the manifest the layout promises actually exists", () => {
  assert.ok(existsSync(join(ROOT, "src/app/manifest.ts")), "app/manifest.ts must exist");
  const layout = read("src/app/layout.tsx");
  // Next serves app/manifest.ts at /manifest.webmanifest — pointing the layout at
  // /manifest.json again would silently 404 exactly like before.
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
});

test("every icon the manifest names is a real file", () => {
  const src = read("src/app/manifest.ts");
  const refs = [...src.matchAll(/src: "(\/icons\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3, "expected at least 3 icons declared");
  for (const r of refs) {
    const p = join(ROOT, "public", r);
    assert.ok(existsSync(p), `manifest names ${r} but the file is missing`);
    assert.ok(statSync(p).size > 1000, `${r} is suspiciously small`);
  }
});

test("iOS gets a real home-screen icon", () => {
  // Without an apple-touch-icon iOS screenshots the page and uses that.
  assert.match(read("src/app/layout.tsx"), /apple: \[\{ url: "\/icons\/apple-touch-icon\.png"/);
  assert.ok(existsSync(join(ROOT, "public/icons/apple-touch-icon.png")));
});

test("the service worker never caches HTML or JS", () => {
  // This app is a thin native shell around the live deployment — a web deploy
  // reaching phones instantly is the whole delivery model. A worker that cached
  // pages would strand clients on a stale build and make "it's fixed" untrue.
  const sw = read("public/sw.js");
  assert.match(sw, /\/_next\/static\//, "only immutable hashed assets may be cached");
  assert.match(sw, /if \(!cacheable\) return;/, "everything else must pass through untouched");
  assert.match(sw, /skipWaiting/, "a bad worker has to be replaceable by shipping a good one");
  assert.match(sw, /clients\.claim/);
});

test("the install prompt cannot nag someone forever", () => {
  const src = read("src/components/InstallPrompt.tsx");
  assert.match(src, /isStandalone\(\)\) return;/, "hidden once installed");
  assert.match(src, /symmetry_install_dismissed/, "dismissal has to stick");
  // iOS has no install API; the only honest thing is instructions.
  assert.match(src, /Add to Home Screen/);
});

test("the invite leads with a one-tap link, and keeps the password as fallback", () => {
  const route = read("src/app/api/invite-client/route.ts");
  assert.match(route, /generateLink\(\{/);
  assert.match(route, /type: "recovery"/);
  assert.match(route, /next=\/welcome/, "the link must land on the first-run screen");
  // Links expire and mail clients mangle them. "The button didn't work" must
  // never mean "you cannot get in".
  assert.match(route, /tempPassword/);
  const email = read("src/lib/inviteEmail.ts");
  assert.match(email, /Open my app/);
  assert.ok(
    email.indexOf("Open my app") < email.indexOf("If you need to sign in by hand"),
    "the one-tap button has to come before the credentials block",
  );
});

test("first-run never traps anyone", () => {
  const src = read("src/app/(app)/welcome/WelcomeClient.tsx");
  assert.match(src, /I'll do this later/, "the password step must be skippable");
  assert.match(src, /Take me to my programme/);
  // 16px inputs, or iOS zooms the page when the keyboard opens — a small thing
  // that makes a first impression feel broken.
  assert.match(src, /fontSize: 16,/);
});

/**
 * PUBLIC MEANS PUBLIC.
 *
 * The manifest and icons shipped, and the install prompt still would not have
 * worked. Checking what the live site actually served found everything behind
 * the login wall: a phone fetches /manifest.webmanifest with NO session, got
 * redirected to /login, and received HTML. HTML is not a manifest, so Chrome
 * would have gone on refusing to offer "Install app" — the same symptom, a new
 * cause, and invisible without asking the deployed site.
 *
 * Same for /privacy, which is the URL Apple and Google fetch while logged out.
 * A privacy policy a reviewer cannot read is not a published privacy policy.
 */
test("the install and policy URLs are reachable without a session", () => {
  const mw = read("src/middleware.ts");
  for (const p of ['pathname === "/privacy"', 'pathname === "/manifest.webmanifest"', 'pathname === "/sw.js"', 'pathname.startsWith("/icons/")']) {
    assert.ok(mw.includes(p), `middleware must let ${p} through unauthenticated`);
  }
  // And they have to sit ABOVE the redirect, or the allowance never runs.
  //
  // Matched loosely on purpose: the redirect became redirectKeepingSession on
  // 13 Aug (it was dropping refreshed auth cookies and signing people out), and
  // the old exact-string search then compared against indexOf's -1. That
  // happened to fail loudly here; the same pattern the other way round would
  // have PASSED silently forever.
  const loginRedirect = mw.search(/(NextResponse\.redirect|redirectKeepingSession)\(new URL\("\/login"/);
  assert.ok(loginRedirect > -1, "no login redirect found in middleware at all — this test is not checking anything");
  assert.ok(
    mw.indexOf('pathname === "/privacy"') < loginRedirect,
    "the public allowance must come before the login redirect",
  );
});

test("first-run comes before the intake questionnaire, not after", () => {
  // /welcome sets the app up; /onboarding asks about goals and injuries. Without
  // /welcome in the skip list the onboarding redirect fired first and a new
  // client was asked about their health history before they had a password.
  const mw = read("src/middleware.ts");
  assert.match(mw, /pathname === "\/onboarding" \|\| pathname === "\/set-password" \|\| pathname === "\/welcome"/);
  assert.match(read("src/app/(app)/welcome/WelcomeClient.tsx"), /needsIntake \? "\/onboarding" : "\/home"/);
});

test("a first-time client reaches first-run however they signed in", () => {
  // The one-tap link lands on /welcome. But links expire, and the invite email
  // carries a temporary password as a fallback — someone signing in that way
  // skipped first-run entirely: never asked to choose a password, never offered
  // the home-screen install. The flag decides, not the route they arrived by.
  const mw = read("src/middleware.ts");
  assert.match(mw, /first_login_completed === false/);
  assert.match(mw, /(NextResponse\.redirect|redirectKeepingSession)\(new URL\("\/welcome", request\.url\)/);
  // First run comes BEFORE the intake questionnaire.
  assert.ok(
    mw.indexOf('new URL("/welcome"') < mw.indexOf('new URL("/onboarding"'),
    "password and install come before goals and injury history",
  );
  // And it stays one round trip — middleware runs on every navigation.
  assert.match(mw, /client_app_settings\(first_login_completed\)/);
});
