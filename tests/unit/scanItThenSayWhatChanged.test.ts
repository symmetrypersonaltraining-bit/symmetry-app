// TWO THINGS FROM THE FOOD SHEET, 24 AUG.
//
// Dustin: "need to ai parse as well from here to add/edit items. barcode scan
// not working, goes straight to this screen instead of giving a second to scan."
//
// The barcode he sent — 048121959449 — is a VALID UPC-A; I checked the check
// digit before assuming a misread. So the scan worked and the complaint is
// about what happened next: it showed him "Not in our database yet — want us to
// look it up?" with a button. A cache miss, phrased as a fault, in front of a
// lookup that always runs and always works. That is the "not working".
//
// The second half is real too. The detect loop accepted the FIRST result of the
// FIRST frame that decoded anything, at ~60 frames a second — so the scanner
// had a verdict before the phone was level, from whatever was in shot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const SCANNER = read("src/app/(app)/nutrition/v3/BarcodeScanner.tsx");
const SHEET = read("src/app/(app)/nutrition/v3/FoodSearchSheet.tsx");
const ADJUST = read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx");
const ROUTE = read("src/app/api/nutrition-ai/meal-edit/route.ts");

// ── the scanner ────────────────────────────────────────────────────────────

test("a code has to be read the same several frames running", () => {
  assert.match(SCANNER, /const CONFIRMATIONS = 3;/);
  assert.match(SCANNER, /if \(n >= CONFIRMATIONS\) finish\(raw\);/);
  // The camera path must NOT call finish() directly any more.
  const loop = SCANNER.slice(SCANNER.indexOf("const tick = async"), SCANNER.indexOf("rafRef.current = requestAnimationFrame(tick);"));
  assert.match(loop, /sawFromCamera\(/, "the loop still accepts the first frame that decodes");
  assert.ok(!/finish\(String\(codes\[0\]/.test(loop), "the loop calls finish() directly again");
});

test("a broken run of reads does not add up to a confirmation", () => {
  const loop = SCANNER.slice(SCANNER.indexOf("const tick = async"), SCANNER.indexOf("rafRef.current = requestAnimationFrame(tick);"));
  assert.match(loop, /seenRef\.current = \{ code: "", n: 0 \};/,
    "two glances at different products a second apart could add up to three agreeing reads");
});

test("the check digit is verified, and only where there is one", () => {
  assert.match(SCANNER, /function checkDigitOk/);
  // UPC-A (12) and EAN-13 (13) only. EAN-8 is rare on food and CODE_128 has no
  // fixed length to check against, so they pass through.
  assert.match(SCANNER, /if \(code\.length !== 12 && code\.length !== 13\) return true;/);
});

test("the check digit maths is right, against real codes", async () => {
  // Re-implemented from the source so the test fails if the source drifts.
  // Lifted from the source and stripped of its type annotations, so this fails
  // if the maths in the app drifts rather than testing a copy of it.
  const from = SCANNER.indexOf("function checkDigitOk");
  const body = SCANNER.slice(from, SCANNER.indexOf("\n}\n", from) + 2)
    .replace("(code: string): boolean", "(code)")
    .replace(" as number", "");
  const fn = new Function(`${body}; return checkDigitOk;`)() as (c: string) => boolean;

  // The barcode Dustin actually scanned. It is valid — this is why I did not
  // "fix" a misread that never happened.
  assert.equal(fn("048121959449"), true, "Dustin's real scan must pass");
  // A single transposed digit is the classic misread, and must not.
  assert.equal(fn("048121959459"), false);
  assert.equal(fn("048121959440"), false);
  // A real EAN-13 (Nutella 3017620422003).
  assert.equal(fn("3017620422003"), true);
  assert.equal(fn("3017620422004"), false);
  // Lengths with no check digit are let through untouched.
  assert.equal(fn("12345678"), true);
  assert.equal(fn("9900112233445566"), true);
});

// ── the lookup ─────────────────────────────────────────────────────────────

test("a catalog miss looks the barcode up instead of asking", () => {
  assert.match(SHEET, /await lookUpBarcode\(barcode\);/, "the scan still stops to ask permission");
  // In the CODE, not the comment that records why it went.
  const code = SHEET.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assert.ok(
    !/Not in our database yet/.test(code),
    "the cache-miss screen is back — it reads as a failure in front of something that always works",
  );
  assert.ok(!/"catalog-miss"/.test(code), "the catalog-miss stage is reachable again");
});

test("the one remaining dead end is the real one", () => {
  // Open Food Facts has never heard of it either. That IS a decision.
  assert.match(SHEET, /not in ours and not in Open Food\s*\n?\s*Facts/);
  assert.match(SHEET, /Add it as a custom food/);
});

// ── say what changed ───────────────────────────────────────────────────────

test("the route is told what is already on the plate", () => {
  assert.match(ROUTE, /CURRENT ITEMS:/, "without the current items it cannot express 'remove' or 'double it'");
  assert.match(ROUTE, /id=\$\{i\.id\}/);
});

test("an op pointing at an item that was never sent is dropped", () => {
  assert.match(ROUTE, /const known = new Set\(items\.map\(\(i\) => i\.id\)\);/);
  assert.match(ROUTE, /o\.op === "add" \|\| \(o\.id && known\.has\(o\.id\)\)/,
    "a change the person watched being accepted would silently not happen");
});

test("a nonsense reply cannot produce a nonsense meal", () => {
  assert.match(ROUTE, /Math\.max\(0, x\.amount\)/, "a negative amount is not a smaller portion");
  assert.match(ROUTE, /const MAX_OPS = 25;/);
  assert.match(ROUTE, /typeof x\.servings === "number" && x\.servings > 0 \? x\.servings : 1/);
});

test("it has its own feature name but shares the parse allowance", () => {
  assert.match(ROUTE, /enforceMeter\(clientId, "meal_edit"\)/);
  assert.match(ROUTE, /logUsage\(clientId, "meal_edit"/);
  const registry = read("src/lib/ai/meter-core.ts");
  assert.match(registry, /meal_edit:\s*\{[^}]*limitColumn: "ai_daily_parse_limit"/,
    "a second daily cap for the same kind of ask is a number nobody can hold in their head");
});

test("the sheet applies the change but never saves it", () => {
  assert.match(ADJUST, /async function runAiEdit\(\)/);
  // It writes the SAME pending state the steppers write.
  assert.match(ADJUST, /if \(op\.op === "set" && op\.id\) next\[op\.id\] = Math\.max\(0, Number\(op\.amount\) \|\| 0\);/);
  assert.match(ADJUST, /if \(op\.op === "remove" && op\.id\) next\[op\.id\] = 0;/);
  // A swap zeroes the outgoing item the same way — the plan row has to stay,
  // and the replacement goes on as an added food below it.
  assert.match(ADJUST, /if \(op\.op === "swap" && op\.id\) next\[op\.id\] = 0;/);
  assert.match(ADJUST, /Nothing is saved until you press Save\./,
    "the person is not told the change is still pending");
  // And it must not call either save path itself.
  const fn = ADJUST.slice(ADJUST.indexOf("async function runAiEdit()"), ADJUST.indexOf("const stepFor ="));
  assert.ok(!/onSave\(|onSaveToPlan\(/.test(fn), "the model can commit a change to a logged meal on its own");
});

test("it sends the amounts on screen, not the plan's", () => {
  const fn = ADJUST.slice(ADJUST.indexOf("async function runAiEdit()"), ADJUST.indexOf("const stepFor ="));
  assert.match(fn, /amount: amounts\[it\.id\] \?\?/, "'double it' would double the wrong number");
});

test("it can be dictated", () => {
  const fn = ADJUST.slice(ADJUST.indexOf("Say it, rather than tapping"), ADJUST.indexOf("Add from the food database"));
  assert.match(fn, /<MicButton/, "typing 'no bread, four eggs, add a banana' on a phone is the thing this replaces");
});
