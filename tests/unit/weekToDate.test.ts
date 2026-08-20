// The summary card's default window is THIS WEEK SO FAR.
//
// Dustin, 2026-08-20: "Logic on the daily average needs to go by days so far
// this week dont include days in the future for averages for tge week."
//
// It was a ROLLING SEVEN DAYS labelled "7d". On a Thursday the denominator is 7
// even though the week is four days old, so logging Mon/Tue/Wed read as
// "3 of 7 days · 43%" when it is three of four · 75%. Nothing counted a future
// date — the window simply was not the week while being labelled as one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { weekToDateStart, shiftDate, AVG_RANGES } from "../../src/components/nutrition/useNutritionAverages.ts";
import { weekStartOf } from "../../src/lib/ai/weekly-numbers.ts";

test("the week starts on Sunday", () => {
  // 2026-08-20 is a Thursday.
  assert.equal(weekToDateStart("2026-08-20"), "2026-08-16");
});

test("Sunday is its own week start", () => {
  assert.equal(weekToDateStart("2026-08-16"), "2026-08-16");
});

test("Saturday still belongs to the week that began the Sunday before", () => {
  assert.equal(weekToDateStart("2026-08-22"), "2026-08-16");
});

test("it agrees with weekStartOf — two definitions of a week is its own bug", () => {
  for (const d of ["2026-08-16", "2026-08-17", "2026-08-20", "2026-08-22",
                   "2026-01-01", "2026-12-31", "2027-02-28"]) {
    assert.equal(weekToDateStart(d), weekStartOf(d),
      d + " starts a different week depending on which module you ask");
  }
});

test("the window never reaches past today — the actual complaint", () => {
  const today = "2026-08-20"; // Thursday
  const start = weekToDateStart(today);
  const days = Math.round(
    (Date.parse(today + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000,
  ) + 1;
  assert.equal(days, 5, "Sun, Mon, Tue, Wed, Thu — not 7");
  assert.ok(start <= today);
});

test("month and year boundaries do not wander", () => {
  assert.equal(weekToDateStart("2026-09-01"), "2026-08-30"); // Tue → Sun in Aug
  assert.equal(weekToDateStart("2027-01-01"), "2026-12-27"); // Fri → Sun in Dec
});

test("shiftDate is not affected by daylight saving", () => {
  // US DST ends 2026-11-01. A local-time date walk would repeat or skip a day.
  assert.equal(shiftDate("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDate("2026-11-01", 1), "2026-11-02");
  assert.equal(weekToDateStart("2026-11-03"), "2026-11-01");
});

test("week-to-date is offered as a range and carries no fixed length", () => {
  const wtd = AVG_RANGES.find((r) => r.key === "wtd");
  assert.ok(wtd, "the range does not exist");
  assert.equal(wtd!.days, 0, "a fixed length would reintroduce the rolling window");
});

test("the card asks for week-to-date, not a rolling week", () => {
  const C = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(C, /summaryRange === "today" \? "wtd" : summaryRange/,
    "the hero card is back on a rolling seven days");
  assert.doesNotMatch(C, /isToday \? " · 7d" : ""/,
    "it still calls the window 7d, which is what made it read as the week");
});

test("the hook branches on wtd before the fixed-length ranges", () => {
  const H = readFileSync(join(process.cwd(), "src/components/nutrition/useNutritionAverages.ts"), "utf8");
  assert.match(H, /\} else if \(range === "wtd"\) \{\n[\s\S]{0,400}?start = weekToDateStart\(today\);/,
    "wtd falls through to the fixed-length branch, where days=0 would make start later than today");
});

// ─── dismissing a notification without going to it ──────────────────────────
//
// Dustin, 2026-08-20: "trainer needs to be able to dismiss notifications
// quickly so they're not in the way on the screen."
//
// Tapping a notification navigates. So clearing the list meant visiting every
// one, or "Mark all read" and losing the ones still worth opening. There was no
// way to clear a single row.

test("every notification row has its own dismiss control", () => {
  const N = readFileSync(join(process.cwd(), "src/components/NotificationCenter.tsx"), "utf8");
  assert.match(N, /aria-label=\{"Dismiss " \+ r\.title\}/,
    "there is no per-row dismiss, so the only way to clear one is to open it");
  assert.match(N, /onClick=\{\(ev\) => \{ ev\.stopPropagation\(\); void markRead\(r\); \}\}/,
    "dismissing must not also fire the row's navigation");
});

test("the dismiss button is not nested inside the row button", () => {
  // A <button> inside a <button> is invalid HTML and browsers reparent it,
  // which drops the click handler entirely — the × would render and do nothing.
  const N = readFileSync(join(process.cwd(), "src/components/NotificationCenter.tsx"), "utf8");
  const start = N.indexOf("rows.map((r) => (");
  assert.ok(start > 0);
  const row = N.slice(start, N.indexOf("))\n            )}", start));
  const openBtn = row.indexOf("onClick={() => openRow(r)}");
  const closeOfOpen = row.indexOf("</button>", openBtn);
  const dismiss = row.indexOf("aria-label={\"Dismiss ");
  assert.ok(closeOfOpen > 0 && dismiss > closeOfOpen,
    "the dismiss button sits inside the navigating button — invalid nesting, and the click never fires");
});

test("Mark all read is still there — dismissing one does not replace clearing them all", () => {
  const N = readFileSync(join(process.cwd(), "src/components/NotificationCenter.tsx"), "utf8");
  assert.match(N, /Mark all read/);
});
