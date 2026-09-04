// ============================================================================
// "i typed in pushup"  — Dustin, 4 Sep 2026.
//
// The movement library spells that lift FOUR ways, because the names were typed
// by hand over a year:
//
//   Push Up · Push-Up · Pushup · Push ups
//
// Twenty-three variations of the movement exist. A plain substring test splits
// them into disjoint sets — "pushup" finds six, "push up" finds a different
// fourteen, and neither spelling finds all of them. There is no way for the
// person searching to know which one to guess, and the ones they do not guess
// simply do not exist as far as the search box is concerned.
//
// The fix is to stop treating spacing and punctuation as part of the word. This
// tests the RULE against the real names, rather than asserting that some
// particular regex is still in the file.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The matcher, mirrored from MovementPicker. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const matches = (query: string, name: string) => {
  const terms = query.split(/\s+/).map(norm).filter(Boolean);
  const hay = norm(name);
  return terms.every((t) => hay.includes(t));
};

// Every spelling that is actually in the library today.
const REAL_NAMES = [
  "Push Up",
  "Push-Up",
  "Push ups",
  "Diamond Push Up",
  "Close Grip Push Up",
  "Scapular Push Up",
  "Plyo Push Up",
  "Depth Plyo Pushup",
  "Stability Ball Pushup",
  "Incline Pushup with Rotation",
  "Medicine Ball Alternating Pushup",
  "Alternating Leg Bosu Pushup",
];

test("every way of typing it finds every way of spelling it", () => {
  for (const query of ["pushup", "push up", "push-up", "PushUp", "  push   up  "]) {
    const found = REAL_NAMES.filter((n) => matches(query, n));
    assert.equal(
      found.length,
      REAL_NAMES.length,
      `"${query}" found ${found.length} of ${REAL_NAMES.length}. Missing: ${REAL_NAMES.filter((n) => !matches(query, n)).join(", ")}`,
    );
  }
});

test("the old substring test really did fail this", () => {
  // A check that cannot fail is not a check. This is the behaviour as it
  // shipped: lowercase, no normalisation.
  const oldMatches = (query: string, name: string) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = name.toLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  const before = REAL_NAMES.filter((n) => oldMatches("pushup", n));
  assert.ok(
    before.length < REAL_NAMES.length,
    "the unfixed matcher found everything, so this test is watching nothing",
  );
});

test("narrowing still works — it is not matching everything", () => {
  assert.ok(!matches("pushup", "Barbell Back Squat"), "the matcher has become too loose to narrow anything");
  assert.ok(matches("diamond push up", "Diamond Push Up"));
  assert.ok(!matches("diamond push up", "Plyo Push Up"), "every word must still be required");
});

test("both search surfaces use it", () => {
  const picker = readFileSync(join(process.cwd(), "src/components/MovementPicker.tsx"), "utf8");
  const sheet = readFileSync(join(process.cwd(), "src/components/AddWorkoutButton.tsx"), "utf8");
  for (const [file, src] of [["MovementPicker", picker], ["AddWorkoutButton", sheet]] as const) {
    assert.match(
      src,
      /replace\(\/\[\^a-z0-9\]\+\/g, ""\)/,
      `${file} is matching raw substrings again — "pushup" and "Push Up" have stopped being the same word`,
    );
  }
});

test("the movement search reads aliases too", () => {
  // A movement goes by more than one name — that is what the column is for.
  // Leaving it out of the search leaves out the answer.
  const picker = readFileSync(join(process.cwd(), "src/components/MovementPicker.tsx"), "utf8");
  assert.match(picker, /aliases/, "aliases are no longer searched");
  assert.match(picker, /everfit_name/, "the Everfit name is no longer searched");
});
