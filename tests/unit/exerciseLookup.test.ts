// Exercise name matching — the rules that decide whether a movement already
// exists or a new row gets created.
//
// Three "it's missing, add it" reports landed on 10 Aug alone. All three were
// already in the library under different wording:
//
//   "seated leg curl machine"  → "Seated Hamstring Curl Machine" (14 Jul)
//   "box bridge"               → "Box Glute Bridge"
//   "ball bridge"              → "Ball Glute Bridge"
//
// When the AI resolvers miss, they INSERT. So a miss is not a failed search,
// it is a duplicate — which is how 67 of them accumulated by July.

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExerciseName,
  namesMatch,
  rowMatchesName,
  preferShared,
} from "../../src/lib/exerciseLookup.ts";

// ─── normalisation ──────────────────────────────────────────────────────────

test("case and surrounding whitespace are ignored", () => {
  assert.ok(namesMatch("Seated Leg Curl Machine", "  seated leg curl MACHINE "));
});

test("punctuation and internal spacing are ignored", () => {
  assert.ok(namesMatch("Machine-Assisted Pull Up", "Machine Assisted Pull-Up"));
  assert.ok(namesMatch("Seated Leg Curl (Machine)", "Seated Leg Curl Machine"));
  assert.ok(namesMatch("Dumbbell  Row", "Dumbbell Row"));
});

test("an empty or whitespace-only name never matches anything", () => {
  assert.equal(namesMatch("", ""), false);
  assert.equal(namesMatch("   ", "Squat"), false);
  assert.equal(normalizeExerciseName(""), "");
});

// ─── it must NOT fuzzy match ────────────────────────────────────────────────

test("different movements do not match, however similar the words", () => {
  // Logging a client's sets against the wrong movement is worse than a
  // duplicate, so nothing here is allowed to be clever.
  const pairs: [string, string][] = [
    ["Seated Leg Curl", "Single Leg Curl"],
    ["Leg Press", "Leg Press Machine"],
    ["Box Glute Bridge", "Ball Glute Bridge"],
    ["Seated Leg Curl Machine", "Seated Leg Extension Machine"],
    ["Front Squat", "Back Squat"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(namesMatch(a, b), false, `"${a}" must not match "${b}"`);
  }
});

test("a word in the middle is NOT ignored — that needs an explicit alias", () => {
  // "Box Bridge" and "Box Glute Bridge" really are the same movement, but the
  // rule that merged them automatically would also merge things that are not.
  // Search finds it by token; identity requires an alias someone wrote down.
  assert.equal(namesMatch("Box Bridge", "Box Glute Bridge"), false);
});

// ─── aliases ────────────────────────────────────────────────────────────────

const SEATED_LEG_CURL = {
  id: "f821398a",
  name: "Seated Leg Curl Machine",
  aliases: ["Seated Hamstring Curl Machine", "Seated Leg Curl", "Seated Hamstring Curl", "Leg Curl Machine"],
  client_owner_id: null,
};

test("a row answers to its own name", () => {
  assert.ok(rowMatchesName(SEATED_LEG_CURL, "Seated Leg Curl Machine"));
  assert.ok(rowMatchesName(SEATED_LEG_CURL, "seated leg curl machine"));
});

test("a row answers to every one of its aliases", () => {
  // The real regression this prevents: asking the AI for the machine by its
  // OLD name after the 10 Aug rename would otherwise mint a second row.
  for (const a of SEATED_LEG_CURL.aliases) {
    assert.ok(rowMatchesName(SEATED_LEG_CURL, a), `should answer to "${a}"`);
  }
});

test("a row does not answer to a name it has no claim to", () => {
  assert.equal(rowMatchesName(SEATED_LEG_CURL, "Leg Extension Machine"), false);
  assert.equal(rowMatchesName(SEATED_LEG_CURL, "Prone Lying Hamstring Curl Machine"), false);
});

test("rows with no aliases still match on name alone", () => {
  assert.ok(rowMatchesName({ name: "Goblet Squat", aliases: null }, "goblet squat"));
  assert.equal(rowMatchesName({ name: "Goblet Squat", aliases: null }, "Front Squat"), false);
});

// ─── shared beats personal ──────────────────────────────────────────────────

test("the shared library row wins over a client-owned copy", () => {
  // Two clients doing the same movement must land on the same exercise or
  // their history stops being comparable.
  const rows = [
    { id: "personal", client_owner_id: "client-1" },
    { id: "shared", client_owner_id: null },
  ];
  assert.equal(preferShared(rows, "client-1"), "shared");
});

test("failing that, the caller's own copy wins over someone else's", () => {
  const rows = [
    { id: "someone-else", client_owner_id: "client-2" },
    { id: "mine", client_owner_id: "client-1" },
  ];
  assert.equal(preferShared(rows, "client-1"), "mine");
});

test("preferShared handles the empty case", () => {
  assert.equal(preferShared([], "client-1"), null);
});
