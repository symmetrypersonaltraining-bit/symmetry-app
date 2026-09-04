// A LIBRARY WORKOUT IS NAMED FOR THE WORK, NEVER THE PERSON.
//
// Dustin, 4 Sep: *"we need to rename these. public workouts should never get
// named by client names or initials."* And, on mid-block edits: *"that's a 1
// time thing, i do not want those saved as near duplicates to the library. ...
// just mark them in calendar as modified from original."*
//
// 160 day labels and 6 programme names carried a person. 28 client-code
// prefixes — GG2, SG2, HK6, JD6, KR2, MM2, SP6 and the rest — plus programmes
// ending "— Sara", "— Jennifer", "— Claudine", "— Tyler".
//
// Worse than the initials were the parentheses, because they carried the
// REASON: "(back is talking today)", "(left leg or foot bothering him)",
// "(Dizzy Day (lightheaded, everything seated))". A client searching the
// library would have read his parents' conditions off the workout list.
//
// Conditions stay — they are useful and impersonal. The person goes.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stmts = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const GUARD = read("supabase/migrations/20260904e_library_names_and_no_promotion.sql");
const RENAME = read("supabase/migrations/20260904f_client_codes_out_of_workout_names.sql");
const guard = stmts(GUARD);

// ── the naming guard ────────────────────────────────────────────────────────

test("a client-code prefix is refused", () => {
  assert.match(guard, /v_name ~ '\^\[A-Z\]\{2,4\}\[0-9\]\\s'/);
  assert.match(guard, /cannot be named with a client code/);
});

test("the digit is REQUIRED, so no exercise abbreviation can trip it", () => {
  // BW, DB, KB, SL, GHD, APT all start a legitimate label. Letters alone would
  // have blocked "BW Squat w/ Heel Focus" and every label like it.
  assert.ok(!/\^\[A-Z\]\{2,4\}\\s/.test(guard), "the prefix pattern no longer requires a digit");
});

test("a client's name is refused only where it reads as a person", () => {
  // Position matters: after a dash, after an open paren, or possessive. And a
  // four-letter floor. Without both, "Day" — Jennifer Day — flags every workout
  // in the library, and a first draft of this check matched 200+ innocent
  // labels including "Barn Workout - Day 1".
  assert.match(guard, /length\(split_part\(c\.name, ' ', 1\)\) >= 4/);
  assert.match(guard, /\(—\|–\|-\)\\s\*' \|\| split_part/);
  assert.match(guard, /cannot be named after a client/);
});

test("the error tells him what to do instead", () => {
  // A guard that only says no teaches nothing and gets worked around.
  assert.match(guard, /name it for the work \(pattern, focus, level\), not the person/);
  assert.match(guard, /A condition on its own \("No Overhead", "Low Back Sensitive"\) is fine/);
});

test("a client's own private workout is not policed", () => {
  // The rule is about what the whole roster can see. A client naming their own
  // workout after themselves is nobody else's business.
  assert.match(guard, /if new\.client_owner_id is not null then\s*\n\s*return new;/);
});

test("it fires on the write, on every route", () => {
  assert.match(guard, /before insert or update of label, client_owner_id on public\.days/);
});

// ── the no-promotion guard ──────────────────────────────────────────────────

test("a one-off modification cannot be promoted into the library", () => {
  assert.match(guard, /old\.client_owner_id is not null\s*\n\s*and new\.client_owner_id is null/);
  assert.match(guard, /'library_fork', 'forked_for_swap', 'ai_adjust', 'ai_replace'/);
  assert.match(guard, /not a new library workout\. It stays with the client it was made for/);
});

test("the refusal names the workout it was modified from", () => {
  // "Modified from original" is the language he asked for; the error uses it so
  // the thing he sees names the original rather than an id.
  assert.match(guard, /select label from days where id = new\.swapped_from_day_id/);
});

// ── the rename ──────────────────────────────────────────────────────────────

test("the rename strips the code and keeps the workout", () => {
  assert.match(RENAME, /regexp_replace\(d\.label, '\^\[A-Z\]\{2,4\}\[0-9\]\\s\+', ''\)/);
  assert.match(RENAME, /where d\.label ~ '\^\[A-Z\]\{2,4\}\[0-9\] '/);
});

test("the conditions survive; the person does not", () => {
  // The point of the rename is not to erase why a session exists. "Low Back
  // Sensitive" is useful to everyone; "back is talking today" was addressed to
  // one man about his back.
  assert.match(RENAME, /' \(Low Back Sensitive\)'/);
  assert.match(RENAME, /' \(Left Leg or Foot Sensitive\)'/);
  assert.match(RENAME, /' \(Travel Kit\)'/);
  assert.match(RENAME, /' \(Partner-Assisted\)'/);
  assert.match(RENAME, /' \(Supervised\)'/);
});

test("the old names are kept", () => {
  assert.match(RENAME, /bak_day_labels_initials_20260904 and bak_program_names_20260904/);
});
