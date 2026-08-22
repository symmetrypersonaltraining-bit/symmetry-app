// ============================================================================
// The app must never tell a trainer to go and ask themselves.
//
// Dustin, 22 Aug, asking his own app to swap an exercise across his program.
// The reply: "That tells me your program is fully custom from Dustin... I can't
// make that change without Dustin's approval... He designs the movements
// intentionally." Third person, twice, to the person it was describing.
//
// The instruction that prevents this has existed for weeks and is correct. The
// fault was that only ONE of the two context builders used it:
//
//   assembleCoachContext  → coach card      → had it
//   assistantContext      → free-text chat  → dropped it on the floor
//
// fetchClientProfile returns isCoachThemselves to both. assistantContext took
// `profile.line` and ignored the rest. So the card knew who he was and the box
// he actually types into did not.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { coachingThemselvesLine } from "../../src/lib/ai/coach-context.ts";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the self-coaching instruction", () => {
  it("says nothing for an ordinary client", () => {
    assert.equal(coachingThemselvesLine(false, "Dustin"), null);
    assert.equal(coachingThemselvesLine(undefined, "Dustin"), null);
  });

  it("names whoever the trainer actually is", () => {
    // It used to be an allowlist of trainer emails, which became true for
    // Stephanie the day she was added — and told the model that SHE was Dustin,
    // in the masculine.
    const steph = coachingThemselvesLine(true, "Stephanie");
    assert.match(steph!, /Stephanie/);
    assert.ok(!/Dustin/.test(steph!), "the instruction hardcodes one trainer's name");
  });

  it("forbids the three things that actually went wrong", () => {
    const line = coachingThemselvesLine(true, "Dustin")!;
    assert.match(line, /NEVER tell them to message, ask, check with, or run anything by/,
      "nothing stops it telling him to go and ask himself");
    assert.match(line, /Never refer to \$?\{?coachFirstName\}?|Never refer to Dustin in the third person/,
      "nothing stops the third person");
    // "I can't make that change without Dustin's approval" was the exact
    // sentence, so approval gets its own clause.
    assert.match(line, /needs approval or sign-off|approval or sign-off/,
      "nothing stops it demanding the trainer's own sign-off");
  });
});

describe("every context builder that reads a profile uses it", () => {
  // This is the actual bug: not a missing instruction, a builder that did not
  // ask for it. Any new builder reading fetchClientProfile has to do the same.
  const builders: [string, string][] = [
    ["src/lib/ai/coach-context.ts", "the coach card"],
    ["src/lib/ai/assistantContext.ts", "the free-text chat box"],
  ];

  for (const [file, what] of builders) {
    it(`${what} carries the instruction`, () => {
      const code = strip(read(file));
      assert.match(
        code,
        /coachingThemselvesLine\(/,
        `${what} reads a client profile but never asks whether that client IS the trainer. That is how the reply came back telling him he needed his own approval.`,
      );
    });
  }

  it("no builder reads the profile and drops the flag", () => {
    for (const [file, what] of builders) {
      const code = strip(read(file));
      if (!/fetchClientProfile|profile\?\.line/.test(code)) continue;
      assert.match(
        code,
        /isCoachThemselves/,
        `${what} uses the profile without ever touching isCoachThemselves`,
      );
    }
  });
});
