// Grouping a section into the blocks a person actually performs.
//
// superset_group had been written by the trainer, selected in four queries and
// typed in three files, and read by nothing. Claudine's Tuesday Strength — two
// pairs and a carry — rendered as five identical numbered cards.

import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSection, memberLabel, isImmediate, restLabel, membersInRound,
  type SupersetPe, type GroupBlock,
} from "../../src/lib/supersets";

const pe = (position: number, superset_group: string | null, sets = 3, rest: string | null = null): SupersetPe =>
  ({ id: "pe" + position, position, sets, rest, superset_group });

// Claudine's Tuesday Strength, exactly as tagged.
const TUE_STRENGTH = [
  pe(1, "A", 4, "0"),    // Pendulum Squat
  pe(2, "A", 4, "75s"),  // Machine Assisted Pull Up
  pe(3, "B", 4, "0"),    // Hip Thrust Machine
  pe(4, "B", 4, "75s"),  // Dumbbell Push Press
  pe(5, "C", 4, "60s"),  // Farmer Carry — alone
];

test("two pairs and a carry, not five cards", () => {
  const blocks = groupSection(TUE_STRENGTH);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.kind), ["group", "group", "single"]);
  assert.equal((blocks[0] as GroupBlock<SupersetPe>).label, "A");
  assert.equal((blocks[1] as GroupBlock<SupersetPe>).label, "B");
});

test("a group of one is an ordinary movement, not a superset of nothing", () => {
  // Farmer Carry is tagged C to mark it as the third block, not to pair it.
  const blocks = groupSection(TUE_STRENGTH);
  assert.equal(blocks[2].kind, "single");
});

test("members keep their programmed order", () => {
  const g = groupSection(TUE_STRENGTH)[0] as GroupBlock<SupersetPe>;
  assert.deepEqual(g.members.map((m) => m.position), [1, 2]);
  assert.equal(memberLabel(g.label, 0), "A1");
  assert.equal(memberLabel(g.label, 1), "A2");
});

test("a block takes the place of its first member", () => {
  // Order of appearance decides, so the client reads the section top to bottom
  // in the order it is performed.
  const blocks = groupSection([pe(1, null), pe(2, "A"), pe(3, "B"), pe(4, "A"), pe(5, "B")]);
  assert.deepEqual(blocks.map((b) => b.kind), ["single", "group", "group"]);
  assert.deepEqual((blocks[1] as GroupBlock<SupersetPe>).members.map((m) => m.position), [2, 4]);
});

test("untagged movements are left alone", () => {
  const blocks = groupSection([pe(1, null), pe(2, null), pe(3, "  ")]);
  assert.deepEqual(blocks.map((b) => b.kind), ["single", "single", "single"]);
});

// ─── rounds ─────────────────────────────────────────────────────────────────

test("the longest member decides how many rounds there are", () => {
  // Claudine's Accessory D: Adductor Machine 3x15 paired with Copenhagen Hold
  // 2x20s. Three rounds, and the third has one movement in it.
  const g = groupSection([pe(1, "D", 3, "0"), pe(2, "D", 2, "60s")])[0] as GroupBlock<SupersetPe>;
  assert.equal(g.rounds, 3);
  assert.equal(membersInRound(g, 0).length, 2);
  assert.equal(membersInRound(g, 1).length, 2);
  assert.equal(membersInRound(g, 2).length, 1, "the shorter movement must drop out, not show a set it has not got");
  assert.equal(membersInRound(g, 2)[0].position, 1);
});

test("a triplet is a circuit, not two supersets", () => {
  // 29 of the 91 groups in the live data have three or more members —
  // "P3 C — Full Body Circuit" runs Goblet Squat / Incline Row / RDL together.
  const g = groupSection([pe(1, "C", 4), pe(2, "C", 4), pe(3, "C", 4)])[0] as GroupBlock<SupersetPe>;
  assert.equal(g.members.length, 3);
  assert.equal(memberLabel(g.label, 2), "A3");
});

