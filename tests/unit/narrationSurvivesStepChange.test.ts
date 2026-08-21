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

  it("starts the next line inside the tap, not in an effect afterwards", () => {
    // Stronger than what this asserted first time round. The original fix
    // spent the gesture on a separate "unlock" and still left the actual
    // playback to the arrival effect — a tick past the gesture, which is the
    // window mobile actually checks. Starting the line in go() itself is the
    // thing that matters; the unlock is now only for speech synthesis.
    assert.match(
      player,
      /setIdx\(at\);[\s\S]{0,400}play\(steps\[at\]\)/,
      "go() must call play() for the step it is moving to, in the same handler as the tap",
    );
  });

  it("does not tear down the line the tap just started", () => {
    // The second half of the silence. The arrival effect returned `stop`, so:
    // tap -> go() starts the line -> React re-renders -> the old effect's
    // cleanup runs -> stop() kills it. Unmount cleanup belongs on its own
    // effect, which exists.
    const arrival = player.slice(
      player.indexOf("Speak on arrival"),
      player.indexOf("Never leave a voice talking"),
    );
    assert.ok(arrival.length > 0, "the arrival effect is gone — nothing plays on step change");
    assert.doesNotMatch(
      arrival,
      /return stop;/,
      "the arrival effect must not clean up with stop() — it fires after go() has already " +
        "started the new line, and stops it",
    );
    assert.match(
      arrival,
      /startedFor\.current === step\.id/,
      "and it must skip a step go() already started, or both fire and talk over each other",
    );
  });
});

describe("the player says nothing it is not doing", () => {
  it("never mutes the shared element", () => {
    // Reported: "botton is there to listen to tuturial but still no sound it
    // says playing. and it glitches like crazy when you click listen button".
    //
    // The unlock muted the element, played it, and restored `muted` in a
    // promise callback. That callback landed after the real line had started —
    // so it paused the narration a beat in and left `muted` wherever the race
    // put it. The UI said "Playing…" because React state had been set; the
    // element was paused and silent.
    assert.doesNotMatch(
      speech,
      /\.muted\s*=/,
      "nothing may mute the shared audio element. If it needs unlocking, unlock it by " +
        "playing the real line from a real tap — which is what go() and the play button do.",
    );
  });

  it("never pauses the element from a promise callback", () => {
    assert.doesNotMatch(
      speech,
      /\.then\([\s\S]{0,120}\.pause\(\)/,
      "a deferred pause cannot know whether a newer line has started since — it silences it",
    );
  });

  it("treats an aborted load as a cancellation, not a broken file", () => {
    assert.match(
      speech,
      /MEDIA_ERR_ABORTED/,
      "swapping src mid-load fires an abort on this element. Reacting to it starts the " +
        "browser voice on top of the line about to play — the glitching he saw.",
    );
    assert.match(
      speech,
      /el\.currentSrc[\s\S]{0,80}endsWith\(url\)/,
      "an error for a line already moved on from belongs to that line, not this one",
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
describe("the tutorial is reachable", () => {
  const entryPoints = [
    ["the dashboard", "src/app/(app)/home/TrainerHome.tsx", /<TutorialCard \/>/],
    ["the sidebar", "src/components/TrainerSidebar.tsx", /href: "\/tutorial"/],
    ["settings", "src/app/(app)/settings/SettingsClient.tsx", /href="\/tutorial"/],
  ] as const;

  for (const [where, file, pattern] of entryPoints) {
    it(`has a door from ${where}`, () => {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert.match(
        src,
        pattern,
        `${where} lost its link to /tutorial. Settings alone is not findable — that is ` +
          "the state this was reported in.",
      );
    });
  }
});

describe("a trainer can put the guide away", () => {
  const hook = fs.readFileSync(path.join(ROOT, "src/lib/useTutorialVisibility.ts"), "utf8");

  it("hides per trainer, never with the global flag", () => {
    // The failure this prevents: "I'm done" wired to app_flags, so the trainer
    // who finishes first switches the guide off for every trainer onboarded
    // after them — including the one person who actually needs it.
    assert.match(
      hook,
      /trainer_settings[\s\S]{0,200}tutorial_dismissed_at/,
      "the dismissal must live on the trainer's own settings row",
    );
    assert.doesNotMatch(
      stripComments(hook),
      /from\("app_flags"\)[\s\S]{0,200}(update|upsert|insert)/,
      "hiding the guide must never write to app_flags — that switch is global",
    );
  });

  it("a failed read shows the guide rather than hiding it", () => {
    // Opposite default to lib/flags.ts, on purpose. An unwanted card is an
    // annoyance; a new trainer whose only signpost silently vanished is not.
    assert.match(
      hook,
      /setDismissed\(false\)/,
      "the catch/no-user paths must fall back to NOT dismissed",
    );
  });

  it("hiding is reversible", () => {
    assert.match(hook, /export interface TutorialVisibility[\s\S]*?show: \(\) => Promise<void>/,
      "there must be a way back — hiding the guide cannot be one-way");
    for (const [where, file] of [
      ["the tutorial's own last screen", "src/app/(app)/tutorial/TutorialClient.tsx"],
      ["Settings", "src/app/(app)/settings/SettingsClient.tsx"],
    ] as const) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert.match(src, /show(Tutorial)?\(\)/, `${where} lost the control that restores it`);
    }
  });
});
