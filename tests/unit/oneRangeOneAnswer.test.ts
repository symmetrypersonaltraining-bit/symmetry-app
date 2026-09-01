// Progress showed a client two different numbers for the same statistic, and
// told another she had no body-fat data at all.
//
// MetricCards filtered the series twice: the parent windowed it by its own
// range, handed the result to the expanded panel as `allData`, and the panel
// windowed it again by a SECOND range control that defaulted to a different
// span. Two consequences, both live:
//
//   - Body fat, lean mass and fat mass are read at InBody cadence, not weekly.
//     The parent's window usually left one point, and no button in the panel
//     could widen past what the parent had already discarded, so every range
//     said "Not enough data for this range" on a client with years of readings.
//
//   - The tile opened at 8 weeks and the panel at 4, and the panel's delta took
//     its END from the parent's array and its START from its own. So the same
//     weight statistic read +13.4 lb on the tile and +18.6 lb inside it.
//
// The arithmetic is inline in a client component, so these reconstruct it from
// the real shapes rather than importing it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "..", "..", "src/components/MetricCards.tsx"), "utf8");

type P = { date: string; value: number };
const SPARSE: P[] = [
  { date: "2026-02-10", value: 24.0 },
  { date: "2026-05-02", value: 21.5 },
  { date: "2026-08-20", value: 18.0 },
];

// What the panel now does: one filter, against the shared window.
function panel(all: P[], startDate: string, endDate: string) {
  const filtered = all.filter((d) => d.date >= startDate && d.date <= endDate);
  const chartData = filtered.length >= 2 ? filtered : all.slice(-10);
  const current = filtered.length > 0 ? filtered[filtered.length - 1].value
                : all.length > 0 ? all[all.length - 1].value : null;
  const startVal = filtered.length > 1 ? filtered[0].value
                 : chartData.length > 1 ? chartData[0].value : null;
  return { chartData, delta: current != null && startVal != null ? current - startVal : null };
}

// The shape that was there before, so the properties below can be shown to
// discriminate rather than to pass on anything. A test that cannot fail is not
// a test, and three of the ones below only exercise a local reconstruction.
function oldPanel(all: P[], parentStart: string, parentEnd: string, panelCutoff: string) {
  const parentFiltered = all.filter((d) => d.date >= parentStart && d.date <= parentEnd);
  const filtered = parentFiltered.filter((d) => d.date >= panelCutoff);
  const chartData = filtered.length >= 2 ? filtered : parentFiltered.slice(-10);
  const current = parentFiltered.length > 0 ? parentFiltered[parentFiltered.length - 1].value : null;
  const startVal = filtered.length > 1 ? filtered[0].value : null;
  return { chartData, delta: current != null && startVal != null ? current - startVal : null };
}

test("the old double filter really did empty a sparse chart", () => {
  // Parent at 8 weeks, panel asking for 6 months: the panel cannot widen past
  // what the parent already discarded.
  const { chartData } = oldPanel(SPARSE, "2026-06-25", "2026-08-20", "2026-02-20");
  assert.ok(chartData.length < 2, "if this passes, the fixture no longer reproduces the bug");
});

test("the old delta really did span two windows", () => {
  const wide = oldPanel(SPARSE, "2026-02-01", "2026-08-20", "2026-02-01").delta!;
  const narrow = oldPanel(SPARSE, "2026-02-01", "2026-08-20", "2026-05-01").delta!;
  assert.ok(Math.abs(narrow) < Math.abs(wide),
    "the fixture must show the narrower range reporting a different change");
});

test("a sparse metric still draws when the range is widened", () => {
  // Eight weeks holds one reading; the chart falls back to the series rather
  // than refusing to draw.
  assert.ok(panel(SPARSE, "2026-06-25", "2026-08-20").chartData.length >= 2,
    "an 8-week window on InBody-cadence data must still draw something");
  // Six months holds all three.
  assert.equal(panel(SPARSE, "2026-02-01", "2026-08-20").chartData.length, 3);
});

test("both ends of the delta come from the same window", () => {
  const { delta } = panel(SPARSE, "2026-05-01", "2026-08-20");
  assert.equal(delta, 18.0 - 21.5, "the subtraction must not span two ranges");
});

test("a wider window gives a delta at least as large as a narrower one", () => {
  // The property that was violated: 4 weeks reported a BIGGER change than 8.
  const wide = panel(SPARSE, "2026-02-01", "2026-08-20").delta!;
  const narrow = panel(SPARSE, "2026-05-01", "2026-08-20").delta!;
  assert.ok(Math.abs(wide) >= Math.abs(narrow),
    `wider window (${wide}) reported less change than narrower (${narrow})`);
});

test("the panel no longer owns a second range control", () => {
  const panelSrc = src.slice(src.indexOf("function ExpandedPanel"));
  assert.ok(!/useState\(2\);\s*\n\s*\/\/ Auto-open/.test(panelSrc),
    "the panel still has its own range state");
  assert.match(panelSrc, /rangeIdx,\s*\n\s*setRangeIdx,/, "the range must arrive from the parent");
});

test("the panel receives the unfiltered series", () => {
  assert.match(src, /allData=\{getAllDataPoints\(expandedKey\)\}/,
    "handing the panel a pre-filtered array is what emptied the sparse charts");
});

test("the workouts tile obeys its range and counts only finished sessions", () => {
  const q = src.slice(src.indexOf("supabase.from('workout_logs')"));
  const first = q.slice(0, q.indexOf("supabase.from('meal_adherence_logs')"));
  assert.match(first, /\.eq\('completed', true\)/, "abandoned sessions counted as done");
  assert.match(first, /\.gte\('log_date', startDate/, "the tile ignored its own range control");
  assert.match(first, /\.lte\('log_date', endDate/, "the window must close at both ends");
});