test("a movement with no set count still gets one round", () => {
  const g = groupSection([pe(1, "A", null), pe(2, "A", null)])[0] as GroupBlock<SupersetPe>;
  assert.equal(g.rounds, 1);
  assert.equal(membersInRound(g, 0).length, 2);
});

// ─── labels come from position, never from the tag ──────────────────────────

test("the tag is not the label", () => {
  // Live data holds three conventions at once: bare letters, warmup-A /
  // cooldown-A, and FIN. Normalising them would MERGE warmup-A and cooldown-A,
  // which share a section. So grouping keys off the tag and the label is
  // positional.
  const blocks = groupSection([
    pe(1, "warmup-A"), pe(2, "warmup-A"),
    pe(3, "cooldown-A"), pe(4, "cooldown-A"),
  ]);
  const [a, b] = blocks as GroupBlock<SupersetPe>[];
  assert.equal(a.label, "A");
  assert.equal(b.label, "B", "two different tags must never share a display letter");
  assert.equal(a.tag, "warmup-A");
  assert.equal(b.tag, "cooldown-A");
});

test("FIN groups like anything else", () => {
  const g = groupSection([pe(1, "FIN"), pe(2, "FIN"), pe(3, "FIN")])[0] as GroupBlock<SupersetPe>;
  assert.equal(g.members.length, 3);
  assert.equal(g.label, "A");
});

test("grouping never spans sections, because it is only ever given one", () => {
  // The guarantee is structural: groupSection takes a single section's list.
  // On "Gym B — Upper (Supported)" the letters A and B are each used once in
  // Primary Strength and again in Accessory Strength, so a day-scoped version
  // would weld two unrelated pairs into one four-movement block.
  const primary = groupSection([pe(1, "A"), pe(2, "A")]);
  const accessory = groupSection([pe(3, "A"), pe(4, "A")]);
  assert.equal((primary[0] as GroupBlock<SupersetPe>).members.length, 2);
  assert.equal((accessory[0] as GroupBlock<SupersetPe>).members.length, 2);
});

// ─── rest ───────────────────────────────────────────────────────────────────

test("zero rest means go straight into the next movement", () => {
  for (const r of ["0", "0s", "0 sec", "0 seconds", "none", "-", "—", " 0 "]) {
    assert.ok(isImmediate(r), "not read as immediate: " + JSON.stringify(r));
  }
  assert.equal(restLabel("0"), "straight into the next movement");
});

test("a real rest interval is still a rest interval", () => {
  for (const r of ["75s", "60s", "90 sec", "2 min"]) {
    assert.ok(!isImmediate(r), "wrongly read as immediate: " + r);
  }
  assert.equal(restLabel("75s"), "rest 75s");
  assert.equal(restLabel("2 min"), "rest 2 min");
});

test("no rest on file says nothing rather than guessing", () => {
  assert.equal(restLabel(null), null);
  assert.equal(restLabel(""), null);
  assert.equal(isImmediate(null), false);
  assert.equal(isImmediate(""), false);
});


// ─── Claudine's two solo days, exactly as tagged in the database ────────────

const THU_STRENGTH = [
  pe(1, "A", 4, "0"),    // Angled Leg Press 4x15
  pe(2, "A", 4, "75s"),  // Cable Seated Row 4x12
  pe(3, "B", 3, "0"),    // Lateral Squat 3x12 ea
  pe(4, "B", 3, "60s"),  // Kettlebell Floor Press 3x12 ea
  pe(5, "C", 3, "60s"),  // Prone Lying Hamstring Curl — alone
];
const THU_ACCESSORY = [
  pe(1, "D", 3, "0"),    // Battle Rope Alternating Waves
  pe(2, "D", 3, "45s"),  // Cable Pallof Press
  pe(3, "E", 3, "0"),    // Kettlebell Gorilla Row
  pe(4, "E", 3, "45s"),  // Hanging Knee Raise
];
const TUE_ACCESSORY = [
  pe(1, "D", 3, "0"),    // Adductor Machine 3x15
  pe(2, "D", 2, "60s"),  // Copenhagen Adductor Hold 2x20s
];

