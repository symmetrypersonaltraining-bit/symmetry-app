import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPeakWeekLocked, PEAK_WEEK } from "../../src/lib/peak-week";

/**
 * A FREEZE MUST NAME WHOSE IT IS.
 *
 * Peak Week shipped as a pair of module-level constants:
 *
 *     const LOCKED_START = "2026-08-03";
 *     const LOCKED_END   = "2026-08-09";
 *     const isLocked = (d) => d >= LOCKED_START && d <= LOCKED_END;
 *
 * — with no client scope, in TWO components. It is Dustin's shoot week, and it
 * froze the schedule of every client on the roster for seven days.
 *
 *   Tyler Dorsett, 5:17 AM, schedule board: "My workouts are locked and it
 *   won't let me access them."
 *   Todd, day sheet: could not pull a missed workout forward to today.
 *
 * Two reports, two different components, one cause. Fixing the board left the
 * sheet broken, because each carried its own copy of the dates — which is the
 * argument for a single definition rather than a careful edit in two places.
 *
 * Two things are asserted, and the second matters more than the first:
 *   1. Nobody redeclares the range locally.
 *   2. The scope check FAILS OPEN. An unknown owner means nothing is locked.
 *      A freeze that defaults to on is how one person's week became everyone's.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Strip comments — this bug is described in several of them. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

test("the peak-week range is declared in exactly one place", () => {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    if (file.endsWith("lib/peak-week.ts")) continue;
    const src = code(readFileSync(join(ROOT, file), "utf8"));
    if (/LOCKED_START|LOCKED_END/.test(src)) offenders.push(`${file}: redeclares LOCKED_START/END`);
    if (new RegExp(`["']${PEAK_WEEK.start}["']`).test(src)) offenders.push(`${file}: hardcodes ${PEAK_WEEK.start}`);
    if (new RegExp(`["']${PEAK_WEEK.end}["']`).test(src)) offenders.push(`${file}: hardcodes ${PEAK_WEEK.end}`);
  }
  assert.deepEqual(
    offenders,
    [],
    "Import isPeakWeekLocked from @/lib/peak-week instead. A second copy of the " +
      "dates is how the schedule board got fixed while the day sheet stayed " +
      "broken:\n  " + offenders.join("\n  "),
  );
});

test("the freeze fails OPEN — an unknown owner locks nothing", () => {
  const inside = PEAK_WEEK.start;
  // The case that shipped: no owner known, everyone frozen.
  assert.equal(isPeakWeekLocked(inside, ""), false, "empty owner must not lock");
  assert.equal(isPeakWeekLocked(inside, null), false, "null owner must not lock");
  assert.equal(isPeakWeekLocked(inside, undefined), false, "undefined owner must not lock");
  // Tyler and Todd.
  assert.equal(isPeakWeekLocked(inside, "some-other-client-id"), false, "another client must not lock");
});

test("the freeze still applies to the client it belongs to", () => {
  assert.equal(isPeakWeekLocked(PEAK_WEEK.start, PEAK_WEEK.clientId), true);
  assert.equal(isPeakWeekLocked(PEAK_WEEK.end, PEAK_WEEK.clientId), true);
  assert.equal(isPeakWeekLocked("2026-08-05", PEAK_WEEK.clientId), true);
  // Boundaries are inclusive, and a day either side is free.
  assert.equal(isPeakWeekLocked("2026-08-02", PEAK_WEEK.clientId), false);
  assert.equal(isPeakWeekLocked("2026-08-10", PEAK_WEEK.clientId), false);
});

test("every component that can freeze a day takes an owner", () => {
  for (const file of ["src/components/ScheduleBoard.tsx", "src/components/WorkoutDaySheet.tsx"]) {
    const src = readFileSync(join(ROOT, file), "utf8");
    assert.match(src, /isPeakWeekLocked/, `${file} must use the shared scope check`);
    assert.match(
      src,
      /ownerClientId/,
      `${file} must accept ownerClientId — forClient is only set when a TRAINER ` +
        `is viewing someone else, so on a client's own page it cannot answer ` +
        `"whose schedule is this?", which is the exact case that broke.`,
    );
  }
});
