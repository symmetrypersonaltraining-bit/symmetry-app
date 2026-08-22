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

describe("the swap flow acts on the day being logged", () => {
  const banner = strip(read("src/components/OffPlanBanner.tsx"));
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));

  // Dustin's 22 Aug morning in one sentence: he opened a session he forgot on
  // the Friday, swapped it, and the swap landed on today — replacement
  // scheduled today, today's planned work skipped, Friday untouched.
  it("the logger hands the banner its session date", () => {
    assert.match(
      logger,
      /<OffPlanBanner[^>]*sessionDate=\{sessionDate\}/,
      "OffPlanBanner is mounted without sessionDate again — every swap it makes will go to today",
    );
  });

  it("the banner reads the clock exactly once, as a fallback", () => {
    const calls = (banner.match(/CT_TODAY\(\)/g) || []).length;
    assert.equal(
      calls,
      2,
      `CT_TODAY() is called ${calls} times. It should appear twice and only twice: once as the fallback for logDate, once to decide whether that day IS today. Any other call is a write that ignores the day being logged.`,
    );
    assert.match(banner, /const logDate = sessionDate \|\| CT_TODAY\(\);/, "logDate is gone — there is no single answer for which day this is");
  });

  it("no write in the banner uses a date other than logDate", () => {
    // Each of the three writes assigns `const today = logDate` first; a fresh
    // clock read here is the exact regression.
    assert.ok(
      !/const today = CT_TODAY\(\)/.test(banner),
      "a write in the banner is reading the clock again instead of the day being logged",
    );
  });

  it("the copy does not say today when it is not", () => {
    // Copy claiming "today" while writing to Friday is how somebody swaps the
    // wrong session and only finds out when the week looks wrong.
    assert.match(banner, /const isToday = logDate === CT_TODAY\(\);/, "nothing distinguishes today from a past session in the copy");
    assert.match(banner, /dayWord/, "the date-aware wording is gone");

    // The exact sentences that used to lie. Each is now built from dayWord.
    const wereLies = [
      "Swap today's workout for",
      "this only affects today",
      "still on today as well",
      "Replace today\u2019s workout\"",
      "basic workout for today",
      "Swap today for:",
      "this only changes today",
      "logged for today",
    ];
    const survivors = wereLies.filter((t) => banner.includes(t));
    assert.deepEqual(
      survivors,
      [],
      `these still say "today" no matter which day is being logged:\n  ${survivors.join("\n  ")}`,
    );
  });
});

describe("every angle out of the swap keeps the day", () => {
  const banner = strip(read("src/components/OffPlanBanner.tsx"));
  const aiRoute = strip(read("src/app/api/workout-ai/route.ts"));

  // Dustin, 22 Aug, after the first two fixes: "now its showing the one I just
  // logged and the one I replaced. also there's a workout on today, my rest
  // day... I was trying to replace yesterday's cardio w a walk thats all."
  //
  // Three separate places were still reading the clock after the swap itself
  // had been fixed. Each one on its own reproduces the whole complaint.
  it("nothing navigates to a bare day id any more", () => {
    const bare = banner.match(/window\.location\.href = "\/workout\/" \+ (?!\(target \|\| openDayId\))/g) || [];
    assert.deepEqual(
      bare,
      [],
      "a navigation out of this component passes a day id. The logger then has no date to read and logs the workout you just swapped in against today.",
    );
    assert.match(banner, /async function goToWorkout/, "goToWorkout is gone — the three exits are back to guessing");
  });

  it("the swap navigates to the row it just created", () => {
    // .select("id") here does double duty: proves the insert landed AND gives
    // the scheduled row to open, so the client cannot be sent to a bare day.
    assert.match(banner, /const addedId/, "the swap does not keep the id of the row it inserted");
    assert.match(banner, /goToWorkout\(target\.id, addedId\)/, "the swap is not opening the row it just made");
  });

  it("the AI builder is told which day it is building for", () => {
    assert.match(banner, /date: logDate,/, "the AI request no longer carries the session date — the route will fall back to its own clock");
    assert.match(aiRoute, /const clockToday = CT_TODAY\(\);/, "the route lost its separation of 'the clock' from 'the day this is for'");
    assert.match(aiRoute, /typeof body\.date === "string"/, "the route ignores the date it is given");
  });

  it("the route will not take any date it is handed", () => {
    // It is a body field driving unsupervised writes, so: real ISO day, never
    // in the future, never further back than the board itself shows.
    assert.match(aiRoute, /raw > clockToday/, "a future date would be accepted and workouts would appear on days that have not happened");
    assert.match(aiRoute, /30 \* 86400000/, "there is no floor on how far back a caller can reach");
  });
});
