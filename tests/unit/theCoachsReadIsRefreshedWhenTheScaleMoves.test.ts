// THE COACH'S READ STOPS QUOTING A WEIGHT FROM LAST WEEK.
//
// Dustin, 5 Sep, looking at his own home screen: *"its reading weight from the
// wrong place. im at 205."*
//
// It was not reading the wrong place. `clients.current_weight` said 205 and his
// latest weigh-in said 205 — both correct. The paragraph said 207 because it
// had been WRITTEN ON 29 AUGUST, when 207.2 (17 Aug) was the most recent
// weigh-in that existed. Seven days later it was still on screen, beside live
// tiles it now contradicted:
//
//     paragraph (29 Aug)          tile (live)
//     "5 of 8 done"               4/8
//     "consistency jumped to 100%" 61%
//     "flat at 207 lb"            205
//
// Every figure in it was true for the week it was written in and wrong for the
// week it was being read in. The read is written once, on a Saturday, and then
// displayed for seven days.
//
// Of the four fixes put to him he chose this one: rewrite the read, and only
// the read, when the number it quotes actually moves. A weigh-in is the
// trigger, because a weigh-in is what dates the paragraph.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ROUTE = read("src/app/api/cron/weekly-ai/route.ts");
const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const CRONS = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };

// ── the trigger ─────────────────────────────────────────────────────────────

test("only a read that a weigh-in has overtaken is rewritten", () => {
  assert.match(code, /return !!w && w > c\.ai_focus_date;/,
    "the refresh must compare the last weigh-in against the day the read was written");
});

test("a client with no read yet is left to the weekly sweep", () => {
  // Refreshing nothing would spend a model call to write a first read on a
  // Wednesday, off the wrong week windows.
  assert.match(code, /if \(!c\.ai_focus \|\| !c\.ai_focus_date\) return false;/);
});

test("the roster is checked in ONE query, under the 1,000-row cap", () => {
  // PostgREST caps a read at 1,000 rows whatever .limit() asks for. That cap
  // has already silently truncated three other reads in this app — the AI
  // health page, the dashboard's programme check, and the workout library.
  assert.match(code, /fetchAllRowsSafe</);
  assert.match(code, /weekly-ai refresh: recent weigh-ins/);
  assert.ok(!/for \(const c of clients\)[\s\S]{0,400}from\("metrics"\)/.test(code),
    "the weigh-in lookup is inside the per-client loop");
});

// ── it describes the week it is written in ──────────────────────────────────

test("a mid-week refresh uses THIS week, not next", () => {
  // The Saturday sweep shifts its windows forward because its copy is read from
  // Sunday. Reusing that shift on a Wednesday would tell a client how a week
  // that has not started is going — Dustin, 31 Aug: "5 out of 8?? its Monday
  // the week starts today..."
  assert.match(code, /mode === "refresh" \? weekStartOf\(today\) : weekStartOf\(nextDay\(today\)\)/);
  assert.match(code, /fetchWeeklyComparison\(db, c\.id, today, mode === "refresh" \? "now" : "nextWeek"\)/);
});

// ── it touches the read and nothing else ────────────────────────────────────

test("the week's focus is chosen once and not moved mid-week", () => {
  // Rewriting the focus because someone stepped on a scale moves the target
  // they are working towards, three days in.
  assert.match(code, /if \(mode === "weekly" && !trainerOwnsFocus\) \{/);
  assert.match(code, /if \(mode === "weekly"\) \{\s*\n\s*update\.ai_food_focus = /);
});

test("a refresh never asks the programming question", () => {
  assert.match(code, /if \(mode === "weekly" && result\.value\.programmingQuestion && isQuestionWeek\(week\)\)/);
});

test("the read and its date always travel together", () => {
  // ai_focus_date is what the staleness test reads. Writing the read without
  // it would make the next refresh fire again the following day, forever.
  const upd = code.slice(code.indexOf('const update: Database'), code.indexOf("if (mode === \"weekly\") {"));
  assert.match(upd, /ai_focus: result\.value\.coachRead/);
  assert.match(upd, /ai_focus_date: today/);
});

// ── it actually runs ────────────────────────────────────────────────────────

test("the daily refresh is scheduled, and the Saturday sweep is untouched", () => {
  const refresh = CRONS.crons.find((c) => c.path === "/api/cron/weekly-ai?mode=refresh");
  assert.ok(refresh, "nothing runs the refresh");
  assert.match(refresh.schedule, /^\d+ \d+ \* \* \*$/, "the refresh must be daily");
  const weekly = CRONS.crons.find((c) => c.path === "/api/cron/weekly-ai");
  assert.ok(weekly, "the weekly sweep was removed");
  assert.equal(weekly.schedule, "0 3 * * 0");
});

test("the mode comes off the URL and defaults to the weekly sweep", () => {
  // A typo'd or absent mode must never silently turn the Saturday sweep into a
  // refresh — that would leave the whole roster without a focus for the week.
  assert.match(code, /mode: sp\.get\("mode"\) === "refresh" \? "refresh" : "weekly"/);
});
