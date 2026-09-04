// ============================================================================
// Two things a client told us, pinned so they stay fixed.
//
// Both came from Bobbie Page on 20 Aug 2026, and both are the kind of thing
// that gets quietly undone by somebody doing something else nearby.
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

describe("nothing floats over the message composer", () => {
  // "your face is still in the way to try and hit enter on this screen"
  //
  // The 13 Aug fix lifted the coach 64px above the composer and it was STILL
  // in the way a week later. A constant that clears one phone's composer is a
  // guess about every other phone, so messages now has no floating coach at
  // all. Anything re-added to that corner has to answer for this test.
  it("surfaceFor returns null for the messages screen", async () => {
    const { surfaceFor } = await import("../../src/components/GlobalCoach.tsx");
    assert.equal(
      surfaceFor("/messages"),
      null,
      "the floating coach is back on /messages. It sits in the same corner as the send button, and lifting it by a fixed number of pixels has already failed twice.",
    );
  });

  it("still appears on the screens that have room for it", async () => {
    const { surfaceFor } = await import("../../src/components/GlobalCoach.tsx");
    for (const p of ["/home", "/nutrition", "/progress", "/settings"]) {
      assert.ok(surfaceFor(p), `the coach disappeared from ${p} — only /messages was meant to lose it`);
    }
  });

  it("no lift constant was reintroduced for messages", () => {
    const code = strip(read("src/components/GlobalCoach.tsx"));
    assert.ok(
      !/FAB_LIFT[\s\S]{0,200}messages\s*:/.test(code),
      "a pixel lift for the messages screen is back. That approach was tried and it did not hold.",
    );
  });
});

describe("past workouts reset every week", () => {
  const code = strip(read("src/components/ScheduleBoard.tsx"));

  // "The app keeps telling me I missed 13 workouts... I would not be moving 13
  // workouts forward. Thinking it would be cool if it reset each week."
  it("the count is scoped to this week, not all of history", () => {
    assert.match(
      code,
      /w\.date >= weekStart/,
      "the past-workout count is unbounded again. Counting from the beginning of time turns a nudge into a debt nobody can clear, and the number only ever grows.",
    );
    assert.match(code, /function weekStartOf/, "weekStartOf is gone — there is nothing to scope the week to");
  });

  it("the button says past, not missed", () => {
    // Dustin, 21 Aug: "same button but just label it past workouts not missed
    // sessions." A tile that says you missed something is a telling-off.
    //
    // REWRITTEN 4 Sep, and deliberately. The old version matched string
    // literals that STARTED with an arrow, which is how the label happened to
    // be written at the time rather than anything that mattered. The tile
    // redesign put the arrow at the end and split the label across two spans,
    // so a check that was still perfectly happy about the word "missed" failed
    // over punctuation instead. It now reads the whole control and asserts the
    // two things that are actually true requirements.
    const m = code.match(/className="sym-past"[\s\S]*?<\/button>/);
    assert.ok(m, "the past-workouts control is gone — this test has stopped watching anything");
    const strip = m![0];
    assert.ok(
      !/missed/i.test(strip),
      `the past control tells the client they missed something:\n  ${strip}`,
    );
    assert.match(strip, /Past /, "the past control no longer says what it opens");
  });

  it("older sessions are still reachable, just not counted", () => {
    // Resetting the count must not hide the sessions themselves. The past
    // section still lists them and they are still movable — the change is that
    // they stop asking to be dealt with.
    assert.match(code, /showPast \? pastDays : \[\]/, "the past section no longer lists past days at all");
  });
});
