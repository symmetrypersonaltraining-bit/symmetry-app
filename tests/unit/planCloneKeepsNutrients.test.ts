// Guard: every meal-plan cloner names kcal and micros in its column list.
//
// `src/app/api/nutrition/plan-edit/route.ts` carries this above its own clone:
//
//   "kcal + micros MUST be in this list. It is an explicit column list, so a
//    column missing from it is silently dropped when the plan is cloned -
//    the trap flagged in docs/BACKLOG.md item 4."
//
// It was fixed there. `generate_rotation_plans()` — the same clone, from the
// database, on pg_cron job 14 every morning at 06:20 CT, generating ten weeks
// of plans ahead — had the identical explicit column list and was missing both.
//
// ── Measured before changing it, because "could happen" is not a reason ────
//
//   select count(*), count(*) filter (where kcal is not null),
//          count(*) filter (where micros is not null) from meal_items;
//   → 1566 rows, 0 with kcal, 0 with micros.
//
// So it was LATENT, not active. Nothing was being lost because nothing has ever
// been there — the clone was faithful by accident.
//
// Fixed now rather than later for one reason: the app has just started
// producing that data. FoodSearchSheet carries the full nutrient bag
// (`d445002`), the AI parse path carries it (`3c59a08`), and plan-edit already
// copies both columns. The first plan built with real nutrient data would be
// stripped of it for every rotation client — 24 plans, 724 items, out to 19
// October — and the symptom would surface weeks later as "the nutrients are
// missing on future plans", which is a miserable thing to diagnose backwards.
//
// This test reads the migrations in order and checks the LAST definition, so a
// later migration that reintroduces a short column list fails here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");

function lastDefinitionOf(fnName: string): { file: string; body: string } | null {
  const defs = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(DIR, f), "utf8") }))
    .filter((m) => new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fnName}`, "i").test(m.sql));
  if (!defs.length) return null;
  const last = defs[defs.length - 1];
  const i = last.sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fnName}`, "i"));
  return { file: last.file, body: last.sql.slice(i) };
}

test("the rotation cloner ships as a migration", () => {
  assert.ok(lastDefinitionOf("generate_rotation_plans"), "it lives only in the database");
});

test("the rotation cloner copies kcal and micros", () => {
  const d = lastDefinitionOf("generate_rotation_plans")!;
  const i = d.body.indexOf("insert into meal_items");
  assert.ok(i > 0, "the meal_items clone is gone");
  const stmt = d.body.slice(i, d.body.indexOf(";", i));
  // Both halves: the column list AND the select list. Naming a column and not
  // selecting it inserts a null, which is the same silent loss wearing a
  // different hat.
  assert.match(stmt, /\(meal_id,[^)]*\bkcal\b[^)]*\)/, `${d.file}: kcal is not in the column list`);
  assert.match(stmt, /\(meal_id,[^)]*\bmicros\b[^)]*\)/, `${d.file}: micros is not in the column list`);
  assert.match(stmt, /mi\.kcal/, `${d.file}: kcal is named but never selected`);
  assert.match(stmt, /mi\.micros/, `${d.file}: micros is named but never selected`);
});

test("the app-side cloner still copies them too", () => {
  // The one that was already fixed. If this regresses, the two disagree again
  // and only one of them is tested by the migration above.
  const route = readFileSync(join(process.cwd(), "src/app/api/nutrition/plan-edit/route.ts"), "utf8");
  const i = route.indexOf('.from("meal_items").select(');
  assert.ok(i > 0);
  const sel = route.slice(i, i + 260);
  assert.match(sel, /kcal/, "plan-edit stopped copying kcal");
  assert.match(sel, /micros/, "plan-edit stopped copying micros");
});

test("the previous rotation definition was backed up", () => {
  // A comment naming a bak_ table is not a backup: there has to be a migration
  // that creates it and puts pg_get_functiondef into it.
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const backup = files.find((f) => {
    const sql = readFileSync(join(DIR, f), "utf8");
    return (
      /create table if not exists public\.bak_generate_rotation_plans/i.test(sql) &&
      /pg_get_functiondef/i.test(sql) &&
      /'generate_rotation_plans'/.test(sql)
    );
  });
  assert.ok(backup, "the change is not reversible from the repo");
});

test("nothing else about the rotation changed", () => {
  // The horizon, the already-exists skip and the version numbering are what
  // make this safe to re-run. A fix that quietly altered one of them would be
  // far worse than the latent bug it was fixing.
  const d = lastDefinitionOf("generate_rotation_plans")!;
  assert.match(d.body, /p_horizon_weeks integer default 10/);
  assert.match(d.body, /if exists \(select 1 from meal_plans mp where mp\.client_id = rot\.client_id and mp\.effective_date = mday\) then\s*\n\s*continue;/);
  assert.match(d.body, /coalesce\(max\(mp\.version_number\), 0\) \+ 1/);
  assert.match(d.body, /'pending'/, "auto-rotation plans must stay pending, never live");
});
