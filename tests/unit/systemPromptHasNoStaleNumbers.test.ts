// Guard: no client's body numbers are written into the system prompt.
//
// Section 6 of SYMMETRY_SYSTEM_PROMPT carried a hardcoded weight and body-fat
// figure for eighteen clients. On 15 Aug 2026 every one was checked against the
// `metrics` table and every one was wrong:
//
//   Tyler Dorsett     prompt 236 lb / 12.7%   actual 250.8 / 7.7%   (6 Aug)
//   Lauren Standefer  prompt 155 / 29%        actual 146.2 / 28.7%  (5 Aug)
//   Cheyenne Martin   prompt 205 / 35.9%      actual 197.1 / 37.8%  (14 Aug)
//   Claudine Ocon     prompt 110 / 25.2%      actual 116.7 / 24.2%  (4 Aug)
//   Todd Prine        prompt 236              actual 242.4          (27 Jul)
//   Brooke Reynolds, Tania Millan, Laurie Kane, Troy Schnitzler
//                     carried figures and have NO metrics row at all
//
// Tyler is in contest prep. The prompt had him fifteen pounds lighter and five
// points fatter than he is, and the model has no way to know it is out of date,
// so it answers with confidence. That is the failure this file exists to stop
// coming back — and it WILL be tempting to come back, because pasting a roster
// into a prompt is the fastest way to make the AI sound like it knows people.
//
// Current numbers now arrive as live context from `metrics`, carrying the date
// they were measured (src/lib/ai/assistantContext.ts, metricsLine).
//
// MUTATION-TESTED: putting a "Weight: 236 lbs | BF: 12.7%" line back into the
// roster fails this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_SRC = readFileSync(join(process.cwd(), "src/lib/ai/system-prompt.ts"), "utf8");

// Section 6 is where the roster lives. Restricting to it keeps the rule honest:
// the prompt legitimately talks ABOUT weight and body fat elsewhere (what to
// read, how to discuss a plateau), and a blanket ban on the words would be
// noise that gets suppressed rather than obeyed.
function rosterSection(): string {
  const start = PROMPT_SRC.indexOf("SECTION 6 — CLIENT ROSTER");
  assert.ok(start > -1, "Section 6 has moved or been renamed; this guard needs updating, not deleting");
  const end = PROMPT_SRC.indexOf("SECTION 7", start);
  return PROMPT_SRC.slice(start, end > -1 ? end : PROMPT_SRC.length);
}

test("no client weight is hardcoded in the roster", () => {
  const hits = [...rosterSection().matchAll(/Weight:\s*[\d.]+/gi)].map((m) => m[0]);
  assert.deepEqual(
    hits,
    [],
    `hardcoded weights are back in the prompt: ${hits.join(", ")}. ` +
      `They go stale silently and the model states them as fact. Current weight comes from ` +
      `metricsLine() in src/lib/ai/assistantContext.ts.`
  );
});

test("no client body-fat figure is hardcoded in the roster", () => {
  const hits = [...rosterSection().matchAll(/BF:\s*[\d.]+/gi)].map((m) => m[0]);
  assert.deepEqual(hits, [], `hardcoded body-fat figures are back: ${hits.join(", ")}`);
});

test("no bare lb / % figure is smuggled into a roster line", () => {
  // The obvious way around the two rules above is to write "236 lbs, 12.7% bf"
  // without the labels. Catch the shape, not the spelling.
  const hits = [...rosterSection().matchAll(/\b\d{2,3}(?:\.\d)?\s*(?:lbs?|pounds)\b/gi)].map((m) => m[0]);
  assert.deepEqual(
    hits,
    [],
    `weights in a roster line without the "Weight:" label: ${hits.join(", ")}`
  );
});

test("the roster says where current numbers actually come from", () => {
  // Removing the numbers is only half the fix. Without this the model has a
  // roster full of people and no statement about what it does NOT know, and
  // filling that gap is exactly what it is good at.
  const section = rosterSection();
  assert.match(
    section,
    /live context/i,
    "the roster no longer tells the model that current numbers arrive as live context"
  );
  // \s+ between words, not a space. The prompt is hand-wrapped prose and this
  // phrase straddles a line break — matching a literal space failed against
  // perfectly correct text, which is the fourth time tonight a source-scanning
  // test has been fooled by formatting rather than by meaning.
  assert.match(
    section,
    /[Nn]ever\s+state\s+a\s+number\s+from\s+memory/,
    "the instruction not to state a number from memory has been removed"
  );
});

test("the live metrics line is still wired into the client context", () => {
  // The other half. If metricsLine stops being assembled, the prompt's promise
  // that numbers 'arrive as live context' becomes false and the model is left
  // knowing nothing rather than knowing something stale — quieter, still wrong.
  const CTX = readFileSync(join(process.cwd(), "src/lib/ai/assistantContext.ts"), "utf8");
  assert.match(CTX, /async function metricsLine\(/, "metricsLine is gone");
  assert.match(CTX, /metricsLine\(db, clientId\)/, "metricsLine is no longer called");
  assert.match(CTX, /if \(metrics\) lines\.push\(metrics\)/, "the metrics line is no longer added to the context");
  assert.match(
    CTX,
    /LATEST WEIGH-IN \(\$\{latest\.metric_date\}\)/,
    "the weigh-in DATE has been dropped — a ten-week-old reading must not be read back as today's"
  );
});