test("Thursday Strength: two pairs and a standalone curl", () => {
  const blocks = groupSection(THU_STRENGTH);
  assert.deepEqual(blocks.map((b) => b.kind), ["group", "group", "single"]);
  const [a, b] = blocks as GroupBlock<SupersetPe>[];
  assert.equal(a.rounds, 4);
  assert.equal(b.rounds, 3);
});

test("Thursday Accessory: two pairs, four rounds of nothing missing", () => {
  const blocks = groupSection(THU_ACCESSORY) as GroupBlock<SupersetPe>[];
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((x) => x.label), ["A", "B"]);
  for (const g of blocks) {
    assert.equal(g.rounds, 3);
    for (let r = 0; r < 3; r++) assert.equal(membersInRound(g, r).length, 2);
  }
});

test("Tuesday Accessory: the uneven pair drops to one movement in round three", () => {
  // This is the case that would have shown an empty input box.
  const g = groupSection(TUE_ACCESSORY)[0] as GroupBlock<SupersetPe>;
  assert.equal(g.rounds, 3);
  assert.deepEqual(membersInRound(g, 2).map((m) => m.position), [1],
    "the Copenhagen hold only has two sets and must not appear in the third round");
});

test("every first movement of a pair says go straight into the next", () => {
  for (const section of [TUE_STRENGTH, THU_STRENGTH, THU_ACCESSORY, TUE_ACCESSORY]) {
    for (const block of groupSection(section)) {
      if (block.kind !== "group") continue;
      const last = block.members[block.members.length - 1];
      for (const m of block.members) {
        if (m === last) {
          assert.ok(!isImmediate(m.rest), "the last movement of a pair must carry the real rest");
        } else {
          assert.equal(restLabel(m.rest), "straight into the next movement");
        }
      }
    }
  }
});

// ─── the logger actually uses it ────────────────────────────────────────────
//
// The whole point of this change is that superset_group stopped being read
// from the database and thrown away. That is a fact about the logger, not
// about this module, so it is asserted against the logger's source.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const logger = readFileSync(
  join(import.meta.dirname, "..", "..", "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the logger groups a section instead of mapping it flat", () => {
  assert.match(logger, /groupSection\(__list as never\)/,
    "the section is still rendered as a flat list");
  assert.ok(!/currentSection\?\.prescribed_exercises\.map\(/.test(logger),
    "the old flat map is still there");
});

test("the logger draws a group round by round, not movement by movement", () => {
  assert.match(logger, /Array\.from\(\{ length: block\.rounds \}/,
    "rounds are not the outer loop, so it is still all-sets-of-A1-then-A2");
  assert.match(logger, /membersInRound</, "a short member would show a set it has not got");
});

test("every input in a group card goes through the same handlers as an ordinary card", () => {
  // Two layouts for one set is exactly how a screen comes to disagree with
  // itself. The arrangement differs; what a set MEANS must not.
  const grp = logger.slice(logger.indexOf("const renderGroupBlock"));
  const card = grp.slice(0, grp.indexOf("return __blocks.map"));
  for (const fn of ["updateSet(m.id, r", "logSet(m.id, r)", "unlogSet(m.id, r)", "saveTypedSet(m.id, r)"]) {
    assert.ok(card.includes(fn), "group card does not call " + fn);
  }
  assert.match(card, /fieldCfg\[m\.id\] \|\| defaultTrackedFields\(m\)/,
    "the group card resolves tracked fields its own way");
});

test("rest is rendered, not just used to start a timer", () => {
  const grp = logger.slice(logger.indexOf("const renderGroupBlock"));
  assert.match(grp, /restLabel\(m\.rest\)/, "rest still reaches the client as silence");
  assert.match(grp, /isImmediate\(m\.rest\)/);
});
