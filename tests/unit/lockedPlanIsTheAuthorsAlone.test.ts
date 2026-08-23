// A PLAN THE APP MAY NOT WRITE.
//
// Dustin, 22 Aug: "I need to be able to change any part of my meal plan through
// that project and the app should never change it period. i plan it, I schedule
// it, i change it all from that project period... the app does not design my
// mesl plan, I do. fix it!"
//
// The enforcement is a database trigger (migration 20260822g), because that is
// the only place a rule survives a route nobody remembered to check. Two things
// about that trigger cost a round of testing each, and both are pinned here so
// a future edit cannot quietly undo them:
//
//   1. It must NOT test current_user. Inside a SECURITY DEFINER function
//      current_user is the function's OWNER, always `postgres`, never the
//      caller — the first version let every single app write through while
//      looking exactly like it worked. The caller's identity lives in the
//      `role` GUC, which PostgREST sets per request.
//
//   2. It must NOT reach for new.<column> inside a CASE over tg_table_name.
//      plpgsql demands every branch's column exist on the row type, so
//      `new.meal_plan_id` in a meal_plans trigger aborted the write for EVERY
//      client, locked or not. Field access on a `record` variable resolves at
//      run time; the IF ladder does.
//
// The app-side check is a courtesy on top: it turns the refusal into a sentence
// instead of a 500. Every route that writes plan tables must consult it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planIsLocked, lockedPlanMessage } from "../../src/lib/nutrition/planLock.ts";

const ROOT = join(import.meta.dirname, "..", "..");
// Comments in this migration DISCUSS both traps by name. Strip them, or the
// explanation of the bug reads as the bug.
const stripSqlComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const MIGRATION = stripSqlComments(readFileSync(
  join(ROOT, "supabase", "migrations", "20260822g_a_locked_meal_plan_belongs_to_its_author.sql"),
  "utf8",
));

const fakeDb = (row: unknown) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
});

test("a locked client is reported locked", async () => {
  assert.equal(await planIsLocked(fakeDb({ plan_locked: true }), "c1"), true);
});

test("an unlocked client is not", async () => {
  assert.equal(await planIsLocked(fakeDb({ plan_locked: false }), "c1"), false);
  assert.equal(await planIsLocked(fakeDb(null), "c1"), false);
});

test("no client id is never treated as locked", async () => {
  assert.equal(await planIsLocked(fakeDb({ plan_locked: true }), null), false);
  assert.equal(await planIsLocked(fakeDb({ plan_locked: true }), undefined), false);
});

test("the refusal names the place the change belongs", () => {
  assert.match(lockedPlanMessage(), /Command Center/);
});

test("the guard reads the role GUC, not current_user", () => {
  assert.match(MIGRATION, /current_setting\('role', true\)/);
  assert.ok(
    !/\bcurrent_user\b/.test(MIGRATION),
    "current_user is the definer inside SECURITY DEFINER — testing it lets every app write through",
  );
});

test("the guard resolves the row at run time, not through new.<column>", () => {
  assert.ok(
    !/\bnew\.meal_plan_id\b/.test(MIGRATION) && !/\bnew\.meal_id\b/.test(MIGRATION),
    "a CASE over new.<column> aborts writes for every client, locked or not",
  );
  assert.match(MIGRATION, /r\.meal_plan_id/);
  assert.match(MIGRATION, /r\.meal_id/);
});

test("the guard covers all four plan tables, every operation", () => {
  for (const table of ["meal_plans", "meals", "meal_items", "macro_targets"]) {
    const re = new RegExp(
      `before insert or update or delete on public\\.${table}\\s*\\n\\s*for each row execute function public\\.guard_locked_meal_plan\\(\\)`,
    );
    assert.match(MIGRATION, re, `${table} is not guarded for all three operations`);
  }
});

test("every route that writes a plan table asks first", () => {
  const routes = [
    "src/app/api/nutrition/plan-edit/route.ts",
    "src/app/api/nutrition/adopt-plan/route.ts",
    "src/app/api/nutrition/plan-restore/route.ts",
    "src/app/api/nutrition-ai/plan-build/route.ts",
    "src/lib/ai/agent-tools.ts",
  ];
  for (const r of routes) {
    const src = readFileSync(join(ROOT, r), "utf8");
    assert.match(src, /planIsLocked\(/, `${r} writes plan tables without checking the lock`);
  }
});
