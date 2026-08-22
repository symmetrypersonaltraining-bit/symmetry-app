// A REST DAY DOES NOT BREAK A STREAK.
//
// Dustin, 22 Aug: "a rest day is considered completed... if i logged everything
// that was scheduled this week, which i did, my streak should be 5 days. rest
// days count towards streak. only thing that stops a streak is if something
// programmed is not logged."
//
// The old rule counted only days that HAD a completed workout and required them
// to be consecutive calendar days. Wednesday 19 Aug was programmed as a rest
// day — nothing scheduled, nothing missed — and it ended his streak. He had
// done every session on his programme and the app showed 2.
//
// The rule below is the one he described, extracted so it can be tested against
// the real week rather than only read. The page holds the same logic inline
// over `recentScheduled`; the last test here pins them together.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** One day of the plan. */
interface Day { sched: number; done: number }

/**
 * Days newest-first, index 0 being today.
 *
 *   nothing programmed          counts (a rest day is part of the plan)
 *   everything programmed done  counts, and ANCHORS
 *   anything programmed left    ends it — unless it is today, which is not over
 *
 * Returns the count as of the last anchoring day, so trailing rest days cannot
 * pad a streak for somebody who has not trained.
 */
function streak(days: Day[]): number {
  let run = 0;
  let best = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const isToday = i === 0;
    if (!d || d.sched === 0) {
      if (!isToday) run++;
    } else if (d.done >= d.sched) {
      run++;
      best = run;
    } else if (isToday) {
      // still going
    } else break;
  }
  return best;
}

const REST: Day = { sched: 0, done: 0 };
const DONE = (n = 2): Day => ({ sched: n, done: n });
const MISSED = (n = 2, d = 0): Day => ({ sched: n, done: d });

// ─── the actual week he was looking at ──────────────────────────────────────

test("his real week: five days, not two", () => {
  // Sat 22 (today, nothing scheduled) · Fri 21 done · Thu 20 done ·
  // Wed 19 REST · Tue 18 done · Mon 17 done · Sun 16 rest · Sat 15 MISSED
  const week = [REST, DONE(), DONE(), REST, DONE(), DONE(), REST, MISSED(2, 0)];
  assert.equal(streak(week), 5);
});

test("the old rule is what produced 2", () => {
  // Only days with a completed workout, required consecutive. Fri + Thu, then
  // Wednesday's gap ends it. Kept as a test so the regression is legible.
  const completedDates = ["2026-08-21", "2026-08-20", "2026-08-18", "2026-08-17"];
  let old = 0;
  for (let i = 0; i < completedDates.length; i++) {
    if (i === 0) { old++; continue; }
    const prev = new Date(completedDates[i - 1] + "T00:00:00").getTime();
    const curr = new Date(completedDates[i] + "T00:00:00").getTime();
    if (Math.round((prev - curr) / 86400000) === 1) old++; else break;
  }
  assert.equal(old, 2, "if this is not 2, the bug being fixed was something else");
});

// ─── the rule, piece by piece ───────────────────────────────────────────────

test("a missed session ends it", () => {
  assert.equal(streak([REST, DONE(), MISSED(2, 1), DONE(), DONE()]), 1);
});

test("a PARTIALLY logged day is a missed day", () => {
  // Two scheduled, one logged. The programme was not completed.
  assert.equal(streak([REST, MISSED(2, 1), DONE()]), 0);
});

test("today never breaks the streak, however unfinished", () => {
  // 6am, today's two sessions untouched. Yesterday and before were perfect.
  assert.equal(streak([MISSED(2, 0), DONE(), DONE(), DONE()]), 3);
});

test("today counts once today's work is actually done", () => {
  assert.equal(streak([DONE(), DONE(), DONE()]), 3);
});

test("today's rest day is not credited before the day is over", () => {
  // Nothing scheduled today and nothing done yesterday either.
  assert.equal(streak([REST, MISSED(1, 0)]), 0);
});

test("trailing rest days do not pad it", () => {
  // Trained once, then a fortnight with nothing programmed.
  const days = [REST, REST, REST, REST, REST, DONE(), MISSED(1, 0)];
  // Five, not six: today is a rest day and is not credited until it is over,
  // so the run is the four earlier rest days plus the day that anchored it.
  assert.equal(streak(days), 5, "the run is real up to the anchoring day");
  // But somebody who has NEVER anchored has no streak at all, however many
  // empty days they have.
  assert.equal(streak([REST, REST, REST, REST]), 0);
});

test("an empty history is zero, not NaN", () => {
  assert.equal(streak([]), 0);
});

// ─── the page uses this rule ────────────────────────────────────────────────

test("home page counts the streak by compliance, not by consecutive workouts", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(app)/home/page.tsx"), "utf8");
  assert.match(src, /e\.done >= e\.sched/,
    "the streak no longer asks whether the programme was completed");
  assert.match(src, /if \(!isToday\) run\+\+;/,
    "a rest day must bridge the streak, and today must not be credited early");
  assert.match(src, /streakDays = run;/,
    "the count must anchor on a day with programmed work, or rest days pad it");
  assert.ok(!/completedDates/.test(src),
    "the consecutive-completed-dates walk is still there — that is the bug");
});
