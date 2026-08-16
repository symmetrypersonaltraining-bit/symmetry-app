// Guard: the duration job never publishes a video by itself again.
//
// ── What was measured, 16 Aug ──────────────────────────────────────────────
//
//   select count(*) filter (where status='approved' and applied_at is not null),
//          count(*) filter (where status='approved' and applied_at is null)
//   from exercise_video_candidates;
//   → 179 auto-applied, 0 reviewed by hand.
//
// 792 exercises have a video; 617 came from the original library. The other 175
// were found by an agent web search and put in front of clients by a cron job,
// and not one of them was looked at first. There was no such thing in that
// database as a video a person had approved.
//
// ── Why that is a bug ──────────────────────────────────────────────────────
//
// /api/video-candidates/decide/route.ts opens with the rule in its own words:
// "The candidates came out of a web search run by an agent, which is a
// perfectly good way to find a demo of a Romanian deadlift and a perfectly good
// way to find a fourteen-minute critique of one. Nothing found that way goes in
// front of a client without a human looking at it first."
//
// The staging table, the review screen, the approve/reject/undo route and the
// previous_video_url stash all exist to enforce that sentence.
// `measure_video_durations()` reached past every one of them: its second loop
// took any candidate of 30 seconds or less on an exercise with no video and
// wrote exercises.video_url directly, every ten minutes.
//
// The queue was not being skipped — it was being run AFTER publication. Its
// "live" list is videos already in front of clients, sorted longest-first, with
// an undo. Review after the fact is a different product from review before it.
//
// This test reads the migrations in order and checks the LAST definition of the
// function, so a later migration quietly restoring the apply loop fails here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");

/** Every migration that redefines the function, oldest first. */
function definitions(): { file: string; body: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(DIR, f), "utf8") }))
    .filter((m) => /create\s+or\s+replace\s+function\s+public\.measure_video_durations/i.test(m.sql))
    .map((m) => {
      const i = m.sql.search(/create\s+or\s+replace\s+function\s+public\.measure_video_durations/i);
      return { file: m.file, body: m.sql.slice(i) };
    });
}

test("the function is defined by a migration at all", () => {
  const defs = definitions();
  assert.ok(defs.length > 0, "measure_video_durations lives only in the database — it must ship as a migration");
});

test("the current definition does not write exercises.video_url", () => {
  const defs = definitions();
  const last = defs[defs.length - 1];
  // The apply loop's signature line. Nothing else in this function touches the
  // exercises table.
  assert.doesNotMatch(
    last.body,
    /update\s+public\.exercises\s+set\s+video_url/i,
    `${last.file} publishes a video without anyone reviewing it`,
  );
  assert.doesNotMatch(
    last.body,
    /set\s+status\s*=\s*'approved'/i,
    `${last.file} approves a candidate without anyone reviewing it`,
  );
});

test("the measuring half is still there — it is the part nothing else can do", () => {
  // Only this function holds the YouTube key. Removing the apply loop must not
  // have taken the duration fill with it, or every candidate sits unmeasured
  // and unapprovable forever.
  const defs = definitions();
  const last = defs[defs.length - 1].body;
  assert.match(last, /set duration_sec = v_secs/i);
  // BOTH parking sites, counted rather than matched: one for a URL no video id
  // can be read out of, one for a video the API does not return (removed,
  // private, deleted account). Either left unparked is a row that is selected
  // every ten minutes forever and never resolves — the failure mode that killed
  // the food import for two weeks.
  const parked = (last.match(/set status = 'dead'/gi) || []).length;
  assert.equal(parked, 2, `${parked} of the 2 dead-URL parking sites survive`);
});

test("`applied` still appears in the return shape, reporting zero", () => {
  // Dropping the key would break anything reading this function's output; it
  // reporting 0 is how you can see it has stopped applying.
  const defs = definitions();
  const last = defs[defs.length - 1].body;
  assert.match(last, /'applied',\s*0/);
});

test("the previous definition was backed up before being replaced", () => {
  // A comment mentioning a bak_ table is not a backup. There has to be a
  // migration that CREATES it and puts pg_get_functiondef into it, or the
  // rollback exists only in whatever ran in someone's session.
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const backup = files.find((f) => {
    const sql = readFileSync(join(DIR, f), "utf8");
    return (
      /create table if not exists public\.bak_measure_video_durations/i.test(sql) &&
      /pg_get_functiondef/i.test(sql) &&
      /'measure_video_durations'/.test(sql)
    );
  });
  assert.ok(backup, "no migration actually captures the old definition — the change is not reversible from the repo");
});

test("approving in the app still stashes what it replaced", () => {
  // The undo path is the only thing that makes an approval cheap to take back,
  // and it is now the ONLY way a video reaches a client.
  const route = readFileSync(join(process.cwd(), "src/app/api/video-candidates/decide/route.ts"), "utf8");
  assert.match(route, /previous_video_url: previous/);
});

// ── The other auto-publisher ───────────────────────────────────────────────
//
// Removing the loop from the DB function was half a fix. `applyMeasured()` in
// /api/video-candidates/verify did the identical thing from the app, with a
// 60-second ceiling instead of 30 — which is where the 58, 59 and 60-second
// videos in the live set came from — so the next verify run would simply
// republish everything.
//
// `applied_at` is only ever set by these two. The human path
// (/api/video-candidates/decide) does not set it, which is what makes
// "179 applied, 0 by hand" a complete answer rather than a suggestive one.

const VERIFY = readFileSync(join(process.cwd(), "src/app/api/video-candidates/verify/route.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the verify route does not publish either", () => {
  assert.doesNotMatch(
    VERIFY,
    /\.from\("exercises"\)\s*\n?\s*\.update\(\{\s*video_url/,
    "verify still writes exercises.video_url — the DB-side fix is half a fix",
  );
  assert.doesNotMatch(
    VERIFY,
    /status:\s*"approved"/,
    "verify still approves a candidate without anyone reviewing it",
  );
});

test("verify still reports `applied`, at zero", () => {
  assert.match(VERIFY, /applied: 0/);
});

test("verify still classifies by length — only the publishing went", () => {
  // MAX_SECONDS remains the ok/too_long boundary. Losing it would leave every
  // measured candidate unclassified.
  assert.match(VERIFY, /MAX_SECONDS/);
  assert.match(VERIFY, /seconds <= MAX_SECONDS \? "ok" : "too_long"/);
});

test("the ranking survived the removal, on the review screen", () => {
  // It used to decide what got published. It now decides what a person is shown
  // first. Deleting it outright would have thrown away a real judgement:
  // highest confidence, then shortest.
  const q = readFileSync(join(process.cwd(), "src/app/(app)/library/videos/VideoQueueClient.tsx"), "utf8");
  assert.match(q, /high: 0, medium: 1, low: 2/);
  assert.match(q, /restSorted/);
  assert.match(q, /\{restSorted\.map/, "the sorted list must be the one actually rendered");
});

test("the queue no longer tells the trainer that short clips go live on their own", () => {
  // Comments stripped: the file explains the old copy in a comment, and the
  // explanation must not satisfy a test about what is on screen.
  const q = readFileSync(join(process.cwd(), "src/app/(app)/library/videos/VideoQueueClient.tsx"), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(q, /Found, but not used/);
  assert.match(q, /Nothing goes in front of a client until you press/);
});
