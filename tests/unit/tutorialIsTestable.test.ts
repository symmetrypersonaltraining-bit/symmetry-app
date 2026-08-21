// ============================================================================
// A trainer can test the tutorial, report from inside it, and start again.
//
// Dustin, 21 Aug, on the three trainers about to try it: "make sure feedback is
// available in tuturial so we can have them test, adjust, reset and test again
// until it's right."
//
// Two things were missing from that loop.
//
// REPORT. The feedback bubble was already on /tutorial — it is mounted in the
// root layout — but app_feedback.client_context defaults to
// window.location.pathname, and all 51 steps share one URL. Every report a
// tester filed would have said "/tutorial" and nothing else, so "this bit is
// wrong" arrives with no way to know which bit.
//
// RESET. Progress lives in localStorage and nothing cleared it, so a tester got
// exactly ONE clean walkthrough. Every run after it resumed part-way in with
// ticks already showing — which is not a test.
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

const TUT = strip(read("src/app/(app)/tutorial/TutorialClient.tsx"));

describe("feedback from inside the tutorial says which step", () => {
  it("the tutorial publishes its current step", () => {
    assert.match(TUT, /setPageContext\(/, "the tutorial no longer publishes which step it is on");
    assert.match(TUT, /step\.id/, "the published context does not include the step id");
  });

  it("it clears the context on unmount, so other screens are not mislabelled", () => {
    assert.match(
      TUT,
      /return \(\) => setPageContext\(null\)/,
      "leaving the tutorial would leave its step attached to every later report",
    );
  });

  it("the feedback dock actually reads it", () => {
    const dock = strip(read("src/components/FloatingDock.tsx"));
    assert.match(dock, /getPageContext\(\)/, "FloatingDock ignores the published context again");
    assert.match(dock, /context:\s*getPageContext\(\)/, "the context is read but not submitted");
  });

  it("submitFeedback still prefers an explicit context over the pathname", () => {
    const fb = strip(read("src/lib/feedback.ts"));
    assert.match(
      fb,
      /client_context:\s*input\.context\s*\?\?/,
      "feedback stopped honouring the caller's context, so the tutorial's step is discarded",
    );
  });
});

describe("a tester can start over", () => {
  it("there is a reset that clears all three keys", () => {
    const fn = TUT.slice(TUT.indexOf("function resetTutorialProgress"));
    const body = fn.slice(0, fn.indexOf("\n}") + 2);
    for (const k of ["SEEN_KEY", "POS_KEY", "VOICE_KEY"]) {
      assert.ok(body.includes(k), `reset does not clear ${k}, so a "fresh" run is not fresh`);
    }
  });

  it("it is wired to a control and confirms first", () => {
    assert.match(TUT, /resetTutorialProgress\(\);/, "nothing calls the reset");
    assert.match(TUT, /confirm\(/, "reset wipes progress with no confirmation");
  });

  it("and it clears the in-memory ticks too, not just storage", () => {
    // Clearing localStorage alone leaves every step still ticked until reload.
    const at = TUT.indexOf("resetTutorialProgress();");
    assert.match(
      TUT.slice(at, at + 200),
      /setSeen\(new Set\(\)\)/,
      "the ticks stay on screen after a reset until the page is reloaded",
    );
  });
});
