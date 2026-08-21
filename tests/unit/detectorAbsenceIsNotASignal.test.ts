// Guard: the calendar detector never treats a missing appointment as a problem,
// and approving a move moves one session.
//
// ── Dustin's rule, in his words ────────────────────────────────────────────
//
//   "My programmed schedule is the default and it persists. The ABSENCE of an
//    appointment is not a signal and must never flag or move anything. An
//    appointment is a POSITIVE signal that can move a workout. Nothing else."
//
// ── What was measured, 16 Aug ──────────────────────────────────────────────
//
//   select reason, count(*) from schedule_change_proposals
//   where status='pending' group by reason;
//   → uncovered 56, retired 17, orphaned 10, moved 6, cancelled 3
//
// The 10 'orphaned' rows were the default state reported as an error: a
// supervised session sitting exactly where it was programmed, with no Google
// appointment on that date. Todd Prine had 8 of them, all false — his recurring
// series had lapsed while his programming was right.
//
// ── And the move path could not apply at all ───────────────────────────────
//
// Simulating every pending 'moved' proposal against the old
// resolve_schedule_proposal():
//
//   client            from -> to      rows updated   target rows: any / supervised
//   Cheyenne Martin   08-17 -> 08-19        1               1 / 0
//   Greg Lennon       08-17 -> 08-22        2               1 / 0
//   Sariah Duncan     08-19 -> 08-18        3               2 / 0
//   (six in total, same shape)
//
// `target supervised = 0` for all six: the occupancy guard had no `supervised`
// filter, so a client's own unsupervised homework on the target date read as
// "occupied" and every move silently no-opped. And the update matched by DATE
// rather than by the proposal's scheduled_workout_id — 2 and 3 rows — so a move
// that did fire would have dragged that homework along with the session.
//
// These tests read the migrations in order and check the LAST definition of
// each function, so a later migration quietly restoring any of it fails here.
// SQL comments are stripped first: the migration headers quote the old code at
// length, and an explanation must never satisfy a test about the code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");

const stripSql = (s: string) => s.replace(/--.*$/gm, "");

/** The last migration to define `fn`, comments stripped. */
function lastDefinition(fn: string): { file: string; body: string } {
  const defs = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(DIR, f), "utf8") }))
    .filter((m) => new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, "i").test(m.sql))
    .map((m) => {
      const i = m.sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, "i"));
      return { file: m.file, body: stripSql(m.sql.slice(i)) };
    });
  assert.ok(defs.length > 0, `${fn} lives only in the database — it must ship as a migration`);
  return defs[defs.length - 1];
}

/** A migration that actually captures the old definition of `fn`. */
function backupExists(fn: string): string | undefined {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .find((f) => {
      const sql = readFileSync(join(DIR, f), "utf8");
      return (
        new RegExp(`create table if not exists public\\.bak_${fn}`, "i").test(sql) &&
        /pg_get_functiondef/i.test(sql) &&
        new RegExp(`'${fn}'`).test(sql)
      );
    });
}

// ── detect_schedule_changes ────────────────────────────────────────────────

test("the detector never writes an 'orphaned' proposal again", () => {
  const { file, body } = lastDefinition("detect_schedule_changes");
  assert.doesNotMatch(
    body,
    /'orphaned'/,
    `${file} still emits 'orphaned' — the absence of an appointment is not a signal`,
  );
});

