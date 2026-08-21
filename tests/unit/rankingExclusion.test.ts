import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isExcludedFromRankings, unrankedClientIds } from "../../src/lib/rankings";

/**
 * THE COACH IS NOT A CONTESTANT.
 *
 * Dustin: "Let's go ahead and take me out of the actual rankings in the
 * challenge to make sure my clients are the spotlight." At the time he was #1
 * with 8 days, one ahead of Cheyenne.
 *
 * There are FOUR places that rank people, and the reason this file exists is
 * that they do not share code:
 *
 *   challenge_leaderboard    SQL   group chat board, winner, Coach Bot
 *   challenge_group_total    SQL   the anonymous total
 *   /api/challenge           TS    standings for the client dashboard
 *   /api/leaderboard         TS    the 7/30-day consistency board
 *
 * This app's recurring bug is exactly this shape: Peak Week fixed in the
 * schedule board and not the day sheet, feedback inserted in four components,
 * progress spacing fixed on one of two progress pages. So the assertions below
 * are less about the rule than about every surface holding it.
 *
 * The distinction that must survive: the trainer is not ranked, but he is not a
 * fake account either. His days still feed the anonymous group total. Merging
 * him into the demo-account exclusion would silently drop him out of roster
 * numbers where he belongs.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const TRAINER = { id: "t", name: "Dustin Gautreaux", email: "symmetrypersonaltraining@gmail.com" };
const CLIENT = { id: "c", name: "Cheyenne Martin", email: "cheyenne@example.com" };
const DEMO = { id: "d", name: "Demo", email: "demo@symmetrytraining.app" };

test("the trainer is never ranked, by email or by flag", () => {
  assert.equal(isExcludedFromRankings(TRAINER), true);
  assert.equal(isExcludedFromRankings({ ...TRAINER, email: "  SymmetryPersonalTraining@Gmail.com " }), true);
  assert.equal(isExcludedFromRankings({ id: "x", name: "Someone", email: "s@x.com", exclude_from_rankings: true }), true);
});

test("clients are ranked, demo accounts are not", () => {
  assert.equal(isExcludedFromRankings(CLIENT), false);
  assert.equal(isExcludedFromRankings({ ...CLIENT, exclude_from_rankings: false }), false);
  assert.equal(isExcludedFromRankings(DEMO), true);
  assert.equal(isExcludedFromRankings(null), false);
  assert.equal(isExcludedFromRankings(undefined), false);
});

test("unrankedClientIds drops the trainer and the demo, keeps the clients", () => {
  const out = unrankedClientIds([TRAINER, CLIENT, DEMO]);
  assert.equal(out.has("t"), true);
  assert.equal(out.has("d"), true);
  assert.equal(out.has("c"), false);
  assert.equal(unrankedClientIds(null).size, 0);
});

test("both TS boards rank through the shared helper", () => {
  for (const f of ["src/app/api/leaderboard/route.ts", "src/app/api/challenge/route.ts"]) {
    const src = read(f);
    assert.match(src, /unrankedClientIds/, `${f} must build its ranked list with unrankedClientIds`);
  }
});

test("the trainer still counts toward the anonymous group total", () => {
  // /api/challenge keeps BOTH sets on purpose: demo-only for the totals,
  // demo+trainer for the named standings. If this collapses to one set again,
  // the group number silently drops by his days.
  const src = read("src/app/api/challenge/route.ts");
  assert.match(src, /const excluded = excludedClientIds\(/);
  assert.match(src, /const unranked = unrankedClientIds\(/);
  assert.match(src, /rankIds = ids\.filter\(\(id\) => !unranked\.has\(id\)\)/);
  // The day counter — which feeds groupTotal — must still use `excluded`.
  assert.match(src, /if \(excluded\.has\(cid\)\) return;/);
});

test("the SQL board filters before it ranks, from one roster definition", () => {
  const sql = read("supabase/migrations/20260803_trainer_out_of_rankings.sql");
  assert.match(sql, /create or replace view v_challenge_roster/);
  // Both functions read the view rather than re-stating the roster.
  const fromView = sql.match(/from v_challenge_roster/g) || [];
  assert.ok(fromView.length >= 2, "both challenge functions must read v_challenge_roster");
  // Ranked filter inside the leaderboard's roster CTE. Filtering AFTER rank()
  // would leave a hole where the coach was — #1 missing, everyone still #2.
  assert.match(sql, /from v_challenge_roster r where r\.ranked/);
  // The total's roster is deliberately unfiltered.
  assert.match(sql, /select r\.cid from v_challenge_roster r\n/);
  assert.match(sql, /exclude_from_rankings boolean not null default false/);
});

test("Coach Bot cannot report a rank the coach does not have", () => {
  const src = read("src/app/api/cron/coachbot/route.ts");
  assert.doesNotMatch(src, /dustin_position/, "a rank for someone who is off the board is an invented fact");
  assert.match(src, /coach_is_not_ranked: true/);
  // "They", not "He". The prompt became a function of the owner's name on
  // 21 Aug — there are two coaches and one of them is not a "he" — but what
  // this guards is unchanged: the model must be TOLD the coach is off the
  // board, not merely left without a number for them.
  assert.match(src, /They are NOT on the board/, "the prompt must say so, not just the facts");
  assert.match(src, /never give them a rank, a place or a score/,
    "the prompt no longer forbids inventing a placing for the coach");
});
