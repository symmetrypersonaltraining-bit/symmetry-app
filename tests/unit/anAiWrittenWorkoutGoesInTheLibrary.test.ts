// ============================================================================
// A WORKOUT YOU JUST BUILT CAN BE FOUND.
//
// Dustin, 13 Sep 2026:
//   *"when ai writes a workout we tell it, app shoukd build that workout in the
//    clients personal workout library to be used again from any path that
//    searches workouts to log."*
//
// Chasing that turned up something bigger than the AI paths, and it is in the
// migration rather than in this file: `days.exercise_count` is a plain column
// that NOTHING maintained — no trigger, no generated expression, and not one
// line in src/. Every day created since at least 1 Sep read 0 however many
// movements it held, and /api/library-search filters `exercise_count > 0`. So
// nothing built in the last fortnight could be found by searching at all.
// 20260913d adds the trigger and backfills 1,210 rows.
//
// THIS file is the other half: a session logged by the coach has to BE a
// workout, not just a note on the calendar. A day with no exercises is filtered
// out by that same search, and re-logging one opens an empty logger — which is
// exactly what /api/workout-manual refuses to create for a future session.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ACTIONS = read("src/lib/ai/clientActions.ts");
const MIGRATION = read("supabase/migrations/20260913d_a_workout_you_just_built_can_be_found.sql");
const SEARCH = read("src/app/api/library-search/route.ts");

const handler = (() => {
  const at = ACTIONS.indexOf('if (name === "log_a_workout_i_did")');
  return ACTIONS.slice(at, at + 2600);
})();

describe("an AI-written workout goes in the library", () => {
  it("the logged session carries a real movement, not an empty day", () => {
    assert.doesNotMatch(handler, /exercises: \[\]/,
      "an empty day is filtered out of library-search and opens an empty logger");
    assert.match(handler, /exercises: \[\{ name: movement/,
      "it must build one real movement so the day is a workout");
  });

  it("the movement is the activity, the title is the instance", () => {
    // "Hike" as the movement, "3 Mile Hike" as the session. Collapsing them
    // mints a new movement every time they walk a different distance.
    assert.match(handler, /const movement = \(str\("movement"\) \|\| title\)/,
      "movement must be its own field, falling back to the title");
    const at = ACTIONS.indexOf('movement: {');
    const desc = ACTIONS.slice(at, at + 700);
    assert.match(desc, /'Hike', not '3 Mile Hike'/,
      "the tool must tell the model not to put the distance in the movement name");
  });

  it("the section is validated here, not trusted from the model", () => {
    assert.match(handler, /VALID_SECTIONS/, "an unknown section would fail the DB check constraint");
    assert.match(handler, /"Accessory"/, "…and there has to be a default");
  });

  it("a hike is one set, not three", () => {
    assert.match(handler, /sets: 1/, "a logger offering three sets of a hike looks wrong on the way in");
  });

  it("the confirmation tells them it is saved for next time", () => {
    assert.match(handler, /saved to their library/i,
      "a capability nobody is told about is a capability nobody uses");
  });

  // ── THE MIGRATION IS THE LOAD-BEARING HALF ────────────────────────────────
  it("exercise_count is kept true by the database, not by hope", () => {
    assert.match(MIGRATION, /create trigger trg_days_sync_exercise_count/,
      "without the trigger the column goes stale again the next time anything is built");
    assert.match(MIGRATION, /after insert or delete or update of section_id/,
      "all three operations change a count");
    assert.match(MIGRATION, /is distinct from c\.n/,
      "a no-op update would write a programme_audit row for nothing");
  });

  it("the existing rows were backed up before being overwritten", () => {
    assert.match(MIGRATION, /create table if not exists public\.bak_days_exercise_count_20260913/,
      "the old values are the only record of what the stale backfill held");
  });

  it("a day with no sections is covered too", () => {
    // It has no row in the aggregate, so the main UPDATE cannot reach it and a
    // stale non-zero count would survive.
    assert.match(MIGRATION, /not exists \(select 1 from public\.sections s where s\.day_id = d\.id\)/);
  });

  it("the search still requires a workout to have something in it", () => {
    // The filter was never wrong — the column feeding it was.
    assert.match(SEARCH, /\.gt\("exercise_count", 0\)/,
      "an empty day must stay out of the search results");
  });
});
