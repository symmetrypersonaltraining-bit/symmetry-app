// THE BANNER MUST BE DISMISSABLE, AND DISMISSING ONE MUST NOT SILENCE THE REST.
//
// Dustin, 22 Aug, mid-session: "this is the notification banner I was talking
// about. I need to be able to dismiss that quickly."
//
// It is fixed at z-index 3000 across the top of every screen for six seconds —
// twelve for a person's message — and the ENTIRE bar was a single <button> that
// navigates. So the only two ways out were to wait it out or to tap it and be
// taken somewhere you did not ask to go. With a client in front of him that is
// the top of the app gone, repeatedly.
//
// (The first attempt at this ask went to the notification BELL, which is a
// different control. The bell work stands on its own; this is the thing he
// actually meant.)
//
// The design constraint that matters: dismissing the group chat must NOT
// swallow a client messaging him twenty minutes later. A blanket mute would be
// worse than the complaint, because missing a client's message is the fault
// this banner exists to prevent. So dismissal is per SOURCE and per session.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/MessageNotifier.tsx"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("there is a dismiss control, and it is not the tap-to-read target", () => {
  assert.match(code, /aria-label=\{"Dismiss " \+ banner\.text\}/, "no dismiss button");
  assert.match(code, /onClick=\{\(ev\) => \{ ev\.stopPropagation\(\); hush\(b\); \}\}/,
    "dismissing must not also fire the navigation the bar is wrapped in");
});

test("the bar is a row, because a button cannot live inside a button", () => {
  // The old markup put position/background/animation on the <button> itself.
  // If that comes back, the × has nowhere legal to go.
  const firstEl = code.slice(code.indexOf("if (!banner) return null;"));
  assert.match(firstEl, /return \(\s*\n?\s*<div/, "the outer element is not a container");
  assert.match(firstEl, /position: "fixed", top: "calc\(env\(safe-area-inset-top\)/,
    "the fixed positioning moved off the container");
});

test("dismissing is remembered for the session, and only for the session", () => {
  assert.match(code, /sessionStorage\.setItem\(QUIET_KEY/,
    "a dismissed banner comes straight back on the next poll");
  assert.ok(!/localStorage\.(get|set)Item\(QUIET_KEY/.test(code),
    "persisting it across app launches silences messages indefinitely");
});

test("dismissal is per source — one wave-off does not mute everything", () => {
  assert.match(code, /dismissed\.current\.add\(b\.href\)/,
    "dismissal must be keyed to the source, not a global flag");
  assert.match(code, /queued\.filter\(\(q\) => !dismissed\.current\.has\(q\.href\)\)/,
    "a dismissed source is re-queued on the next poll");
  // The skip-over rule, not its spelling. 26 Aug this loop gained two more
  // reasons to hold a banner back — a muted event and an open workout — so the
  // dismissal check moved into an `allowed()` predicate beside them. What has
  // to stay true is that a banner already queued from a dismissed source is
  // stepped over rather than shown.
  assert.match(code, /const allowed = \(b: Banner\) =>\s*\n?\s*!dismissed\.current\.has\(b\.href\)/,
    "dismissal is no longer consulted when choosing the next banner");
  assert.match(code, /while \(next && !allowed\(next\)\) next = queue\.current\.shift\(\);/,
    "a dismissed banner already sitting in the queue is still shown");
  // The thing that must NOT be true.
  assert.ok(!/dismissed\.current = new Set\(\[["'`]all/.test(code),
    "a blanket mute would swallow a client's message, which is the whole point of the banner");
});

test("dismissing also clears the same source already waiting behind it", () => {
  assert.match(code, /queue\.current = queue\.current\.filter\(\(q\) => q\.href !== b\.href\)/,
    "dismissing one reveals its twin, so it takes two taps to get rid of one thing");
});
