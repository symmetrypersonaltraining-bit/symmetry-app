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
