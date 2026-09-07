// THE WORK SAVED. THE SCREEN DID NOT KNOW.
//
// Dustin, 7 Sep, home showing both of today's sessions on Start and the week at
// 0% adherence: "I logged my workout earlier... I just relogged n completed it
// and still won't save."
//
// It had saved. workout_logs completed at 2:04pm with 31 sets, and today's
// scheduled_workouts row marked completed and linked to it. He was looking at a
// render made before he finished.
//
// RefreshOnReturn asks the server again when a screen comes back from being
// away. The rules it has to obey are all here, and the important one is
// negative: it must NEVER reload. A pageshow handler that called
// location.reload() broke the hardware Back button on 1 Aug (see HapticTap) —
// reloading on a bfcache restore throws away the page Back just restored and
// re-arms BackButtonGuard's sentinel, so every press went one entry deeper.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(join(process.cwd(), "src/components/RefreshOnReturn.tsx"), "utf8");
const LAYOUT = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

// COMMENTS STRIPPED BEFORE ASSERTING. The file's own header explains at length
// why location.reload() must never appear here, and the first run of this test
// failed on that sentence — the prose, not the code. middlewareAsksAuthLast
// carries the same warning from the opposite direction: a test that reads a
// file has to be told the difference between what the code does and what the
// comment says about it.
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("it refreshes rather than reloading — the Back button depends on it", () => {
  assert.ok(SRC.includes("router.refresh()"), "it does not refresh at all");
  assert.ok(!/location\s*\.\s*reload\s*\(/.test(SRC),
    "location.reload() is what broke hardware Back on 1 Aug; never here");
  assert.ok(!/history\.(push|replace)State|router\.(push|replace)\(/.test(SRC),
    "this must not touch history — Back has to behave exactly as it did");
});

test("it listens for both ways a screen comes back", () => {
  assert.ok(SRC.includes('"visibilitychange"'), "app-switch return is not covered");
  assert.ok(SRC.includes('"pageshow"'), "the bfcache restore (hardware Back) is not covered");
  assert.ok(SRC.includes("e.persisted"), "a plain pageshow on first load must not trigger a refresh");
});

test("it does not refetch on a flick away and back", () => {
  // Two guards: a quiet period before firing, and a minimum time away.
  assert.ok(/QUIET_MS\s*=\s*\d+/.test(SRC), "no debounce");
  assert.ok(/MIN_AWAY_MS\s*=\s*\d+/.test(SRC), "no minimum-away guard");
  const away = Number(/MIN_AWAY_MS\s*=\s*(\d+)/.exec(SRC)?.[1]);
  assert.ok(away >= 1000, "the minimum time away is too short to be a real return");
});

test("it does not spend a request on a screen that left again", () => {
  assert.ok(SRC.includes('document.visibilityState !== "visible"'),
    "the timer fires without re-checking that the screen is still on show");
});

test("both shells mount it — a client has this problem too", () => {
  assert.ok(LAYOUT.includes("import RefreshOnReturn"), "not imported in the app layout");
  const mounts = LAYOUT.match(/<RefreshOnReturn \/>/g) || [];
  assert.equal(mounts.length, 2,
    "the trainer shell and the client shell each need one; found " + mounts.length);
});

test("it sits alongside the realtime sync, not instead of it", () => {
  // RealtimeScheduleSync covers somebody ELSE moving a session while you watch.
  // This covers your own screen having been away. Both, or the gap comes back.
  assert.ok(LAYOUT.includes("<RealtimeScheduleSync />"),
    "the realtime sync was removed; the two cover different cases");
});
