// ============================================================================
// At most ONE full-screen interrupt, and the app enforces it.
//
// Dustin, 21 Aug: "overall i dont want screen take overs popping up constantly
// and causing too much annoyance and clutter."
//
// What he was describing, measured. A lapsed client opening the app on a Sunday
// got FOUR full-screen takeovers stacked:
//
//   SlackerScreen            z 9999   "welcome back slacker", 14 comedy variants
//   ClientTakeovers lapse    z 2000   the same message, written kindly
//   SundayWeighInReminder    z   85   weigh in today
//   ClientWeekSummary brief  z   80   your week in review
//
// ClientTakeovers' own header promised "at most ONE takeover ever on screen"
// and meant it — but it could only speak for the six variants inside itself.
// The other three were mounted elsewhere and painted straight over the top.
// SlackerScreen was the worst of them: it also ignored checkin_nudges_off, so a
// client who had explicitly asked not to be nudged got the wanted poster.
//
// Three are deleted. This file is what stops a fifth being written.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const GONE = [
  ["SlackerScreen", "duplicated the lapse screen at a higher z-index AND ignored the client's own do-not-nudge setting"],
  ["PrankInvoice", "an expired gag still mounted at z-index 99999 on every dashboard load"],
  ["SundayWeighInReminder", "a takeover for a job WeighInNudge does as a card, and it fired at the trainer in /client-preview"],
  ["PwaInstallBanner", "the second of two install prompts, with a second dismiss key"],
] as const;

describe("the culled takeovers stay culled", () => {
  for (const [name, why] of GONE) {
    it(name + " is gone", () => {
      assert.ok(!exists("src/components/" + name + ".tsx"), name + " is back. It was removed because it " + why + ".");
    });
  }

  it("and nothing mounts them", () => {
    const mounts = ["src/app/(app)/home/page.tsx", "src/app/(app)/home/ClientDashboard.tsx", "src/app/(app)/layout.tsx"];
    for (const f of mounts) {
      const code = strip(read(f));
      for (const [name] of GONE) {
        assert.ok(!new RegExp("<" + name + "\\b|<SlackerGate\\b").test(code) || name !== "SlackerScreen", f + " still renders " + name);
        assert.ok(!new RegExp("from [\"']@/components/" + name + "[\"']").test(code), f + " still imports " + name);
      }
    }
  });

  it("exactly one install prompt survives", () => {
    assert.ok(exists("src/components/InstallPrompt.tsx"), "both install prompts were deleted");
    assert.ok(!exists("src/components/PwaInstallBanner.tsx"), "the second install prompt is back");
  });
});

describe("the slot is the only way onto the whole screen", () => {
  it("the slot exists and picks a single holder", () => {
    assert.ok(exists("src/lib/takeoverSlot.ts"), "takeoverSlot.ts is gone");
    const slot = strip(read("src/lib/takeoverSlot.ts"));
    assert.match(slot, /export function currentHolder/, "currentHolder is gone");
    assert.match(slot, /c\.priority < best\.priority/, "the slot no longer resolves by priority");
  });

  // The two components that can cover a client's screen unprompted. Both must
  // ask, or the guarantee is a comment again.
  for (const c of ["ClientTakeovers", "ClientWeekSummary"]) {
    it(c + " asks for the slot before covering the screen", () => {
      const code = strip(read("src/components/" + c + ".tsx"));
      assert.match(code, /useTakeoverSlot\(/, c + " paints full-screen without claiming the slot");
    });
  }

  it("announcements outrank the week brief", () => {
    // Shelf life, the same rule ClientTakeovers uses internally. A birthday is
    // worth saying today only; a week in review is still worth saying tomorrow.
    const slot = strip(read("src/lib/takeoverSlot.ts"));
    const ann = /ANNOUNCEMENTS:\s*(\d+)/.exec(slot);
    const brief = /WEEK_BRIEF:\s*(\d+)/.exec(slot);
    assert.ok(ann && brief, "the priority constants are gone");
    assert.ok(Number(ann![1]) < Number(brief![1]), "the week brief now outranks a birthday");
  });
});

describe("the week in review is weekly, and remembered per person", () => {
  const code = strip(read("src/components/ClientWeekSummary.tsx"));

  it("only opens on Sunday or Monday", () => {
    // It used to fire on the first open of EVERY day while its own comment
    // claimed "once-weekly". A week in review on a Thursday is reviewing a week
    // that has not finished.
    assert.match(code, /dow !== 0 && dow !== 1/, "the week brief opens on days that have nothing to review");
  });

  it("records seen per person, not per device", () => {
    assert.match(
      code,
      /client_announcements_seen/,
      "the brief is back on localStorage only — dismissing it on the phone would leave it waiting on the iPad",
    );
  });

  it("records it on dismissal, not on opening", () => {
    // The old key was written the moment it opened, so closing the app without
    // reading it counted as having read it.
    const dismiss = code.slice(code.indexOf("async function dismissBrief"));
    assert.match(
      dismiss.slice(0, dismiss.indexOf("\n  }") + 4),
      /client_announcements_seen/,
      "dismissBrief no longer records that they saw it",
    );
  });
});
