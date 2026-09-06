import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ASSESSMENT_RULES } from "../../src/lib/ai/assessmentContext";

// Until 5 Sep 2026 no client-facing AI surface in this app had read a single
// line of an assessment. It knew what somebody lifted, ate, weighed and had
// scheduled, and nothing about them physically — so asked "can I add some
// squats?" by a man whose lumbar spine is FUSED, it said yes.
//
// Two rulings govern what happens now, and they pull against each other, which
// is why both are pinned here:
//
//   "they are not hard rules but ai needs to ask about contradictions w a mild
//    warning before overriding them."          — Dustin, 5 Sep
//   "explain it simply, never name it."        — Dustin, 5 Sep
//
// A refusal would be the "ask your coach" reflex that made Bobbie Page give up
// on 14 Aug and that he has now ruled against twice in two days. And a coach
// that reasons out loud in NASM vocabulary breaks the oldest client-facing
// guardrail in the app.

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("both client-facing context builders read the assessment", () => {
  // Two doors, one for free text and one for the coach answer. A question about
  // a sore shoulder can land at either.
  for (const f of ["src/lib/ai/assistantContext.ts", "src/lib/ai/coach-context.ts"]) {
    const src = read(f);
    assert.ok(/assessmentBlock/.test(src), `${f} no longer reads the assessment`);
  }
});

test("it warns and asks — it never refuses", () => {
  assert.ok(
    /NONE OF IT IS A HARD RULE and you must never refuse/.test(ASSESSMENT_RULES),
    "the no-refusing rule is gone; a model handed a list of restrictions will enforce them",
  );
  assert.ok(
    /Never "I can't do that"/.test(ASSESSMENT_RULES),
    "the explicit ban on the refusal sentence is gone",
  );
  assert.ok(
    /WARN ONCE, not every time/.test(ASSESSMENT_RULES),
    "nothing stops it repeating the same warning every turn, which is how an app gets ignored",
  );
});

test("it explains in plain words and never names the method", () => {
  assert.ok(/never name the method/i.test(ASSESSMENT_RULES), "the never-name-it rule is gone");
  for (const banned of ["NASM", "inhibit", "lengthen", "activate", "integrate"]) {
    assert.ok(
      new RegExp(`Never[^.]*${banned}|${banned}[^.]*never`, "i").test(ASSESSMENT_RULES),
      `${banned} is no longer named as forbidden client-facing vocabulary`,
    );
  }
});

test("it asks before advising on pain, and stops at the red flags", () => {
  assert.ok(/Up to TWO questions/.test(ASSESSMENT_RULES), "the clarify-gate is gone");
  assert.ok(/Not three/.test(ASSESSMENT_RULES), "nothing caps the questions, and interrogation is its own failure");
  // The refer-out list. These are the ones that must never be worked around.
  for (const flag of ["numbness", "radiating", "dizziness", "chest pain", "shortness of breath", "swelling"]) {
    assert.ok(
      ASSESSMENT_RULES.toLowerCase().includes(flag),
      `"${flag}" has dropped off the stop-and-hand-over list`,
    );
  }
});

test("no assessment is said out loud, not filled in with a guess", () => {
  // Half the roster has none. A coach that quietly reasons from an empty form
  // is worse than one that admits it cannot see anything — contract rule 2,
  // "no data" is not "zero".
  const src = read("src/lib/ai/assessmentContext.ts");
  assert.ok(/none on file/.test(src), "the no-assessment branch is gone");
  assert.ok(
    /an assessment you invented is worse than none/.test(src),
    "nothing stops it inferring an assessment from training history, goal or age",
  );
});
