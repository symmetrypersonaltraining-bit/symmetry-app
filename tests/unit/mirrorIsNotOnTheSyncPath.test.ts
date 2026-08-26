import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE MIRROR MUST NOT SPEND THE CALENDAR SYNC'S TIME.
 *
 * 25–26 Aug 2026, a day and a half of hourly timeouts. The session mirror ran
 * at the tail of /api/gcal-sync. It created Google events with PUT, believing a
 * PUT to an unused id creates one — it does not, Google answers 404 — so every
 * write failed, the watermark never advanced, and all 200 writes were retried
 * on the following hour. Two hundred doomed calls an hour inside a request that
 * was already using 55 of its 60 seconds.
 *
 * The sync writes appointments, payment rows and payment reminders. It went
 * down for a read-only convenience copy published for another trainer to look
 * at. Two rules came out of it, and these are them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments out — these files explain the rule by naming what it forbids. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SYNC = read("src/app/api/gcal-sync/route.ts");
const CRON = read("src/app/api/cron/session-mirror/route.ts");
const MIRROR = read("src/lib/sessionMirror.ts");
const RUN = read("src/lib/runSessionMirror.ts");

test("the calendar sync does not run the mirror", () => {
  assert.doesNotMatch(
    code(SYNC),
    /runSessionMirror/,
    "the mirror is back inside gcal-sync — that is what caused the 25 Aug outage",
  );
  assert.doesNotMatch(code(SYNC), /session_mirror_enabled/);
});

test("the mirror has a schedule of its own, behind the same guards as the sync", () => {
  assert.match(code(CRON), /runSessionMirror\(db, t, \{ deadlineMs \}\)/);
  assert.match(code(CRON), /isCronRequest\(req\)/);
  assert.match(code(CRON), /isDbSchedulerRequest\(req\)/);
  assert.match(code(CRON), /status: 403/);
});

test("a wall clock, not a write count, is what stops the pass", () => {
  // 200 writes is fine at 40ms each and fatal at 400ms. The count alone was
  // what let this overrun.
  assert.match(code(CRON), /const BUDGET_MS = 48_000;/);
  assert.match(code(CRON), /deadlineMs = startedAt \+ BUDGET_MS/);
  assert.match(code(RUN), /deadlineMs\?: number/);
  assert.match(code(RUN), /deadlineMs: opts\.deadlineMs/);
  assert.match(code(MIRROR), /if \(opts\.deadlineMs && Date\.now\(\) > opts\.deadlineMs\)/);
});

test("a trainer with no time left is skipped rather than half-published", () => {
  assert.match(code(CRON), /if \(Date\.now\(\) > deadlineMs\)/);
});

test("creating a Google event is a POST, and only an existing one is PUT", () => {
  // The actual bug. events.insert takes the caller-supplied id in the BODY;
  // events.update requires the event to exist already.
  const c = code(MIRROR);
  assert.match(c, /method: "POST",\s*body: JSON\.stringify\(\{ \.\.\.payload, id: eventId \}\)/);
  assert.match(c, /if \(existing\.has\(eventId\)\)/, "the PUT branch must be gated on the event existing");
  // And a taken id is updated, not reported as a failure.
  assert.match(c, /409/);
});

test("a run that failed cannot mark itself published", () => {
  // The other half of why it retried forever: had the watermark advanced on a
  // failed pass the sessions would simply never have been written again.
  assert.match(
    code(RUN),
    /const clean = result\.cappedAt === null && result\.errors\.length === 0;/,
  );
  assert.match(code(RUN), /clean \? \{ session_mirror_synced_at/);
});

// ── and it has to actually finish ────────────────────────────────────────────

test("a capped publish resumes instead of rewriting its first page forever", () => {
  // Measured the moment the mirror was switched back on: published 83, capped
  // 83, zero errors — the write count never came near maxWrites, the clock is
  // what stops it. And the watermark deliberately does not move on a capped
  // run, so `since` stays null and the incremental skip stays off. Without a
  // cursor that means run two starts at the top of the window and rewrites the
  // same 83 events. An hour at a time, forever, never reaching the 84th of 721.
  assert.match(code(MIRROR), /if \(opts\.resumeAfter && new Date\(session\.starts_at\) < opts\.resumeAfter\)/);
  assert.match(code(RUN), /resumeAfter:\s*\n?\s*opts\.full \|\| !trainer\.session_mirror_cursor/);
  assert.match(code(RUN), /session_mirror_cursor: clean \? null : result\.resumeAfter,/);
  assert.match(code(RUN), /session_mirror_cursor/);
  assert.match(code(RUN), /MIRROR_TRAINER_COLS[\s\S]{0,220}session_mirror_cursor/);
});

test("the resume point is only offered when there is more to do", () => {
  // A pass that reached the end of the window must report null, or the next run
  // would skip everything before a point it had already finished with — and the
  // early part of the window would stop being maintained.
  assert.match(code(MIRROR), /resumeAfter: cappedAt === null \? null : resumeAfter,/);
  // Recorded on every successful write, not only where the deadline breaks the
  // loop: maxWrites can end it too, and a cursor set in one exit and not the
  // other loses whatever sits between them.
  assert.match(code(MIRROR), /written \+= 1;\s*\n[\s\S]{0,320}resumeAfter = session\.starts_at;/);
});
