import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TODAY LEAVES A POINTER, NOT A HOLE.
 *
 * Dustin, 9 Sep, with the past strip open on the Workout tab: *"wed is
 * missing."* It was not. Today is hoisted to the top of the board — right, and
 * it stays — but it was then FILTERED OUT of the chronological run, so the list
 * below read:
 *
 *     Monday, Sep 7  →  Tuesday, Sep 8  →  Thursday, Sep 10
 *
 * A gap in a date sequence does not read as "moved to the top". It reads as
 * lost data — and he had just moved two sessions onto that exact date, so the
 * first thing it looked like was the move having failed. The data was correct
 * the whole time; the board was telling him it wasn't.
 */

const BOARD = readFileSync(
  join(process.cwd(), "src/components/ScheduleBoard.tsx"), "utf8");

test("today is no longer filtered out of the expanded sequence", () => {
  // The old line built the sequence as
  //   [...(showPast ? pastDays : []), ...upcomingDays.filter(d => d !== today)]
  // which dropped today whether or not the past strip was open.
  assert.doesNotMatch(BOARD, /showPast \? pastDays : \[\]\), \.\.\.upcomingDays\.filter/,
    "today must stay in the run when the past strip is open");
  assert.match(BOARD, /showPast \? \[\.\.\.pastDays, \.\.\.upcomingDays\]/,
    "with the strip open the run is the full span, today included");
});

test("its slot renders a pointer, never a second copy of the day", () => {
  assert.match(BOARD, /renderTodayPointer/);
  // The map must branch: today's slot gets the pointer, every other date gets
  // the real tile. Rendering renderDayTile for today twice would put two
  // identical days on one screen.
  assert.match(BOARD,
    /d\.date === today && todayFirst\s*\?\s*renderTodayPointer\(d\.date\)\s*:\s*renderDayTile/);
});

test("the pointer says how many sessions are on it", () => {
  // The count is the whole point: it is what tells him the two moved sessions
  // landed on that date, right where he was looking for them.
  const fn = BOARD.slice(BOARD.indexOf("function renderTodayPointer"),
                         BOARD.indexOf("function renderDayTile"));
  assert.match(fn, /byDate\[k\] \|\| \[\]/, "it reads the day's real sessions");
  assert.match(fn, /session\$\{n === 1 \? "" : "s"\}/, "and says how many");
  assert.match(fn, /at the top ↑/, "and where they went");
});

test("the pointer scrolls back to the hoisted tile", () => {
  assert.match(BOARD, /data-today-anchor/,
    "the today tile needs an anchor to scroll to");
  assert.match(BOARD, /scrollIntoView/);
});

test("today is still rendered first, above the past strip", () => {
  // The hoist is right and this fix must not undo it.
  const first = BOARD.indexOf("{todayFirst && renderDayTile(today, 0)}");
  const strip = BOARD.indexOf("pastDays.length > 0 && (");
  assert.ok(first > 0 && strip > first, "today comes before the past toggle");
  // The anchor rides on the tile itself rather than a wrapper, so the exact
  // shape other tests pin stays intact.
  assert.match(BOARD, /isToday \? \{ "data-today-anchor": "" \}/);
});