test("a client with no future appointment is out of scope entirely", () => {
  const { file, body } = lastDefinition("detect_schedule_changes");
  // The gate itself: at least one future appointment, any status.
  assert.match(body, /create temporary table _scd_eligible/i, `${file} has no eligibility gate`);
  assert.match(
    body,
    /from appointments a\s+where \(a\.scheduled_at at time zone 'America\/Chicago'\)::date >= v_today_ct/i,
    `${file} builds eligibility from something other than future appointments`,
  );
  // This used to count FOUR joins, one per proposal source: orphan candidates,
  // uncovered candidates, cancelled and retired. Three of those sources are
  // gone — see "the detector no longer proposes moves" below — so the count is
  // now one: 'uncovered'. 'retired' is gated the other way round, by its own
  // "this client has nothing booked at all" check, which is the same rule
  // inverted and cannot be expressed as a join to the eligible set.
  const joins = (body.match(/join _scd_eligible/gi) || []).length;
  assert.equal(joins, 1, `expected the uncovered source gated on a future appointment, found ${joins} joins`);
  assert.match(
    body,
    /where p\.is_retired[\s\S]*?not exists \([\s\S]*?from appointments a/i,
    `${file} files 'retired' without checking the client has nothing booked — ` +
      "which would report every client whose slot merely moved",
  );
});

test("the detector no longer proposes moves at all", () => {
  // ── What changed, 21 Aug ─────────────────────────────────────────────────
  //
  // Four tests used to live here: orphans are computed but never persisted,
  // pairing is 1:1 in both directions, a paired appointment is not also
  // reported uncovered, and exactly one pending move survives per session.
  // Every one of them described the 'moved' proposal — the machinery that
  // worked out where a session should go and then asked Dustin to approve it.
  //
  // He deleted the question:
  //
  //   "on the schedule moves, if it picks up where the session was moved and
  //    the workout is not there and it's still on the day the original session
  //    was on then move it. you shouldnt need my approval for that"
  //
  // So the pairing moved into sync_supervised_workouts_to_appointments(), which
  // performs the move instead of proposing it, and the detector was reduced to
  // the two reasons that still need a human: an appointment nothing covers, and
  // a slot that has gone away. Migration
  // 20260821171049_detector_stops_proposing_moves_and_cancellations.
  //
  // The four old tests are not weakened, they are inverted: what they guarded
  // is now guarded by its ABSENCE here and by its presence in the mover, which
  // tests/unit/scheduleNeverOverridesAPerson.test.ts holds to the same rules.
  const { file, body } = lastDefinition("detect_schedule_changes");

  assert.doesNotMatch(
    body,
    /insert into schedule_change_proposals[\s\S]{0,400}'moved'/i,
    `${file} proposes moves again — the sync performs them, and asking twice is the friction he removed`,
  );
  assert.doesNotMatch(
    body,
    /insert into schedule_change_proposals[\s\S]{0,400}'cancelled'/i,
    `${file} proposes cancellations again`,
  );
  // And it actively retires any left over from the old design, so a proposal
  // filed before the change cannot sit in his queue forever.
  assert.match(
    body,
    /set status = 'superseded'[\s\S]{0,200}reason in \('moved', 'cancelled'\)/i,
    `${file} leaves pre-change 'moved' and 'cancelled' proposals pending`,
  );
  // Only two reasons may be written now.
  const reasons = new Set(
    [...body.matchAll(/insert into schedule_change_proposals[\s\S]*?'(\w+)',\s*(?:'|case)/gi)].map((m) => m[1]),
  );
  for (const r of reasons) {
    assert.ok(
      ["uncovered", "retired"].includes(r),
      `${file} writes a '${r}' proposal — only 'uncovered' and 'retired' still need a human`,
    );
  }
});

test("the detector never deletes a scheduled workout", () => {
  const { file, body } = lastDefinition("detect_schedule_changes");
  assert.doesNotMatch(body, /delete\s+from\s+scheduled_workouts/i, `${file} deletes schedule rows`);
  assert.doesNotMatch(body, /update scheduled_workouts/i, `${file} edits the schedule — detection proposes, approval applies`);
});

test("proposals are superseded, never deleted", () => {
  const { file, body } = lastDefinition("detect_schedule_changes");
  assert.doesNotMatch(body, /delete\s+from\s+schedule_change_proposals/i, `${file} destroys proposal history`);
});

test("the previous detector definition was backed up before being replaced", () => {
  assert.ok(
    backupExists("detect_schedule_changes"),
    "no migration captures the old detector — the change is not reversible from the repo",
  );
});

test("the rows retired by the rule change were recorded first", () => {
  // Superseding 11 pending proposals is a state change and has to be undoable.
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const m = files.find((f) => /bak_scp_superseded_20260816/i.test(readFileSync(join(DIR, f), "utf8")));
  assert.ok(m, "the pending proposals this change retires are not recorded anywhere");
  const sql = readFileSync(join(DIR, m!), "utf8");
  assert.match(sql, /insert into public\.bak_scp_superseded_20260816/i, "the table is created but never filled");
  assert.match(sql, /prev_status/, "nothing records what the status was before");
  assert.doesNotMatch(stripSql(sql), /delete\s+from\s+public\.schedule_change_proposals/i, "it deletes proposals instead of superseding them");
});

// ── resolve_schedule_proposal ──────────────────────────────────────────────

test("approving a move moves THAT session, not the whole day", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(body, /where sw\.id = v_p\.scheduled_workout_id/i, `${file} still matches by date and moves every session on it`);
  // from_date is kept as a staleness guard, not as the selector.
  assert.match(body, /and sw\.scheduled_date = v_p\.from_date/i, `${file} would move a session that has already been moved`);
});

test("a move with no session id is refused rather than guessed", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(
    body,
    /if v_p\.scheduled_workout_id is null then\s+raise exception/i,
    `${file} falls back to matching by date when it does not know which session`,
  );
});

test("unsupervised homework on the target date is not a collision", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(
    body,
    /not exists \(select 1 from scheduled_workouts x[\s\S]*?and x\.supervised/i,
    `${file} still counts a client's own homework as an occupied date — every move no-ops`,
  );
  // Two supervised sessions on one date is still refused, and the row being
  // moved is not its own blocker.
  assert.match(body, /and x\.id <> sw\.id/i, `${file} lets the moving row block itself`);
});

test("a logged session is still never moved", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(body, /and sw\.workout_log_id is null/i, `${file} would move a session that has already been logged`);
});

test("applying is still an UPDATE — never delete-and-reinsert", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(body, /update scheduled_workouts sw\s+set scheduled_date = v_p\.to_date, moved_from_date = v_p\.from_date/i,
    `${file} no longer preserves the row and its provenance`);
  assert.doesNotMatch(body, /delete\s+from\s+scheduled_workouts/i, `${file} deletes and reinserts — that breaks workout_log_id and history`);
  assert.doesNotMatch(body, /insert into scheduled_workouts/i, `${file} reinserts schedule rows`);
});

