// The recipe library could never be published, and nothing ever said so.
//
// 17 Aug, fact-checking the group message: it told 30 clients they had "20
// cook-from-scratch recipes". They had none. All 20 library rows were
// 'private', and the Shared library tab asks for 'public'.
//
// The sync route inserts them AS public. `enforce_recipe_publish` — a BEFORE
// INSERT OR UPDATE trigger that stops a client self-publishing — rewrote them
// back, because it decides with `is_trainer()`, which resolves through
// `auth.uid()`, and the service role that builds the library has no auth.uid().
//
// It fails invisibly from every angle: the insert succeeds, an update reports
// 20 rows affected, RETURNING hands back 20 ids, and `updated_at` moves because
// the same trigger sets it. Only the column you asked for is unchanged. Three
// "successful" migrations changed nothing before this was found.
//
// Reads the LAST definition in the migrations, so a later migration quietly
// restoring the old body fails here. Comments are stripped first: the migration
// header quotes the old code verbatim, and an explanation must never satisfy a
// test about the code.

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

const GUARD = lastDefinition("enforce_recipe_publish");

test("a library row is exempt from the publish guard", () => {
  assert.match(
    GUARD.body,
    /if new\.client_id is null then[\s\S]{0,200}?return new;/i,
    `${GUARD.file}: library recipes are demoted to private again, so the shelf is empty`,
  );
});

test("the exemption comes FIRST, or the guard demotes before it is reached", () => {
  const exempt = GUARD.body.search(/if new\.client_id is null then/i);
  const demote = GUARD.body.search(/new\.visibility := 'private'/i);
  assert.ok(exempt >= 0 && demote >= 0, `${GUARD.file}: one of the two branches is gone`);
  assert.ok(exempt < demote,
    `${GUARD.file}: the INSERT demotion runs before the library exemption, which is the original bug`);
});

// ─── the hole this must NOT open ────────────────────────────────────────────
// Verified against the live database on 17 Aug after applying: updating every
// client-owned private recipe to 'public' as a non-trainer touched 1 row and
// left it 'private'. Client-owned public recipes stayed at 14.

test("a client still cannot self-publish their own recipe", () => {
  assert.match(GUARD.body, /new\.visibility := 'private'/i,
    `${GUARD.file}: a client's INSERT of a public recipe is no longer demoted — anyone can publish to the shared library`);
  assert.match(GUARD.body, /new\.visibility := old\.visibility/i,
    `${GUARD.file}: a client's UPDATE to public is no longer reverted — anyone can publish an existing recipe`);
});

test("both client branches still test is_trainer()", () => {
  const checks = GUARD.body.match(/not is_trainer\(\)/gi) || [];
  assert.equal(checks.length, 2,
    `${GUARD.file}: expected the INSERT and UPDATE branches to each check is_trainer(), found ${checks.length}`);
});

test("the exemption is on client_id, not on visibility", () => {
  // Exempting by visibility ("skip the guard when publishing") would remove the
  // guard entirely while looking like a narrowing.
  assert.doesNotMatch(
    GUARD.body,
    /if new\.visibility = 'public' then\s*return new;/i,
    `${GUARD.file}: the guard is skipped whenever the row is being published, which is every case it exists for`,
  );
});

// ─── reversibility ──────────────────────────────────────────────────────────

test("the old definition and the changed rows are both captured", () => {
  const sql = readFileSync(join(DIR, GUARD.file), "utf8");
  assert.match(sql, /create table if not exists public\.bak_enforce_recipe_publish/i,
    `${GUARD.file}: no backup of the trigger function — the change is not reversible from the repo`);
  assert.ok(
    sql.indexOf("bak_enforce_recipe_publish") < sql.indexOf("create or replace function public.enforce_recipe_publish"),
    `${GUARD.file}: the backup is taken after the replacement, so it captures the NEW definition`,
  );
  // The data change ships as its own migration ON PURPOSE: a statement placed
  // after a dollar-quoted body in one migration is silently dropped (16 Aug).
  assert.doesNotMatch(
    sql.slice(sql.lastIndexOf("$function$")),
    /update\s+public\.recipes/i,
    `${GUARD.file}: an UPDATE sits after the function body, where it is silently dropped`,
  );
});
