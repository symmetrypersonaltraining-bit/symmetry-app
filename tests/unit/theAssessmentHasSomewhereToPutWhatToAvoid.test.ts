import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// `contraindicated_movements` has been a column on client_assessments since the
// table was built, and eight clients carry one: Greg's fused lumbar spine,
// Sharon's medication-induced dizziness, Martha's one-new-movement-per-Saturday
// rule. Every one of them was written straight to the database — because THE
// FORM HAD NO BOX FOR IT. Sit down and do an assessment and there was nowhere
// to type the single most important thing about the client.
//
// Dustin, 5 Sep 2026: "the notes shoukd be included in the assessment add them
// there n make sure ai sees them."
//
// He asked for BOTH shapes. The chips are the recurring ones; the free text is
// where the judgement lives. Losing either half loses something: without chips
// the AI has only prose to reason over, and without the box, a sentence like
// "predictability is a clinical requirement for his cognitive load, not a
// preference" has nowhere to go and is simply dropped.

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, "src/app/(app)/assessment/page.tsx"), "utf8");

test("the form carries all three fields, and saves them", () => {
  for (const f of ["contraindication_flags", "contraindicated_movements", "trainer_notes"]) {
    assert.ok(
      new RegExp(`^\\s*${f}[?:]`, "m").test(src),
      `${f} is no longer on the form's data model — it will be silently dropped again`,
    );
    assert.ok(
      new RegExp(`${f}: data\\.${f}`).test(src),
      `${f} is collected but never written to the row`,
    );
  }
});

test("both halves are rendered, not just the chips", () => {
  assert.ok(/CONTRA_FLAGS\.map/.test(src), "the contraindication chips are gone");
  assert.ok(
    /field: "contraindicated_movements"/.test(src),
    "the free-text box is gone — the chips alone cannot hold a sentence like Greg's",
  );
  assert.ok(/field: "trainer_notes"/.test(src), "the trainer-notes box is gone");
});

test("every chip is one that actually occurs in a real client's notes", () => {
  // Invented options are worse than none: they get ticked because they are
  // there, and then the AI reasons from a restriction nobody meant. These
  // twelve are drawn from the eight notes that existed on 5 Sep.
  const block = src.slice(src.indexOf("const CONTRA_FLAGS"), src.indexOf("] as const;", src.indexOf("const CONTRA_FLAGS")));
  for (const real of [
    "No spinal loading",              // Greg (fusion), Gerard, Sharon G
    "No impact",                      // Gerard, Greg
    "No loaded overhead pressing",    // Sharon G, Gerard, Greg, Celeste
    "Seated or supported only",       // Gerard, Greg
    "No unstable-surface work",       // Sharon G
    "Pain-free range only",           // Sharon G, Gerard, Greg
    "No deep or loaded knee flexion", // Greg, Christine
    "Cap lower-back / hinge loading", // Grant, Claudine
  ]) {
    assert.ok(block.includes(real), `the chip "${real}" is gone, and a real client's file needs it`);
  }
});

test("the chips are not described as hard rules", () => {
  assert.ok(
    /NOT HARD RULES/.test(src),
    "the note saying these are not hard rules is gone — the next person to read this file will make the AI refuse, which Dustin explicitly ruled against",
  );
});
