import { test } from "node:test";
import assert from "node:assert/strict";
import { centralOffsetForDate, centralIso, shiftDate } from "../../src/lib/central-time";

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
