// ============================================================================
// The food logger revamp — the three rules that are easy to undo by accident.
//
// From Dustin's spec, 21 Aug (claude/FOOD-LOGGER-REVAMP-SPEC.md):
//
//  1. "when i hit swap for custom, it should not force to save the meal in
//     library, it's an option but may just be a one time off plan swap"
//     Swap and unlogged-insert called saveMyMeal unconditionally, so a library
//     meant for meals you want again filled up with meals eaten once.
//
//  2. "make sure that the app can access full food library from every option"
//     Every other way of building a meal could reach the catalogue; the
//     composer — the sheet behind "Swap for custom" — could only be typed
//     into, so a food with known numbers was re-typed and re-ESTIMATED.
//
//  3. "replace needs to be renamed replace with library meals or something
//     like that so it's diff than swap with custom"
//     Two different actions reading as synonyms: one types a meal that does
//     not exist, the other picks one that does.
//
// Plus the structural fact that makes (2) work at all, and which a later
// refactor would happily undo: the composer's draft is owned by the PARENT.
// Only the top sheet in the stack renders, so pushing the food library
// unmounts the composer — a locally-held draft is gone by the time the food
// comes back.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const V3 = path.join(ROOT, "src/app/(app)/nutrition/v3");
const client = fs.readFileSync(path.join(V3, "NutritionV3Client.tsx"), "utf8");
const composer = fs.readFileSync(path.join(V3, "ComposerSheet.tsx"), "utf8");

/** Comments quote the old behaviour at length; an explanation must not pass. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const clientCode = stripComments(client);

describe("a one-off custom meal stays one-off", () => {
  it("nothing saves to the library without the tick", () => {
    // Every saveMyMeal in the composer's onSave must be behind `keep`. The
    // failing shape is a bare `await saveMyMeal(...)` on its own line.
    const onSave = clientCode.slice(
      clientCode.indexOf("onSave={async (items, name, keep)"),
      clientCode.indexOf("// ---- individual sheets"),
    );
    assert.ok(onSave.length > 0, "could not find the composer's onSave handler");
    const calls = [...onSave.matchAll(/(\S[^\n]*?)saveMyMeal\(/g)].map((m) => m[1].trim());
    assert.ok(calls.length > 0, "no saveMyMeal calls found — did the handler move?");
    for (const prefix of calls) {
      assert.match(
        prefix,
        /if \(keep\)/,
        `an unconditional saveMyMeal survives ("${prefix}saveMyMeal(…)"). Every save has to be ` +
          "behind the tick, or the library fills with meals nobody chose to keep.",
      );
    }
  });

  it("the tick is offered on every mode", () => {
    assert.match(
      clientCode,
      /keepOption\s*$/m,
      "keepOption must be unconditional now — it used to be false for exactly the modes " +
        "that saved without asking, which is the bug",
    );
  });

  it("and it defaults off", () => {
    assert.match(
      composer,
      /const \[keep, setKeep\] = useState\(false\)/,
      "the tick defaults on — a default-on tick is a forced save with extra steps",
    );
  });

  it("no button still promises a save it no longer performs", () => {
    for (const [file, src] of [["NutritionV3Client", client], ["ComposerSheet", composer]] as const) {
      assert.doesNotMatch(
        stripComments(src),
        /saves to My Meals|saves automatically/,
        `${file} still tells the client the meal is saved for them`,
      );
    }
  });
});

describe("the food library is reachable from the composer", () => {
  it("the composer offers it", () => {
    assert.match(composer, /onOpenFoodSearch/, "ComposerSheet has no way into the library");
    assert.match(
      clientCode,
      /onOpenFoodSearch=\{\(\) => openSheet\(\{ kind: "foodsearch", target: "composer" \}\)\}/,
      "the composer's library button is not wired to the food search",
    );
  });

  it("the picked food comes back to the draft, not to the database", () => {
    assert.match(
      clientCode,
      /if \(s\.target === "composer"\) \{[\s\S]{0,240}setComposerDraft[\s\S]{0,120}backSheet\(\)/,
      "a food picked for the composer must be added to the DRAFT and hand control back. " +
        "The draft is not a meal until it is saved.",
    );
  });

  it("the draft survives the trip, because the parent owns it", () => {
    assert.match(
      clientCode,
      /const \[composerDraft, setComposerDraft\]/,
      "the draft must live in the parent — only the top sheet renders, so a draft owned by " +
        "the composer is destroyed the moment the library opens over it",
    );
    assert.doesNotMatch(
      composer,
      /useState<CustomItem\[\]>\(\[\]\)/,
      "ComposerSheet is holding items in its own state again; it will lose them to the library",
    );
  });

  it("every way into the composer starts a fresh draft", () => {
    // A raw replaceSheet/openSheet would inherit whatever the last draft held,
    // so a new custom meal would open pre-filled with someone else's items.
    assert.doesNotMatch(
      clientCode,
      /(replaceSheet|openSheet)\(\{ kind: "composer"/,
      "a composer is being opened without seeding the draft — it will inherit the last one",
    );
  });
});

describe("replace and swap do not read as the same action", () => {
  it("replace names what it picks from", () => {
    assert.match(
      clientCode,
      /"Replace with library meal"/,
      'the action is called "Replace…" again, which is indistinguishable from "Swap for custom"',
    );
  });

  it("swap still names what it picks from", () => {
    assert.match(clientCode, /"Swap for custom"/);
  });
});
