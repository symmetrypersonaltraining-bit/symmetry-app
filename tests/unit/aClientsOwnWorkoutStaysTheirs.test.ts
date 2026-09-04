// WHOSE WORKOUT IS IT.
//
// Dustin, 4 Sep: *"i want all workouts from my library visible for all clients.
// for workouts created and saved by a client it should only be visible to that
// client in their personal library."*
//
// Half of that worked. `client_reads_shared_library` (3 Sep) put his whole
// library in front of every client, which is the first half. The second half
// leaked through `client_own_days`, a policy that granted every day of every
// programme a client is ASSIGNED to and never looked at who made the day.
//
// Several clients share one programme row — "Solo Training — 3-Day" is assigned
// to a handful of people — so a day stamped with one client's `client_owner_id`
// was readable by all of them. Measured before the fix: 21 day-rows reachable by
// the wrong client. Madeleine Coker could read Gerard's and Sharon's personal
// solo programmes, nineteen days whose LABELS carry their injuries — "Low Back
// Day (back is talking today)", "Dizzy Day (lightheaded, everything seated)",
// "Left Leg Quiet". None were scheduled for her.
//
// The two days Jenn could see were the same fault with a gentler cause: they
// were Jennifer's own cardio, built by Dustin while he happened to be signed
// into his client account, so they carried his client id inside her live block.
// Those were re-stamped to the library rather than hidden.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const M = readFileSync(
  join(process.cwd(), "supabase/migrations/20260904c_a_clients_own_workout_stays_theirs.sql"),
  "utf8",
);
/** The statements only. This file explains itself at length, and the prose
 *  names the very policies the checks below assert are left alone. */
const sql = M.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("a day reached through a programme assignment is nobody's or the reader's", () => {
  assert.match(M, /drop policy if exists client_own_days on public\.days;/);
  assert.match(
    M,
    /\(client_owner_id is null or client_owner_id = my_client_id\(\)\)/,
    "the assignment policy still ignores who created the day",
  );
});

test("the assignment check itself is unchanged", () => {
  // Narrowing WHICH programmes a client can read was never the ask, and doing it
  // by accident would take his library away from everybody.
  assert.match(M, /join program_assignments pa on pa\.program_id = ph\.program_id/);
  assert.match(M, /c\.auth_user_id = \(select auth\.uid\(\)\)/);
});

test("auth.uid() stays wrapped as an InitPlan", () => {
  // 3 Sep: 45 policies called auth.uid() once per ROW. Re-introducing an
  // unwrapped call in a policy on `days` — the biggest table a client reads —
  // would undo a measured speed fix.
  assert.ok(!/[^(]auth\.uid\(\)\s*\)?\s*$/m.test(M.replace(/\(select auth\.uid\(\)\)/g, "")),
    "an unwrapped auth.uid() is back in a policy");
});

test("being scheduled for a workout is still its own grant", () => {
  // client_sched_days is deliberately untouched: a client told to do a session
  // must be able to open it, whoever built it.
  assert.ok(!/client_sched_days/.test(sql), "the scheduled-workout grant was altered by this migration");
});

test("the library half of the rule is not touched", () => {
  assert.ok(
    !/client_reads_shared_library/.test(sql),
    "the policy that puts his library in front of every client was changed",
  );
});

// ── AND WHAT HE BUILDS IS THE LIBRARY, WHICHEVER ACCOUNT HE BUILT IT FROM ────
//
// 4 Sep: *"if I created it under my account then it gets saved to my library
// for everyone. only ones that stay on client only are something they create
// themselves from their account. i always create new workouts, those should
// keep building my library bigger."*
//
// He has a client record of his own, so twelve workouts he built while signed
// into the client app were stamped with his client id and went private to him.

const OWNER = readFileSync(
  join(process.cwd(), "supabase/migrations/20260904d_the_owners_workouts_are_the_library.sql"),
  "utf8",
);
const ownerSql = OWNER.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("the owner's stamp is cleared at the write, not just in the data", () => {
  // A one-off UPDATE fixes the twelve that exist. The trigger is what makes it
  // true of the thirteenth, on whichever route creates it — there are at least
  // four that set client_owner_id.
  assert.match(ownerSql, /create trigger trg_owner_creations_are_library/);
  assert.match(ownerSql, /before insert or update of client_owner_id on public\.days/);
  assert.match(ownerSql, /new\.client_owner_id := null;/);
});

test("only the OWNER's stamp is cleared", () => {
  // Another trainer's client-side creation is left alone on purpose: the library
  // is one shared pool with no per-trainer scoping, so clearing their stamp
  // would publish their work to every client in the business.
  assert.match(ownerSql, /t\.role = 'owner'/);
  assert.match(ownerSql, /and t\.active/);
});

test("a client's own creation is never touched by it", () => {
  // The guard is on client_owner_id belonging to a TRAINER, so an ordinary
  // client's row cannot match. If this ever loosens, every client's private
  // workout goes into the shared library at once.
  assert.match(ownerSql, /join trainers t on \(t\.auth_user_id = c\.auth_user_id or lower\(t\.email\) = lower\(c\.email\)\)/);
});

test("the rows it clears are backed up first", () => {
  assert.match(ownerSql, /create table if not exists bak_days_owner_stamp_20260904/);
});
