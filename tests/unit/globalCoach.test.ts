import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { claimCoachSlot, coachSlotClaimed } from "../../src/lib/ai/coachMount";

const ROOT = process.cwd();

// The global ✦ is mounted in the layout, so it is on every client screen at
// once. Two rules keep that from being a nuisance, and neither is visible in a
// diff of the component that breaks it.

// Rule 1 — the workout logger never gets a floating button from the layout.
// Dustin, 2026-08-12: "we need to make sure we're very careful about where
// these get mounted so that they don't mess up the current screen, especially
// the workout logger." That screen is pinned by its own layout tests and gets
// its own mount on its own terms.
test("the logger is excluded, and nothing else is excluded by accident", async () => {
  const { surfaceFor } = await import("../../src/components/GlobalCoach");
  assert.equal(surfaceFor("/workout/2f9c-abc"), null, "the layout is mounting a coach on the workout logger");
  assert.equal(surfaceFor("/workout/2f9c-abc/anything"), null);

  // The workout LIST is a different screen and does get one.
  assert.equal(surfaceFor("/workout"), "workout");
  assert.equal(surfaceFor("/nutrition"), "nutrition");
  assert.equal(surfaceFor("/progress"), "progress");
  assert.equal(surfaceFor("/home"), "home");
  assert.equal(surfaceFor("/settings/theme"), "settings");
  assert.equal(surfaceFor("/something-new"), "app");
});

// Rule 2 — never two ✦ buttons. "make sure any other duplicate ai buttons are
// removed when we add this one."
test("a screen with its own coach hides the global one, and gives it back", () => {
  assert.equal(coachSlotClaimed(), false, "something is holding the slot before anything mounted");

  const releaseNutrition = claimCoachSlot();
  assert.equal(coachSlotClaimed(), true, "the global \u2726 is still showing next to the screen's own");

  releaseNutrition();
  assert.equal(coachSlotClaimed(), false, "the global \u2726 never came back after leaving the screen");
});

test("navigating between two screens that both claim never drops the button", () => {
  // React mounts the next screen before unmounting the last, so the claims
  // overlap. A boolean would go false on the first release and leave the global
  // button showing on top of a screen that has its own.
  const first = claimCoachSlot();
  const second = claimCoachSlot();
  first();
  assert.equal(coachSlotClaimed(), true, "the incoming screen's claim was cancelled by the outgoing one's release");
  second();
  assert.equal(coachSlotClaimed(), false);

  // And a double release cannot drive the count negative, which would hide the
  // global button on every screen for the rest of the session.
  const once = claimCoachSlot();
  once(); once(); once();
  assert.equal(coachSlotClaimed(), false);
  const after = claimCoachSlot();
  assert.equal(coachSlotClaimed(), true, "the count went negative and the coach is gone app-wide");
  after();
});

// Rule 3 — the floating button disappears while the keyboard is up, rather than
// moving. "when the keyboard comes up, it can cover things and all that."
test("CoachFab returns nothing while a keyboard is open", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/CoachFab.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /useKeyboardInset\(\)/, "CoachFab no longer reads the keyboard inset");
  assert.match(
    code,
    /if\s*\(\s*kb\s*>\s*0\s*\)\s*return null/,
    "CoachFab must unmount while the keyboard is up — repositioning it still covers the field being typed into"
  );
});

// Rule 4 — off the nutrition tab the chat must not offer to change a meal it
// cannot change. A Confirm button over a no-op tells a client their day is
// logged when it is not.
test("the global mount cannot execute actions and does not pretend to", () => {
  const gc = fs.readFileSync(path.join(ROOT, "src/components/GlobalCoach.tsx"), "utf8");
  assert.match(gc, /canAct=\{false\}/, "the global coach is mounted with actions enabled but no write helpers");

  const sheet = fs.readFileSync(path.join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
  const code = sheet.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    code,
    /&&\s*!canAct\)/,
    "an action intent is no longer diverted when the surface cannot act — it will render a Confirm button that does nothing"
  );
});

// PRODUCTION OUTAGE, 13 Aug. Dustin: "app is partially crashed... the ai icon
// in the bottom right is flickering... it freezed on home screen cant click
// anything", and a client could not open her workout.
//
// GlobalCoach renders CoachChatSheet. CoachChatSheet claimed the ✦ slot on
// mount. GlobalCoach hides itself when the slot is claimed. So: mount, claim,
// hide, unmount, release, mount — a render loop that pinned the main thread.
// GlobalCoach lives in the app layout, so it took every client screen with it.
//
// Both halves are asserted, because either one alone reopens the loop.
test("the global coach never claims the slot it watches", () => {
  const gc = fs.readFileSync(path.join(ROOT, "src/components/GlobalCoach.tsx"), "utf8");
  assert.match(
    gc,
    /claimsSlot=\{false\}/,
    "GlobalCoach is claiming the slot again — it hides itself when the slot is claimed, so this is an infinite mount/unmount loop"
  );

  const sheet = fs.readFileSync(path.join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
  const code = sheet.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    code,
    /if \(!claimsSlot\) return;/,
    "the sheet claims unconditionally again, so the prop cannot switch it off"
  );
});

// Dustin, 2026-08-13, with a screenshot of the coach open on the workout
// logger showing "swap M4 for salmon and rice": "this is the ai in workout
// logger talking about nutrition. we shoukd have capability of doing anythijg
// in app from any page but the initial opening shoukd be specific to the page
// its in."
//
// Capability and opener are separate concerns. The endpoint has the client's
// whole picture and answers anything from anywhere — that does not change. The
// OPENER is the part that should know where it is standing.
test("each screen opens with its own line, not the nutrition one", async () => {
  const sheet = fs.readFileSync(path.join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
  const { surfaceFor } = await import("../../src/components/GlobalCoach");

  const openersAt = sheet.indexOf("const OPENERS");
  assert.ok(openersAt > -1, "the per-surface openers are gone — every screen is back to one greeting");
  const openers = sheet.slice(openersAt, sheet.indexOf("\n};", openersAt));

  // Every surface GlobalCoach can produce must have an opener, or it silently
  // falls back to a generic one nobody wrote on purpose.
  for (const p of ["/workout", "/progress", "/home", "/messages", "/settings", "/help", "/nutrition", "/anything"]) {
    const s = surfaceFor(p);
    if (!s) continue;
    assert.match(openers, new RegExp(`\\n  ${s}:`), `no opener for the ${s} surface (${p})`);
  }

  // And the meal-specific greeting must not be the one a lifter sees.
  const workoutBlock = openers.slice(openers.indexOf("  workout:"), openers.indexOf("  logger:"));
  assert.doesNotMatch(workoutBlock, /salmon|M4|cookie|meal/i, "the workout opener still talks about meals");
});

test("the meal action chips only appear where a meal can actually be changed", () => {
  const sheet = fs.readFileSync(path.join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
  assert.match(
    sheet,
    /\[\.\.\.\(canAct \? ACTION_CHIPS : \[\]\)/,
    '"Swap a meal" is offered on screens that cannot swap a meal'
  );
});
