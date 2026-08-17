// Guard: a client's own unsupervised work never stops a workout following its
// appointment.
//
// ── DUSTIN, 16 AUG ─────────────────────────────────────────────────────────
//
//   "unsupervised workouts should not block a move. I have that set to move
//    workouts as I make schedule changes so that when I pull up the app that
//    day the right workout is there. nothing should block that system, fix it."
//
// ── MEASURED ───────────────────────────────────────────────────────────────
//
// Dates in the next 28 days holding at least one live scheduled_workouts row:
//
//   562 occupied dates
//   413 of them (73%) hold NO supervised session — homework only
//   29 clients affected, i.e. every active client
//
// Under the old guard every one of those 413 read as "occupied" and refused a
// move. The guard exists to stop two supervised sessions colliding; it was
// instead refusing three quarters of the calendar.
//
// ── THE SCHEMA ALREADY SAID SO ─────────────────────────────────────────────
//
// uq_scheduled_workout_one_per_day is UNIQUE (client_id, day_id,
// scheduled_date) — keyed on day_id, NOT on the date alone. Several rows per
// date are legal by design, which is exactly what a supervised session plus
// that day's homework is. Every unfiltered "is this date occupied?" test
// contradicts the constraint the table actually carries. That is why the same
// bug appeared in three separate functions.
//
// Reads the LAST definition in the migrations, so a later migration quietly
// restoring the unfiltered check fails here. Comments are stripped first: the
// migration headers quote the old code verbatim, and an explanation must never
// satisfy a test about the code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");
const stripSql = (s: string) => s.replace(/--.*$/gm, "");

function lastDefinition(fn: string): { file: string; body: string } {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, "i");
  const defs = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(DIR, f), "utf8") }))
    .filter((m) => re.test(m.sql))
    .map((m) => ({ file: m.file, body: stripSql(m.sql.slice(m.sql.search(re))) }));
  assert.ok(defs.length > 0, `${fn} lives only in the database — it must ship as a migration`);
  return defs[defs.length - 1];
}

const SYNC = lastDefinition("sync_supervised_workouts_to_appointments");

