import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("src/components/AddWorkoutButton.tsx", "utf8");

// "when they search for a workout, it should search the description. that way if
// they search for chest strength and balance, or something like that it will
// find the most appropriate workouts. also they can search beginner,
// intermediate, advanced, hard, easy." — Dustin, 3 Sep

test("search reads the description and the difficulty, not only the title", () => {
  assert.ok(
    !/lib\.filter\(\(d\) => d\.label\.toLowerCase\(\)\.includes\(q\.toLowerCase\(\)\)\)/.test(src),
    "search matches the label alone again — a chest session named 'Upper Push A' is invisible"
  );
  assert.match(src, /d\.description/, "the description must be part of what is searched");
  assert.match(src, /d\.difficulty/, "difficulty must be searchable — beginner, intermediate, advanced");
});

test("the query is split into words, so a multi-word search is AND not a phrase", () => {
  // "chest strength balance" appears in no description as that exact run of
  // characters. A substring test on the whole query finds nothing.
  assert.match(src, /q\.toLowerCase\(\)\.split\(/, "the query must be split into terms");
  assert.match(src, /terms\.every\(/, "every term must match, or it is a phrase search wearing a disguise");
});

test("the columns are actually fetched", () => {
  const selects = src.match(/\.select\("id, label[^"]*"\)/g) || [];
  assert.ok(selects.length >= 2, "expected both library reads to select day columns");
  for (const sel of selects) {
    assert.match(sel, /description/, `${sel} does not fetch the description it claims to search`);
    assert.match(sel, /difficulty/, `${sel} does not fetch difficulty`);
  }
});
