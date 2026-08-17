// Guard: the shared library cannot ship without the RLS policy that makes it
// visible — and that policy cannot ship without a migration file.
//
// Dustin, 15 Aug: "i need you to confirm that dylans app we built to mirror
// mine is getting all of these updates live so he can test exactly the way mine
// is set up."
//
// The answer, when he asked, was NO for one specific reason. The library's
// read policy had been applied by hand to the live database through the
// Supabase API, with no file in supabase/migrations/. His instance is a
// separate database that only receives schema through those files, so the code
// would have deployed to his Vercel project and his clients would have opened
// an EMPTY library — RLS returns an empty list, not an error, so there would
// have been nothing in any log to explain it.
//
// docs/DYLAN-INSTANCE.md already said this in as many words: "Not applied by
// hand to one database and remembered later — that is precisely how 186 of them
// went missing." This test is here so the next person cannot do it either.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

test("the library read policy exists as a migration, not just in one database", () => {
  const sql = allMigrationSql();
  assert.match(
    sql,
    /create policy my_meals_library_read/i,
    "my_meals_library_read is not in any migration — a second instance would never get it, " +
      "and its clients would see an empty library with nothing in the logs"
  );
  assert.match(sql, /client_id is null/i, "the policy must actually scope to library rows");
});

test("the policy is a SELECT policy — it must not hand out writes", () => {
  const sql = allMigrationSql();
  const idx = sql.toLowerCase().indexOf("create policy my_meals_library_read");
  const stmt = sql.slice(idx, sql.indexOf(";", idx));
  assert.match(stmt, /for select/i, "a library row must never become client-writable");
  assert.doesNotMatch(stmt, /for (all|insert|update|delete)/i);
  assert.doesNotMatch(stmt, /with check/i, "a SELECT policy has no business carrying a write check");
});

test("it drops before it creates, so re-running a migration is safe", () => {
  const sql = allMigrationSql();
  const dropAt = sql.toLowerCase().indexOf("drop policy if exists my_meals_library_read");
  const createAt = sql.toLowerCase().indexOf("create policy my_meals_library_read");
  assert.ok(dropAt >= 0, "no idempotent drop — a re-run would fail on 'already exists'");
  assert.ok(dropAt < createAt, "the drop has to come first");
});

test("the RECIPE library is readable, and the publish guard still stops clients", () => {
  // The recipes went in as `private` — enforce_recipe_publish() downgrades a
  // public insert unless is_trainer(), and the service role is not a trainer.
  // All twenty were invisible to every client while the sync route reported
  // {"ok":true,"recipes":20}, which was TRUE: the inserts succeeded. A trigger
  // rewrote a column on the way in and no error was ever produced.
  const sql = allMigrationSql();
  assert.match(sql, /create policy recipes_library_read/i, "library recipes must be readable");
  assert.match(
    sql,
    /create policy recipe_ing_library_read/i,
    "a visible recipe listing no ingredients is worse than not showing it"
  );
  // The fix must NOT have been to weaken the trigger or is_trainer(). That
  // trigger is what stops a client publishing a recipe to everybody else.
  assert.doesNotMatch(sql, /drop trigger[^;]*trg_recipe_publish/i);
  // Anchored to the function NAME. `create or replace function[^;]*is_trainer`
  // spans from any function header to the next semicolon, so it fired on the
  // 17 Aug trigger fix because that function's COMMENT quotes the RLS policy
  // "((client_id = my_client_id()) OR is_trainer())" before its first `;` —
  // and it had always been one stray mention away from firing on an unrelated
  // migration. Same lesson as the other source-reading guards this week.
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+(public\.)?is_trainer\b/i,
    "is_trainer() has been redefined — that would relax every RLS policy in the database at once");

  // 17 AUG — THIS RULE IS NARROWED, ON PURPOSE, AND HERE IS WHY.
  //
  // It used to forbid touching enforce_recipe_publish() at all. That was the
  // right instinct and the wrong bound: it forbade the FIX as well as the
  // weakening. The read policy this file checks for was added and the recipes
  // still never appeared, because the Recipes screen asks for
  // `.eq("visibility","public")` and RLS cannot make a 'private' row satisfy a
  // filter the app itself applies. Half a fix reads exactly like a whole one
  // until somebody opens the screen.
  //
  // What shipped instead: library rows — `client_id is null` — are exempt from
  // the guard. A client cannot create one. The INSERT policy is
  // ((client_id = my_client_id()) OR is_trainer()) and NULL = my_client_id() is
  // never true, so a client_id-null row comes only from a trainer or the
  // service role that builds the library. The guard exists to stop a CLIENT
  // self-publishing THEIR OWN recipe, and a library row is neither.
  //
  // Verified against the live database after applying, not reasoned about:
  // updating every client-owned private recipe to 'public' as a non-trainer
  // touched 1 row and left it 'private'; client-owned public stayed at 14.
  //
  // So the rule becomes: the two client branches must survive intact. Their
  // content is pinned in tests/unit/recipeLibraryPublishes.test.ts, with a
  // mutation harness at tests/mutate-recipe-publish.sh covering both directions
  // — the library going dark again, and a client gaining the ability to publish.
  assert.match(sql, /if new\.client_id is null then/i,
    "library recipes are demoted to private on insert again, so the shelf is empty");
  assert.match(sql, /new\.visibility := 'private'/i,
    "a client's public INSERT is no longer demoted — anyone can publish to the shared library");
  assert.match(sql, /new\.visibility := old\.visibility/i,
    "a client's UPDATE to public is no longer reverted — anyone can publish an existing recipe");
});

test("the library read policies are SELECT-only, both tables", () => {
  const sql = allMigrationSql();
  for (const name of ["recipes_library_read", "recipe_ing_library_read", "my_meals_library_read"]) {
    const i = sql.toLowerCase().indexOf(`create policy ${name}`);
    assert.ok(i >= 0, `${name} missing`);
    const stmt = sql.slice(i, sql.indexOf(";", i));
    assert.match(stmt, /for select/i, `${name} must be SELECT-only`);
    assert.doesNotMatch(stmt, /for (all|insert|update|delete)/i);
  }
});

test("the sync route is the only writer of library rows, and it is key-gated", () => {
  // It writes with the service role. Reachable without a key, it would let
  // anybody wipe and replace the library for every client at once.
  const p = join(process.cwd(), "src/app/api/admin/sync-library/route.ts");
  assert.ok(existsSync(p), "the sync route is missing");
  const src = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /x-scheduler-key/, "must require the scheduler key");
  assert.match(src, /status: 401/, "and reject without it");
  assert.match(src, /createAdminClient/, "it needs the service role to write library rows");
  // The deletes must be filtered to library rows. An unfiltered delete here
  // would take every client's saved meals with it.
  assert.match(src, /from\("my_meals"\)\.delete\(\)\.is\("client_id", null\)/,
    "the meal delete must be scoped to client_id IS NULL");
  assert.doesNotMatch(src, /from\("my_meals"\)\.delete\(\)\s*;/, "unscoped delete on my_meals");
});