test("homework on the target date does not block the move", () => {
  assert.match(
    SYNC.body,
    /not exists \(\s*select 1 from scheduled_workouts x[\s\S]*?and x\.supervised/i,
    `${SYNC.file} still counts unsupervised work as an occupied date — 413 of 562 dates would refuse a move`,
  );
});

test("the row being moved is not its own blocker", () => {
  assert.match(SYNC.body, /and x\.id <> sw\.id/i, `${SYNC.file} lets the moving row block itself`);
});

test("two supervised sessions on one day is still refused", () => {
  // The collision the guard was actually written for. Deleting the check
  // outright would "unblock" the system by letting sessions stack.
  assert.match(SYNC.body, /not exists \(\s*select 1 from scheduled_workouts x/i,
    `${SYNC.file} has no occupancy guard at all — supervised sessions can now stack`);
});

test("every other safety rule survived", () => {
  // Unblocking one thing must not quietly unblock the rest. Each of these is
  // the difference between "follows the calendar" and "rewrites history".
  const rules: [RegExp, string][] = [
    [/and sw\.supervised\b/i, "supervised sessions only — homework must not be dragged around"],
    [/and sw\.workout_log_id is null/i, "never move a session that has been logged"],
    // Rule 4 is no longer a bare `moved_from_date is null` — it now exempts the
    // job's own moves so a session can be followed more than once. What must
    // survive is the HUMAN half: a move this job did not make is still skipped.
    [/and \(sw\.moved_from_date is null or sw\.moved_by = 'calendar_sync'\)/i, "never override a manual move"],
    [/and a\.status = 'scheduled'/i, "the appointment must still be live"],
    [/and c\.archived_at is null/i, "skip archived clients"],
    [/join appointments a on a\.id = sw\.appointment_id/i, "only a workout already linked to that appointment"],
    [/sw\.scheduled_date >= v_tomorrow/i, "future only — never rewrite today or the past"],
  ];
  for (const [re, why] of rules) {
    assert.match(SYNC.body, re, `${SYNC.file} lost a guard: ${why}`);
  }
});

test("it moves rows, and never deletes or inserts them", () => {
  assert.match(SYNC.body, /set scheduled_date\s*=\s*cd\.new_date,\s*moved_from_date = cd\.old_date/i,
    `${SYNC.file} no longer preserves the row and its provenance`);
  assert.doesNotMatch(SYNC.body, /delete\s+from\s+scheduled_workouts/i, `${SYNC.file} deletes schedule rows`);
  assert.doesNotMatch(SYNC.body, /insert into scheduled_workouts/i, `${SYNC.file} reinserts schedule rows`);
});

test("the dry run really is dry", () => {
  // The only way to inspect this job before it acts. If p_dry_run stopped
  // gating the update, checking what it would do would BE doing it.
  assert.match(SYNC.body, /and not p_dry_run/i, `${SYNC.file}: the dry run writes`);
});

test("the previous definition was backed up before being replaced", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const backup = files.find((f) => {
    const sql = readFileSync(join(DIR, f), "utf8");
    return (
      /create table if not exists public\.bak_sync_supervised_workouts/i.test(sql) &&
      /pg_get_functiondef/i.test(sql) &&
      /'sync_supervised_workouts_to_appointments'/.test(sql)
    );
  });
  assert.ok(backup, "no migration captures the old definition — the change is not reversible from the repo");
});

test("all three copies of this bug are fixed together", () => {
  // The same unfiltered occupancy test appeared in three functions. Fixing one
  // and leaving another is how it comes back: whichever path is used next is
  // still blocked, and it reads as the fix not having worked.
  //
  // The third, generate_scheduled_workouts, was fixed on 17 Aug and is checked
  // separately below — it writes the guard as a positive `exists ... as
  // slot_already_covered` rather than the `not exists` these two share, so one
  // regex cannot cover all three. The count in this test's name is the point:
  // when it said "three" and listed two, the third had been left behind.
  for (const fn of ["resolve_schedule_proposal", "sync_supervised_workouts_to_appointments"]) {
    const { file, body } = lastDefinition(fn);
    // Bounded window rather than "up to the next )": the guard's own body
    // contains parentheses — (a.scheduled_at at time zone …) — so a lazy match
    // to the first bracket stops short of the filter and reports a fixed
    // function as broken. Both guards are well under 400 characters.
    assert.match(
      body,
      /not exists \(\s*select 1 from scheduled_workouts x[\s\S]{0,400}?x\.supervised/i,
      `${file}: ${fn} still counts homework as occupied`,
    );
  }
});

// ── The job could only ever move a session once ────────────────────────────
//
// Rule 4 skips any row with a moved_from_date, and the job's own UPDATE sets
// that column. So it moved each session exactly once and then skipped it
// forever — a client who reschedules twice stopped being followed after the
// first change, silently, by a rule aimed at manual moves.
//
// Rule 4 cannot simply go: Dustin was asked directly which wins when he drags a
// session on the board and the appointment later moves, and chose HIS DRAG
// STICKS. So the rule had to learn the difference between a move a person made
// and a move this job made.
//
// scheduled_workouts.moved_by, NULL meaning human. The seven app paths that
// move a workout all leave it null and are therefore left alone without any of
// them being touched. A path that forgot to mark itself would otherwise have
// had its move quietly undone on the next cron tick — that failure is silent,
// so the default has to be the safe one rather than the tidy one.

test("the job can move a session it already moved", () => {
  assert.match(
    SYNC.body,
    /\(sw\.moved_from_date is null or sw\.moved_by = 'calendar_sync'\)/i,
    `${SYNC.file}: rule 4 still blocks the job's own earlier move — each session can be followed only once`,
  );
});

test("the job marks its own moves, or it cannot recognise them next time", () => {
  assert.match(
    SYNC.body,
    /set scheduled_date\s*=\s*cd\.new_date,\s*moved_from_date = cd\.old_date,\s*moved_by\s*=\s*'calendar_sync'/i,
    `${SYNC.file}: the move is not stamped, so the exemption above can never match`,
  );
});

test("a human move is still left alone — NULL means human", () => {
  // The half that implements Dustin's answer. An exemption written as
  // `moved_by is distinct from 'trainer'` would treat every unmarked app move
  // as fair game and undo his drags.
  assert.doesNotMatch(
    SYNC.body,
    /moved_by is distinct from/i,
    `${SYNC.file}: unmarked moves are treated as non-human, so a board drag gets undone`,
  );
  assert.doesNotMatch(
    SYNC.body,
    /moved_by is null or/i,
    `${SYNC.file}: a null moved_by is being treated as eligible rather than as a person`,
  );
});

test("the column ships as a migration", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  // Anchored. Without the boundary this passes for a migration adding
  // `moved_by_unused` — the column the function reads would still not exist,
  // and rule 4's exemption would silently never match. The same prefix hole
  // was found in the detector guard earlier today.
  const m = files.find((f) => /add column if not exists moved_by\b/i.test(readFileSync(join(DIR, f), "utf8")));
  assert.ok(m, "moved_by exists only in the database — it must ship as a migration");
});

// ── The third copy: generation refused a whole pattern-day over homework ────
//
// Dustin, 17 Aug: "it should never refuse if me or my client does it. it goes
// wherever we put it. the app should only auto generate or move assigned
// workouts to days they are on the schedule so it's right in the app but if we
// override it leave it alone."
//
// Measured the same day over five weeks: seven pattern-days refused for no
// reason — four supervised sessions blocked by that client's own homework
// (Sharon Rambo 22 Aug, Greg Lennon 7/14/21 Sep) and three of Greg's Daily
// Reset Walks blocked by his supervised Saturday session.

const GEN = lastDefinition("generate_scheduled_workouts");

test("generation asks whether the SLOT is filled, not whether the date is", () => {
  assert.doesNotMatch(
    GEN.body,
    /date_already_covered/i,
    `${GEN.file}: the unfiltered date check is back — a client's own homework suppresses the session they are booked in for`,
  );
  assert.match(
    GEN.body,
    /exists \([\s\S]{0,400}?from scheduled_workouts sw[\s\S]{0,400}?sw\.supervised = cd\.is_sup/i,
    `${GEN.file}: generation no longer compares supervised against supervised`,
  );
});

test("two supervised sessions in one day is still refused", () => {
  // Widening this into "generate everything always" is the opposite failure and
  // would double-book him at the gym.
  assert.match(
    GEN.body,
    /slot_already_covered\s+then\s+'skipped_existing'/i,
    `${GEN.file}: nothing is skipped for being already filled — sessions can now stack`,
  );
});

test("a session moved off its pattern day is not put back", () => {
  // Rule 1 opens this hole and the over-broad guard was accidentally covering
  // it. Sara Prince pulled her 19 Aug ankle mobility forward to the 17th and
  // completed it; without this, generation hands the 19th straight back to her.
  assert.match(
    GEN.body,
    /exists \([\s\S]{0,400}?sw\.moved_from_date = cd\.sched_date/i,
    `${GEN.file}: generation re-creates sessions a human has already moved away`,
  );
  assert.match(
    GEN.body,
    /moved_off_this_date\s+then\s+'skipped_moved_away'/i,
    `${GEN.file}: the moved-away skip is computed and then not acted on`,
  );
});

test("the new log action is allowed by the log's CHECK constraint", () => {
  // The constraint listed three actions and this function is its only writer,
  // so shipping the action without widening the CHECK turns every skipped_moved_away
  // row into a failed insert — and the failure would surface as generation
  // dying, not as a missing log line.
  const sql = readFileSync(join(DIR, GEN.file), "utf8");
  assert.match(sql, /schedule_generation_log_action_check/,
    `${GEN.file}: the action CHECK is untouched but a new action was added`);
  assert.match(sql, /'skipped_moved_away'::text/,
    `${GEN.file}: the CHECK does not allow the action the function writes`);
  // And it must be widened BEFORE the body: a statement placed after a
  // dollar-quoted body in one migration is silently dropped (16 Aug).
  assert.ok(sql.indexOf("schedule_generation_log_action_check") < sql.indexOf("AS $function$"),
    `${GEN.file}: the constraint change sits after the function body, where it is silently dropped`);
});

test("the old generation definition is captured before it is replaced", () => {
  const sql = readFileSync(join(DIR, GEN.file), "utf8");
  assert.match(sql, /create table if not exists public\.bak_generate_scheduled_workouts/i,
    `${GEN.file}: no backup table — the change is not reversible from the repo`);
  assert.ok(sql.indexOf("bak_generate_scheduled_workouts") < sql.indexOf("create or replace function public.generate_scheduled_workouts"),
    `${GEN.file}: the backup is taken after the replacement, so it captures the NEW definition`);
});
