// A SCHEDULED WORKOUT ALWAYS BELONGS TO AN ASSIGNMENT.
//
// Dustin, 22 Aug: "my corrective is over, bulk starts monday. figure out how
// this keeps happening and get it fixed. thats been an ongoing issue for a long
// time."
//
// It kept happening because two facts were stored separately and nothing tied
// them together: what is on the CALENDAR (scheduled_workouts) and which
// programme the client is "on" (program_assignments.active). assignment_id was
// nullable, so 128 of his sessions existed with no assignment row at all, and
// the app fell back on whatever was still flagged active — two programmes with
// no future sessions between them.
//
// The second half is subtler and is what made the first repair attempt wrong.
// `pa_enforce_program_isolation` makes programmes single-client by deep-copying
// on a second assignment. Dustin and Tyler were scheduled onto the SAME bulk
// days; Dustin's assignment took the programme, Tyler's forked it, and Tyler's
// 88 sessions still pointed at Dustin's copy. So stamping has to follow the
// fork, or it produces a row whose assignment has nothing to do with its day —
// worse than the state it was added to fix.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "supabase/migrations");
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const ALL = FILES.map((f) => fs.readFileSync(path.join(DIR, f), "utf8"));

function defines(needle: string): string {
  const re = new RegExp("create\\s+(or\\s+replace\\s+)?function\\s+public\\." + needle + "\\b", "i");
  let out = "";
  for (const s of ALL) if (re.test(s)) out = s;
  assert.ok(out, `no migration defines ${needle}`);
  return out;
}

const SQL = defines("stamp_scheduled_workout_assignment");

test("the stamp runs before the row lands, on insert and on a day change", () => {
  assert.match(SQL, /before insert or update of day_id on public\.scheduled_workouts/i,
    "an AFTER trigger cannot set the column, and missing the day_id update lets a " +
    "moved workout keep an assignment for a programme it is no longer in");
});

test("it derives the programme from the day, never from a guess", () => {
  assert.match(SQL, /from public\.days d join public\.phases ph on ph\.id = d\.phase_id/i,
    "the programme must come from the day the work is actually on");
});

test("a day with no programme is left alone rather than forced into one", () => {
  assert.match(SQL, /if v_program is null then\s+return new;/i,
    "one-off and client-owned days legitimately have no programme");
});

test("it follows the fork the isolation trigger performs", () => {
  assert.match(SQL, /select program_id into v_actual/i,
    "the assignment's programme is not re-read, so a fork goes unnoticed");
  assert.match(SQL, /v_actual is distinct from v_program/i, "the fork is not detected");
  assert.match(SQL, /nd\.label = v_label/i,
    "days must be matched by LABEL — position restarts per phase, so matching on " +
    "position pairs a day with the wrong one");
  assert.match(SQL, /if v_newday is null then\s+return new;/i,
    "an unrecognisable copy must leave the row unstamped rather than attach an " +
    "assignment whose programme does not contain the day");
});

test("active is derived from the calendar, not declared by hand", () => {
  const m = ALL.find((s) => /set active = exists/i.test(s));
  assert.ok(m, "nothing derives active from scheduled work");
  assert.match(m!, /sw\.scheduled_date >= current_date/i,
    "active must mean 'has work from today onward'");
  assert.match(m!, /where exists \(\s*--[\s\S]{0,220}select 1 from public\.scheduled_workouts sw2/i,
    "without the guard, a client between blocks has every assignment switched off");
});

test("the repair is reversible", () => {
  const joined = ALL.join("\n");
  for (const t of ["bak_program_assignments_20260822", "bak_sw_assignment_20260822"]) {
    assert.ok(joined.includes(t), `the migration does not name its backup table (${t})`);
  }
});
