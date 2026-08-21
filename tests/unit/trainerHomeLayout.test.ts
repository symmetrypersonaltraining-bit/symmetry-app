// ============================================================================
// What is, and is not, on the trainer home screen.
//
// Both of these are here because they were asked for by name, and both are the
// kind of thing a later session undoes by accident while doing something else.
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

describe("Week ahead is off the home screen", () => {
  // Dustin, 21 Aug: "get rid of this table all together, this function we will
  // talk about later and needs to be fully automated not on my home screen."
  const home = strip(read("src/app/(app)/home/TrainerHome.tsx"));

  it("TrainerWeekDigest is not rendered on trainer home", () => {
    assert.ok(
      !/<TrainerWeekDigest\b/.test(home),
      "the Week ahead roster is back on the home screen. It was removed on purpose — the function is wanted AUTOMATED, and is a conversation still to be had.",
    );
  });

  it("it is not imported there either", () => {
    assert.ok(
      !/from ["']@\/components\/TrainerWeekDigest["']/.test(home),
      "TrainerWeekDigest is imported into trainer home again",
    );
  });

  it("but the component still exists", () => {
    // Deleting it would mean rebuilding the roster maths, the drift detection
    // and the focus editor from nothing when the automation conversation
    // happens. Unmounted is the decision; deleted is not.
    assert.ok(
      fs.existsSync(path.join(ROOT, "src/components/TrainerWeekDigest.tsx")),
      "TrainerWeekDigest.tsx was deleted. It is meant to be unmounted, not gone — the function is still wanted, automated.",
    );
  });

  it("nothing else lost its way to approve a focus line", () => {
    // The digest was one of two ways a focus line got set. If SaturdayReview
    // ever leaves too, the Sunday fallback publishes AI text to clients that
    // nobody has read.
    assert.match(home, /<SaturdayReview\b/, "SaturdayReview is gone from home — focus drafts would then publish on Sunday unreviewed");
  });
});

describe('"Needs your eyes" shows three, and folds back up', () => {
  const panel = read("src/components/ClientNotesPanel.tsx");
  const code = strip(panel);

  it("previews three notes, not six", () => {
    const m = /const PREVIEW = (\d+);/.exec(code);
    assert.ok(m, "PREVIEW is gone — the preview count is hardcoded somewhere again");
    assert.equal(m![1], "3", `the panel previews ${m![1]} notes. With 58 open it was taller than the phone and ran into the payments card below it.`);
  });

  it("the expand control toggles rather than being a one-way door", () => {
    assert.ok(
      /setShowAll\(\(v\) => !v\)/.test(code),
      'the "show the rest" button sets showAll true instead of toggling — open it once and the panel stays tall for the rest of the session',
    );
    assert.match(code, /Show fewer/, "there is no way to collapse the list again");
  });

  it("has room beneath it for the next card", () => {
    assert.match(
      code,
      /rounded-2xl overflow-hidden mt-4 mb-4/,
      "the notes panel lost its bottom margin — it sits flush against the payments card and reads as overlapping it",
    );
  });
});
