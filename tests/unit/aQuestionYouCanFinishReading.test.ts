// Dustin's programming question, 1 Sep 2026:
//
//   "You completed 8 of 9 sessions last week but are sitting at 5 of 8 this
//    week — what got in the way, and are the current session days or the volume
//    of sessions per week actually fitting your schedule ri"
//
// Three faults in one card.
//
// OUTDATED / INACCURATE. 5 of 8 is what he did the week BEFORE. This week he
// had trained twice out of three. The sweep runs late on a Saturday for the
// week beginning next day, so it already passes audience "nextWeek" and
// weeklyNumbersBlock hands the model windows relabelled "THE WEEK BEFORE LAST"
// and "LAST WEEK", with an explicit instruction never to say "this week". The
// model said it anyway — and an instruction with nothing enforcing it is a
// hope. So the question asked him to explain a shortfall that never happened.
//
// TRUNCATED. `.slice(0, 200)` cut it mid-word at "schedule ri". A question you
// cannot finish reading is a question you cannot answer.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLAIMS_THIS_WEEK, trimToWord } from "../../src/lib/ai/weekly-copy-guards";

const src = readFileSync(
  join(import.meta.dirname, "..", "..", "src/app/api/cron/weekly-ai/route.ts"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const REAL = "You completed 8 of 9 sessions last week but are sitting at 5 of 8 this week — what got in the way, and are the current session days or the volume of sessions per week actually fitting your schedule right now?";

test("the question Dustin was shown is caught", () => {
  assert.ok(CLAIMS_THIS_WEEK.test(REAL), "the exact card that shipped would pass again");
});

test("a question about finished weeks is kept", () => {
  const good = "You completed 8 of 9 sessions the week before last and 5 of 8 last week — what got in the way?";
  assert.ok(!CLAIMS_THIS_WEEK.test(good));
});

test("the other ways of saying it are caught too", () => {
  for (const s of [
    "how is this week going",
    "you are 5 of 8 so far this week",
    "your week so far looks light",
    "your current week is behind",
  ]) assert.ok(CLAIMS_THIS_WEEK.test(s), "missed: " + s);
});

test("last week and next week are not false positives", () => {
  for (const s of [
    "you trained 5 of 8 last week",
    "the week before last was your best",
    "what would make next week easier",
  ]) assert.ok(!CLAIMS_THIS_WEEK.test(s), "wrongly caught: " + s);
});

test("nothing is ever cut mid-word", () => {
  assert.equal(trimToWord(REAL, 200).endsWith(" ri"), false, "the exact truncation that shipped");
  const t = trimToWord(REAL, 120);
  assert.ok(t.endsWith("…"), "a trimmed question should say it was trimmed");
  assert.ok(!/\s\S{1,2}…$/.test(t), "stopped mid-word: " + t);
});

test("a question that fits is left completely alone", () => {
  const short = "Are your session days still working around your schedule?";
  assert.equal(trimToWord(short, 320), short);
});

test("a sentence boundary is preferred to a word boundary", () => {
  const two = "Your squat volume dropped. What would you rather spend that time on instead?";
  assert.equal(trimToWord(two, 40), "Your squat volume dropped.");
});

test("the route enforces both, and says so when it drops one", () => {
  assert.match(code, /CLAIMS_THIS_WEEK\.test\(question\)/, "the label rule is not enforced");
  assert.match(code, /trimToWord\(s\("programmingQuestion"\), 320\)/, "still a blind slice");
  assert.match(code, /console\.error\("weekly-ai: dropped a question/,
    "a question vanishing silently is how this goes unnoticed for a month");
  assert.ok(!/programmingQuestion"\)\.slice\(0, 200\)/.test(code), "the old chop is still there");
});
