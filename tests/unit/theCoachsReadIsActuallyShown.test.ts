import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// clients.ai_focus — the two-or-three-sentence read on their training, written
// every Saturday by the weekly sweep, described in that sweep's own prompt as
// "the training-side read for the home screen" — was displayed by NOTHING.
// Clean grep across the repo, 5 Sep 2026: no component, no route. Months of
// good, paid-for, per-client coaching written straight into a column nobody
// read. Its sibling ai_food_focus was wired up on the food logger; this one was
// simply never finished.
//
// Two things have to stay true, and the second is the one that will rot: the
// read is SHOWN, and it is HIDDEN THE MOMENT IT IS STALE. The focus line above
// it carries weekly_focus_week and disappears when it belongs to another week.
// This column carries only the date it was written, so the staleness check is
// hand-written here — and a paragraph of last week's coaching presented as this
// week's is worse than showing nothing at all.

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, "src/components/ClientWeekSummary.tsx"), "utf8");

test("the week card reads ai_focus out of the database", () => {
  assert.ok(
    /ai_focus, ai_focus_date/.test(src),
    "ai_focus is no longer selected — the read is back to being written weekly and shown to nobody",
  );
  assert.ok(
    /s\.coachRead &&/.test(src),
    "the read is no longer rendered",
  );
});

test("a read from an earlier week is not shown", () => {
  assert.ok(
    /function currentWeekRead/.test(src),
    "the staleness guard is gone — last week's read will be presented as this week's",
  );
  assert.ok(
    /eveOfThisWeek/.test(src) && /ai_focus_date >= eveOfThisWeek/.test(src),
    "the guard no longer compares the write date against this week — the sweep runs the night BEFORE the week it writes for, so the comparison has to allow that one day and nothing more",
  );
});
