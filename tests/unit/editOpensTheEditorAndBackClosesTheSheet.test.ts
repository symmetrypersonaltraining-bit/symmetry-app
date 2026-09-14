// ============================================================================
// THE EDIT BUTTON EDITS, AND THE PHONE'S BACK CLOSES THE SHEET.
//
// Two reports, one screen, the same evening.
//
// 1. *"Edit button n 3 dots are same button...why?"*
//
//    Because they were. Byte for byte:
//
//      <button className="sym-bt" onClick={() => openSheet({ kind: "meal", …})}>✎ Edit</button>
//      <button className="sym-bt ic" onClick={() => openSheet({ kind: "meal", …})}>⋯</button>
//
//    Same handler, same argument. Both opened the MENU — Swap, Replace, Copy to
//    slot, Save to My Meals, Move, Delete — and the thing that actually edits
//    the food was its SEVENTH item, "✎ Edit items". A button labelled Edit that
//    opens a menu you then hunt through is a button that has to be learned.
//
// 2. *"the back button on mobile goes back to home. That's not the previous
//    screen so that breaks my rule about back button on mobile."*
//
//    His rule, 11 Sep, in lib/nav/backFromHere.ts: "When you hit either button,
//    it needs to go back one page — the previous screen you were looking at."
//
//    A sheet was not a history entry, so Back popped the whole Nutrition page
//    and landed on Home. The previous screen he was looking at was this page
//    with the sheet shut, and the control everyone actually uses could not get
//    there. BackButtonGuard does not cover it — that only binds inside a
//    Capacitor shell, and Capacitor is deliberately out of package.json.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const V3 = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");

describe("edit opens the editor and back closes the sheet", () => {
  it("Edit and ⋯ are no longer the same call", () => {
    // Scoped to the row's action bar. Elsewhere in the file `kind: "meal"` is
    // opened legitimately — tapping the card body, tapping a logged row, and
    // the Edit fallback for a row with nothing to edit — so a file-wide count
    // would fail for reasons that have nothing to do with this bug.
    // Anchored on the Edit button itself: there are four `sym-acts` bars in
    // this file (AI plan, option rows, extras) and only this one has the pair.
    const edit = V3.indexOf("✎ Edit");
    assert.ok(edit > -1, "the Edit button is gone");
    const bar = V3.slice(Math.max(0, edit - 900), edit + 600);

    const plainMenuCalls = bar.match(/onClick=\{\(\) => openSheet\(\{ kind: "meal", rowKey: row\.key \}\)\}/g) || [];
    assert.equal(
      plainMenuCalls.length,
      1,
      `${plainMenuCalls.length} buttons in the row action bar open the meal menu unconditionally — ` +
        "Edit and ⋯ are the same button again",
    );
    assert.match(bar, /✎ Edit/, "the Edit button itself is gone");
    assert.match(bar, /aria-label="more"/, "the ⋯ button is gone");
  });

  it("Edit opens the item editor", () => {
    assert.match(V3, /openSheet\(\s*canEditItems\(row\)\s*\?\s*\{ kind: "adjust", rowKey: row\.key \}/,
      "Edit must go straight to the adjust sheet");
  });

  it("⋯ is still the menu", () => {
    assert.match(V3, /openSheet\(\{ kind: "meal", rowKey: row\.key \}\)\} aria-label="more"/,
      "the ⋯ button must still open the action sheet");
  });

  it("a row with nothing to edit falls back to the menu", () => {
    // AdjustSheetView renders null for an open slot or an unchosen plan option,
    // so Edit would otherwise open a sheet showing nothing.
    assert.match(V3, /function canEditItems\(row: Row\): boolean/);
    assert.match(V3, /row\.kind === "custom" && !!row\.meta\) \|\| \(row\.kind === "plan" && !!row\.chosen/,
      "the guard must test the same two conditions AdjustSheetView does");
  });

  // ── the back button ───────────────────────────────────────────────────────
  it("an open sheet is a history entry, so Back has it to pop", () => {
    assert.match(V3, /window\.history\.pushState\(\{ symSheet/,
      "without an entry per sheet, Back leaves the page entirely");
    assert.match(V3, /window\.addEventListener\("popstate", onPop\)/,
      "and something has to listen for it");
  });

  it("Back closes ONE sheet, not the whole stack", () => {
    // Two deep (menu → editor) Back should land on the menu, which is the
    // previous screen he was looking at. That is the whole rule.
    assert.match(V3, /setSheetStack\(\(prev\) => prev\.slice\(0, -1\)\)/,
      "popstate must pop one level");
  });

  it("closing from inside the app gives the entry back", () => {
    // Otherwise every open-and-shut grows the history and Back needs as many
    // presses as sheets ever opened.
    assert.match(V3, /window\.history\.go\(-excess\)/);
  });

  it("a swallowed popstate cannot arm a dead press", () => {
    // This app has shipped a dead Back button twice (BackButtonGuard v2 and
    // v3). If history.go() fires no popstate the flag must not stay set.
    assert.match(V3, /setTimeout\(\(\) => \{ selfPop\.current = false; \}, 300\)/,
      "the self-pop flag must time out");
  });

  it("nothing is pushed when no sheet is open", () => {
    // The sentinel that backFromHere.ts forbids in capitals was pushed on a
    // PAGE with the same URL, so popping it re-rendered the identical screen.
    // Every entry here corresponds to a sheet that is actually open.
    assert.match(V3, /if \(sheetDepth > historyDepth\.current\)/,
      "entries must be driven by the sheet depth, never pushed unconditionally");
  });
});
