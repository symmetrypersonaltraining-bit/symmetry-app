// ============================================================================
// THE ADD-WORKOUT SHEET, after 4 Sep 2026.
//
// Dustin, on the shipped sheet:
//
//   "add workouts does not show the type what I did option or manual workout
//    builder, thats the first issue. its there but at the very bottom of 100+
//    workoyts so Noone has seen it."
//
//   "3 definitely do not like that, fix it a replace shouod reolace what they
//    said not move anything."
//
//   "we need that view botton on all of these so they can see what it actually
//    is as well. maje sure we can view, then go back to that screen without
//    dropping the search."
//
// Four separate requirements, and three of them are the kind that quietly
// regress in a refactor — an entry point drifting back down a list, a helper
// creeping back in, a preview turning into a navigation. Each gets a check.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/components/AddWorkoutButton.tsx"), "utf8");

test("the two entry points come before the library list", () => {
  // They were literally underneath every workout in the house. Anything that
  // puts them back below the results puts them back out of sight.
  const custom = SRC.indexOf("Type what I did");
  const build = SRC.indexOf("Build my own");
  const list = SRC.indexOf("filtered.slice(0, 120)");
  assert.ok(custom > -1, "the 'type what I did' entry point is gone");
  assert.ok(build > -1, "the 'build my own' entry point is gone");
  assert.ok(list > -1, "the library list is gone — re-anchor this test");
  assert.ok(custom < list, "'type what I did' is below the library list again — nobody will find it");
  assert.ok(build < list, "'build my own' is below the library list again — nobody will find it");
});

test("adding never moves a session that is already scheduled", () => {
  // The pull-forward looked 7 days ahead for the same workout and MOVED that
  // row onto the chosen date. Dustin ruled it out: add adds, replace replaces
  // what was named, nothing else on the calendar moves on its own.
  assert.ok(
    !/pullForwardSlot|findSlotToPullForward/.test(SRC),
    "the pull-forward is back — adding a workout will silently move another one off its day",
  );
  const moves = SRC.match(/scheduled_date: pickedDate[^}]*moved_from_date/g) || [];
  assert.deepEqual(moves, [], "this sheet is writing a move again; it may only insert");
});

test("every result can be opened before it is added", () => {
  const row = SRC.slice(SRC.indexOf("filtered.slice(0, 120)"), SRC.indexOf("filtered.length === 0"));
  assert.match(row, /openPreview\(d\)/, "results no longer offer View — a list of names is a list of guesses");
  assert.match(row, /askOrAdd\(d\)/, "results no longer offer Add");
});

test("View is a layer over the sheet, not a navigation away from it", () => {
  // The whole point is coming back to the search you had. A router push, a
  // window.location, or closing the sheet all lose it.
  const preview = SRC.slice(SRC.indexOf("{preview ? ("), SRC.indexOf(") : ask ? ("));
  assert.ok(preview.length > 400, "the preview block moved — re-anchor this test before trusting it");
  assert.match(preview, /setPreview\(null\)/, "there is no way back from the preview");
  assert.ok(!/router\.push|window\.location/.test(preview), "the preview navigates away, so the search is lost");
  assert.ok(!/setQ\(""\)/.test(preview), "the preview clears the search box on the way in or out");
});

test("the preview shows client-facing section names only", () => {
  // The corrective vocabulary — Inhibit, Lengthen, Activate, Integrate — is the
  // internal engine and is never shown to a client.
  const preview = SRC.slice(SRC.indexOf("{preview ? ("), SRC.indexOf(") : ask ? ("));
  assert.ok(
    !/internal_name/.test(preview),
    "the preview is rendering internal_name — NASM language must never reach a client screen",
  );
  assert.match(SRC, /sec\.client_facing_name \|\|/, "the preview no longer prefers the client-facing name");
});

test("the filters cover what he asked for", () => {
  // "bodypart, difficulty, upper, lower, core, cardio, intention fir the workout"
  for (const needed of ["F_REGION", "F_FOCUS", "F_MODALITY", "F_INTENT", "F_DIFF"]) {
    assert.match(SRC, new RegExp(needed), `${needed} is gone — a filter he asked for has been dropped`);
  }
  assert.match(SRC, /"core", "Core"/, "core is no longer a region filter");
  assert.match(SRC, /"cardio", "Cardio"/, "cardio is no longer a type filter");
});

test("the AI sets the filters rather than answering with a shortlist", () => {
  // The point is options you can adjust. If it returned a list, a near miss
  // would cost a rephrase instead of one tap on a chip.
  const ask = SRC.slice(SRC.indexOf("async function askAi()"), SRC.indexOf("finally { setAiBusy(false); }"));
  assert.match(ask, /setFRegion\(/, "the AI reply no longer sets the region chip");
  assert.match(ask, /setFIntent\(/, "the AI reply no longer sets the intent chips");
  assert.match(ask, /setAiReading\(/, "the AI no longer says what it understood, so a wrong read is invisible");
  assert.ok(!/setLib\(/.test(ask), "the AI is replacing the library list instead of setting filters");
});
