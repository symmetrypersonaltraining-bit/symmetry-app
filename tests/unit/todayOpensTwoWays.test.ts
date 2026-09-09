import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TODAY'S WORKOUT OPENS TWO WAYS.
 *
 * Dustin, 4 Sep and again 9 Sep: home's today tile was "the last place a
 * workout opens only one way" — the Workout tab had carried a Start / View
 * split since 3 Sep and home had not.
 *
 * ⚠️ It was worse than a missing button. BOTH branches of the tile wrapped the
 * whole card in a Link to the overview, while the pill on it read "Start
 * Workout". The one control was LABELLED Start and DID View. A client who
 * tapped Start landed on the overview and had to find another button.
 *
 * `?start=1` is what enters the session; the bare id opens the overview.
 */

const HOME = readFileSync(
  join(process.cwd(), "src/app/(app)/home/ClientDashboard.tsx"), "utf8");

/** The today's-workout region: both the single card and the multi-row list. */
const TILE_RAW = HOME.slice(
  HOME.indexOf("_todayWorkouts.length === 0"),
  HOME.indexOf("Sunday weigh-in reminder"));

/** The same region with comments removed -- the prose above these controls
 *  describes the old bug, so it says "Start" too, and a count that includes it
 *  measures the commentary rather than the markup. */
const TILE = TILE_RAW.replace(/\{\/\*[^]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("Start enters the session rather than the overview", () => {
  const starts = TILE.match(/workout\/\$\{[^}]+\}\?start=1/g) ?? [];
  assert.equal(starts.length, 2,
    "both the single card and each row of the multi list need a real Start");
});

test("View is offered beside it", () => {
  // The two render differently -- the card puts the word on its own line, the
  // row wraps it in a span -- so match the eye icon that labels both, and the
  // word itself, rather than one exact bit of markup.
  const eyes = TILE.match(/ti-eye/g) ?? [];
  assert.equal(eyes.length, 2, "single card and multi row each get a View");
  const words = TILE.match(/\bView\b/g) ?? [];
  assert.ok(words.length >= 2, "and each says View");
});

test("every Start in the tile carries ?start=1", () => {
  // The exact shape of the old bug, stated as an invariant: the word Start
  // appeared twice in the tile and ?start=1 appeared zero times, so both
  // Starts opened the overview. Counting them is what makes it provable.
  const starts = TILE.match(/\bStart\b/g) ?? [];
  const flags = TILE.match(/\?start=1/g) ?? [];
  assert.ok(starts.length > 0, "the tile still offers Start");
  assert.equal(flags.length, starts.length,
    "a control that says Start must enter the session, not the overview");
});

test("the tile no longer wraps everything in one destination", () => {
  // Two destinations cannot live inside one anchor, and nested <a> is invalid
  // HTML. The card is a container now; the buttons are the links.
  assert.doesNotMatch(TILE, /<Link href=\{`\$\{basePath\}\/workout\/\$\{_todayWorkouts\[0\]\.id\}`\}>\s*\n\s*<div className="rounded-2xl/,
    "the single card must not be wrapped in a Link again");
});

test("a completed session still offers View", () => {
  // It is how a client reads back what they actually lifted.
  const done = TILE.slice(TILE.indexOf("Completed ✓"));
  assert.match(done.slice(0, 1200), /ti-eye/);
});
