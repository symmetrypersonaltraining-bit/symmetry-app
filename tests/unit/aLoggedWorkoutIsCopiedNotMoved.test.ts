// ============================================================================
// A SESSION YOU HAVE ALREADY TRAINED IS COPIED FORWARD, NEVER MOVED.
//
// Agreed with Dustin, 3 Sep 2026.
//
// The previous fix (1 Sep, after Jenn Day lost a week of history) stopped the
// LOG following a completed session to its new date. That was right: a log
// records something that happened, and moving it made the streak, the
// consistency calendar and the schedule disagree about which day someone
// trained.
//
// But it left the SCHEDULE row free to walk off on its own. So the day you
// actually trained went blank, and the log sat there with nothing on the
// calendar to explain it — the same disagreement, from the other side.
//
// You cannot move history. What a person wants when they drag a finished
// session forward is that workout on the new day as well. So: the trained one
// stays exactly where it was, with its log, and a fresh copy lands on the
// target date. No dialog — there is one right answer, and asking every time is
// friction rather than safety.
//
// THESE ARE BEHAVIOURAL, NOT SOURCE-SHAPE. They run the real function against a
// stub client and read the writes. Run them against the pre-3-Sep code and the
// first two fail: it issued an UPDATE moving scheduled_date and no INSERT.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { moveScheduledWorkout } from "../../src/lib/moveWorkout";

type Payload = Record<string, unknown>;

/**
 * Splits a PostgREST column list on top-level commas only, so the embedded
 * `workout_logs(completed, completed_at)` survives as one item. A stub that
 * split naively would hand back a row missing the completion flag and every
 * test here would pass for the wrong reason.
 */
function topLevelCols(cols: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of cols) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function stubClient(row: Payload | null) {
  const updates: { table: string; payload: Payload }[] = [];
  const inserts: { table: string; payload: Payload }[] = [];
  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          const wanted = topLevelCols(String(cols)).map((c) => c.replace(/\(.*$/, ""));
          const projected = row === null
            ? null
            : Object.fromEntries(Object.entries(row).filter(([k]) => wanted.includes(k)));
          return { eq: () => ({ maybeSingle: async () => ({ data: projected, error: null }) }) };
        },
        update(payload: Payload) {
          updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
        insert(payload: Payload) {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, updates, inserts };
}

const TRAINED: Payload = {
  scheduled_date: "2026-08-26",
  workout_log_id: "log-1",
  client_id: "client-1",
  assignment_id: "asg-1",
  day_id: "day-1",
  published_workout_id: null,
  position: 2,
  source: "trainer",
  workout_logs: { completed: true },
};

const UNFINISHED: Payload = { ...TRAINED, workout_logs: { completed: false } };

test("a trained session does not move — the original stays where it was", async () => {
  const { client, updates, inserts } = stubClient(TRAINED);
  const outcome = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-09-05");

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.kind, "copied");
  assert.equal(
    updates.filter((u) => u.table === "scheduled_workouts").length,
    0,
    "the trained session was moved — the day it was actually done now shows nothing",
  );
  assert.equal(
    updates.filter((u) => u.table === "workout_logs").length,
    0,
    "the log was rewritten; a log records when something happened, not where it is planned",
  );
  assert.equal(inserts.length, 1, "no copy was created, so the client lost the workout entirely");
  assert.equal(inserts[0].payload.scheduled_date, "2026-09-05");
});

test("the copy is a fresh session, not a second claim on the log", async () => {
  const { client, inserts } = stubClient(TRAINED);
  await moveScheduledWorkout(client, { id: "sw-1" }, "2026-09-05");
  const copy = inserts[0].payload;

  assert.equal(copy.day_id, "day-1", "the copy has to be the same workout");
  assert.equal(copy.client_id, "client-1");
  assert.equal(copy.status, "scheduled", "a copy of a finished session is not itself finished");
  assert.ok(!("workout_log_id" in copy), "the copy claimed the original's log");
  // supervised and appointment_id belong to the appointment on the ORIGINAL
  // date. Carrying them over lets sync_supervised_workouts_to_appointments()
  // drag the copy straight back onto that date within hours.
  assert.ok(!("supervised" in copy), "the copy carried supervised — the sync job can now move it");
  assert.ok(!("appointment_id" in copy), "the copy carried appointment_id — the sync job can now move it");
  assert.equal(copy.moved_from_date, "2026-08-26", "moved_from_date unset leaves the cron guard unarmed");
});

test("an unfinished session still moves, and takes its log with it", async () => {
  const { client, updates, inserts } = stubClient(UNFINISHED);
  const outcome = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-09-05");

  assert.equal(outcome.ok && outcome.kind, "moved");
  assert.equal(inserts.length, 0, "an unfinished session was copied instead of moved");
  const sw = updates.find((u) => u.table === "scheduled_workouts");
  assert.ok(sw, "the plan did not move");
  assert.equal(sw!.payload.scheduled_date, "2026-09-05");
  const log = updates.find((u) => u.table === "workout_logs");
  assert.ok(log, "the shell log stayed behind — the schedule and the streak now disagree");
  assert.equal(log!.payload.log_date, "2026-09-05");
});

test("a row that cannot be read is reported rather than half-copied", async () => {
  const { client, inserts } = stubClient(null);
  const outcome = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-09-05");
  // Unreadable means "not known to be completed", so it takes the move path and
  // must not silently insert anything.
  assert.equal(inserts.length, 0);
  assert.equal(outcome.ok, true);
});
