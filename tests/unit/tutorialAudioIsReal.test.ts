// ============================================================================
// A step is only claimed as recorded if the file is actually there.
//
// The failure this prevents is silent and unpleasant: RECORDED_STEPS says a
// step has audio, narrate() reaches for /tutorial-audio/<id>.mp3, the file 404s,
// and the step plays NOTHING — no recording and no fallback to the browser
// voice either, because the fallback only happens when audioUrl is null.
//
// So the generated set has to agree with the filesystem in both directions,
// and every id in it has to be a real step.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RECORDED_STEPS, resolveAudio } from "../../src/lib/tutorial/audio.ts";
import { allSteps } from "../../src/lib/tutorial/script.ts";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "public/tutorial-audio");

const onDisk = fs.existsSync(DIR)
  ? new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(/\.mp3$/, "")))
  : new Set<string>();

describe("recorded tutorial narration", () => {
  it("every claimed recording exists on disk", () => {
    const missing = [...RECORDED_STEPS].filter((id) => !onDisk.has(id));
    assert.deepEqual(
      missing,
      [],
      `these steps claim a recording with no file behind it — they would play SILENCE, not the browser voice:\n  ${missing.join("\n  ")}`,
    );
  });

  it("every file on disk is claimed", () => {
    const unclaimed = [...onDisk].filter((id) => !RECORDED_STEPS.has(id));
    assert.deepEqual(unclaimed, [], `recorded but never played — re-run scripts/voice/ingest-narration.sh`);
  });

  it("every claimed recording belongs to a real step", () => {
    const ids = new Set(allSteps().map((s) => s.id));
    const orphans = [...RECORDED_STEPS].filter((id) => !ids.has(id));
    assert.deepEqual(orphans, [], "recordings for steps that no longer exist");
  });

  it("an unrecorded step resolves to null, so the browser voice still reads it", () => {
    assert.equal(resolveAudio({ id: "definitely-not-a-step" }), null);
  });

  it("an explicit audioUrl always wins", () => {
    assert.equal(resolveAudio({ id: "x", audioUrl: "/custom.mp3" }), "/custom.mp3");
  });
});
