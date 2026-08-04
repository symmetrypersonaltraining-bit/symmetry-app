import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE KEYBOARD COVERED THE SIGN-IN SCREEN.
 *
 * Dustin, 2026-08-04, with a screenshot of the Android keyboard filling the
 * bottom half of the login page: "keyboard covers app when it pops up fix this".
 * Visible in it: the email field flush against the top of the keyboard, and
 * nothing else — no password field, no error line, no Sign in button.
 *
 * Two causes, and both had to go:
 *
 *   1. `interactiveWidget: "overlays-content"` in the root viewport told Chrome
 *      "draw the keyboard on top and do nothing else" — including not scrolling
 *      the field being typed into back into view. It arrived in 7d7cc8f as part
 *      of a workout-logger approach that was then abandoned piece by piece
 *      (4cb50a1, 48d246f). The logger holds its own layout now and never needed
 *      it; every other screen was quietly paying for it.
 *
 *   2. A page sized `min-h-screen` is exactly as tall as the viewport, so there
 *      is no overflow — even a browser that wants to scroll the field into view
 *      has nowhere to scroll to. KeyboardSafeArea makes the box as tall as the
 *      space actually left, and lets it scroll.
 *
 * These assertions exist because both are one careless edit from coming back,
 * and neither fails loudly — the screen just silently eats its own submit
 * button on a phone nobody tested on.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("the viewport does not tell the browser to ignore the keyboard", () => {
  const layout = read("src/app/layout.tsx");
  assert.ok(
    !/interactiveWidget:\s*"overlays-content"/.test(layout),
    'overlays-content suppresses the browser scrolling the focused field into view on EVERY screen. The logger does not need it — it pins its height with useStableViewportHeight.',
  );
  assert.match(layout, /interactiveWidget:\s*"resizes-visual"/);
});

test("every screen a client signs in through survives the keyboard", () => {
  // These three are the whole path from an invite email to the app: sign in,
  // set a password, first run. A keyboard covering the button on any of them is
  // a client who does not get in at all.
  for (const p of [
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/set-password/page.tsx",
    "src/app/(app)/welcome/WelcomeClient.tsx",
  ]) {
    const src = read(p);
    assert.match(src, /KeyboardSafeArea/, `${p} must be wrapped in KeyboardSafeArea`);
    // The form root specifically. set-password's loading spinner is still a
    // min-h-screen box and that is fine — it has no fields to cover.
    assert.ok(
      !/className="min-h-screen flex flex-col/.test(src),
      `${p} still has a min-h-screen form root — that is the no-room-to-scroll bug`,
    );
    assert.ok(
      !/minHeight: "100vh"/.test(src),
      `${p}: a 100vh form root has no overflow for the browser to scroll`,
    );
  }
});

test("the card inside the shortened box keeps its height instead of being squeezed", () => {
  // flex-1 (which is flex: 1 1 0%) lets the card SHRINK when the box gets
  // shorter, so the button is clipped and there is still nothing to scroll to.
  // flex: 1 0 auto keeps its natural height and pushes the box into overflow,
  // which is the entire point.
  for (const p of ["src/app/(auth)/login/page.tsx", "src/app/(auth)/set-password/page.tsx"]) {
    const src = read(p);
    assert.match(src, /flex: "1 0 auto"/, `${p}: the card must not shrink`);
    assert.ok(
      !/className="flex-1 rounded-t-3xl/.test(src),
      `${p}: flex-1 lets the keyboard squeeze the card`,
    );
  }
});

test("KeyboardSafeArea measures the keyboard rather than guessing", () => {
  const src = read("src/components/KeyboardSafeArea.tsx");
  assert.match(src, /useKeyboardInset/, "height must come from the real visual viewport");
  assert.match(src, /scrollFocusedIntoView/, "the focused field has to be brought into the space that is left");
  assert.match(src, /calc\(100dvh - \$\{kb\}px\)/);
  assert.match(src, /overflowY: "auto"/, "without this there is still nowhere to scroll");
});

test("the workout logger is not wrapped in it", () => {
  // Opposite rule on that screen: NOTHING may move when the keyboard opens.
  // See tests/unit/loggerLayout.test.ts.
  assert.ok(
    !read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx").includes("KeyboardSafeArea"),
  );
});

test("sign-in fields are 16px, so iOS does not zoom the page on focus", () => {
  // Below 16px Safari zooms in when a field is focused and leaves the page
  // scrolled sideways — the same complaint, wearing a different hat.
  for (const p of ["src/app/(auth)/login/page.tsx", "src/app/(auth)/set-password/page.tsx"]) {
    const src = read(p);
    assert.match(src, /fontSize: 16/, `${p}: inputs must be at least 16px`);
    assert.ok(
      !/rounded-lg px-4 py-3 text-sm border/.test(src),
      `${p}: text-sm is 14px and will zoom on iOS`,
    );
  }
});

/**
 * THE QR CODE FOR EVERYBODY.
 *
 * The invite QR is per-client and only rendered when `!client.auth_user_id` —
 * a client who has never had a login. Every client already using the app shows
 * a Reset-credentials button instead, which changes their password. So "show
 * them how to install it" had no answer for the ~35 people who most needed to
 * hear it. /install is public, permanent, identical for everyone, and safe to
 * print.
 */
test("/install is reachable without signing in", () => {
  const mw = read("src/middleware.ts");
  assert.ok(mw.includes('pathname === "/install"'), "the QR target must not redirect to /login");
  assert.ok(
    mw.indexOf('pathname === "/install"') < mw.indexOf('NextResponse.redirect(new URL("/login"'),
    "the allowance has to sit above the redirect or it never runs",
  );
});

test("the install page carries both halves: instructions and the QR itself", () => {
  const src = read("src/app/install/page.tsx");
  assert.match(src, /Add to Home Screen/, "iOS has no install API; instructions are the only route");
  assert.match(src, /InstallPrompt/, "Android gets the real one-tap install");
  assert.match(src, /QRCode\.toDataURL/, "the page has to be able to show its own QR");
  assert.match(src, /\/install"/, "the QR must encode the install URL, not the bare origin");
});

test("settings points at it, or nobody will ever find it", () => {
  assert.match(read("src/app/(app)/settings/SettingsClient.tsx"), /href="\/install"/);
});
