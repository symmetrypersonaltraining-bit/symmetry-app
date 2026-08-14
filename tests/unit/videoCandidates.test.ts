import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lengthFromHtml, videoId, MAX_SECONDS } from "../../src/app/api/video-candidates/verify/route";

/**
 * THE VIDEO PIPELINE'S ONE LOAD-BEARING RULE.
 *
 * Dustin, 2026-08-13: "All videos need to be under thirty seconds, preferably
 * under twenty seconds."
 *
 * Videos now fill themselves in — he asked for that explicitly, after the first
 * version parked all 151 behind an approval queue: "you put all videos in the
 * app that are currently there without my checking every one why cant you do it
 * now?" He was right; the 553 already in the library went in unreviewed, so the
 * queue was holding new videos to a standard nothing else met, and it would
 * have sat there.
 *
 * What did NOT relax, and is what this file is about: the LENGTH. A candidate
 * whose duration could not be read is never applied. The failure it prevents is
 * a client tapping play mid-set and getting a fourteen-minute talking-head
 * review of the movement instead of a five-second demo.
 *
 * That is exactly the guard most likely to erode, because it is now the only
 * thing standing between an automatic writer and 250 client-facing screens —
 * and because the duration is SCRAPED out of a watch page rather than read from
 * an API. The day YouTube renames the field, every check starts returning
 * "cannot tell". If that ever came to mean "apply anyway", the whole library
 * would fill with unmeasured videos in one run, silently.
 */

const ROOT = process.cwd();
const DECIDE = readFileSync(join(ROOT, "src/app/api/video-candidates/decide/route.ts"), "utf8");
const VERIFY = readFileSync(join(ROOT, "src/app/api/video-candidates/verify/route.ts"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a candidate with no verified length can never be approved", () => {
  const code = strip(DECIDE);
  assert.match(
    code,
    /if \(c\.duration_sec == null\)[\s\S]{0,220}status: 400/,
    "the approve path no longer refuses candidates whose length was never read — " +
      "this is the only thing keeping an unmeasured video off a client's screen",
  );
  // And the refusal must come BEFORE the write, not after it.
  const guardAt = code.indexOf("c.duration_sec == null");
  const writeAt = code.indexOf('.from("exercises")\n    .update({ video_url: c.url');
  assert.ok(guardAt !== -1 && writeAt !== -1 && guardAt < writeAt, "the length guard must run before the write");
});

test("approving stashes the URL it overwrote, so it can be undone", () => {
  const code = strip(DECIDE);
  assert.match(code, /previous_video_url: previous/, "approve must record what it replaced");
  assert.match(code, /action === "undo"[\s\S]{0,400}video_url: c\.previous_video_url/, "undo must restore it");
});

test("the automatic fill only ever writes a MEASURED, in-ceiling candidate", () => {
  const code = strip(VERIFY);
  // The query that feeds the writer. Both filters are load-bearing: without
  // `not null` an unmeasured row is eligible, without `lte` a two-hour video is.
  assert.match(
    code,
    /\.eq\("status", "pending"\)\s*\.not\("duration_sec", "is", null\)\s*\.lte\("duration_sec", MAX_SECONDS\)/,
    "the auto-fill no longer restricts itself to measured candidates under the ceiling — " +
      "one run would fill the library with unmeasured videos",
  );
});

test("the automatic fill never replaces a video that is already there", () => {
  const code = strip(VERIFY);
  // Overwriting a demo Dustin chose, or one that has worked for months, with a
  // search result is a regression nobody notices until a client does.
  assert.match(code, /\.filter\(\(e\) => !e\.video_url\)/, "the empty-only filter is gone");
  assert.match(code, /if \(!empty\.has\(c\.exercise_id\)\) continue/, "candidates are no longer screened against it");
});

test("the fill picks the best candidate per exercise, not an arbitrary one", () => {
  const code = strip(VERIFY);
  assert.match(code, /CONF_RANK/, "confidence is no longer part of the choice");
  // Shortest wins ties: his stated preference is "preferably under twenty".
  assert.match(code, /a\[0\] < b\[0\] \|\| \(a\[0\] === b\[0\] && a\[1\] < b\[1\]\)/);
  // And the runners-up must be closed out, or the next run flips the video back
  // and forth between two candidates forever.
  assert.match(code, /status: "superseded"/, "losing candidates stay pending and will re-apply");
});

test("the length parser reads a real watch-page payload", () => {
  // Shapes captured from live pages. If YouTube renames these, this test is the
  // thing that says so — otherwise every candidate silently becomes
  // 'unverified' and the queue just quietly stops filling.
  assert.equal(lengthFromHtml('..."lengthSeconds":"17","keywords"...'), 17);
  assert.equal(lengthFromHtml('...{"lengthSeconds": "212", "isLive":false}...'), 212);
  // approxDurationMs is the fallback and is MILLISECONDS. Reading it as
  // seconds would make a 19-second demo look like a 5-hour video and quietly
  // bury every good candidate as 'too_long'.
  assert.equal(lengthFromHtml('..."approxDurationMs":"19000"...'), 19);
  // No payload is "I cannot tell", never zero and never a pass.
  assert.equal(lengthFromHtml("<html>consent interstitial</html>"), null);
  assert.equal(lengthFromHtml('"lengthSeconds":"0"'), null);
});

test("a page we could not read is retried, not recorded as a verdict", () => {
  const code = strip(VERIFY);
  assert.match(
    code,
    /if \(v\.status === "unverified"\) return Promise\.resolve\(\)/,
    "an unreadable page must write nothing — leaving duration_sec null is what makes the next run retry it. " +
      "Recording a verdict would bury a probably-fine video behind one transient fetch",
  );
});

test("the ceiling is Dustin's sixty seconds", () => {
  /**
   * Was 30. He raised it to 60 on 14 Aug after the numbers showed the "119
   * exercises still need a video" problem was not a search problem at all:
   * 112 of the 119 already HAD a video found, parked in `too_long` because the
   * shortest clip that existed for them ran 31 seconds against a 30-second
   * ceiling.
   *
   * Pinned as a value he owns, not a number to tune. Anyone lowering it is
   * taking videos off 67 exercises; anyone raising it is putting something
   * longer than a minute in front of someone mid-set. Either is his call.
   */
  assert.equal(MAX_SECONDS, 60);
});

test("every URL shape the agents recorded still parses", () => {
  assert.equal(videoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoId("https://example.com/not-a-video"), null);
});

test("both routes are trainer-only, checked against the session", () => {
  for (const [name, src] of [["verify", VERIFY], ["decide", DECIDE]] as const) {
    const code = strip(src);
    assert.match(code, /isTrainerUser\(user\)/, `${name} no longer checks the trainer`);
    assert.match(code, /supabase\.auth\.getUser\(\)/, `${name} must resolve the user from the session`);
    assert.ok(
      !/body\.(email|isTrainer|role)/.test(code),
      `${name} trusts the request body for identity`,
    );
  }
});
