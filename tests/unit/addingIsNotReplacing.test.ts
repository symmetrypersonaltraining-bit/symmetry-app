import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "MY SOLO WORKOUTS HAVE DISAPPEARED?"
 *
 * Robby Burns, 24 Aug 2026, 7:32pm: *"my solo workouts have disappeared? maybe
 * I moved them accidentally? I did the 12 solo exercises tonight."*
 *
 * Nothing had disappeared — he had 33 solo sessions still scheduled. Two things
 * had gone wrong, and this file is about the second one.
 *
 * He self-assigned "Volleyball - 2 hours" on the 21st and "2 hours pickleball"
 * on the 23rd. Both times his "Ankle & Hip Daily Mobility — Solo" was marked
 * `skipped` in the SAME MILLISECOND the activity row was created:
 *
 *   21 Aug   mobility skipped 13:49:56.540   volleyball created 13:49:56.655
 *   23 Aug   mobility skipped 00:44:40.757   pickleball created 00:44:40.756
 *
 * He had not replaced anything. He played volleyball AND did his mobility. The
 * app recorded him as skipping it, twice, and he read the empty days as his
 * programme vanishing.
 *
 * The dialog did ask. It asked with **Replace it** as a solid, brand-coloured,
 * full-width button placed first, and **Add as well** as a faint dashed outline
 * underneath — so the destructive answer was the one that looked like the
 * default, and a client answering it quickly picked the one that deleted work.
 *
 * Adding is the common case and the safe one. The safe answer gets the weight.
 */

const SRC = readFileSync(join(process.cwd(), "src/components/AddWorkoutButton.tsx"), "utf8");

/** The ask dialog only — the file has other buttons. */
// RE-ANCHORED 4 Sep. The preview layer was added ahead of this branch, so the
// chain reads `{preview ? ( … ) : ask ? ( … ) : build ? (`. The dialog itself is
// unchanged; only the string that finds it moved.
const DIALOG = SRC.slice(SRC.indexOf(") : ask ? ("), SRC.indexOf(") : build ? ("));

test("the ask block was found, so the rest of this file means something", () => {
  assert.ok(DIALOG.length > 500, "the dialog moved — re-anchor these tests before trusting them");
});

test("ADD is offered before REPLACE", () => {
  const addAt = DIALOG.indexOf('addLibrary(a.day, "add")');
  const replaceAt = DIALOG.indexOf('addLibrary(a.day, "replace"');
  assert.ok(addAt > -1 && replaceAt > -1, "both answers must still be offered");
  assert.ok(
    addAt < replaceAt,
    "replace is back on top — the answer that marks a session skipped is the first thing a tired client taps",
  );
});

test("the solid primary button is ADD, and REPLACE is the quiet one", () => {
  // Weighting is the whole fix. Both answers stay available; only one looks
  // like the default.
  const addBtn = DIALOG.slice(DIALOG.indexOf('addLibrary(a.day, "add")'));
  const primaryStyle = addBtn.slice(0, 400);
  assert.match(primaryStyle, /background: "var\(--brand-primary/, "add is no longer the primary button");

  const repBtn = DIALOG.slice(DIALOG.indexOf('addLibrary(a.day, "replace"'));
  const secondaryStyle = repBtn.slice(0, 400);
  assert.match(secondaryStyle, /border: "1px dashed/, "replace is styled as the default again");
  assert.doesNotMatch(
    secondaryStyle,
    /background: "var\(--brand-primary/,
    "replace must never be the solid brand button",
  );
});

test("replace says out loud that it marks the session skipped", () => {
  assert.match(DIALOG, /marked skipped/);
  // And says when NOT to pick it. "Replace" alone reads as "log this instead",
  // which is exactly how a client who did both answers it.
  assert.match(DIALOG, /only do this if you did/i);
});

test("add explains that both sessions stay", () => {
  assert.match(DIALOG, /Both sessions stay on that day/);
  assert.match(DIALOG, /as well as/);
});

test("backdating a finished workout still never replaces anything", () => {
  // Separate path, and it must stay separate: recording something that already
  // happened is never a statement about the rest of the day's plan.
  assert.match(
    SRC,
    /if \(markDone\) \{ await addLibrary\(d, "add"\); return; \}/,
    "marking a workout done can now clear the day's plan",
  );
});

test("a replace still only touches rows it actually matched", () => {
  // The existing guard, kept: an update matching zero rows is not an error, so
  // without .select("id") the dialog would report a replacement it never made.
  assert.match(SRC, /\.eq\("status", "scheduled"\)\s*\n\s*\.select\("id"\)/);
});
