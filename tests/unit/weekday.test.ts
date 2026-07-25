// ============================================================================
// Unit tests — src/lib/nutrition/weekday.ts (TZ-safe ISO weekday).
// Run: npm run test:unit   (node --import tsx --test)
//
// Day-of-week has repeatedly been a source of timezone bugs. These lock the
// contract: the weekday is read from the Y-M-D components with NO local-TZ
// drift, ISO numbering 1=Mon..7=Sun.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isoWeekdayFromDateStr } from "../../src/lib/nutrition/weekday";

describe("isoWeekdayFromDateStr — America/Chicago calendar dates", () => {
  it("2026-07-27 → 1 (Monday)", () => assert.equal(isoWeekdayFromDateStr("2026-07-27"), 1));
  it("2026-07-26 → 7 (Sunday)", () => assert.equal(isoWeekdayFromDateStr("2026-07-26"), 7));
  it("2026-07-25 → 6 (Saturday)", () => assert.equal(isoWeekdayFromDateStr("2026-07-25"), 6));
  it("2026-07-01 → 3 (Wednesday)", () => assert.equal(isoWeekdayFromDateStr("2026-07-01"), 3));

  it("covers a full week Mon..Sun in order", () => {
    // 2026-07-27 Mon .. 2026-08-02 Sun
    const week = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];
    assert.deepEqual(week.map(isoWeekdayFromDateStr), [1, 2, 3, 4, 5, 6, 7]);
  });

  it("is stable regardless of process timezone (no drift near midnight)", () => {
    // A date string is a pure calendar date; the helper must never shift it.
    assert.equal(isoWeekdayFromDateStr("2026-01-01"), 4); // Thursday
    assert.equal(isoWeekdayFromDateStr("2025-12-31"), 3); // Wednesday
    assert.equal(isoWeekdayFromDateStr("2024-02-29"), 4); // leap day, Thursday
  });
});
