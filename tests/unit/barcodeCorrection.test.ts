// A scanned food you can correct.
//
// app_feedback 2026-08-17, client app, /nutrition: "Need to be able to edit
// scanned barcode foods."
//
// A scan resolved straight to the amount picker, where you can change how MUCH
// but not what the food claims to contain. Most of the catalog is Open Food
// Facts — 574,632 crowd-entered rows — so wrong macros on a scanned product are
// ordinary, and there was no way to fix one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHEET = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"), "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function fnBody(name: string): string {
  const i = SHEET.indexOf(name);
  assert.ok(i > 0, name + " is gone");
  const after = i + name.length;
  const rest = SHEET.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = /);
  return SHEET.slice(i, end === -1 ? SHEET.length : after + end);
}

test("there is a way to correct a picked food", () => {
  assert.match(SHEET, /These numbers look wrong — fix them/,
    "no affordance to correct a scanned food's macros");
  assert.match(code(SHEET), /onClick=\{editPicked\}/);
});

test("the correction is pre-filled from what was scanned", () => {
  const b = code(fnBody("function editPicked"));
  for (const f of ["name:", "serving:", "p:", "c:", "f:"]) {
    assert.ok(b.includes(f), "the form does not carry " + f + " across");
  }
  assert.match(b, /picked\.serving \|\| "1 serving"/,
    "it pre-fills the amount currently dialled in rather than the BASE serving — that doubles a '2 Tbsp (30 g)' food");
});

test("the correction keeps the barcode, so the next scan finds it", () => {
  const b = code(fnBody("function editPicked"));
  assert.match(b, /setPendingBarcode\(picked\.barcode \?\? null\)/,
    "without the barcode the fix is saved but never found again");
  assert.match(code(SHEET), /\.\.\.\(pendingBarcode \? \{ barcode: pendingBarcode \} : \{\}\)/,
    "the insert drops the barcode");
});

test("the barcode is read off the catalog row in the first place", () => {
  assert.match(code(SHEET), /barcode\?: string \| null;/, "CatalogFood cannot carry a barcode");
  assert.match(code(SHEET), /barcode: \(raw\.barcode as string\) \?\? null,/, "mapRow drops it");
});

test("a scan prefers the client's own correction over the shared row", () => {
  const b = code(fnBody("async function handleBarcode"));
  assert.match(b, /created_by_client_id\.eq\.\$\{clientId\},created_by_client_id\.is\.null/,
    "the lookup does not consider the client's own corrected copy");
  assert.match(b, /\.order\("created_by_client_id", \{ ascending: false, nullsFirst: false \}\)/,
    "without the ordering the shared row can win and the food comes back wrong again");
});

// ─── the save has to be real ────────────────────────────────────────────────

test("a refused insert is not reported as a save", () => {
  // supabase-js resolves {data, error} rather than throwing, so the empty catch
  // never fired for a duplicate barcode, an RLS denial or a constraint. The
  // client believed their correction was saved; it was not, and the next scan
  // brought back the same wrong numbers.
  const c = code(SHEET);
  assert.match(c, /const \{ data, error: insErr \} = await supabase/,
    "the insert's error is discarded again");
  assert.match(c, /if \(insErr\) throw insErr;/);
  assert.match(c, /setSaveWarning\("Logged for today, but couldn't save it to your foods\."\)/,
    "a failed save must say so — silently logging locally is how this stays invisible");
  assert.doesNotMatch(c, /\} catch \{ \/\* catalog not ready/,
    "the swallowing catch is back");
});

test("the warning is cleared before each attempt", () => {
  // Otherwise a stale warning sits over a save that has since succeeded.
  assert.match(code(SHEET), /setSaveWarning\(null\);\n\s*let saved/);
});

test("the form says which thing it is doing", () => {
  assert.match(SHEET, /pendingBarcode \? "Fix these numbers — saved as your own copy" : "Create custom food/,
    "correcting a scanned food and inventing a new one read identically");
});
