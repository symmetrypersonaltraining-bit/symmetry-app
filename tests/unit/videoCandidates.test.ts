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
 * 151 candidates were found by agents searching YouTube. The search half is
 * cheap to get right and cheap to get wrong — a wrong candidate is one bad row
 * in a staging table. The DURATION half is the part that reaches a client: the
 * failure is somebody tapping play mid-set and getting a fourteen-minute
 * talking-head review of the movement instead of a five-second demo.
 *
 * And the duration is the part most likely to break silently, because it is
 * scraped out of a watch page rather than read from an API. The day YouTube
 * renames the field, every check starts returning "cannot tell" — and the only
 * thing standing between that and the whole queue being waved through is the
 * approve guard. So both halves are pinned here.
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

test("only the decide route writes a video URL onto an exercise", () => {
  // The whole staging design collapses if anything upstream can write straight
  // to exercises.video_url — that is what keeps a web-search result from
  // reaching a client without a human looking at it.
  assert.ok(
    !/\.from\("exercises"\)[\s\S]{0,120}video_url:/.test(strip(VERIFY)),
    "the verify route writes video_url onto an exercise — it must only touch the candidates table",
  );
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

test("the ceiling is Dustin's thirty seconds", () => {
  assert.equal(MAX_SECONDS, 30);
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
