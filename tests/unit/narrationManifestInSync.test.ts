// ============================================================================
// Every spoken tutorial step is in the narration manifest.
//
// The manifest is what gets recorded in Dustin's voice. A step missing from it
// is not a build error and not a broken page — it is one line of the tutorial
// suddenly spoken by the browser's robot voice, in the middle of his own. That
// is the kind of fault nobody notices until a new trainer is sitting in front
// of it.
//
// So: adding a step to src/lib/tutorial/script.ts without regenerating the
// manifest fails here, with the command to fix it.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allSteps } from "../../src/lib/tutorial/script.ts";

const ROOT = process.cwd();
const REGEN = "npx tsx scripts/voice/build-manifest.ts > scripts/voice/narration-manifest.json";

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/voice/narration-manifest.json"), "utf8"),
) as { lines: { id: string; text: string }[] };

describe("the narration manifest matches the tutorial script", () => {
  const steps = allSteps();

  it("has an entry for every step", () => {
    const have = new Set(manifest.lines.map((l) => l.id));
    const missing = steps.filter((s) => !have.has(s.id)).map((s) => s.id);
    assert.deepEqual(
      missing,
      [],
      `${missing.length} tutorial step(s) have no recorded line and would fall back to the robot voice mid-tutorial. Regenerate:\n  ${REGEN}`,
    );
  });

  it("has no entry for a step that no longer exists", () => {
    const real = new Set(steps.map((s) => s.id));
    const orphans = manifest.lines.filter((l) => !real.has(l.id)).map((l) => l.id);
    assert.deepEqual(orphans, [], `the manifest still lists removed steps. Regenerate:\n  ${REGEN}`);
  });

  it("the recorded words are the words the tutorial actually says", () => {
    // Editing narration without regenerating leaves a recording of the OLD
    // line playing over the NEW text on screen — worse than no recording.
    const byId = new Map(manifest.lines.map((l) => [l.id, l.text]));
    const drifted = steps
      .filter((s) => byId.get(s.id) !== s.narration.replace(/\s+/g, " ").trim())
      .map((s) => s.id);
    assert.deepEqual(
      drifted,
      [],
      `${drifted.length} step(s) had their narration edited after the manifest was built. The recording would say something different from the screen. Regenerate:\n  ${REGEN}`,
    );
  });

  it("every line is short enough to clone cleanly", () => {
    // Chatterbox is prompted per line. Very long lines drift in prosody and
    // are also the ones that fail and have to be retried individually.
    const long = manifest.lines.filter((l) => l.text.split(/\s+/).length > 120).map((l) => l.id);
    assert.deepEqual(long, [], "these narration lines are over 120 words and should be split");
  });
});
