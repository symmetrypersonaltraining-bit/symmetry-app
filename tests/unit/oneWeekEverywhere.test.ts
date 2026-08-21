// ============================================================================
// One definition of "the week", on the card and inside the AI copy next to it.
//
// Dustin, 21 Aug: "how many workouts they logged out of how many are scheduled
// per that current day in the week... if they have 2 workouts scheduled each day
// and they logged them all on wed it should say 6/6 logged so far. if they
// missed 1 it should read 5/6 so far this week... at the end of the week it
// resets like everything else we worked on."
//
// What it was doing instead:
//   - "Week in review" measured a ROLLING trailing seven days, then printed the
//     Sun-Sat focus line directly underneath it. Two different weeks, one
//     screen, both labelled "week".
//   - "This week" counted the WHOLE Sun-Sat week in the denominator, so
//     Thursday and Friday's sessions were held against a client on Tuesday and
//     the tile could not read well until Saturday.
//   - The nutrition tile was a rolling 7 days next to both of them.
//
// src/lib/ai/weekly-numbers.ts was already right and always had been. This
// file pins the card to it.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the AI's week windows are the definition", () => {
  const nums = strip(read("src/lib/ai/weekly-numbers.ts"));

  it("last week is the previous FULL Sun-Sat", () => {
    const fn = nums.slice(nums.indexOf("export function lastWeekWindow"));
    assert.match(fn.slice(0, 200), /weekStartOf\(today\), -7/, "lastWeekWindow is no longer the previous calendar week");
  });

  it("this week runs Sunday through TODAY, not through Saturday", () => {
    const fn = nums.slice(nums.indexOf("export function thisWeekWindow"));
    const body = fn.slice(0, 220);
    assert.match(body, /end: today/, "thisWeekWindow no longer ends today — it would count sessions not due yet");
  });

  it("scheduled and completed are counted the same way the card counts them", () => {
    const ctx = strip(read("src/lib/ai/weekly-context.ts"));
    assert.match(ctx, /workoutsScheduled: sw\.length/, "the AI stopped counting scheduled rows in the window");
    assert.match(ctx, /status === "completed"/, "the AI stopped counting completions by status");
  });
});

describe("the client's week card uses those same windows", () => {
  const code = strip(read("src/components/ClientWeekSummary.tsx"));

  it("last week is the calendar week, not a rolling seven days", () => {
    assert.match(code, /lastWkStart = useMemo\(\(\) => addDays\(thisWk, -7\)/, "the review is back on a rolling window");
    assert.match(code, /lastWkEnd = useMemo\(\(\) => addDays\(thisWk, -1\)/, "the review no longer ends on Saturday");
    assert.doesNotMatch(code, /addDays\(today, -6\)/, "the rolling trailing-7 window is back");
  });

  it("this week's denominator stops at today", () => {
    // The line that matters: .gte(thisWk) .lte(today). Bounded at thisWkEnd it
    // counts sessions that have not come round yet as already missed.
    const q = code.slice(code.indexOf('gte("scheduled_date", thisWk)'));
    assert.match(
      q.slice(0, 120),
      /lte\("scheduled_date", today\)/,
      "this week's workouts are counted to the end of the week again, so a Tuesday can never look good",
    );
  });

  it("the nutrition tile is the calendar week too", () => {
    assert.match(
      code,
      /useNutritionAverages\(clientId \|\| "", today, "custom", thisWk, today, clientId\)/,
      "the nutrition tile is back on a rolling 7 days while everything beside it is Sun-Sat",
    );
  });

  it("and the tile says what it is actually measuring", () => {
    assert.match(code, /logged so far/, 'the workouts tile no longer says "logged so far", which is what the number now means');
  });
});
