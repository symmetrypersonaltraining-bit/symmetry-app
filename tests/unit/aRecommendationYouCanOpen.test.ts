// The assessment tool recommended programmes that do not exist.
//
// The routing block in the prompt was written by hand and never reconciled with
// the `programs` table: it offered "Scapular Precision Program" (the real one is
// "Scapular Stability & Shoulder Mechanics"), "APT Correction Program" (it is
// "APT Correction"), "5-Day Split" ("5-Day Bodybuilding Split"). Eight of the
// thirteen names were not in the table at all.
//
// Nothing downstream checked. The route returned the model's answer verbatim
// and the assessment page rendered it as free text, so a trainer was shown a
// confident recommendation for a programme they could not open.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(import.meta.dirname, "..", "..", "src/app/api/assessment-recommend/route.ts"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the real programme list is read before the prompt is built", () => {
  assert.match(code, /\.from\("programs"\)/, "the prompt still invents its own list");
  assert.match(code, /\.is\("personal_for_client_id", null\)/,
    "a personal programme belongs to one client and must not be offered");
  assert.match(code, /\.eq\("status", "live"\)/, "a draft is not something to start a client on");
  assert.ok(code.indexOf('.from("programs")') < code.indexOf("const prompt ="),
    "the list must be fetched before the prompt that embeds it");
});

test("duplicate names collapse to one option", () => {
  // The table carries the same block seeded per trainer. Offering the model
  // three identical choices is noise it has to resolve.
  assert.match(code, /new Map</);
  assert.match(code, /if \(!byName\.has\(r\.name\)\) byName\.set/);
});

test("the model is told to choose only from the list, and to return an id", () => {
  assert.match(code, /Choose one from this list and nothing\s*\n?else/);
  assert.match(code, /"recommended_program_id"/);
});

test("the answer is resolved against the real rows", () => {
  assert.match(code, /catalogue\.find\(\(r\) => r\.id === result\?\.recommended_program_id\)/,
    "an id that resolves is the only trustworthy part of the answer");
  assert.match(code, /result\.recommended_program = chosen\.name/,
    "the displayed name should come from the row, not from the model");
});

test("an unresolvable answer is marked rather than presented as a decision", () => {
  assert.match(code, /recommended_program_unmatched = true/);
});

test("the old hand-written programme names are gone from the routing block", () => {
  // These three never existed in the table.
  // Against the stripped source: the comment above explains the bug by quoting
  // the old names, and must not be mistaken for the bug.
  for (const phantom of ["Precision Program", "Correction Program", "Hip Pain Program"]) {
    assert.ok(!code.includes(phantom),
      "the prompt still names a programme that does not exist: " + phantom);
  }
});
