import test from "node:test";
import assert from "node:assert/strict";
import {
  BANNED_USER_TERMS,
  violatesSurfaceLanguage,
  scrubSurfaceLanguage,
} from "../../src/lib/movement/ces-data";

// The movement screen is the one surface where a stray "dysfunction" or
// "abnormal" reads to a client as a medical opinion — exactly what this app
// must never give. There WAS a guard. It did nothing:
//
//     const leaks = violatesSurfaceLanguage(String(layers[k] ?? ''));
//     if (leaks.length) layers[k] = `${layers[k]}`;   // ← assigns to itself
//
// Every leak was detected and none was ever removed, and because the intent was
// so clearly commented nobody re-read the line. These tests are the difference
// between a guard and a comment about a guard.

test("the scrubber actually removes every banned term", () => {
  for (const term of BANNED_USER_TERMS) {
    const sentence = `Your screen showed ${term} in the movement.`;
    const { text } = scrubSurfaceLanguage(sentence);
    assert.equal(
      violatesSurfaceLanguage(text).length,
      0,
      `"${term}" survived the scrub: ${JSON.stringify(text)}`
    );
  }
});

test("it reports what it found, so the trainer can see what the model reached for", () => {
  const { leaked } = scrubSurfaceLanguage(
    "This is not a diagnosis, but the valgus suggests dysfunction."
  );
  assert.ok(leaked.includes("diagnosis"));
  assert.ok(leaked.includes("valgus"));
  assert.ok(leaked.includes("dysfunction"));
});

test("clean copy is returned untouched", () => {
  const clean = "Your left knee drifts in at the bottom of the squat. The ankle is the reason.";
  const { text, leaked } = scrubSurfaceLanguage(clean);
  assert.equal(text, clean);
  assert.deepEqual(leaked, []);
});

test("it replaces with plain English rather than leaving a hole", () => {
  const { text } = scrubSurfaceLanguage("We saw valgus on the left.");
  assert.match(text, /knee drifting in/);
  assert.doesNotMatch(text, /valgus/i);
});

test("longer phrases are replaced before their parts", () => {
  // "anterior pelvic tilt" must not become "hips tipped forward" only after
  // something inside it has already been mangled.
  const { text } = scrubSurfaceLanguage("There is an anterior pelvic tilt present.");
  assert.match(text, /hips tipped forward/);
  assert.equal(violatesSurfaceLanguage(text).length, 0);
});

test("deleting a term does not leave doubled spaces or a space before punctuation", () => {
  const { text } = scrubSurfaceLanguage("This follows the NASM model.");
  assert.doesNotMatch(text, /\s{2,}/);
  assert.doesNotMatch(text, /\s+[,.;:!?]/);
});

test("it is case-insensitive — the model does not always shout", () => {
  for (const variant of ["DYSFUNCTION", "Dysfunction", "dysfunction"]) {
    const { text } = scrubSurfaceLanguage(`Some ${variant} here.`);
    assert.equal(violatesSurfaceLanguage(text).length, 0, variant);
  }
});

test("a term inside a longer word is not mangled", () => {
  // "CES" is banned; "process" and "success" must survive intact.
  const { text } = scrubSurfaceLanguage("The process was a success.");
  assert.equal(text, "The process was a success.");
});
