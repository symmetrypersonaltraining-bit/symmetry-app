// The per-set timer. Dustin, 12–13 Aug: the clock moves onto the set it times,
// and every set can be flipped between countdown and stopwatch.
//
// The one that matters most here is DRIFT. The timer is wall-clock derived, so
// these tests jump `now` forward by minutes at a time — which is precisely what
// a backgrounded phone does to a setInterval-based timer. A counter build fails
// every one of these; this one cannot.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newTimer, defaultMode, start, pause, reset, setMode, toggleMode,
  elapsedSecs, remainingSecs, displaySecs, isExpired, isRunning,
  outcomeOnStop, startOnly,
} from "../../src/lib/setTimer.ts";

const T0 = 1_700_000_000_000; // any fixed epoch; nothing here reads the clock

test("a programmed time counts down, no programmed time is a stopwatch", () => {
  assert.equal(defaultMode(30), "timer");
  assert.equal(defaultMode(null), "stopwatch");
  assert.equal(defaultMode(0), "stopwatch");
  assert.equal(newTimer(20).mode, "timer");
  assert.equal(newTimer(null).mode, "stopwatch");
});

test("a stopwatch reads 0:00 before it is started, never the target", () => {
  // Showing the programmed target on a stopwatch face makes a goal look like
  // something already done.
  const sw = setMode(newTimer(20), "stopwatch");
  assert.equal(displaySecs(sw, T0), 0);
});

test("a countdown shows the full target before it is started", () => {
  assert.equal(displaySecs(newTimer(20), T0), 20);
});

test("countdown runs down and stops at zero", () => {
  const st = start(newTimer(20), T0);
  assert.equal(displaySecs(st, T0 + 5_000), 15);
  assert.equal(displaySecs(st, T0 + 20_000), 0);
  assert.equal(displaySecs(st, T0 + 90_000), 0, "never goes negative");
  assert.equal(isExpired(st, T0 + 20_000), true);
  assert.equal(isExpired(st, T0 + 19_000), false);
});

test("stopwatch counts up from zero", () => {
  const st = start(newTimer(null), T0);
  assert.equal(displaySecs(st, T0 + 1_000), 1);
  assert.equal(displaySecs(st, T0 + 62_000), 62);
  assert.equal(isExpired(st, T0 + 62_000), false, "a stopwatch never expires");
});

test("backgrounding the phone does not lose time", () => {
  // The whole reason this is wall-clock derived. Ten minutes pass with no tick
  // delivered at all; the reading is still correct.
  const sw = start(newTimer(null), T0);
  assert.equal(elapsedSecs(sw, T0 + 600_000), 600);
  const cd = start(newTimer(45), T0);
  assert.equal(remainingSecs(cd, T0 + 600_000), 0);
  assert.equal(isExpired(cd, T0 + 600_000), true);
});

test("pause banks the time and resuming continues from there", () => {
  let st = start(newTimer(null), T0);
  st = pause(st, T0 + 7_000);
  assert.equal(isRunning(st), false);
  assert.equal(elapsedSecs(st, T0 + 999_000), 7, "a paused clock does not move");
  st = start(st, T0 + 999_000);
  assert.equal(elapsedSecs(st, T0 + 1_002_000), 10, "3 more seconds on top of 7");
});

test("a countdown pauses and resumes without losing the remainder", () => {
  let st = start(newTimer(30), T0);
  st = pause(st, T0 + 10_000);
  assert.equal(remainingSecs(st, T0 + 500_000), 20);
  st = start(st, T0 + 500_000);
  assert.equal(remainingSecs(st, T0 + 505_000), 15);
});

test("restarting a finished countdown starts it over, not at zero", () => {
  let st = start(newTimer(20), T0);
  st = pause(st, T0 + 25_000);        // ran past the end
  assert.equal(remainingSecs(st, T0 + 25_000), 0);
  st = start(st, T0 + 30_000);
  assert.equal(remainingSecs(st, T0 + 30_000), 20, "second set gets the full time");
});

test("flipping the mode starts the new clock from scratch", () => {
  // "toggle from timer to stopwatch STARTING FROM ZERO" — 13 Aug.
  let st = start(newTimer(30), T0);
  st = setMode(st, "stopwatch");
  assert.equal(isRunning(st), false, "flipping mid-run stops the clock");
  assert.equal(displaySecs(st, T0 + 60_000), 0, "stopwatch begins at zero");
  st = start(st, T0 + 60_000);
  assert.equal(displaySecs(st, T0 + 63_000), 3);
  // ...and back again gets the whole programmed time, not what the stopwatch read
  st = toggleMode(st);
  assert.equal(st.mode, "timer");
  assert.equal(displaySecs(st, T0 + 63_000), 30);
});

