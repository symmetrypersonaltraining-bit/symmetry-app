// Your own meals must not be lost among the shared library.
//
// Dustin, 17 Aug, asked what he was looking at: "is this where im seeing all
// types of stuff under my foods on mine?" He had 3 saved meals and the list
// showed 53 — his three plus the fifty shared library meals, in one flat list
// with nothing marking which was which.
//
// The flag to tell them apart was ALREADY being computed. loadMyMeals set
// `library: m.client_id == null` with a comment explaining exactly why the
// picker needs it — and the useState type had no such field, so it was dropped
// on the way into state and never reached a single render. Computed, commented,
// discarded.
//
// NutritionV3Client.tsx is off limits without per-item permission. Granted for
// this change on 17 Aug: two tabs, Mine and Library.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);

// Comments must not satisfy a structural assertion — the header above quotes the
// very code being asserted on. Same helper shape as deadCatchWrites.
function code(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[++i] ?? ""; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}

const CODE = code(SRC);

test("the comment stripper strips, or every assertion below is theatre", () => {
  assert.equal(code("a // library: true\nb").includes("library: true"), false);
  assert.ok(code("x.library; // note").includes("x.library"));
});

test("the library flag survives into state instead of being dropped", () => {
  assert.match(
    CODE,
    /useState<\{[^}]*library\?: boolean[^}]*\}\[\]>/,
    "myMeals state has no `library` field again — loadMyMeals computes it and the render never sees it",
  );
  assert.match(CODE, /library: m\.client_id == null/,
    "nothing computes which meals are shared, so nothing can separate them");
});

test("the list is split, and the counts come from the same split", () => {
  assert.match(CODE, /const mineMeals = myMeals\.filter\(\(m\) => !m\.library\)/,
    "no Mine list");
  assert.match(CODE, /const libraryMeals = myMeals\.filter\(\(m\) => m\.library\)/,
    "no Library list");
  // Counting one thing and rendering another is how a tab says (3) and shows 50.
  assert.match(CODE, /\$\{mineMeals\.length\}/, "the Mine count is not derived from the Mine list");
  assert.match(CODE, /\$\{libraryMeals\.length\}/, "the Library count is not derived from the Library list");
  assert.match(CODE, /shownMeals\.map\(/, "the sheet still renders the unsplit list");
  assert.match(CODE, /const shownMeals = mealTab === "mine" \? mineMeals : libraryMeals/,
    "the tab no longer selects which list is shown");
});

// ─── the destructive one ────────────────────────────────────────────────────

test("a shared library meal cannot be deleted from this screen", () => {
  // For a CLIENT, RLS refuses the delete and the row returns on refresh.
  // For DUSTIN it SUCCEEDS — removing the meal from all 30 clients, from inside
  // his own meal list, with an undo that would re-save it as his personal copy.
  assert.match(CODE, /\{!mm2\.library && \(\s*<button onClick=\{\(\) => deleteMyMeal\(mm2\)\}/,
    "the delete button is offered on shared library rows");
  assert.match(CODE, /if \(m\.library\) \{[\s\S]{0,120}?return;/,
    "deleteMyMeal has no library guard — hiding the button is one lock, not two");
});

test("the guard is inside deleteMyMeal, before it writes", () => {
  const fn = CODE.slice(CODE.indexOf("async function deleteMyMeal"));
  const guard = fn.indexOf("if (m.library)");
  const del = fn.indexOf('.from("my_meals").delete()');
  const optimistic = fn.indexOf("setMyMeals((prev) => prev.filter");
  assert.ok(guard >= 0 && del > 0 && optimistic > 0, "deleteMyMeal has changed shape");
  assert.ok(guard < optimistic, "the row is removed from the screen before the library check");
  assert.ok(guard < del, "the delete is sent before the library check");
});

// ─── the swap list ──────────────────────────────────────────────────────────

test("the swap list puts your own first and says which are shared", () => {
  assert.match(
    CODE,
    /\[\.\.\.myMeals\.filter\(\(m\) => !m\.library\), \.\.\.myMeals\.filter\(\(m\) => m\.library\)\]\.map\(/,
    "the swap list is unordered again, so three of your meals sit among fifty",
  );
  assert.match(CODE, /mm2\.library && <span[\s\S]{0,120}?LIBRARY/,
    "shared rows in the swap list are unlabelled");
});
