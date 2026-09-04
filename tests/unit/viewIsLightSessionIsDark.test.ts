// ============================================================================
// VIEW AND START MUST NOT LAND ON THE SAME-LOOKING SCREEN.
//
// Dustin, 4 Sep, on the shipped Start-vs-View split:
//
//   "when we click on that view/edit the screen it opens should be light/white
//    like it was before. workout logger (start) opens to dark so they are diff."
//
// The session view has always pinned itself to a fixed dark ground
// (--session-bg) whatever colour scheme is active, because that is the screen
// you hold between sets. The overview followed the theme. On any dark scheme —
// which is most of them, and every one under auto-dark — the two screens were
// the same colour, so the two buttons appeared to do the same thing.
//
// Pinning the overview light is the mirror of what the session already does.
// These two assertions are a pair: neither is worth anything alone, because the
// point is the CONTRAST between the destinations, not either one's colour.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("the two destinations look different", () => {
  const logger = read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx");
  const css = read("src/app/globals.css");

  it("the overview root is pinned light", () => {
    assert.match(
      logger,
      /<div className="sym-light" style=\{\{ background: "var\(--brand-bg\)", minHeight: "100vh"/,
      "the overview follows the theme again — on a dark scheme it is indistinguishable from the session view",
    );
  });

  it("the session view is still pinned dark", () => {
    assert.match(
      logger,
      /background: "var\(--session-bg\)"/,
      "the session view no longer pins its own ground, so the contrast this pair exists for is gone",
    );
  });

  it("pinning light does not throw away the client's scheme", () => {
    // A hardcoded palette would make this screen look like a different app, and
    // the natively dark schemes (Midnight, Carbon Neon) have no light variant to
    // fall back on. The surfaces are neutral; primary and accent are not.
    const block = css.slice(css.indexOf(".sym-light {"));
    const decl = block.slice(0, block.indexOf("}"));
    assert.ok(
      !/--brand-primary\s*:/.test(decl),
      "sym-light is overriding --brand-primary — every control on the screen loses the client's colour",
    );
    assert.ok(
      !/--brand-accent\s*:/.test(decl),
      "sym-light is overriding --brand-accent — the screen stops matching the rest of the app",
    );
    assert.match(decl, /--brand-card:\s*color-mix\([^)]*--brand-primary/,
      "the card surface is a flat grey rather than a tint of the client's own colour");
  });

  it("elevation is re-derived for a light ground", () => {
    // The dark-mode shadow tokens are near-black at high opacity. Left in place
    // they are invisible on white, which is how a "light mode" ends up looking
    // like flat paper.
    const block = css.slice(css.indexOf(".sym-light {"));
    const decl = block.slice(0, block.indexOf("}"));
    assert.match(decl, /--shadow-1:/, "shadow tokens were not re-derived for the light ground");
    assert.match(decl, /color-scheme: light/, "form controls will still render themselves dark");
  });
});
