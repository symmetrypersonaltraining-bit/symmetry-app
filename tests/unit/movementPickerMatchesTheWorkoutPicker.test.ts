// ============================================================================
// BUILD MY OWN gets the same search as ADD A WORKOUT.
//
// Dustin, 4 Sep: "now we need to do pretty much the same thing with taht build
// my own button. it needs to function the same where we can search movements
// from movement library with filters, ai, etc."
//
// "The same" is the requirement, so these check the shape matches: filters, an
// Ask that sets those filters, a View on every result, and a picker that layers
// over the builder instead of navigating away from a half-typed workout.
//
// Two of them are safety rules rather than parity, and they matter more:
// excluded movements must never be offered, and the corrective vocabulary must
// never reach a client's screen.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments explain the rules; only the CODE can break them. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PICKER = read("src/components/MovementPicker.tsx");
const BUILDER = read("src/components/ManualWorkoutBuilder.tsx");
const ROUTE = read("src/app/api/movement-search/route.ts");

test("an excluded movement is never offered", () => {
  // Rule 13: never program an Excluded movement. This is one of the surfaces
  // that could, so it is one of the surfaces that must not.
  assert.match(
    PICKER,
    /availability_status \|\| "available"\) !== "excluded"/,
    "the picker no longer filters out excluded movements — they can be programmed again",
  );
});

test("the corrective vocabulary never reaches this screen", () => {
  // Inhibit / Lengthen / Activate / Integrate is the internal engine. It is on
  // the exercise row, which is exactly why it has to be kept off the screen
  // deliberately rather than by luck.
  const code = strip(PICKER);
  assert.ok(
    !/corrective_phase_tags/.test(code),
    "the picker is reading corrective_phase_tags — NASM language must never be shown to a client",
  );
  for (const word of ["Inhibit", "Lengthen", "Activate", "Integrate"]) {
    assert.ok(!new RegExp(word).test(code), `${word} appears in the picker's UI, not just its comments`);
  }
});

test("it filters on what the library actually knows", () => {
  for (const group of ["M_MUSCLE", "M_MODALITY", "M_EQUIP"]) {
    assert.match(PICKER, new RegExp(group), `${group} is gone — a filter has been dropped`);
  }
});

test("free text still works, so the library is not a cage", () => {
  // "red band pull-apart" is a real thing somebody types and no library has to
  // contain it. The picker is an option, never a gate.
  assert.match(
    BUILDER,
    /onChange=\{\(e\) => update\(i, \{ name: e\.target\.value \}\)\}/,
    "the exercise name is no longer typeable — the picker has become a requirement",
  );
  assert.match(BUILDER, /setPicking\(i\)/, "there is no way to open the picker from a row");
});

test("the picker layers over the builder rather than navigating away", () => {
  // A half-typed workout must survive going to look for a movement.
  assert.match(BUILDER, /if \(picking !== null\)/, "the picker is no longer rendered in place of the builder");
  assert.ok(
    !/router\.push|window\.location/.test(PICKER),
    "the picker navigates away, so a half-built workout would be lost",
  );
});

test("every result can be viewed before it is chosen", () => {
  assert.match(PICKER, /setDetail\(e\)/, "results no longer offer View");
  assert.match(PICKER, /onPick\(e\.name\)/, "results no longer offer Use");
  assert.match(PICKER, /Watch the demo/, "the detail view no longer offers the movement's video");
});

test("the AI sets filters and never names a movement", () => {
  // Same contract as the workout library: the model returns a filter over a
  // closed vocabulary and the database — here, the in-memory list of real rows
  // — does the matching. A model that named movements could name one that does
  // not exist.
  assert.ok(!/exercise_id|"name"/.test(ROUTE.split("const SYSTEM")[1] || ""), "the prompt invites the model to name movements");
  assert.match(ROUTE, /never name an exercise/i, "the prompt no longer forbids naming an exercise");
  const ask = PICKER.slice(PICKER.indexOf("async function askAi()"), PICKER.indexOf("finally { setAiBusy(false); }"));
  assert.match(ask, /setFMuscle\(/, "the AI reply no longer sets the body-part chips");
  assert.match(ask, /setAiReading\(/, "the AI no longer says what it understood");
  assert.ok(!/setAll\(/.test(ask), "the AI is replacing the movement list instead of setting filters");
});

test("a missing key degrades to a name search rather than an outage", () => {
  assert.match(ROUTE, /if \(!apiKey\)/, "the route no longer has a no-key path");
  assert.match(ROUTE, /interpreted: false/, "the no-key path does not tell the caller it was not interpreted");
});
