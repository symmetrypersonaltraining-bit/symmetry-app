// ============================================================================
// A session logs against the day you opened, not the day it is now.
//
// Dustin, 22 Aug, catching up a walk he forgot on the Friday:
//   "I logged the workout and it logged it on today. no good."
//
// The date-aware branch has existed since 6 Aug. /workout/[dayId] accepts
// EITHER a scheduled_workouts id or a days id, and only the first carries a
// date — given a scheduled row it logs against that row's scheduled_date,
// given a bare day it asks the clock.
//
// Both client-facing ways into the logger passed the DAY. So the fix never
// engaged from the two screens a client actually uses to catch up, and every
// make-up was credited to today while the day they really trained stayed
// outstanding. Confirmed in his data: a walk for the 21st written to the 22nd,
// with the 21st's cardio still sitting at `scheduled`.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("openTarget picks the id that knows the date", () => {
  it("prefers the scheduled row over the day", async () => {
    const { openTarget } = await import("../../src/components/WorkoutDaySheet.tsx");
    assert.equal(
      openTarget({ id: "sched-1", dayId: "day-1" }),
      "sched-1",
      "the day id wins again — the logger will fall back to the clock and log a make-up against today",
    );
  });

  it("falls back to the day when there is no scheduled row", async () => {
    const { openTarget } = await import("../../src/components/WorkoutDaySheet.tsx");
    // A library workout opened straight from the library has no date of its
    // own, and today IS the right answer for it.
    assert.equal(openTarget({ id: null, dayId: "day-1" }), "day-1");
    assert.equal(openTarget({ dayId: "day-1" }), "day-1");
  });
});

describe("both ways into the logger carry the date", () => {
  const cases: [string, string][] = [
    ["src/components/WorkoutDaySheet.tsx", "the week strip's day sheet"],
    ["src/components/ScheduleBoard.tsx", "the schedule board"],
  ];

  for (const [file, what] of cases) {
    it(`${what} opens by the scheduled row`, () => {
      const code = strip(read(file));
      assert.match(
        code,
        /\/workout\/\$\{openTarget\(w\)\}/,
        `${what} links to /workout/<something else>. If it is w.dayId, every past session opened from here logs against today.`,
      );
      assert.ok(
        !/\/workout\/\$\{w\.dayId\}/.test(code),
        `${what} still has a bare w.dayId link — that is the one that loses the date`,
      );
    });
  }
});

describe("the past is reachable when there is something in it", () => {
  const code = strip(read("src/components/ScheduleBoard.tsx"));

  // "it doesn't let me view full week on a rest day" — on a rest day there is
  // nothing above the board, and the session he wanted was folded away behind
  // a muted toggle.
  it("the past section opens itself when this week has an unlogged session", () => {
    assert.match(code, /autoOpenedPast/, "the auto-open is gone — a forgotten session is invisible again on a rest day");
    assert.match(code, /setShowPast\(true\)/, "nothing opens the past section");
  });

  it("but only once, so collapsing it sticks", () => {
    // The old unbounded auto-open is why this was removed the first time: it
    // fired on anything outstanding ever, so the board opened onto last week
    // almost every time. Scoped to this week AND once per mount.
    assert.match(
      code,
      /if \(autoOpenedPast\.current\) return;/,
      "the auto-open can re-fire and will fight the client trying to collapse it",
    );
    assert.match(
      code,
      /if \(missed\.length === 0\) return;/,
      "the auto-open is not gated on there being anything worth opening for",
    );
  });
});
