// CLEARING TODAY'S ADMIN.
//
// Dustin, 24 Aug: "same for programming run out, I neec a way to click on each
// to get there. also I need a dismiss button on all of these and once I dismiss
// it doesn't come back up. for instance I dont program for trainers so they
// shoukd not be on here. steph is exception I do hers... no big deal if it
// comes up once a month but I need to be abke to clear the list."
//
// Three things, and the first is not a dismissal at all: five of the fourteen
// names under "Programming running out" were TRAINERS. Every trainer carries a
// self-coached client row of their own, and `clients.is_self_coached` already
// existed and already meant exactly this — nothing read it. Making him dismiss
// that every month would be papering over a filter that was never applied.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ADMIN = read("src/components/TodaysAdmin.tsx");
const SQL_PATH = "supabase/migrations/20260824a_clearing_todays_admin.sql";

// ── the structural fix ─────────────────────────────────────────────────────

test("a coach's own roster excludes the people who coach themselves", () => {
  // Moved into programming_coverage() on 24 Aug, when the coverage check
  // stopped fetching scheduled_workouts (PostgREST truncated the read at 1,000
  // rows and nine programmed clients were reported as running out).
  assert.match(ADMIN, /sb\.rpc\("programming_coverage"\)/, "the browser is counting rows again");
  const sql = read("supabase/migrations/20260824b_a_read_that_cannot_truncate.sql");
  assert.match(sql, /coalesce\(c\.is_self_coached, false\) = false/, "trainers are in the coverage count again");
  assert.match(sql, /coalesce\(c\.nutrition_only, false\) = false/);
});

test("coverage is one row per client, so it cannot truncate", () => {
  const sql = read("supabase/migrations/20260824b_a_read_that_cannot_truncate.sql");
  assert.match(sql, /max\(sw\.scheduled_date\) filter \(where sw\.deleted_at is null\)/);
  assert.match(sql, /group by c\.id, c\.name/);
  // A client with nothing scheduled must sort to the TOP, not look healthiest.
  assert.match(sql, /-1\s*\n\s*\)::int as days_left/);
  assert.ok(!/\.limit\(20000\)/.test(ADMIN), "the limit that the server ignores is back");
});

test("the weekly-focus row is filtered the same way", () => {
  // Same five names, same reason. Filtering one and not the other is how a
  // fault gets fixed on one screen and left on the next.
  const i = ADMIN.indexOf("const fRows =");
  assert.ok(i > 0);
  assert.match(ADMIN.slice(i, i + 300), /\.filter\(\(c\) => !c\.is_self_coached\)/);
});

test("Steph is put back, because he writes hers", () => {
  assert.match(read(SQL_PATH), /update public\.clients set is_self_coached = false\s*\n\s*where name = 'Steph Gautreaux'/);
});

// ── click each name ────────────────────────────────────────────────────────

test("every name in the coverage row goes to that client's programme", () => {
  assert.match(ADMIN, /subjects\?: \{ id: string; name: string; href: string \}\[\];/);
  assert.match(ADMIN, /subjects: short\.map\(\(c\) => \(\{ id: c\.id, name: c\.name, href: `\/clients\/\$\{c\.id\}\/program` \}\)\)/);
  // And they are rendered as their own links, not a sentence.
  assert.match(ADMIN, /r\.subjects\?\.length \?/);
  assert.match(ADMIN, /\{sj\.name\} ›/);
});

test("the row is no longer one big anchor", () => {
  // A button inside an anchor is a nested interactive control, and tapping
  // either navigated — which is why there was nowhere to put a dismiss button
  // or a per-client link in the first place.
  const i = ADMIN.indexOf("{rows.map((r) => (");
  assert.ok(i > 0);
  // The first ELEMENT opened for each row must be the div, not a Link.
  // (Skipping the comment block that explains why.)
  const after = ADMIN.slice(i, i + 1600);
  const firstTag = after.replace(/\/\/[^\n]*/g, "").match(/<(\w+)/);
  assert.equal(firstTag?.[1], "div", "the whole row is an anchor again — no room for a dismiss button");
  assert.match(after, /key=\{r\.key\}/);
});

// ── dismissal ──────────────────────────────────────────────────────────────

