import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NUTRITION WEARS THE APP'S FORMAT — and breaks with it in exactly one place.
 *
 * Dustin, 9 Sep, approving `docs/mockups/nutrition-format.html`:
 * *"do not lift meals, leave them in order we eat them in. bright fill on today
 * block as in the mock up is correct."*
 *
 * Both halves of that are load-bearing and both are easy to undo by accident,
 * which is what this file exists to stop:
 *
 *  - The Workout tab hoists today out of date order and draws it first. Copying
 *    that here would put M3 above M1 and move it again as the day went on.
 *  - The bright fill has to land on the DAY tile and nowhere else, because a
 *    second bright thing on the screen means neither one says "you are here".
 *
 * It also pins the trap that cost the most time while building it: everything
 * inside a tile derives from --in-tile / --brand-text, computed from the NORMAL
 * tile background. `.sym-tile.is-today` swaps the background and leaves those
 * tokens alone, so every object placed inside the bright tile needs an explicit
 * inversion or it renders dark text on a dark fill.
 */

const SRC = join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx");
const NUT = readFileSync(SRC, "utf8");
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

// Comments quote the rulings and name the classes, so anything that COUNTS
// occurrences has to read the markup alone or it counts my own prose.
const CODE = NUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the screen opts into the tile system", () => {
  assert.match(CODE, /className="sym-page pb-8"/,
    "the page needs the .sym-page wrapper or none of the tile tokens exist");
});

test("one component serves the trainer's Client View and real clients", () => {
  // The format has to land on both at once. If a second nutrition screen ever
  // appears, this is where it gets caught.
  for (const mount of [
    "src/app/(app)/nutrition/page.tsx",
    "src/app/(app)/client-preview/nutrition/page.tsx",
  ]) {
    assert.match(readFileSync(join(process.cwd(), mount), "utf8"), /NutritionV3Client/,
      `${mount} must mount the one nutrition component`);
  }
});

test("MEALS ARE NEVER LIFTED — the order you eat in is the order they render", () => {
  // The board on the Workout tab hoists today with a filter-and-prepend. If
  // that shape ever appears here, a meal has been moved.
  assert.doesNotMatch(CODE, /displayRows[\s\S]{0,120}\.filter\([^)]*today/,
    "meals must not be filtered around a 'today' item");
  assert.doesNotMatch(CODE, /\[\s*\.\.\.[a-zA-Z]*[Tt]oday[a-zA-Z]*\s*,\s*\.\.\./,
    "no hoisting a today/next item to the front of the meal list");
  // And positively: the rows are rendered in the order the list gives them.
  assert.match(CODE, /displayRows\.map\(\(row, i\) =>/,
    "the meal list renders displayRows in order, unsorted at the render site");
});

test("exactly one thing on the screen is filled bright, and it is the day", () => {
  const brights = CODE.match(/is-today/g) ?? [];
  assert.equal(brights.length, 1,
    "one is-today only: a second bright tile means neither says 'you are here'");
  // ...and it is on the summary tile, gated on the day actually being today.
  assert.match(CODE, /"sym-tile mx-4" \+ \(isToday && selectedDate === today \? " is-today" : ""\)/,
    "the day tile is bright only when it really is now — not on a past day, a "
    + "future day, or a range average");
});

test("a meal is a tile, and it can still be dragged", () => {
  assert.match(CODE, /data-rowkey=\{row\.key\}\n\s*className="sym-tile"/,
    "the meal row is the tile object and keeps the drag hook's anchor");
  assert.match(CODE, /onPointerDown=\{\(e\) => onHandleDown\(e, row\.key\)\}/,
    "hold-to-move survives the conversion");
  assert.match(CODE, /className="sym-grip/, "the ⠿ handle is still there");
});

test("the ring stays a thumb target", () => {
  // It moves into the action strip, which is what the mock-up shows. It must
  // NOT shrink to the mock-up's 27px sketch: it replaces a 46px circle and it
  // is the control a client touches more than any other.
  assert.match(CODE, /className="sym-ring"/, "the log ring uses the shared class");
  const rule = CSS.match(/\.sym-ring \{[^}]*\}/)?.[0] ?? "";
  const px = Number(rule.match(/width:\s*(\d+)px/)?.[1] ?? 0);
  assert.ok(px >= 44, `the log ring is ${px}px — under the 44px touch floor`);
});

test("every object inside the bright tile is inverted", () => {
  // The forgotten-inversion bug: dark text on a dark fill, on the brightest
  // and most-read tile on the screen.
  for (const sel of ["sym-num", "sym-bar", "sym-mac", "sym-split", "sym-chip",
                     "sym-food", "sym-kcal", "sym-more", "sym-ring", "sym-grip"]) {
    assert.ok(new RegExp(`\\.sym-tile\\.is-today[^{]*\\.${sel}`).test(CSS),
      `.${sel} has no .sym-tile.is-today inversion — it will render dark on dark`);
  }
});

test("every sym- class the screen uses actually exists", () => {
  const used = new Set<string>();
  for (const m of CODE.matchAll(/className="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c.startsWith("sym-")) used.add(c);
  }
  assert.ok(used.size > 8, "expected the screen to use the tile classes");
  const missing = [...used].filter((c) => !CSS.includes("." + c));
  assert.deepEqual(missing, [], `classes with no rule in globals.css: ${missing.join(", ")}`);
});

test("no side borders, and no per-macro colour", () => {
  // "No side borders anywhere -- the cap is the only edge that carries colour."
  // The AI cards each carried a 3px borderLeft to say "this one is different".
  assert.doesNotMatch(CODE, /borderLeft:/,
    "a left rule is a side border; the cap says it instead");
  // "Colour means the position, never the type." #5ec9a3 for carbs belonged to
  // no scheme at all.
  assert.doesNotMatch(CODE, /#5ec9a3/, "carbs had a hard-coded hue that no scheme owns");
});

test("the assistant on this screen says whose it is", () => {
  // Ruling 4. The coach card was an AI badge and a paragraph, with nothing
  // telling a client it was not a message their coach typed.
  assert.match(CODE, /\{coachFirstName\.toUpperCase\(\)\}&rsquo;S ASSISTANT/,
    "the coach card must name the assistant, and use the NAME, never a pronoun");
});
