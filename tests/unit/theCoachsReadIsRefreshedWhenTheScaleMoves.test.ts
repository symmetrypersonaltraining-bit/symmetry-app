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

// ── AND IT SAYS WHICH WEEK IT IS ABOUT ──────────────────────────────────────
//
// Dustin, 5 Sep, after the refresh went in: *"reframe it last week as well
// since thats what it's reading."*
//
// He is right, and it is the other half of the same bug. The read reviews the
// week that has FINISHED — that is what the sweep asks for and where its
// numbers come from — but it sat directly under the CURRENT week's date range
// with current-week tiles above it. So it read as a comment on this week and
// lost every argument with the tiles: "5 of 8" beside a tile reading 4/8,
// "flat at 207 lb" when he was 205.
//
// Two halves: the block is labelled with the week it reviews, and the writer is
// stopped from narrating the week in progress at all. The tiles own the week in
// progress; the read owns the one that finished.

const CARD = read("src/components/ClientWeekSummary.tsx");
const cardCode = CARD.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

test("the read is labelled with the week it reviews", () => {
  assert.match(cardCode, /Last week · \{fmtRange\(s\.lastWkStart, s\.lastWkEnd\)\}/,
    "the read still sits under the current week's dates with nothing saying otherwise");
});

test("the label is on the read, not on the focus line", () => {
  // The focus line IS about the week ahead. Labelling the whole panel "last
  // week" would mislabel the one instruction the client is meant to act on.
  const panel = cardCode.slice(cardCode.indexOf("<b>Focus:</b>"));
  const label = panel.indexOf("Last week ·");
  const readOpen = panel.indexOf("{s.coachRead &&");
  assert.ok(readOpen > -1 && label > readOpen, "the label sits outside the coach's read block");
});

test("the writer may not narrate the week in progress", () => {
  assert.match(ROUTE, /IT REVIEWS THE WEEK THAT HAS FINISHED, AND ONLY THAT WEEK/);
  assert.match(ROUTE, /Never write "this week", "so far this week" or "the week so far"/);
  // Body weight is the deliberate exception — it is the number as it stands
  // now, which is the whole point of refreshing on a weigh-in.
  assert.match(ROUTE, /Body weight is the exception and is present tense/);
});

test("and that is enforced, not merely asked for", () => {
  // CLAIMS_THIS_WEEK guarded the programming question from 1 Sep for exactly
  // this reason and was never applied to the read — the bigger surface.
  assert.match(code, /if \(CLAIMS_THIS_WEEK\.test\(coachRead\)\) return null;/);
});

test("a read that claims this week is retried, not silently dropped", () => {
  // Returning null from validateWeekly makes callClaudeJson retry. Dropping the
  // sentence instead would publish a read the model did not write; dropping the
  // whole reply without a retry would cost the client their focus too.
  const v = code.slice(code.indexOf("function validateWeekly"), code.indexOf("function validateWeekly") + 1400);
  assert.match(v, /CLAIMS_THIS_WEEK\.test\(coachRead\)/);
  assert.ok(!/coachRead\.replace\(/.test(v), "the guard is editing the model's sentence rather than refusing it");
});
