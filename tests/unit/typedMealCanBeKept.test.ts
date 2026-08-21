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

test("the tick is shown on EVERY path, because none of them save without it", () => {
  // ── Rewritten 21 Aug, and the rule it guards is inverted ─────────────────
  //
  // This used to assert the opposite: that the tick was HIDDEN on swap and on
  // unlogged insert, because those two saved to My Meals unconditionally and
  // said so on their own button. Offering an option that does nothing is a
  // small lie, so hiding it was right — GIVEN the unconditional save.
  //
  // Dustin removed the unconditional save: "when i hit swap for custom, it
  // should not force to save the meal in library, it's an option but may just
  // be a one time off plan swap they type and ai parse for macros and cal."
  //
  // A library is for meals you want again. Filling it with every one-off — the
  // thing eaten once at somebody's house — makes it worse at the only job it
  // has. So now nothing saves unless asked, and the tick belongs everywhere.
  assert.match(
    CLIENT,
    /^\s*keepOption\s*$/m,
    "keepOption is conditional again. Every mode has to offer the tick now, because no " +
      "mode saves without it — a hidden tick would mean a path that cannot keep anything."
  );
});

test("no path saves to the library unless it was asked to", () => {
  // The pair to the test above, and the one that actually matters: the tick
  // being VISIBLE is worthless if a code path ignores it.
  assert.doesNotMatch(
    CLIENT,
    /const kept = !s\.logNow \|\| keep;/,
    "the old logged-vs-unlogged asymmetry is back — an unlogged insert is saving without asking"
  );
  const onSave = CLIENT.slice(
    CLIENT.indexOf("onSave={async (items, name, keep)"),
    CLIENT.indexOf("// ---- individual sheets"),
  );
  assert.ok(onSave.length > 0, "could not find the composer's onSave handler");
  for (const m of onSave.matchAll(/(\S[^\n]*?)saveMyMeal\(/g)) {
    assert.match(
      m[1].trim(),
      /if \(keep\)/,
      `an unconditional saveMyMeal survives ("${m[1].trim()}saveMyMeal(…)")`
    );
  }
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
