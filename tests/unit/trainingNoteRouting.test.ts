// Guard: movement notes that need Dustin reach him; bookkeeping does not.
//
// Dustin, 15 Aug: "filter the ai stuff. if I need to deal w it send to me, if
// not, send to ai feedback."
//
// The cases below are REAL notes out of exercise_notes, not invented ones. The
// two that matter most are Jennifer's four loads on 15 Aug (three pushes in
// ninety minutes, nothing to answer) and Claudine's knee on 12 Aug — a symptom
// on a corrective client, which is what a wholesale mute would have buried.
//
// The bias is deliberate and asymmetric: a wrongly-delivered note costs one
// skimmed line, a wrongly-swallowed one costs a client who said their knee hurt
// and heard nothing. So the false-negative tests below are the load-bearing
// ones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeTrainingNote } from "../../src/lib/trainingNoteRouting";

const deliver = (n: string) =>
  assert.equal(routeTrainingNote(n), "deliver", `should have reached him: ${JSON.stringify(n)}`);
const quiet = (n: string) =>
  assert.equal(routeTrainingNote(n), "record-only", `should not have buzzed: ${JSON.stringify(n)}`);

test("real symptoms reach him — these are the ones that must never be swallowed", () => {
  // Claudine, 12 Aug, corrective client. The note this whole filter is built
  // around not losing.
  deliver("left knee has been feeling uncomfortable. did roll and stretch calves beforehand.");
  // Dustin's own, 12 Aug.
  deliver("Feeling that bicep tendon a lot on here");
  deliver("shoulder was sore today");
  deliver("sharp pain in my lower back on the second set");
  deliver("knee gave out");
  deliver("had to stop halfway");
  deliver("felt a twinge");
  deliver("my hip was tight the whole time");
});

test("questions and app problems reach him", () => {
  // Bobbie, 13 Aug.
  deliver("The video attached to this movement doesn't really help.");
  deliver("should i go heavier next week");
  deliver("can you swap this out");
  deliver("not sure if I'm doing this right");
  // A bare question mark is enough on its own.
  deliver("this one?");
});

test("bookkeeping stays quiet — Jennifer's 15 Aug run", () => {
  // The four that prompted "should this be coming to my inbox?".
  quiet("22.5 at PF");
  quiet("12.5 at PF");
  quiet("I used a bar at PF");
  quiet("PF chin up 60 lbs");
});

test("other real bookkeeping stays quiet", () => {
  quiet("Used the hip thrust machine instead"); // Lauren, 13 Aug
  quiet("Did stair master this time");          // Madeleine, 12 Aug
  quiet("Stair master again!");                 // Madeleine, 13 Aug
  quiet("1 mile");                              // Dustin, 14 Aug
  quiet("110 lb assist");
  quiet("used 40s");
});

test("a symptom buried inside bookkeeping still reaches him", () => {
  // The dangerous shape: it LOOKS like a load note, and it is not.
  deliver("22.5 at PF, shoulder hurt");
  deliver("used the machine instead, knee was bothering me");
  deliver("did stair master, felt dizzy");
});

test("anything unrecognised is delivered, not swallowed", () => {
  // The default has to fall this way. If an unknown shape went quiet, every
  // future phrasing nobody thought of would vanish silently.
  deliver("the thing on the left was doing the weird thing again");
  deliver("gym was packed so I improvised the whole session honestly");
  deliver("asdf");
});

test("long notes are prose, and prose is somebody explaining something", () => {
  const long =
    "started with the bar to warm up then worked up to a moderate weight and " +
    "everything moved well the whole way through, felt strong today";
  assert.ok(long.length > 80);
  deliver(long);
});

test("symptom words match whole words, not substrings", () => {
  // "bad" and "cant" are both in the symptom list. Substring matching would
  // fire on a cantilever bar and route a plain equipment note as a complaint.
  quiet("used the cantilever bar");
  quiet("3 bands");
  // …while the real words still fire.
  deliver("bad form today");
  deliver("cant lock it out");
  // "badminton warmup" is not asserted either way on purpose: it is neither a
  // symptom nor a recognised bookkeeping shape, so it delivers by DEFAULT, and
  // a test asserting that would be testing the default rather than the word
  // matching it claims to test.
});

test("an empty note never buzzes him", () => {
  quiet("");
  quiet("   ");
});

test("the split is real on the actual sample, not just per-case", () => {
  // Every note in exercise_notes from 12–15 Aug, with the routing intended.
  const sample: [string, "deliver" | "record-only"][] = [
    ["I used a bar at PF", "record-only"],
    ["12.5 at PF", "record-only"],
    ["22.5 at PF", "record-only"],
    ["PF chin up 60 lbs", "record-only"],
    ["1 mile", "record-only"],
    ["Stair master again!", "record-only"],
    ["The video attached to this movement doesn't really help.", "deliver"],
    ["Used the hip thrust machine instead", "record-only"],
    ["Did stair master this time", "record-only"],
    ["left knee has been feeling uncomfortable. did roll and stretch calves beforehand.", "deliver"],
    ["Feeling that bicep tendon a lot on here", "deliver"],
  ];
  const wrong = sample.filter(([n, want]) => routeTrainingNote(n) !== want);
  assert.deepEqual(wrong, [], `misrouted: ${JSON.stringify(wrong)}`);
  // 8 of 11 stop buzzing him; the 3 that mattered still land.
  assert.equal(sample.filter(([n]) => routeTrainingNote(n) === "deliver").length, 3);
});

test("the logger actually consults the router before messaging him", () => {
  // The filter is worthless if the call site still sends unconditionally. This
  // is the only assertion here that touches the workout logger, and it reads
  // the file rather than changing it.
  const src = readFileSync(
    join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
    "utf8"
  ).replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    src,
    /if \(!isTrainerSession && routeTrainingNote\(row\.note\) === "deliver"\)/,
    "the message copy must be gated on the router"
  );
  // The exercise_notes insert must still be unconditional — the AI sees every
  // note whatever the router decides, and that is what makes this safe.
  const insertIdx = src.indexOf('.from("exercise_notes").insert(row)');
  const gateIdx = src.indexOf("routeTrainingNote(row.note)");
  assert.ok(insertIdx > 0, "the exercise_notes insert should still be there");
  assert.ok(insertIdx < gateIdx, "the note must be recorded BEFORE any routing decision");
});
