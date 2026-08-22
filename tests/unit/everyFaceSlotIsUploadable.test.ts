// ============================================================================
// The upload screen must offer exactly the faces the app asks for.
//
// A trainer's own set lives at /bots/<set>/<slug>.webp and faceSrc() builds
// that path from ART in faces.ts. So the slot list on the upload screen is not
// a menu — it IS the set of filenames that will ever be looked for.
//
// Two ways that goes wrong, both silent:
//   * a mood in ART with no slot on the upload screen → a face nobody can ever
//     supply, and every card using it falls back to the stock cartoon
//   * a slot on the screen with no mood → the trainer poses, crops and uploads
//     an image the app will never once display
//
// The first version of the script sent to trainers had SEVEN of the first kind
// — hydrate, nutrition, streak, pr, messages, plan, tips — and four of the
// second. Twenty good images, seven blank spots.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FACE_SLOTS, FACE_SLUGS } from "../../src/lib/ai/faceSlots.ts";

const ROOT = process.cwd();
const faces = fs.readFileSync(path.join(ROOT, "src/lib/ai/faces.ts"), "utf8");

/** Every asset slug ART maps a mood to. */
function artSlugs(): Set<string> {
  const block = faces.slice(faces.indexOf("const ART"), faces.indexOf("FALLBACK_FACE"));
  return new Set([...block.matchAll(/:\s*"([a-z_]+)"/g)].map((m) => m[1]));
}

describe("the upload screen and the app agree on the faces", () => {
  it("every face the app can ask for can be uploaded", () => {
    const missing = [...artSlugs()].filter((s) => !FACE_SLUGS.includes(s));
    assert.deepEqual(
      missing,
      [],
      "these faces exist in ART but have no upload slot, so a trainer can never supply them " +
        "and every card using one falls back to the stock cartoon:\n  " + missing.join("\n  "),
    );
  });

  it("nothing is asked for that the app never shows", () => {
    const art = artSlugs();
    const unused = FACE_SLUGS.filter((s) => !art.has(s));
    assert.deepEqual(
      unused,
      [],
      "these slots are on the upload screen but no mood maps to them — a trainer would pose, " +
        "crop and upload an image the app never displays:\n  " + unused.join("\n  "),
    );
  });

  it("there are twenty, and the stock set has all of them", () => {
    assert.equal(FACE_SLOTS.length, 20, "the set is twenty faces — the script and the folders both assume it");
    const stock = fs.readdirSync(path.join(ROOT, "public/bots"))
      .filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, ""));
    const gaps = FACE_SLUGS.filter((s) => !stock.includes(s));
    assert.deepEqual(gaps, [], "the stock set is missing a face the app can ask for: " + gaps.join(", "));
  });

  it("every slot tells the trainer when it is used", () => {
    // "stern" alone is not enough to know what to pose for.
    for (const s of FACE_SLOTS) {
      assert.ok(s.label && s.what && s.what.length > 12,
        `the ${s.slug} slot has no usable description`);
    }
  });
});

// ── The no-AI branch ────────────────────────────────────────────────────────
//
// Dustin, 21 Aug: a trainer who does not want AI must be shown "how to use the
// app manually to do all of this", and he chose BRANCHING over a bolt-on
// chapter — one coherent walkthrough, not 51 steps about features they do not
// have followed by a correction.

describe("the tutorial reads properly without AI", () => {
  it("a step that only exists because of AI is removed, not apologised for", async () => {
    const { allSteps } = await import("../../src/lib/tutorial/script.ts");
    const withAi = allSteps({ usesAi: true }).map((s) => s.id);
    const without = allSteps({ usesAi: false }).map((s) => s.id);
    assert.ok(without.length < withAi.length, "nothing was dropped for a no-AI reader");
    for (const id of ["ai-drawer", "ai-where", "ai-health"]) {
      assert.ok(withAi.includes(id), `${id} is missing from the full walkthrough`);
      assert.ok(!without.includes(id), `${id} is still shown to somebody with no AI`);
    }
  });

  it("a step with a manual twin swaps its body AND its narration", async () => {
    const { allSteps } = await import("../../src/lib/tutorial/script.ts");
    const on = new Map(allSteps({ usesAi: true }).map((s) => [s.id, s]));
    const off = new Map(allSteps({ usesAi: false }).map((s) => [s.id, s]));
    let swapped = 0;
    for (const [id, s] of off) {
      const orig = on.get(id);
      if (!orig?.manual) continue;
      swapped++;
      assert.deepEqual(s.body, orig.manual, `${id} still shows the AI version on screen`);
      assert.notEqual(
        s.narration,
        orig.narration,
        `${id} reads the manual text but SPEAKS the AI one — the recording would contradict the screen`,
      );
    }
    assert.ok(swapped >= 3, `only ${swapped} steps branch; the AI-heavy ones need manual twins`);
  });

  it("the full walkthrough is the default", async () => {
    const { allSteps } = await import("../../src/lib/tutorial/script.ts");
    assert.deepEqual(
      allSteps().map((s) => s.id),
      allSteps({ usesAi: true }).map((s) => s.id),
      "somebody who has not answered the question yet must get the app as it actually ships",
    );
  });
});
