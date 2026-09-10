// ============================================================================
// ONE CLIENT, ONE COPY.
//
// 10 Sep 2026, 9:54am Central. Programming was run for a new client, Mary
// Ellen: 35 workouts scheduled in one INSERT, on days that live in the library
// programme "Solo Training — 3-Day". Three minutes later: 70 programmes named
// "Solo Training — 3-Day — Mary", 10,150 days, 102,585 prescribed exercises,
// none of them used.
//
// Two BEFORE INSERT triggers on scheduled_workouts fire in name order, and the
// order was wrong. The assignment stamp ran first, found no assignment on the
// library programme, inserted one, and the programme-isolation trigger copied
// the WHOLE programme. Then day isolation forked the one day into the client's
// personal programme and the copy was never looked at again -- so the next row
// did it all over. One full copy per scheduled row.
//
// Red proof, rolled back against production: 2 rows -> +2 programmes, +294
// days. Green proof after the migration: 2 rows -> +0, both rows in "Mary —
// Personal Workouts" with that programme's assignment.
//
// This asserts against the migration that is the record of what is deployed:
//   1. day isolation is named to fire before the stamp,
//   2. a copy remembers its parent and the isolation trigger reuses it,
//   3. the stamp treats an assignment on the copy as one on the parent,
//   4. no migration re-creates the old trigger name behind it.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "supabase/migrations");
const FILE = "20260910d_one_client_one_copy.sql";
const sql = fs.readFileSync(path.join(DIR, FILE), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");

function body(fn: string): string {
  const start = code.indexOf(`create or replace function public.${fn}(`);
  assert.ok(start >= 0, `${fn} is defined in ${FILE}`);
  const end = code.indexOf("$function$;", start);
  return code.slice(start, end);
}

describe("one client, one copy", () => {
  it("day isolation is named to fire before the assignment stamp", () => {
    const m = code.match(/create trigger (\S+)\s+before insert or update of day_id, client_id, status on public\.scheduled_workouts\s+for each row execute function public\.sw_enforce_day_isolation\(\)/);
    assert.ok(m, "the day-isolation trigger is re-created on scheduled_workouts");
    const name = m![1];
    // Postgres fires same-event triggers in name order (C collation).
    assert.ok(name < "trg_stamp_scheduled_workout_assignment", `${name} sorts before the stamp`);
    assert.ok(name < "trg_sw_derive_assignment", `${name} sorts before the assignment derivation`);
    assert.match(code, /drop trigger if exists trg_sw_enforce_day_isolation on public\.scheduled_workouts/, "the old, late-firing name is dropped");
  });

  it("a copy remembers its parent, and the isolation trigger reuses it", () => {
    assert.match(code, /alter table public\.programs\s+add column if not exists forked_from_program_id uuid references public\.programs\(id\)/);
    const fn = body("pa_enforce_program_isolation");
    assert.match(fn, /p\.forked_from_program_id = new\.program_id/, "looks for this client's existing copy of the programme");
    assert.match(fn, /if v_existing is not null then[\s\S]*?new\.program_id := v_existing;\s*return new;/, "and points the assignment at it instead of copying again");
    assert.match(fn, /insert into programs \([^)]*forked_from_program_id\)[\s\S]*?now\(\), now\(\), new\.program_id/, "a new copy is stamped with its parent");
  });

  it("the stamp treats an assignment on the copy as an assignment on the parent", () => {
    const fn = body("stamp_scheduled_workout_assignment");
    assert.match(fn, /pa\.program_id = v_program or p\.forked_from_program_id = v_program/);
    assert.match(fn, /if v_actual is distinct from v_program then[\s\S]*?nd\.label = v_label/, "and follows it to the matching day in the copy");
  });

  it("no later migration brings the late-firing trigger back", () => {
    const later = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > FILE);
    for (const f of later) {
      const s = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^\s*--.*$/gm, "");
      assert.doesNotMatch(s, /create trigger trg_sw_enforce_day_isolation\b/, `${f} re-creates the old trigger name, which fires after the stamp`);
    }
  });
});