test("every row can be dismissed, not just some", () => {
  // The button is rendered inside rows.map with no per-key condition.
  const i = ADMIN.indexOf("aria-label={`Dismiss ${r.title}");
  assert.ok(i > 0, "no dismiss control at all");
  const guard = ADMIN.slice(Math.max(0, i - 400), i);
  assert.ok(!/r\.key ===/.test(guard), "some rows are exempt from being cleared");
});

test("a dismissal expires rather than lasting forever", () => {
  assert.match(ADMIN, /const DISMISS_DAYS = 30;/);
  assert.match(ADMIN, /const until = addDays\(todayCT\(\), DISMISS_DAYS\);/);
  const sql = read(SQL_PATH);
  assert.match(sql, /until\s+date not null/);
  assert.ok(!/dismissed\s+boolean/.test(sql), "a boolean would hide something for good");
});

test("dismissed rows are simply not drawn", () => {
  assert.match(ADMIN, /gte\("until", today\)/, "expired dismissals would keep hiding things");
  assert.match(ADMIN, /setRows\(out\.filter\(\(r\) => !hidden\.has\(r\.key\)\)\)/);
});

test("a dismissal that did not save puts the row back", () => {
  const i = ADMIN.indexOf("async function dismiss(");
  assert.ok(i > 0);
  // Anchored on the function's END rather than a character count. A fixed slice
  // silently shrinks to nothing the moment somebody adds a comment, and then
  // passes for the wrong reason.
  const end = ADMIN.indexOf("useEffect(", i);
  assert.ok(end > i, "the dismiss function moved — re-anchor this test");
  const fn = ADMIN.slice(i, end);
  assert.match(fn, /const keep = rows;/);
  assert.match(fn, /setRows\(keep \?\? null\);/,
    "a dismissal that quietly failed is worse than the row — he would think it was handled");
});

test("the write can actually match the index it conflicts on", () => {
  // THE ORIGINAL ASSERTION HERE REQUIRED THE BUG, and its reason was exactly
  // backwards: it said the upsert stopped "dismissing twice" from erroring,
  // when in fact it made dismissing ONCE error. `onConflict` named three bare
  // columns; the unique index is on COALESCE(subject_id, ...), an expression.
  // Postgres matches ON CONFLICT against a real index, so all of it failed with
  // 42P10 and admin_dismissals stayed empty from the day it shipped until the
  // day Dustin said the row would not clear.
  assert.match(ADMIN, /rpc\("dismiss_admin_row"/);
  // COMMENTS OUT FIRST. The component now carries a note quoting the broken
  // upsert verbatim so the next person does not reintroduce it — and read raw,
  // that note is indistinguishable from the bug it warns about. A test that
  // fails on its own documentation teaches people to delete the documentation.
  const withoutComments = ADMIN.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.doesNotMatch(withoutComments, /onConflict: "trainer_id,row_key,subject_id"/);

  const sql = read("supabase/migrations/20260826b_dismiss_admin_row.sql");
  // The RPC's conflict target must be the index's own expression, character for
  // character — that is the entire point of moving the write server-side.
  assert.match(
    sql,
    /on conflict \(trainer_id, row_key, coalesce\(subject_id, '00000000-0000-0000-0000-000000000000'::uuid\)\)/,
  );
  // And it must not be able to clear somebody else's rows.
  assert.match(sql, /v_trainer uuid := public\.my_trainer_id\(\);/);
  assert.doesNotMatch(sql, /p_trainer_id/, "a trainer parameter would let a caller name someone else");
  assert.match(sql, /revoke all on function public\.dismiss_admin_row/);
});

test("the dismissal is his, and only appears when we know who he is", () => {
  assert.match(ADMIN, /\{me \? \(/, "the button would render with no trainer to attribute it to");
  assert.match(ADMIN, /if \(!me \|\| busy\) return;/);
});

test("the table is per trainer and unique per thing", () => {
  const sql = read(SQL_PATH);
  assert.ok(existsSync(join(ROOT, SQL_PATH)));
  assert.match(sql, /using \(trainer_id = public\.my_trainer_id\(\)\)/);
  // NULL is not distinct from NULL in a unique index, so two whole-row
  // dismissals of the same row would both be allowed without the coalesce.
  assert.match(sql, /coalesce\(subject_id, '00000000-0000-0000-0000-000000000000'::uuid\)/);
});
