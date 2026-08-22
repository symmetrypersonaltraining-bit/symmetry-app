// RLS MUST NOT RE-DERIVE "WHO AM I" FOR EVERY ROW.
//
// The trainer's schedule query was measured at 1806ms against production on
// 22 Aug, of which 1803ms was the row filter:
//
//     Filter: (trainer_can_see_client(client_id) OR (client_id = my_client_id()))
//
// Both are STABLE, but both are called per row — trainer_can_see_client() with a
// different argument each time — and each call runs is_trainer(), is_owner() and
// my_trainer_id() against `trainers` and auth.users. Hoisting the invariants
// into scalar sub-selects makes them InitPlans, evaluated once: 4.5ms.
//
// This test exists because the fix is INVISIBLE. A policy written the slow way
// is correct, passes every isolation test, and looks tidier. Nothing but a
// stopwatch tells you it is wrong, and the symptom reaches Dustin as "the app
// is stuck", never as "a policy is inefficient".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "supabase/migrations");
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const ALL = FILES.map((f) => fs.readFileSync(path.join(DIR, f), "utf8"));

/** The last migration that ALTERs or CREATEs the named policy. */
function policyText(name: string): string {
  const re = new RegExp("(alter|create)\\s+policy\\s+\"?" + name + "\\b", "i");
  let out = "";
  for (const sql of ALL) if (re.test(sql)) out = sql;
  assert.ok(out, `no migration defines the policy ${name}`);
  return out;
}

// The helpers whose answer is the same for every row in a statement.
const INVARIANT = ["is_trainer", "is_owner", "my_trainer_id", "my_client_id"];

test("the scheduled_workouts policies call each identity helper once, not per row", () => {
  const sql = policyText("trainer_all_scheduled_workouts");
  // Everything after the last `alter policy` — the predicate itself, not the
  // explanation above it.
  const body = sql.slice(sql.search(/alter\s+policy/i)).replace(/--[^\n]*/g, "");
  for (const fn of INVARIANT) {
    const bare = new RegExp("(?<!select\\s)(?<!\\.)\\bpublic\\." + fn + "\\s*\\(", "g");
    for (const m of body.matchAll(new RegExp("public\\." + fn + "\\s*\\(", "g"))) {
      const before = body.slice(Math.max(0, m.index - 12), m.index);
      assert.match(before, /\(\s*select\s+$/i,
        `public.${fn}() is called without a wrapping (select …), so Postgres ` +
        `evaluates it once PER ROW instead of once per statement`);
    }
    void bare;
  }
});

test("trainer_can_see_client is not called per row on the hot table", () => {
  const sql = policyText("trainer_all_scheduled_workouts");
  const body = sql.slice(sql.search(/alter\s+policy/i)).replace(/--[^\n]*/g, "");
  assert.ok(!/trainer_can_see_client\s*\(/.test(body),
    "the policy is back to a per-row function call over every scheduled workout");
});

test("the predicate still says the same thing", () => {
  // Not a substitute for the fingerprint check recorded in the migration, but
  // it pins the four branches so a later edit cannot quietly drop one — losing
  // the `is_trainer()` guard would open every row to any signed-in person.
  const sql = policyText("trainer_all_scheduled_workouts");
  const body = sql.slice(sql.search(/alter\s+policy/i)).replace(/--[^\n]*/g, "");
  assert.match(body, /select public\.is_trainer\(\)/, "the non-trainer guard is gone");
  assert.match(body, /client_id is null/, "the unassigned-row branch is gone");
  assert.match(body, /select public\.is_owner\(\)/, "the owner branch is gone");
  assert.match(body, /c\.trainer_id = \(select public\.my_trainer_id\(\)\)/,
    "the own-clients branch is gone");
});

test("it was ALTERed, never dropped and recreated", () => {
  const sql = policyText("trainer_all_scheduled_workouts");
  assert.match(sql, /alter policy/i);
  assert.ok(!/drop\s+policy[^\n]*trainer_all_scheduled_workouts/i.test(sql),
    "DROP then CREATE leaves a window where the policy denies every row — this " +
    "was applied while a client session was being logged");
});
