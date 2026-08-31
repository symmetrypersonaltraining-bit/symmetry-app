// "jenn is having issues clicking buttons, sometimes it wont click to log
// exercises."
//
// Every tick in the logger was disabled={saving}, and logSet() raised that one
// flag for the whole of two awaited round trips — ensureWorkoutLog(), then the
// set_logs upsert. So ticking ANY set disabled EVERY set, and Complete with
// them, until the write came back.
//
// On gym wi-fi that is a few hundred milliseconds to a couple of seconds in
// which the screen looks completely normal and does not respond. You tap again;
// the second tap is swallowed too. Nothing errors, nothing is logged, and it
// reads as the app being flaky.
//
// A set save is a fact about ONE set.
//
// The two operations that really are whole-session — logAllCurrentSets and
// completeWorkout — still raise the global flag and still block everything,
// which is right: neither can safely overlap a tick.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The per-set key, exactly as the component builds it. */
const setKey = (peId: string, si: number) => peId + ":" + si;

test("one set saving does not disable another set's tick", () => {
  const saving = new Set([setKey("pe-1", 0)]);
  const isSetSaving = (peId: string, si: number) => saving.has(setKey(peId, si));
  assert.equal(isSetSaving("pe-1", 0), true, "the set being written is busy");
  assert.equal(isSetSaving("pe-1", 1), false, "the NEXT set must stay tappable");
  assert.equal(isSetSaving("pe-2", 0), false, "a different exercise must stay tappable");
});

test("logSet no longer raises the global flag", () => {
  const fn = code.slice(code.indexOf("async function logSet("), code.indexOf("async function saveTypedSet") + 1);
  assert.ok(fn.length > 100, "logSet not found");
  assert.doesNotMatch(fn, /setSaving\(/, "logSet is freezing the whole logger again");
  assert.match(fn, /markSetSaving\(peId, si, true\)/);
  assert.match(fn, /finally \{ markSetSaving\(peId, si, false\); \}/);
});

test("both ticks gate on their own set", () => {
  const ticks = [...code.matchAll(/disabled=\{saving \|\| isSetSaving\(pe\.id, si\)\}/g)];
  assert.equal(ticks.length, 2, "expected the cardio tick and the strength tick");
  // And no tick is left on the bare global flag.
  const bare = [...code.matchAll(/logSet\(pe\.id, si\); \} \}\} disabled=\{saving\}/g)];
  assert.equal(bare.length, 0, "a tick is still disabled by any save anywhere");
});

test("a whole-session write still blocks everything", () => {
  // These two cannot safely overlap a tick, so they keep the global flag.
  for (const fn of ["logAllCurrentSets", "completeWorkout"]) {
    const body = code.slice(code.indexOf("async function " + fn));
    assert.match(body.slice(0, 400), /setSaving\(true\)/, fn + " no longer blocks the logger");
  }
});

test("concurrent ticks share one ensureWorkoutLog, and never share a failed one", () => {
  // Two ticks in flight both call it. It is already race-safe in the database
  // (workout_logs_one_open_per_day + the 23505 read-back), but the loser pays
  // an extra insert and read — the very latency this change removes.
  assert.match(code, /if \(ensureInFlight\.current\) return ensureInFlight\.current;/);
  // Cleared on settle. A cached REJECTION would turn one dropped request into a
  // session that can never save again.
  assert.match(code, /\.finally\(\(\) => \{ ensureInFlight\.current = null; \}\)/);
});
