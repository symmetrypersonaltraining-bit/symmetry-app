// ============================================================================
// Two rules the calendar sync must never break, asserted against the migration
// that is the record of what is deployed.
//
//   1. ONLINE-ONLY CLIENTS ARE NOT MOVED BY THE CALENDAR.
//      Dustin, 21 Aug: "Tyler does not train in person, we need a wall for
//      that, online only clients do not get wiriouts auto moved by schefule!"
//      Nine of Tyler's sessions had already been dragged Thu -> Mon before the
//      wall existed and had to be restored from a backup table. Eleven clients
//      carry the flag.
//
//   2. A MANUAL MOVE IS FINAL.
//      "make sure if anyone moves a workout manually it stays regardless of
//      gcal sessions."
//      The old guard — `moved_from_date is null or moved_by = 'calendar_sync'`
//      — worked only because no app path ever set moved_by, so it evaluated to
//      NULL and the row fell out of the WHERE. Correct by luck, and the luck
//      ran out the moment calendar_sync moved a row first: it stamped
//      'calendar_sync', a human moving it afterwards set only moved_from_date,
//      and the next sync took the row straight back off the day the trainer
//      chose. A BEFORE UPDATE trigger now stamps the mover, so the guard rests
//      on something real and a move path added later is covered without anyone
//      remembering this.
//
// Asserting on SQL text is blunt. The alternative is a live database in CI,
// and the behaviour itself was verified against production in a rolled-back
// transaction when it shipped — all three cases (app move, sync move, human
// overriding the sync) landed on the right mover.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "supabase/migrations");

function read(name: string): string {
  const file = path.join(DIR, name);
  assert.ok(fs.existsSync(file), `${name} is missing — the rule it carries is not recorded anywhere`);
  return fs.readFileSync(file, "utf8");
}

const mover = read("20260821_manual_move_always_wins.sql");
const proposals = read("20260821_proposals_respect_the_wall.sql");

describe("the calendar sync respects the online-only wall", () => {
  it("skips online-only clients in every branch that can move a workout", () => {
    // linked, orphan and uncovered. Miss one and the other two still let a row
    // through by a different route — which is how Tyler's nine got moved.
    const guards = mover.match(/not c\.online_only/g) || [];
    assert.ok(
      guards.length >= 3,
      `expected the wall in all three CTEs of the mover, found ${guards.length}. ` +
        "A branch without it is a route by which an online-only client's workout still moves.",
    );
  });

  it("does not file proposals about clients it may not move", () => {
    assert.match(
      proposals,
      /not c\.online_only/,
      "the detector must skip online-only clients — otherwise it asks him to decide, " +
        "one appointment at a time, a rule he has already made",
    );
  });
});

describe("a person outranks the calendar", () => {
  it("stamps the mover on every date change", () => {
    assert.match(mover, /create trigger trg_stamp_workout_mover/i);
    assert.match(
      mover,
      /before update on public\.scheduled_workouts/i,
      "it has to be BEFORE UPDATE — an AFTER trigger cannot set the value on the row being written",
    );
    assert.match(
      mover,
      /new\.moved_by := 'manual'/,
      "anything that is not the sync is a person, and must be recorded as one",
    );
  });

  it("only the sync itself may claim to be the sync", () => {
    assert.match(
      mover,
      /current_setting\('symmetry\.mover', true\)/,
      "the trigger distinguishes the sync from a person by a setting the sync sets",
    );
    assert.match(
      mover,
      /set_config\('symmetry\.mover', 'calendar_sync', true\)/,
      "the sync must claim the move, and transaction-locally (the third argument), " +
        "or the claim leaks to whatever runs next in the same session",
    );
  });

  it("still refuses to touch a row a person moved", () => {
    assert.match(
      mover,
      /sw\.moved_from_date is null or sw\.moved_by = 'calendar_sync'/,
      "the guard itself must survive — the trigger only makes it true, it does not replace it",
    );
  });

  it("does not ask him to undo his own move", () => {
    assert.match(
      proposals,
      /m\.moved_by = 'manual'/,
      "an appointment is uncovered BY DESIGN once the trainer moves that week's workout " +
        "off it. Proposing to cover it again is the friction, not the fix.",
    );
  });
});