test("setting the mode it is already in changes nothing", () => {
  const st = start(newTimer(30), T0);
  assert.equal(setMode(st, "timer"), st, "no needless reset of a running clock");
});

test("a countdown with no target cannot be started", () => {
  const st = { ...newTimer(null), mode: "timer" as const };
  assert.equal(isRunning(start(st, T0)), false);
});

test("reset puts a countdown back to full and a stopwatch back to zero", () => {
  const cd = reset(pause(start(newTimer(30), T0), T0 + 12_000));
  assert.equal(remainingSecs(cd, T0 + 12_000), 30);
  const sw = reset(pause(start(newTimer(null), T0), T0 + 12_000));
  assert.equal(elapsedSecs(sw, T0 + 12_000), 0);
});

// ─── what stopping does to the set ───────────────────────────────────────────

test("a countdown that reaches zero logs the set at its programmed time", () => {
  const st = start(newTimer(30), T0);
  assert.deepEqual(outcomeOnStop(st, T0 + 30_000), { seconds: 30, shouldLog: true });
});

test("a countdown stopped early records the time but does NOT log", () => {
  // A hold abandoned at 8 of 30 seconds is information, not a completed set.
  const st = start(newTimer(30), T0);
  assert.deepEqual(outcomeOnStop(st, T0 + 8_000), { seconds: 8, shouldLog: false });
});

test("a stopwatch logs whatever it measured", () => {
  const st = start(newTimer(null), T0);
  assert.deepEqual(outcomeOnStop(st, T0 + 47_000), { seconds: 47, shouldLog: true });
});

test("stopping a clock that never ran writes nothing", () => {
  assert.deepEqual(outcomeOnStop(newTimer(null), T0), { seconds: null, shouldLog: false });
  assert.deepEqual(outcomeOnStop(newTimer(30), T0), { seconds: null, shouldLog: false });
});

test("a stop within a couple of seconds is a fumbled button, not a set", () => {
  // Without this, a mis-tap two seconds into a 0:30 hold rewrites the set's
  // time to 0:02 and the first anyone knows is a log that reads wrong.
  const cd = start(newTimer(30), T0);
  assert.deepEqual(outcomeOnStop(cd, T0 + 1_500), { seconds: null, shouldLog: false });
  assert.deepEqual(outcomeOnStop(cd, T0 + 2_000), { seconds: null, shouldLog: false });
  assert.deepEqual(outcomeOnStop(cd, T0 + 3_000), { seconds: 3, shouldLog: false }, "past the window it records again");

  const sw = start(newTimer(null), T0);
  assert.deepEqual(outcomeOnStop(sw, T0 + 2_000), { seconds: null, shouldLog: false });
  assert.deepEqual(outcomeOnStop(sw, T0 + 3_000), { seconds: 3, shouldLog: true });
});

test("a SHORT programmed hold still completes normally", () => {
  // The cancel window must not swallow a genuinely short target — a 2-second
  // hold that runs to zero is a finished set, not a fumble.
  const st = start(newTimer(2), T0);
  assert.deepEqual(outcomeOnStop(st, T0 + 2_000), { seconds: 2, shouldLog: true });
});

// ─── only one clock at a time ────────────────────────────────────────────────

test("starting one set pauses the others rather than refusing the tap", () => {
  let timers = { a: newTimer(60), b: newTimer(60), c: newTimer(null) };
  timers = startOnly(timers, "a", T0);
  assert.equal(isRunning(timers.a), true);
  assert.equal(isRunning(timers.b), false);

  timers = startOnly(timers, "b", T0 + 10_000);
  assert.equal(isRunning(timers.b), true);
  assert.equal(isRunning(timers.a), false, "the first one stopped");
  assert.equal(elapsedSecs(timers.a, T0 + 99_000), 10, "and kept its 10 seconds");

  // The banked time is still there if you come back to it.
  timers = startOnly(timers, "a", T0 + 20_000);
  assert.equal(remainingSecs(timers.a, T0 + 25_000), 45, "60 - 10 banked - 5 more");
});
