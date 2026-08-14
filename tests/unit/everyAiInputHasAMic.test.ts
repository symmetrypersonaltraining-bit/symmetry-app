import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY AI INPUT IN THE APP HAS A WORKING MIC.
 *
 * Dustin, 14 Aug 2026: "Any AI that we interact with in the app needs to have
 * mics added, and you need to make sure they're working."
 *
 * The audit that followed found two things, and this file pins both, because
 * both were invisible and neither failed anything:
 *
 *   1. The ✦ Coach had NO mic. It is the AI clients actually tap — it mounts on
 *      every client screen via GlobalCoach — and it was the one surface out of
 *      six with no microphone. Five others had one. Each of the five was
 *      correct on its own, so nothing looked wrong.
 *
 *   2. The nutrition logger's "Say it out loud" row constructed
 *      `webkitSpeechRecognition` inline instead of calling lib/dictation. That
 *      API DOES NOT EXIST in the Capacitor WebView, which is the shell Dustin's
 *      clients run. Voice logging therefore hit the "isn't supported on this
 *      device" toast on every real phone while working perfectly in the desktop
 *      browser it would have been tested in. It also had no mic beside the
 *      textarea — reaching voice meant backing out of the screen you were
 *      typing on.
 *
 * The shape of both bugs is the same one this codebase keeps producing: a
 * second copy that drifts, and a gap nobody can see because every piece passes
 * its own test. So the property pinned here is not "MicButton renders" — it is
 * ONE implementation, reachable from EVERY AI text box.
 */

const ROOT = process.cwd();

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

function read(rel: string): string {
  return codeOnly(readFileSync(join(ROOT, rel), "utf8"));
}

/**
 * Every surface where a person types AT an AI (or types a message an AI
 * drafted). Adding a new one without a mic should fail here — that is the whole
 * point. If a surface genuinely should not have one, delete it from this list
 * DELIBERATELY, with a reason.
 */
const AI_TEXT_SURFACES = [
  // The ✦ Coach — mounts on every client screen through GlobalCoach. The one
  // that was missing.
  "src/app/(app)/nutrition/v3/CoachChatSheet.tsx",
  // Free-text meal items → /api/nutrition-ai/parse.
  "src/app/(app)/nutrition/v3/ComposerSheet.tsx",
  // "Type foods with amounts" / "Describe it loosely" → the same parser.
  "src/app/(app)/nutrition/v3/NutritionV3Client.tsx",
  // The client's answer to the AI's daily question, routed to Dustin's inbox.
  "src/components/CoachFocusCard.tsx",
  // Trainer-side: the AI drafts the weekly focus, Dustin edits it.
  "src/components/TrainerWeekDigest.tsx",
  // The trainer agent drawer.
  "src/components/AIAssistant.tsx",
];

for (const rel of AI_TEXT_SURFACES) {
  test(`${rel} gives the person a microphone`, () => {
    const src = read(rel);
    assert.ok(
      /MicButton/.test(src) || /startDictation\(/.test(src),
      `${rel} takes free text destined for an AI and offers no way to speak it. ` +
        `Import MicButton from "@/components/MicButton" and put it on the input — ` +
        `the ✦ Coach was missing exactly this and nobody noticed for a week.`,
    );
  });
}

test("speech recognition is implemented in exactly ONE file", () => {
  // The inline copy in NutritionV3Client is why voice logging was dead in the
  // native shell: it knew about webkitSpeechRecognition and nothing else.
  // lib/dictation is the only place allowed to know the engine exists, because
  // it is the only place that also knows about the Capacitor bridge.
  const offenders: string[] = [];
  const files = execFiles();
  for (const f of files) {
    if (f.endsWith("src/lib/dictation.ts")) continue;
    const src = codeOnly(readFileSync(f, "utf8"));
    if (/webkitSpeechRecognition|new SR\(\)/.test(src)) offenders.push(f.replace(ROOT + "/", ""));
  }
  assert.deepEqual(
    offenders,
    [],
    `these files build their own speech recogniser instead of calling startDictation: ` +
      `${offenders.join(", ")}. webkitSpeechRecognition does not exist in the Capacitor ` +
      `WebView, so a second implementation is a microphone that works everywhere except ` +
      `on the clients' actual phones.`,
  );
});

test("a mic APPENDS to what was typed — it never replaces it", () => {
  // Someone half-types a meal, taps the mic to finish it out loud, and the
  // transcript wipes the half they already typed. Silent, infuriating, and the
  // kind of thing only found by a person mid-log.
  for (const rel of AI_TEXT_SURFACES) {
    const src = read(rel);
    const uses = src.match(/onText=\{[^}]*\}/g) ?? [];
    for (const u of uses) {
      assert.match(
        u,
        /\(p\)/,
        `${rel} passes a mic handler that does not read the previous value: ${u}. ` +
          `Use the functional form — (t) => setX((p) => (p ? p + " " + t : t)) — or ` +
          `dictation destroys whatever the person already typed.`,
      );
    }
  }
});

test("the mic stops when its screen goes away", () => {
  // Android allows ONE recogniser at a time. A sheet closed mid-dictation
  // without stopping holds the slot, and the next mic ANYWHERE in the app then
  // silently fails to start — presenting as "the mic works sometimes".
  const mic = read("src/components/MicButton.tsx");
  assert.match(
    mic,
    /useEffect\(\(\) => \(\) =>/,
    "MicButton no longer stops its recogniser on unmount. Android allows one " +
      "recogniser at a time; an orphaned one makes every later mic fail to start.",
  );
});

test("an unavailable mic says WHICH no it is", () => {
  const mic = read("src/components/MicButton.tsx");
  assert.match(
    mic,
    /not-allowed|permission/i,
    "MicButton no longer distinguishes a denied microphone permission from a missing " +
      "engine. They need opposite things from the person holding the phone, and one " +
      "generic message is how a fixable permission prompt reads as a broken feature.",
  );
});

// ---------------------------------------------------------------------------

function execFiles(): string[] {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  return execSync(`find ${JSON.stringify(join(ROOT, "src"))} -name '*.ts' -o -name '*.tsx'`, {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}
