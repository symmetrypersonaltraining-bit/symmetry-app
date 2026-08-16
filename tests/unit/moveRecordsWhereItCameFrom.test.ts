// Guard: every path that moves a scheduled workout records where it came from.
//
// ── Why this matters more than provenance ──────────────────────────────────
//
// `sync_supervised_workouts_to_appointments()` runs on pg_cron jobid 18, three
// times a day, and moves a supervised session onto its linked appointment's
// date with no approval. Its guard against undoing a deliberate move is one
// line:
//
//   and sw.moved_from_date is null   -- 4. never override a manual move
//
// That guard is only as good as the paths that arm it. Seven places in this app
// move a scheduled workout; six set moved_from_date and `moveWorkout.ts` — the
// one behind the trainer's schedule board and the client day sheet — did not.
// Moving a supervised session off its appointment date from the board left the
// job free to drag it straight back within hours, silently.
//
// Latent rather than observed: all 29 rows carrying a moved_from_date today
// came from the six paths that set it. The guard was simply not connected.
//
// ── What this test actually checks ─────────────────────────────────────────
//
// The write itself, by running it against a stub Supabase client and reading
// the payload. Asserting on the source text would pass for a file that mentions
// the column in a comment, which is exactly how this got missed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { moveScheduledWorkout } from "../../src/lib/moveWorkout";

type Payload = Record<string, unknown>;

/** Minimal stub: records what update() was called with. */
function stubClient(opts: {
  row?: { scheduled_date?: string | null; workout_log_id?: string | null } | null;
  updateError?: { code?: string; message: string } | null;
} = {}) {
  const updates: { table: string; payload: Payload }[] = [];
  const row = opts.row === undefined ? { scheduled_date: "2026-08-19", workout_log_id: null } : opts.row;
  const client = {
    from(table: string) {
      return {
        // The stub honours the column list. PostgREST returns only what was
        // asked for, and a select that stops asking for scheduled_date is
        // exactly how this regresses — a stub that returns the whole row
        // regardless would pass over that.
        select(cols: string) {
          const wanted = String(cols).split(",").map((c) => c.trim());
          const projected = row === null
            ? null
            : Object.fromEntries(Object.entries(row).filter(([k]) => wanted.includes(k)));
          return {
            eq() {
              return { maybeSingle: async () => ({ data: projected, error: null }) };
            },
          };
        },
        update(payload: Payload) {
          updates.push({ table, payload });
          return { eq: async () => ({ error: table === "scheduled_workouts" ? opts.updateError ?? null : null }) };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, updates };
}

test("a move records the date it left", async () => {
  const { client, updates } = stubClient();
  const err = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-08-20");
  assert.equal(err, null);
  const sw = updates.find((u) => u.table === "scheduled_workouts");
  assert.ok(sw, "nothing was written to scheduled_workouts");
  assert.equal(sw!.payload.scheduled_date, "2026-08-20");
  assert.equal(
    sw!.payload.moved_from_date,
    "2026-08-19",
    "moved_from_date not set — the cron job's 'never override a manual move' guard stays unarmed",
  );
});

test("an unreadable row moves anyway, and does not blank moved_from_date", async () => {
  // A failed lookup must not write `moved_from_date: null` over a real value.
  // Omitting the key entirely is the difference between "unknown" and "never
  // moved", and the cron job reads null as the latter.
  const { client, updates } = stubClient({ row: null });
  const err = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-08-20");
  assert.equal(err, null, "the move itself must still stand");
  const sw = updates.find((u) => u.table === "scheduled_workouts")!;
  assert.equal(sw.payload.scheduled_date, "2026-08-20");
  assert.ok(
    !("moved_from_date" in sw.payload),
    "wrote moved_from_date from an unreadable row — null there tells the cron job this was never moved",
  );
});

test("the log follows the workout, from the same lookup", async () => {
  const { client, updates } = stubClient({ row: { scheduled_date: "2026-08-19", workout_log_id: "log-9" } });
  await moveScheduledWorkout(client, { id: "sw-1" }, "2026-08-20");
  const log = updates.find((u) => u.table === "workout_logs");
  assert.ok(log, "the log was left on the old date — the schedule and the streak now disagree");
  assert.equal(log!.payload.log_date, "2026-08-20");
});

test("a caller that already knows the log id does not get a second one moved", async () => {
  const { client, updates } = stubClient({ row: { scheduled_date: "2026-08-19", workout_log_id: "log-9" } });
  await moveScheduledWorkout(client, { id: "sw-1", workoutLogId: null }, "2026-08-20");
  assert.equal(
    updates.filter((u) => u.table === "workout_logs").length,
    0,
    "the caller said there is no log; the row's own column must not override that",
  );
});

test("a duplicate-target collision is reported, not swallowed", async () => {
  const { client } = stubClient({
    updateError: { code: "23505", message: 'duplicate key value violates unique constraint "uq_scheduled_workout_one_per_day"' },
  });
  const err = await moveScheduledWorkout(client, { id: "sw-1" }, "2026-08-20");
  assert.match(String(err), /already on the calendar/i, "a collision must say what happened, not 'try again'");
});

test("every move path in the app sets moved_from_date", () => {
  // The sweep that found this. `.update({ scheduled_date` with no
  // moved_from_date in the same object is the signature of an unarmed guard.
  const SRC = join(process.cwd(), "src");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);

  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Each `.update({ ... })` object that assigns scheduled_date.
    for (const m of src.matchAll(/\.update\(\s*(\{[\s\S]*?\})\s*\)/g)) {
      const obj = m[1];
      if (!/\bscheduled_date\s*:/.test(obj)) continue;
      if (/\bmoved_from_date\s*:/.test(obj)) continue;
      offenders.push(`${f.replace(process.cwd() + "/", "")}: ${obj.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  // Two writes set scheduled_date and deliberately do NOT record a move,
  // because neither is one. Both are named so that adding a third is a
  // decision somebody makes on purpose rather than a gap nobody notices.
  //
  //   ScheduleBoard swapWorkout  — the compensating rollback after the second
  //     half of a swap fails. It puts `a` back where it started; stamping a
  //     move onto a swap that did not happen would be a lie.
  //   agent-tools sw_restore_date — the undo. It restores the ORIGINAL date,
  //     so the session is by definition no longer moved.
  const ALLOWED = [
    { file: "src/components/ScheduleBoard.tsx", why: "compensating rollback of a failed swap" },
    { file: "src/lib/ai/agent-tools.ts", why: "undo: restores the original date" },
  ];
  const unexplained = offenders.filter((o) => !ALLOWED.some((a) => o.startsWith(a.file + ":")));
  assert.deepEqual(
    unexplained,
    [],
    `these move a workout without recording where it came from, so pg_cron jobid 18 is free to undo them:\n  ${unexplained.join("\n  ")}`,
  );
  // And the allowlist must not quietly grow to cover a real move: exactly one
  // write per allowed file, not "anything in this file is fine".
  for (const a of ALLOWED) {
    const n = offenders.filter((o) => o.startsWith(a.file + ":")).length;
    assert.equal(n, 1, `${a.file} has ${n} unrecorded moves; only the ${a.why} is accounted for`);
  }
});