test("every reason other than 'moved' still touches no schedule rows", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  // One UPDATE against scheduled_workouts in the whole function, in the 'moved'
  // branch. Counted rather than matched: a second one added to the
  // acknowledge branch is exactly the regression this rules out.
  const edits = (body.match(/update scheduled_workouts/gi) || []).length;
  assert.equal(edits, 1, `${file} edits the schedule in ${edits} places — acknowledging is not applying`);
});

test("resolving is still trainer-only and still refuses to act twice", () => {
  const { file, body } = lastDefinition("resolve_schedule_proposal");
  assert.match(body, /resolve_schedule_proposal is trainer-only/, `${file} lost its trainer gate`);
  assert.match(body, /refusing to act twice/, `${file} lets an approved proposal be applied again`);
});

test("nothing auto-applies: approval comes in as an argument", () => {
  const { body } = lastDefinition("resolve_schedule_proposal");
  assert.match(body, /p_decision not in \('approve','reject'\)/);
  const { body: det } = lastDefinition("detect_schedule_changes");
  assert.doesNotMatch(det, /resolve_schedule_proposal/i, "the nightly detector calls the apply function — approval must stay manual");
});

test("the previous resolve definition was backed up before being replaced", () => {
  assert.ok(
    backupExists("resolve_schedule_proposal"),
    "no migration captures the old resolve function — the change is not reversible from the repo",
  );
});
