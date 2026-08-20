// The calendar sync has to be observable.
//
// Dustin, 20 Aug: "my gcal ... is not syncing reliable to the app calendar" and
// "I have manual sync in app but its not picking up everything."
//
// Two separate faults behind that. It ran twice a day, so a change made during
// the workday was invisible until 4am. And every run has been logged to
// `gcal_sync_runs` since 1 Aug while NOTHING in the app ever read the table —
// a sync broken for weeks looked exactly like a healthy one, which is how it
// went fully dead from 31 July and was found only by reverse-engineering a
// Google token-refresh timestamp.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/gcal-sync/route.ts"), "utf8");
const PANEL = readFileSync(join(process.cwd(), "src/components/SyncHealth.tsx"), "utf8");
const HOME  = readFileSync(join(process.cwd(), "src/app/(app)/home/TrainerHome.tsx"), "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("code() strips comments and keeps code", () => {
  assert.equal(code("a(); // b()").trim(), "a();");
  assert.match(code('const u = "https://x.test";'), /https:\/\/x\.test/);
});

// ─── the narrow window ──────────────────────────────────────────────────────

test("a narrow run covers a quarter ahead, a full run two years", () => {
  assert.match(code(ROUTE), /const narrow = body\.window === "narrow";/,
    "there is no narrow mode, so an hourly sync would pull two years every hour");
  assert.match(code(ROUTE), /\(narrow \? 90 : 730\)/,
    "the window does not change with the mode");
});

test("the look-back covers the billing cycle, not 30 days", () => {
  // A monthly cycle opens at due_date - 1 month - 7 days = up to 37 days back.
  // A 30-day floor left a week at the start of every cycle that billing reads
  // and the sync could no longer correct.
  assert.match(code(ROUTE), /now\.getTime\(\) - 35 \* 24 \* 60 \* 60 \* 1000/,
    "the behind-edge is back inside the billing look-back");
  assert.doesNotMatch(code(ROUTE), /now\.getTime\(\) - 30 \* 24 \* 60 \* 60 \* 1000/);
});

// ─── unmatched events ───────────────────────────────────────────────────────

test("events that match no client are counted, not silently dropped", () => {
  // 1,975 of 6,545 on the live calendar. Mostly Dustin's own diary — but a
  // mistyped client name lands in exactly the same bucket.
  assert.match(code(ROUTE), /unmatched \+= 1;/,
    "the bare `continue` is back and the count is gone");
  assert.match(code(ROUTE), /unmatched_samples: unmatchedSamples/,
    "a count without examples is not actionable — 1,975 is a number, 'Sarah Prince' is a fix");
});

test("the sample list is bounded and deduplicated", () => {
  // A recurring weekly event would otherwise fill the list with one title.
  assert.match(code(ROUTE), /unmatchedSamples\.length < 40/);
  assert.match(code(ROUTE), /if \(!unmatchedSamples\.includes\(t\)\) unmatchedSamples\.push\(t\)/);
});

// ─── the reconcile refusing to run is not a silent event ────────────────────

test("a refused reconcile is surfaced as an error", () => {
  // The reconcile now declines to delete when more than half the window would
  // disappear. A guard nobody can see firing is the same as no guard.
  assert.match(code(ROUTE), /errors\.push\('reconcile_skipped: ' \+ skipped\)/,
    "the reconcile can refuse and say nothing");
});

// ─── the panel ──────────────────────────────────────────────────────────────

test("something finally reads gcal_sync_runs", () => {
  assert.match(code(PANEL), /\.from\("gcal_sync_runs"\)/);
  assert.match(code(HOME), /<SyncHealth \/>/, "the panel is not on the trainer's home screen");
});

test("it judges the payload, not the HTTP status", () => {
  // `ok` is derived from the status code, so a 200 carrying ten errors logs as
  // success — and a disabled or disconnected calendar returns 200 with
  // {skipped:true}. Both looked healthy for weeks.
  const c = code(PANEL);
  assert.match(c, /run\.ok === false \|\| errs\.length > 0 \|\| skipped \|\| stale/,
    "health is being read off the status code again");
  assert.match(c, /r\.skipped === true/,
    "a switched-off calendar still reads as a healthy sync");
});

test("it goes red when the last run is simply old", () => {
  // The most likely failure is not an error — it is nothing running at all.
  const c = code(PANEL);
  assert.match(c, /STALE_MINUTES = 150/);
  assert.match(c, /const stale = minsOld > STALE_MINUTES;/);
});

test("the staleness threshold allows for the hourly schedule", () => {
  const m = code(PANEL).match(/STALE_MINUTES = (\d+)/);
  assert.ok(m);
  const mins = Number(m![1]);
  assert.ok(mins > 60, "an hourly sync would show as behind between every run");
  assert.ok(mins < 60 * 12, "a threshold this loose would not have caught the 31 July outage");
});

test("the panel never breaks the home screen", () => {
  const c = code(PANEL);
  assert.match(c, /catch \{/, "an unreadable run log must not take the trainer's home down with it");
  assert.match(c, /if \(!loaded \|\| !run\) return null;/);
});
