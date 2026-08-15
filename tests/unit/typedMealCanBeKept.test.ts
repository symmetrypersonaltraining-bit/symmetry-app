// Guard: a client who types what they ate can keep it, on the screen where
// they typed it.
//
// Robert Burns, 14 Aug: he typed a meal, logged it, and went looking for a way
// to save it for next time. There was no way, on that screen, at that moment.
//
// The save DID exist — "⭐ Save to My Meals" — but only in a meal's ⋯ menu, and
// only AFTER the meal was on the plan. Which is to say: not where anyone
// finishes typing, and not under a name he'd look for (he was hunting for "My
// Foods"). Verified in the live DOM at the time, which is why it was written up
// as a discoverability bug rather than a missing feature — the distinction
// matters, because the fix for one is not the fix for the other.
//
// The paths that DID save were the ones nobody was complaining about: "swap for
// custom" and an unlogged "add meal" both save unconditionally and say so on
// their own button. The one that did not was "type what you ate" — the daily
// driver.
//
// MUTATION-TESTED: removing the keepOption prop, or dropping the keep flag on
// the logged-insert path, fails these.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPOSER = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/ComposerSheet.tsx"),
  "utf8"
);
const CLIENT = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8"
);

test("the composer offers to keep the meal, in words a client would look for", () => {
  // Anchored on a word boundary and on the DECLARATION. A bare /keepOption/
  // still matched after the prop was renamed to `keepOptionX`, so the first
  // version of this assertion did not bite under mutation — a test that passes
  // against a broken build is worse than no test, because it is believed.
  assert.match(
    COMPOSER,
    /^\s*keepOption\?: boolean;$/m,
    "the keepOption prop is gone from the composer's type"
  );
  assert.match(
    COMPOSER,
    /\{keepOption && \(/,
    "the keep control is no longer rendered"
  );
  assert.match(
    COMPOSER,
    /Keep this in My Meals/,
    "the keep control no longer says 'My Meals' — the name is half the fix, because it is what the ⋯ menu and the library both call it"
  );
});

test("the keep state reaches onSave rather than being swallowed by the sheet", () => {
  // A tick that the parent never sees is a tick that does nothing, which is
  // worse than no tick at all.
  assert.match(
    COMPOSER,
    /onSave: \(items: CustomItem\[\], name: string, keep: boolean\)/,
    "onSave no longer receives the keep flag"
  );
  assert.match(
    COMPOSER,
    /onSave\(items, name\.trim\(\) \|\| "Custom meal", keep\)/,
    "the save button no longer passes the keep flag through"
  );
});

test("the tick is shown on the typed paths and NOT on the ones that already save", () => {
  // Offering an option that does nothing is its own small lie: "swap it in" and
  // an unlogged "add meal" save to My Meals unconditionally and say so on the
  // button.
  assert.match(
    CLIENT,
    /keepOption=\{s\.mode === "slot" \|\| s\.mode === "extra" \|\| \(s\.mode === "insert" && !!s\.logNow\)\}/,
    "the keepOption condition has changed — check it still excludes swap and unlogged insert"
  );
});

test("a LOGGED typed meal is kept only when asked, and an unlogged one still always is", () => {
  // The asymmetry is deliberate and easy to flatten by accident. An unlogged
  // insert has always gone to the library; a logged one never did.
  assert.match(
    CLIENT,
    /const kept = !s\.logNow \|\| keep;/,
    "the logged-vs-unlogged keep rule is gone"
  );
  assert.match(CLIENT, /if \(kept\) await saveMyMeal\(name, items\)/, "the keep no longer saves");
});

test("the toast tells them it was kept, so they do not go looking again", () => {
  // The original complaint was that he could not tell whether it had saved.
  // Silence on success is what sent him hunting through the menus.
  assert.match(
    CLIENT,
    /Logged ✓ — and kept in My Meals/,
    "the confirmation no longer distinguishes 'logged' from 'logged and kept'"
  );
});
