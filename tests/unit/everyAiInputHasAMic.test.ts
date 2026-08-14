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

/**
 * The ONE mic that deliberately does not append.
 *
 * AIAssistant is the trainer drawer: speaking into it SENDS the question rather
 * than filling the box, because it is used one-handed between sets and "ask out
 * loud, get the answer" is the entire point of a mic there. There is nothing to
 * preserve, because the box is empty by design.
 *
 * Listed here by name so the rule stays a rule. The alternative — softening the
 * assertion so everything passes — is how the rule quietly stops protecting the
 * five surfaces that DO need it.
 */
const SENDS_INSTEAD_OF_APPENDING = new Set(["src/components/AIAssistant.tsx"]);

test("a mic APPENDS to what was typed — it never replaces it", () => {
  // Someone half-types a meal, taps the mic to finish it out loud, and the
  // transcript wipes the half they already typed. Silent, infuriating, and the
  // kind of thing only found by a person mid-log.
  for (const rel of AI_TEXT_SURFACES) {
    if (SENDS_INSTEAD_OF_APPENDING.has(rel)) continue;
    const src = read(rel);
    const uses = src.match(/onText=\{[^}]*\}/g) ?? [];
    for (const u of uses) {
      assert.match(
        u,
        /\(p\)/,
        `${rel} passes a mic handler that does not read the previous value: ${u}. ` +
          `Use the functional form — (t) => setX((p) => (p ? p + " " + t : t)) — or ` +
          `dictation destroys whatever the person already typed. If this surface ` +
          `genuinely should send instead of append, add it to ` +
          `SENDS_INSTEAD_OF_APPENDING with the reason.`,
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

test("a recording mic MOVES", () => {
  /**
   * Dustin, after testing it on his phone: "mic seems to work but needs
   * animation while recording."
   *
   * He is right and it is not cosmetic. A red button with a stop icon is a
   * STATE — it tells you what a tap did, not whether the app is still hearing
   * you. Standing in a gym talking at a phone held at arm's length, "did that
   * actually start?" is the only question, and a still image cannot answer it.
   *
   * Pinned because this is exactly what a refactor drops without noticing: the
   * button still works, still turns red, still returns a transcript, and every
   * other test still passes.
   */
  const mic = read("src/components/MicButton.tsx");
  assert.match(mic, /mic-live/, "the recording halo class is gone from MicButton");
  assert.match(mic, /mic-wave/, "the animated sound bars are gone from MicButton");
  assert.ok(
    mic.indexOf("listening ?") > -1 && /mic-wave[\s\S]{0,400}ti-microphone/.test(mic),
    "the wave no longer replaces the idle microphone icon while listening",
  );

  const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
  for (const kf of ["@keyframes mic-halo", "@keyframes mic-bar", ".mic-wave", ".mic-live"]) {
    assert.ok(
      css.includes(kf),
      `${kf} is missing from globals.css — MicButton renders the class names and ` +
        `nothing animates, which looks identical to a mic that failed to start`,
    );
  }
  assert.match(
    css,
    /prefers-reduced-motion[\s\S]{0,400}mic-live/,
    "the reduced-motion fallback is gone. Someone who turned animations off still " +
      "has to be able to tell the mic is live, so the halo goes static rather than away.",
  );
});

test("MicButton is the ONLY thing in the app that draws a microphone", () => {
  /**
   * No exclusions. Dustin signed off on the last two — the workout logger and
   * the client program page — on 14 Aug, and converting them turned up three
   * more mics that had never worked properly:
   *
   *   · the logger's FEEDBACK mic had no onStart/onEnd, so it never changed
   *     appearance; it threw away the handle, so it could not be stopped and a
   *     second tap orphaned a recogniser (Android allows one); and it called
   *     alert(), which this very file's comments say wedges a WebView.
   *   · the SECOND mount of the AI-programming-note mic referenced no listening
   *     state at all, so it sat dead still while recording.
   *   · the session-note mic handler had no button anywhere in the JSX. Dead
   *     code that read like a working feature.
   *
   * Three mics, one file, none of them right, and every test green throughout.
   * That is the argument for this test having no exemptions.
   *
   * The first version looked for aria-label="Dictate", which most hand-rolled
   * buttons did not set — so it passed while five copies existed. The icon is
   * the honest signal: if a file draws a microphone, it owns a mic.
   */
  const files = execFiles().filter((f) => !f.endsWith("src/components/MicButton.tsx"));
  const offenders = files
    .filter((f) => /ti-microphone/.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(ROOT + "/", ""))
    .sort();

  assert.deepEqual(
    offenders,
    [],
    `these files draw their own microphone instead of using MicButton:\n  ${offenders.join("\n  ")}\n` +
      `One mic, one place. Otherwise the next change to how a mic looks or behaves ` +
      `reaches only some of them — which is exactly how the ✦ Coach ended up the ` +
      `single AI surface in the app with no mic at all.`,
  );
});

test("dictation failure copy lives in ONE place", () => {
  // voiceMessage was WorkoutLogger's, and it was the best in the app: it tells a
  // permission the person can grant apart from a device limit they cannot apart
  // from a network blip. Every other surface had a single generic sentence for
  // all three, which is how a thirty-second settings fix got reported as "the
  // mic doesn't work".
  const dict = read("src/lib/dictation.ts");
  assert.match(dict, /export function dictationMessage/, "dictationMessage is gone from lib/dictation");
  for (const needle of ["no-engine", "not-allowed", "network"]) {
    assert.ok(dict.includes(needle), `dictationMessage no longer distinguishes "${needle}"`);
  }
  assert.match(
    read("src/components/MicButton.tsx"),
    /dictationMessage\(/,
    "MicButton stopped using dictationMessage, so every mic is back to one generic sentence",
  );

  // Comments stripped: MicButton's header legitimately QUOTES the reason codes
  // while explaining them. Reading raw source flagged it, which is a false
  // positive of exactly the kind that gets a test deleted rather than fixed.
  const copies = execFiles()
    .filter((f) => !f.endsWith("src/lib/dictation.ts"))
    .filter((f) => /function voiceMessage|"no-engine"/.test(codeOnly(readFileSync(f, "utf8"))))
    .map((f) => f.replace(ROOT + "/", ""));
  assert.deepEqual(copies, [], `these files re-implement the failure copy: ${copies.join(", ")}`);
});

test("an unavailable mic says WHICH no it is", () => {
  // The distinguishing moved into dictationMessage (see the test above), so this
  // now checks that MicButton still ROUTES failures through it rather than
  // quietly swallowing them or printing one sentence for every cause.
  const mic = read("src/components/MicButton.tsx");
  assert.match(
    mic,
    /onUnavailable[\s\S]{0,300}dictationMessage\(/,
    "MicButton's onUnavailable no longer runs the reason through dictationMessage. " +
      "A denied permission and a missing engine need opposite things from the person " +
      "holding the phone, and one generic message is how a thirty-second settings fix " +
      "reads as a broken feature.",
  );
  assert.match(
    mic,
    /onNotice\s*\?|if \(onNotice\)/,
    "MicButton stopped preferring the caller's inline notice over alert(). A modal " +
      "from inside a WebView overlay is ignored at best and wedges the page at worst.",
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
