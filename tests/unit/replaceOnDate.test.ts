// Replacing a workout has to remove the one it replaces, and has to be able to
// PROVE it did.
//
// Dustin's 17 Aug, which is the fixture below: he believed he had replaced his
// programmed walk with the stair master, and ended the day with both on his
// schedule. The path he used only adds. The path that replaces reported success
// without ever checking a row had changed.

import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionsReplacedBy,
  slotForReplacement,
  skipVerdict,
  describeReplaced,
  type DateOccupant,
} from "../../src/lib/replaceOnDate.ts";

const UPPER_PUSH = "27396d71";
const WALK = "dd11465e";
const STAIRS = "09446b26";

const occ = (o: Partial<DateOccupant> & { id: string; day_id: string }): DateOccupant => ({
  label: null,
  position: 1,
  status: "scheduled",
  deleted_at: null,
  ...o,
});

// Dustin's real 17 Aug, before the stair master went on.
const HIS_DAY: DateOccupant[] = [
  occ({ id: "938635a8", day_id: UPPER_PUSH, label: "Deload — Upper Push + Corrective", position: 1 }),
  occ({ id: "1a1bc3c9", day_id: WALK, label: "Deload — Cardio (20 min Walk)", position: 1 }),
];

// ─── what gets replaced ─────────────────────────────────────────────────────

test("both of his programmed sessions are candidates when the stair master goes on", () => {
  const hit = sessionsReplacedBy(HIS_DAY, STAIRS);
  assert.deepEqual(hit.map((h) => h.id).sort(), ["1a1bc3c9", "938635a8"]);
});

test("a finished session is never replaced — that would erase work he actually did", () => {
  const day = [
    occ({ id: "done", day_id: UPPER_PUSH, status: "completed", label: "Upper Push" }),
    occ({ id: "todo", day_id: WALK, label: "Walk" }),
  ];
  assert.deepEqual(sessionsReplacedBy(day, STAIRS).map((h) => h.id), ["todo"]);
});

test("a soft-deleted row is never resurrected as something to replace", () => {
  const day = [occ({ id: "gone", day_id: WALK, deleted_at: "2026-08-17T00:00:00Z" })];
  assert.deepEqual(sessionsReplacedBy(day, STAIRS), []);
});

test("replacing a session with ITSELF replaces nothing — that is a duplicate, not a swap", () => {
  const day = [occ({ id: "same", day_id: STAIRS, label: "Stair Master" })];
  assert.deepEqual(sessionsReplacedBy(day, STAIRS), [],
    "skipping the original to re-add it identical would log the day as abandoned while nothing changed on screen");
});

test("an empty day replaces nothing and that is not an error", () => {
  assert.deepEqual(sessionsReplacedBy([], STAIRS), []);
});

// ─── which slot the replacement takes ───────────────────────────────────────

test("the replacement lands in the lowest slot it displaces, not at the bottom", () => {
  const replaced = [
    occ({ id: "a", day_id: UPPER_PUSH, position: 3 }),
    occ({ id: "b", day_id: WALK, position: 2 }),
  ];
  assert.equal(slotForReplacement(replaced), 2);
});

test("replacing nothing still yields a valid first slot", () => {
  assert.equal(slotForReplacement([]), 1);
});

test("a null position does not poison the slot arithmetic", () => {
  const replaced = [
    occ({ id: "a", day_id: UPPER_PUSH, position: null }),
    occ({ id: "b", day_id: WALK, position: 4 }),
  ];
  assert.equal(slotForReplacement(replaced), 4);
  assert.equal(slotForReplacement([occ({ id: "a", day_id: WALK, position: null })]), 1);
});

// ─── THE GUARD ──────────────────────────────────────────────────────────────
// This is the whole point of the module. An update matching zero rows is not an
// error, so nothing below may pass by default.

test("a skip that changed nothing must NOT read as success", () => {
  const verdict = skipVerdict(HIS_DAY, []);
  assert.ok(verdict, "zero rows changed is the exact failure that shipped — it has to speak up");
  assert.match(verdict!, /still there/);
});

test("the all-missed message names every session it failed to clear", () => {
  const verdict = skipVerdict(HIS_DAY, [])!;
  assert.match(verdict, /Deload — Upper Push \+ Corrective/);
  assert.match(verdict, /Deload — Cardio \(20 min Walk\)/);
});

test("a partial skip is still a failure — one left behind is the bug he reported", () => {
  const verdict = skipVerdict(HIS_DAY, ["938635a8"]);
  assert.ok(verdict, "clearing one of two still leaves him looking at a day that did not swap");
  assert.match(verdict!, /Deload — Cardio \(20 min Walk\)/);
  assert.doesNotMatch(verdict!, /Upper Push/, "do not name a session that WAS cleared");
});

test("every expected row skipped is the only silent case", () => {
  assert.equal(skipVerdict(HIS_DAY, ["938635a8", "1a1bc3c9"]), null);
});

test("expecting nothing is silent — an add-as-well is not a failed replace", () => {
  assert.equal(skipVerdict([], []), null);
});

test("ids returned that were never expected do not mask a missed row", () => {
  const verdict = skipVerdict(HIS_DAY, ["938635a8", "somebody-elses-row"]);
  assert.ok(verdict, "a count check alone would have passed this; identity is what matters");
  assert.match(verdict!, /Deload — Cardio \(20 min Walk\)/);
});

// ─── the prompt wording ─────────────────────────────────────────────────────

test("the prompt names what it is about to replace", () => {
  assert.equal(describeReplaced(HIS_DAY),
    "Deload — Upper Push + Corrective and Deload — Cardio (20 min Walk)");
});

test("one session reads as one thing, three read as a list", () => {
  assert.equal(describeReplaced([HIS_DAY[0]]), "Deload — Upper Push + Corrective");
  assert.equal(
    describeReplaced([
      occ({ id: "a", day_id: "1", label: "A" }),
      occ({ id: "b", day_id: "2", label: "B" }),
      occ({ id: "c", day_id: "3", label: "C" }),
    ]),
    "A, B and C",
  );
});

test("an unlabelled session still produces a readable prompt", () => {
  assert.equal(describeReplaced([occ({ id: "a", day_id: "1" })]), "what's already scheduled");
});
