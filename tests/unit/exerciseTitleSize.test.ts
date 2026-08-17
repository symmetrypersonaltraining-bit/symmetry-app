// The logger has to show the WHOLE movement name, without shoving the layout.
//
// Dustin, 17 Aug: "I need you to resize exercise names in the logger where we
// can see the full name. do not mess up anything on layout or spacing in the
// app we've finally perfected... I have to see the full name of every movement
// from logger screen."
//
// Every name below is a real one, read from the live database on 17 Aug.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exerciseTitleSize, TITLE_LADDER } from "../../src/lib/exerciseTitleSize.ts";

const LOGGER = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

// ─── his screenshot ─────────────────────────────────────────────────────────

test("the name from his screenshot stops being cut off", () => {
  // Shown as "Cable Rope Tricep…" at text-xl inside a 2-line clamp.
  assert.equal(exerciseTitleSize("Cable Rope Tricep Extension"), "text-lg");
});

test("the longest movement he programs still gets a size", () => {
  assert.equal(exerciseTitleSize("Side-Lying Ribcage Breathing Expansion over Foam Roller"), "text-sm");
  assert.equal(exerciseTitleSize("Hip Flexor Stretch (Kneeling or Standing Split Stance)"), "text-sm");
  assert.equal(exerciseTitleSize("Alternating Arm Kettlebell Bottoms Up Overhead Press"), "text-sm");
});

// ─── the promise that the perfected screen is left alone ────────────────────

test("short names keep text-xl EXACTLY as they are today", () => {
  // 317 of his 627 programmed movements are 22 characters or fewer. Half the
  // library must look identical to the screen he says is finally right.
  for (const n of ["Barbell Bench Press", "Leg Press", "Goblet Squat", "Lat Pulldown", "Face Pull"]) {
    assert.equal(exerciseTitleSize(n), "text-xl", `${n} changed size and did not need to`);
  }
});

test("the 22-character boundary is inclusive, so nothing shrinks early", () => {
  assert.equal(exerciseTitleSize("A".repeat(22)), "text-xl");
  assert.equal(exerciseTitleSize("A".repeat(23)), "text-lg");
});

// ─── it must never hide anything ────────────────────────────────────────────

test("no size in the ladder truncates", () => {
  for (const step of TITLE_LADDER) {
    assert.doesNotMatch(step.size, /truncate|line-clamp/,
      "a truncating class is back in the ladder — the name is cut off again");
  }
});

test("the clamp that caused this is gone from the heading", () => {
  // 0a512b4, 4 Aug, added WebkitLineClamp: 2 to the <h2>. That commit is the
  // "changed back" he remembers.
  const i = LOGGER.indexOf("exerciseTitleSize(");
  assert.ok(i > 0, "the logger heading no longer uses the ladder at all");
  const around = LOGGER.slice(Math.max(0, i - 600), i + 600);
  assert.doesNotMatch(around, /WebkitLineClamp/,
    "the 2-line clamp is back on the exercise heading — this is the exact regression he reported");
});

test("the heading still renders the full name, not a slice of it", () => {
  assert.doesNotMatch(LOGGER, /exercises\?\.name\?\.slice\(/,
    "the name is being cut in JavaScript, which no CSS change can undo");
  assert.doesNotMatch(LOGGER, /exercises\?\.name\?\.substring\(/,
    "the name is being cut in JavaScript, which no CSS change can undo");
});

// ─── the ladder itself ──────────────────────────────────────────────────────

test("a longer name never gets a BIGGER size", () => {
  const order = ["text-xl", "text-lg", "text-base", "text-sm"];
  let worst = 0;
  for (let len = 0; len <= 80; len++) {
    const idx = order.indexOf(exerciseTitleSize("A".repeat(len)));
    assert.ok(idx >= 0, `length ${len} produced an unknown size`);
    assert.ok(idx >= worst, `length ${len} got a bigger size than a shorter name`);
    worst = idx;
  }
});

test("the ladder is ordered, or a later step can never be reached", () => {
  for (let i = 1; i < TITLE_LADDER.length; i++) {
    assert.ok(TITLE_LADDER[i].max > TITLE_LADDER[i - 1].max,
      `step ${i} has a max no larger than the one before it, so it is dead`);
  }
  assert.equal(TITLE_LADDER[TITLE_LADDER.length - 1].max, Infinity,
    "the ladder does not end at Infinity, so a long enough name falls off it");
});

test("a missing or empty name still gets the normal size, not the smallest", () => {
  // The heading falls back to "Exercise" — 8 characters — and rendering that
  // tiny would look like a bug on a screen where something else went wrong.
  assert.equal(exerciseTitleSize(null), "text-xl");
  assert.equal(exerciseTitleSize(undefined), "text-xl");
  assert.equal(exerciseTitleSize(""), "text-xl");
  assert.equal(exerciseTitleSize("   "), "text-xl", "whitespace is not length");
  // The one that makes .trim() mean something: padding must not push a short
  // name down a rung. A trailing space or two in a seeded exercise name is not
  // a reason to render it smaller than the identical name without one.
  assert.equal(exerciseTitleSize("  " + "A".repeat(20) + "        "), "text-xl",
    "surrounding whitespace counted toward the length and shrank a short name");
});

// ─── layout and spacing, which he asked twice not to disturb ────────────────

test("nothing else about the heading row changed", () => {
  const i = LOGGER.indexOf("exerciseTitleSize(");
  const around = LOGGER.slice(Math.max(0, i - 400), i + 400);
  assert.match(around, /font-bold/, "the heading stopped being bold");
  assert.match(around, /text-white/, "the heading colour changed");
  assert.match(around, /leading-tight/, "line spacing on the heading changed");
  assert.match(around, /flex-1 min-w-0/,
    "the heading no longer flexes into the space beside the thumbnail — the row layout moved");
});

// ─── the swap picker, reached from the same screen ──────────────────────────

test("the swap picker shows full movement names too", () => {
  // Same complaint one screen along: choosing a movement you cannot read.
  const i = LOGGER.indexOf("Type to search the exercise library");
  assert.ok(i > 0, "the swap picker has moved — this guard is testing nothing");
  const sheet = LOGGER.slice(i, i + 2000);
  assert.doesNotMatch(sheet, /className="font-semibold text-sm truncate"/,
    "the swap picker truncates movement names again");
  assert.match(sheet, /overflowWrap: "anywhere"/,
    "a long unbroken name can overflow its row instead of wrapping");
});
