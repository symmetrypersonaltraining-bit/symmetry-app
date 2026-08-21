// ============================================================================
// The tutorial has to keep talking after step one, and the voice has to be
// findable at all.
//
// Both halves of this were real, reported bugs on the first phone test:
// "there is no voice on tutorial and needs to be easier to find".
//
//  1. narrate() built a NEW Audio element per line. Mobile only lets a media
//     element start playing while the tap that asked for it is still on the
//     stack; the next step's line is fired from an effect, a tick too late, on
//     an element that has never been unlocked. So the tap on "Voice on" played
//     step one and every step after it was silent. One long-lived element,
//     unlocked once inside a real gesture, keeps its permission.
//
//  2. The control was gated on speechSupported() — whether the BROWSER can do
//     text-to-speech — even though 51 steps are pre-recorded mp3s that need no
//     speech synthesis at all. And it lived in a row of grey buttons under the
//     body text reading "Voice off", which is not a play button.
//
// These assert the shape of the source, which is blunt, but the alternative is
// a headless browser with a media stack and a gesture simulator to catch a
// regression that is one careless `new Audio(` away.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
/** Strip comments before scanning — the prose explains the bug by naming it. */
function stripComments(src: string): string {
  // Block comments FIRST. Stripping {/* jsx */} ahead of them lets the
  // non-greedy span run from an unrelated `{` to the last `*/ }` in the file
  // and swallow the code in between — which is how this test first "passed"
  // against a source it had reduced to four lines.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const speech = stripComments(fs.readFileSync(path.join(ROOT, "src/lib/speech.ts"), "utf8"));
const player = fs.readFileSync(
  path.join(ROOT, "src/app/(app)/tutorial/TutorialClient.tsx"),
  "utf8",
);

describe("narration survives a step change", () => {
  it("does not construct an Audio element per line", () => {
    // The single permitted `new Audio()` is the shared element's constructor,
    // which takes no src. `new Audio(url)` is the bug.
    const perLine = speech.match(/new Audio\(\s*[^)\s]/g) || [];
    assert.deepEqual(
      perLine,
      [],
      "speech.ts builds an Audio element from a URL. A freshly constructed element " +
        "has never been unlocked by a gesture, so mobile refuses to play it from an " +
        "effect and every step after the first is silent. Reuse the shared element " +
        "and set .src instead.",
    );
  });

  it("exposes a gesture-time unlock", () => {
    assert.match(
      speech,
      /export function unlockNarration\(\)/,
      "speech.ts must export unlockNarration() — the only thing that can buy playback " +
        "permission is a real tap, and it has to be spendable from a click handler.",
    );
  });

  it("spends the tap that moves between steps", () => {
    assert.match(
      player,
      /unlockNarration\(\);[\s\S]{0,200}setIdx\(/,
      "go() must call unlockNarration() before changing step. Next/Back ARE the user " +
        "gesture; if it is not spent there, the line that plays a tick later is not " +
        "user-initiated and mobile drops it.",
    );
  });
});

describe("the voice control is findable", () => {
  it("is not gated on browser text-to-speech alone", () => {
    assert.match(
      player,
      /const canHear = recorded \|\| speechSupported\(\)/,
      "A pre-recorded step needs no speech synthesis. Gating the player on " +
        "speechSupported() alone hides 51 real recordings from any browser with TTS " +
        "unavailable or switched off.",
    );
  });

  it("offers a play control, not a settings toggle", () => {
    assert.match(
      player,
      /aria-label=\{speaking \? "Stop narration" : "Play narration"\}/,
      "The control has to read as a player. It used to be a grey button labelled " +
        "'Voice off' sitting last in a row of grey buttons, and the first person to " +
        "test the tutorial reported it had no voice.",
    );
  });
});
