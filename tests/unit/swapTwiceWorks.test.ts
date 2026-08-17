// Guard: swapping to the same workout twice does not fail.
//
// ── WHAT DUSTIN SAW, 17 AUG ────────────────────────────────────────────────
//
//   Couldn't swap that in — your original workout is still there.
//   duplicate key value violates unique constraint "uq_days_no_identical_twin"
//
// His words: "no limits on being able to replace workouts."
//
// ── THE CHAIN ──────────────────────────────────────────────────────────────
//
// OffPlanBanner inserts into scheduled_workouts → the BEFORE INSERT trigger
// sw_enforce_day_isolation sees a shared library day → fork_day_for_client()
// clones it into a personal copy. That clone was unconditional, so the SECOND
// swap to the same library workout tried to create a second identical fork and
// hit uq_days_no_identical_twin (client_owner_id, phase_id, label, position).
//
// The constraint is right — one client should not collect a pile of identical
// copies of "Stage 1 Treadmill Walk". The forking was wrong to assume it had
// never run before. Swapping to a given workout worked exactly once per client,
// ever, and threw raw Postgres text at them every time after.

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

const FORK = lastDefinition("fork_day_for_client");

test("an existing fork is returned instead of a second one being created", () => {
  assert.match(FORK.body, /select d\.id into v_existing/i,
    `${FORK.file} still forks unconditionally — the second swap to a workout will fail`);
  assert.match(FORK.body, /if v_existing is not null then\s+return v_existing;/i,
    `${FORK.file} looks for the existing fork and then ignores it`);
});

test("the lookup matches the constraint that was being violated", () => {
  // uq_days_no_identical_twin is (client_owner_id, phase_id, label, position)
  // NULLS NOT DISTINCT. Miss a column and the lookup can return the wrong day;
  // use = instead of `is not distinct from` and a NULL label never matches, so
  // the collision comes straight back.
  for (const col of ["client_owner_id", "phase_id", "label", "position"]) {
    assert.ok(
      new RegExp(`d\\.${col}\\s*(=|is not distinct from)`, "i").test(FORK.body),
      `${FORK.file}: the fork lookup ignores ${col}, which the unique index uses`,
    );
  }
  assert.match(FORK.body, /d\.label\s+is not distinct from/i, "a NULL label would never match with =");
  assert.match(FORK.body, /d\.position\s+is not distinct from/i, "a NULL position would never match with =");
});

test("the cloning path still clones everything", () => {
  // Returning early must not have cost the actual fork. A day with no sections
  // and no exercises is an empty workout that looks like it worked.
  assert.match(FORK.body, /insert into days/i);
  assert.match(FORK.body, /insert into sections/i);
  assert.match(FORK.body, /insert into prescribed_exercises/i);
  assert.match(FORK.body, /client_owner_id.*p_client_id|p_client_id, d\.created_by/is,
    "the fork must belong to the client it was forked for");
});

test("the previous definition was backed up before being replaced", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const backup = files.find((f) => {
    const sql = readFileSync(join(DIR, f), "utf8");
    return /create table if not exists public\.bak_fork_day_for_client/i.test(sql)
      && /pg_get_functiondef/i.test(sql)
      && /'fork_day_for_client'/.test(sql);
  });
  assert.ok(backup, "no migration captures the old definition — the change is not reversible from the repo");
});

test("the swap still tells the client their original is safe", () => {
  // The copy that matters when it DOES fail. Losing it would leave someone
  // staring at a raw constraint name with no idea whether their session is gone.
  const banner = readFileSync(join(process.cwd(), "src/components/OffPlanBanner.tsx"), "utf8");
  assert.match(banner, /your original workout is still there/i);
});
