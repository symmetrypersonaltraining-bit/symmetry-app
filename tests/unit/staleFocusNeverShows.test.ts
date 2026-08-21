// ============================================================================
// A weekly focus line without a CURRENT week stamp must never reach a screen.
//
// Found 21 Aug: `currentWeekFocus` honoured a NULL weekly_focus_week as "show
// it", written so that rows predating the provenance columns would not vanish.
// Every row in production was a pre-provenance row, so the escape hatch became
// the rule — all 34 clients carrying a focus were shown a line written on or
// before 8 Aug, presented as this week's, with no date on it. Two of them were
// stating counts ("3 lifts and 2 cardio days this week", "It's been 9 days")
// that were flatly wrong by the time anyone read them.
//
// The Saturday sweep has not written since 8 Aug. Until it is fixed, and any
// time it fails again, the honest state is no line at all. This test is here so
// the tolerant form does not come back the next time someone notices the card
// looks empty and "fixes" it.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Comments carry the words this file asserts on. Strip them or a test passes
// on its own explanation.
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the client's week card only shows a focus stamped for this week", () => {
  const src = strip(read("src/components/ClientWeekSummary.tsx"));
  const fn = src.slice(src.indexOf("function currentWeekFocus"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);

  it("currentWeekFocus still exists", () => {
    assert.ok(body.includes("currentWeekFocus"), "currentWeekFocus is gone — the guard it holds went with it");
  });

  it("does not treat a missing week stamp as current", () => {
    // The exact shape of the bug: `if (wk && wk !== thisWeek) return null`.
    // The truthiness check is what let a NULL stamp through.
    assert.ok(
      !/if\s*\(\s*\w+\s*&&\s*\w+\s*!==/.test(body),
      "currentWeekFocus is tolerating a null weekly_focus_week again. A focus that cannot be proven current must not display — clients read it as this week's.",
    );
  });

  it("compares the stamp to this week and returns null when it does not match", () => {
    assert.ok(
      /!==\s*weekStartOf\(todayCT\(\)\)/.test(body) && /return null/.test(body),
      "currentWeekFocus no longer gates on weekStartOf(todayCT())",
    );
  });
});

describe("the trainer's weekly brief does not state a stale focus as this week's", () => {
  // Trainer-only, but Dustin reads it standing in front of the client, so a
  // line from two weeks ago is worse here than useless.
  const src = strip(read("src/app/api/weekly-brief/route.ts"));

  it("weeklyFocus is gated on the week stamp", () => {
    assert.ok(
      /weeklyFocus:\s*client\?\.weekly_focus_week\s*===\s*weekStart/.test(src),
      "weekly-brief is passing clients.weekly_focus through unguarded again",
    );
  });

  it("and the stamp is actually selected from the row", () => {
    assert.ok(
      /select\((["'`])[^"'`]*weekly_focus_week/.test(src),
      "weekly_focus_week is not in the select, so the guard above always fails closed",
    );
  });
});
