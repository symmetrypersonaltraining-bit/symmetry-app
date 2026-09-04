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
  // RE-ANCHORED 4 Sep. Both reads now share one DAY_COLS constant instead of
  // repeating the column list, which is strictly harder to get wrong — but it
  // means the old regex, which looked for two literal select strings, found
  // none. This asserts the same thing through the constant: both library reads
  // go through it, and it fetches everything the search claims to read.
  const cols = src.match(/const DAY_COLS = "([^"]+)"/);
  assert.ok(cols, "DAY_COLS is gone — the two library reads no longer share a column list");
  assert.match(cols![1], /description/, "DAY_COLS does not fetch the description it claims to search");
  assert.match(cols![1], /difficulty/, "DAY_COLS does not fetch difficulty");
  const reads = src.match(/\.select\(DAY_COLS\)/g) || [];
  assert.ok(reads.length >= 2, `expected both library reads to use DAY_COLS, found ${reads.length}`);
});
