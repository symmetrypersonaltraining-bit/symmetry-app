import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG B — A SWAPPED DAY KEPT THE NAME OF THE MOVEMENT IT NO LONGER CONTAINED.
 *
 * Dustin's 13 Aug session was labelled "Deload — Cardio (20 min Walk)" and held
 * an Elliptical Trainer. Claudine Ocon's 31 Jul fork said "Fat Loss Cardio
 * Phase 3: Stair Master" and held a Treadmill Incline Walk. Two clients, so not
 * account-specific.
 *
 * swap_prescribed_exercise did three of four things right: forked the day so
 * history survived, repointed scheduled_workouts at the fork, swapped the
 * exercise. Then it stopped — never renamed the fork, never bumped updated_at.
 *
 * Why a label is worth a test. It is what the UI prints, and what any adherence
 * calculation or AI summary reads unless it walks all the way through to
 * prescribed_exercises. The app was reporting a walk that was an elliptical. It
 * also manufactures fake duplicate-day groups — same label, different content —
 * which are indistinguishable from a genuine duplication bug without opening
 * both and comparing.
 *
 * The logic lives in Postgres, so this reads the function definition off disk
 * rather than calling it. That is a weaker test than executing it, and it is
 * paired with a real end-to-end run done at migration time: a live swap on one
 * of Dustin's own future sessions, asserting the label, the bump, the
 * provenance and the untouched original — then rolled back to the byte. What
 * this file protects against is the next person editing the function and
 * dropping one of the four things.
 */

const RAW = readFileSync(
  join(process.cwd(), "supabase/migrations/20260813_swap_relabels.sql"),
  "utf8",
);
/**
 * Comments stripped before matching. The header explains at length why the
 * schedule_change_proposals insert was REMOVED, and a naive search finds that
 * prose and reports the bug it is describing as present.
 */
const SQL = RAW.replace(/^\s*--.*$/gm, "");

test("the swap bumps updated_at when it repoints the day", () => {
  // Without this a scheduled_workouts row can point at a day created weeks
  // after the row's own last-modified stamp. That contradiction is exactly what
  // made the bug invisible for a month — nothing downstream could tell a swap
  // had happened at all.
  assert.match(
    SQL,
    /set day_id = v_new_day, updated_at = now\(\)/,
    "repointing no longer bumps updated_at",
  );
  // And an in-place edit on a day the client already owns is still a change.
  assert.match(SQL, /update scheduled_workouts set updated_at = now\(\)/);
});

test("only a single-exercise day is relabelled", () => {
  // THE load-bearing condition. On a one-exercise day the label names the
  // movement. On a twelve-exercise day it names the session, and "Push A" is
  // still Push A after one swap — renaming it would be a second corruption
  // shipped as the fix for the first.
  assert.match(SQL, /if v_n_ex = 1 then/, "the single-exercise guard is gone — multi-exercise days will be renamed");
  const at = SQL.indexOf("if v_n_ex = 1 then");
  const relabelAt = SQL.indexOf("update days set label = v_relabel");
  assert.ok(at !== -1 && relabelAt > at, "the relabel must happen inside the single-exercise branch");
});

test("the programme prefix survives the rename", () => {
  // "Deload — Cardio" and "Fat Loss Cardio Phase 3" are context both the client
  // and Dustin navigate by. Rebuilding the whole label from the exercise name
  // would fix the lie and throw away the meaning.
  assert.match(SQL, /substr\(v_label, 1, v_cut - 1\)/, "the prefix is no longer preserved");
  assert.match(SQL, /position\(' \(' in v_label\)/);
  assert.match(SQL, /position\(': ' in v_label\)/);
});

test("the fork records where it came from, and who made it", () => {
  assert.match(SQL, /swapped_from_day_id = v_day/, "provenance is no longer recorded");
  // fork_day_for_client copies the library row's created_by, which claims
  // 'trainer' even when the app did it. The brief called that out specifically.
  assert.match(SQL, /created_by = 'swap'/, "the fork still inherits a false created_by");
});

test("the original day is never modified by a swap", () => {
  // The entire reason for forking. If a swap edited the library day, one
  // client's substitution would rewrite the template every other client is
  // following — silently, and for everyone.
  const body = SQL.slice(SQL.indexOf("v_new_day := public.fork_day_for_client"));
  assert.ok(
    !/update days[\s\S]{0,200}where id = v_day\b/.test(body),
    "something in the swap path writes to the ORIGINAL day",
  );
  assert.ok(
    !/delete from (sections|prescribed_exercises)/.test(SQL),
    "the swap path deletes template rows",
  );
});

test("no audit row is written to a table whose constraints reject it", () => {
  // The first version of this fix inserted into schedule_change_proposals,
  // because the brief suggested it. Its CHECK constraints allow reason IN
  // (moved, cancelled, uncovered, orphaned, pattern_shift, retired) — a
  // completed exercise swap is none of those. The insert was correctly wrapped
  // in `exception when others then null`, so it failed silently on every swap
  // and still returned ok:true.
  //
  // Found by asserting the audit row EXISTED after a live test, not by reading
  // the code. The trail now lives on days.swapped_from_day_id + created_by +
  // scheduled_workouts.updated_at, which cannot drift out of sync with the
  // thing it describes.
  assert.ok(
    !/insert into schedule_change_proposals/.test(SQL),
    "the swap writes to schedule_change_proposals again — its CHECK constraints reject 'exercise_swapped', so it will fail silently",
  );
});
