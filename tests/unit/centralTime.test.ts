import { test } from "node:test";
import assert from "node:assert/strict";
import { centralOffsetForDate, centralIso, shiftDate, centralDayOfWeek, centralFormat, centralFormatDate, centralHour } from "../../src/lib/central-time";

// The bug this pins shut: a hardcoded -05:00 offset, which is CDT. For roughly
// four months a year Central is CST (-06:00), and every appointment the trainer
// edited in that window was written an hour early.

test("summer dates are CDT (-05:00)", () => {
  assert.equal(centralOffsetForDate("2026-07-31"), "-05:00");
  assert.equal(centralOffsetForDate("2026-08-03"), "-05:00");
});

test("winter dates are CST (-06:00) — the four months the old code got wrong", () => {
  assert.equal(centralOffsetForDate("2026-01-15"), "-06:00");
  assert.equal(centralOffsetForDate("2026-12-25"), "-06:00");
  assert.equal(centralOffsetForDate("2027-02-01"), "-06:00");
});

test("the DST boundaries land on the right side", () => {
  // 2026: DST starts Sun Mar 8, ends Sun Nov 1.
  assert.equal(centralOffsetForDate("2026-03-07"), "-06:00", "day before spring forward");
  assert.equal(centralOffsetForDate("2026-03-09"), "-05:00", "day after spring forward");
  assert.equal(centralOffsetForDate("2026-10-31"), "-05:00", "day before fall back");
  assert.equal(centralOffsetForDate("2026-11-02"), "-06:00", "day after fall back");
});

test("centralIso produces an instant Postgres can store unambiguously", () => {
  assert.equal(centralIso("2026-08-03", "09:00"), "2026-08-03T09:00:00-05:00");
  assert.equal(centralIso("2026-01-15", "09:00"), "2026-01-15T09:00:00-06:00");
});

test("9am Central really is 9am Central, in both halves of the year", () => {
  const summer = new Date(centralIso("2026-08-03", "09:00"));
  const winter = new Date(centralIso("2026-01-15", "09:00"));
  const asCentral = (d: Date) =>
    d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit" });
  assert.equal(asCentral(summer), "09:00");
  assert.equal(asCentral(winter), "09:00");
});

test("a naive string would have been wrong — this is what we avoided", () => {
  // Postgres resolves a naive timestamp using the connection timezone (UTC here).
  const naive = new Date("2026-08-03T09:00:00Z");
  const correct = new Date(centralIso("2026-08-03", "09:00"));
  assert.notEqual(naive.getTime(), correct.getTime());
  assert.equal((correct.getTime() - naive.getTime()) / 3600000, 5, "five hours apart in CDT");
});

test("shiftDate is exact across month and year boundaries", () => {
  assert.equal(shiftDate("2026-07-31", 1), "2026-08-01");
  assert.equal(shiftDate("2026-08-01", -1), "2026-07-31");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2026-07-31", -7), "2026-07-24");
});

test("shiftDate does not drift across a DST transition", () => {
  // setDate() on a local Date can land on the same day twice around a
  // transition. Date.UTC arithmetic cannot.
  assert.equal(shiftDate("2026-03-07", 1), "2026-03-08");
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDate("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDate("2026-11-01", 1), "2026-11-02");
});

// ---------------------------------------------------------------------------
// Display helpers. Added 22 Aug after an audit found 31 places where a date
// shown to somebody could be a day out. Dustin: "everything in th eentire app
// needs to go by the actual calendar in the timezone we are in and must be
// accurate."
// ---------------------------------------------------------------------------

test("centralFormat renders an instant in Central, not the reader's zone", () => {
  // 2026-08-24T01:30:00Z is 8:30pm Central on the 23rd. A reader in UTC (which
  // is what the server is) formatting this without a timeZone gets the 24th.
  assert.equal(
    centralFormat("2026-08-24T01:30:00Z", { weekday: "long", month: "short", day: "numeric" }),
    "Sunday, Aug 23",
  );
  assert.equal(
    centralFormat("2026-08-24T01:30:00Z", { hour: "numeric", minute: "2-digit", hour12: true }),
    "8:30 PM",
  );
});

test("centralFormat holds across the DST boundary", () => {
  // CST side: 2026-11-15T01:30:00Z is 7:30pm on the 14th at -06:00.
  assert.equal(centralFormat("2026-11-15T01:30:00Z", { month: "short", day: "numeric" }), "Nov 14");
  // CDT side: 2026-06-15T01:30:00Z is 8:30pm on the 14th at -05:00.
  assert.equal(centralFormat("2026-06-15T01:30:00Z", { month: "short", day: "numeric" }), "Jun 14");
});

test("centralFormatDate never moves a calendar date", () => {
  assert.equal(
    centralFormatDate("2026-08-24", { weekday: "long", month: "long", day: "numeric" }),
    "Monday, August 24",
  );
  // The first of a month is where an off-by-one is most visible.
  assert.equal(centralFormatDate("2026-01-01", { month: "short", day: "numeric", year: "numeric" }), "Jan 1, 2026");
  assert.equal(centralFormatDate("2026-12-31", { month: "short", day: "numeric" }), "Dec 31");
});

test("centralFormatDate agrees with centralDayOfWeek", () => {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const d of ["2026-08-22", "2026-08-23", "2026-03-08", "2026-11-01", "2027-02-28"]) {
    assert.equal(centralFormatDate(d, { weekday: "long" }), names[centralDayOfWeek(d)], d);
  }
});

test("centralHour is a Central wall-clock hour", () => {
  const h = centralHour();
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 23, `got ${h}`);
  // Midnight must be 0, not 24 -- the hour12:false formatter emits "24" for
  // midnight in some ICU versions, which would break every "is it evening" gate.
  const midnightUtcHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false })
      .format(new Date("2026-08-24T05:00:00Z")).replace(/\D/g, ""),
  ) % 24;
  assert.equal(midnightUtcHour, 0);
});
