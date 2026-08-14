import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE NOTIFICATIONS SCREEN MUST DEFAULT ON, AND MUST NOT LIE.
 *
 * Two properties are easy to break here and both fail silently, which is why
 * they are pinned rather than left to review:
 *
 * 1. A MISSING ROW MEANS ENABLED. The preference table stores only
 *    disagreements — someone who has never opened this screen has no rows at
 *    all. If the screen ever renders "off" as the default, every client sees a
 *    wall of switches claiming they opted out of things they never touched, and
 *    the obvious fix (turn them all on) writes 35 × N rows that did not need to
 *    exist.
 *
 * 2. A FORCED EVENT CANNOT BE TOGGLED. It renders on, disabled, and says why.
 *    Showing it greyed rather than hiding it is the point: "why do I still get
 *    announcements?" should be answerable by looking. A switch that appears to
 *    work and then does nothing is worse than no switch — the same reasoning
 *    already written into ExperienceSettings, where a toggle that promised
 *    delivery the code refused to perform was called a lie in the UI.
 *
 * Also pinned: the optimistic write reverts on failure. A dropped request must
 * never leave a switch showing a state the database does not have.
 */

const ROOT = process.cwd();
const SCREEN = join(ROOT, "src/components/NotificationSettings.tsx");

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

test("only an explicit `enabled === false` mutes a row", () => {
  const code = codeOnly(readFileSync(SCREEN, "utf8"));
  assert.match(
    code,
    /r\.enabled === false/,
    "the screen no longer requires a strict false to treat an event as muted; " +
      "a null or missing value would read as 'off' and show clients opt-outs they never made",
  );
});

test("the switch shows ON unless the event is explicitly muted", () => {
  const code = codeOnly(readFileSync(SCREEN, "utf8"));
  assert.match(
    code,
    /on=\{ev\.forced \? true : !muted\.has\(ev\.key\)\}/,
    "the ON state is no longer derived from absence-means-enabled; default-off would " +
      "misrepresent every client who has never opened this screen",
  );
});

test("a forced event renders on, disabled, and refuses to toggle", () => {
  const code = codeOnly(readFileSync(SCREEN, "utf8"));

  assert.match(
    code,
    /disabled=\{ev\.forced\}/,
    "forced events are no longer disabled in the UI — the switch would look operable and do nothing",
  );
  assert.match(
    code,
    /if \(ev\.forced \|\| !userId\) return;/,
    "the toggle handler no longer refuses forced events, so a forced preference could be written",
  );
  assert.match(
    code,
    /can't be turned off/,
    "the explanation for a disabled switch is gone; a greyed toggle with no reason is just broken-looking",
  );
});

test("a failed write reverts the switch", () => {
  const code = codeOnly(readFileSync(SCREEN, "utf8"));
  assert.match(
    code,
    /if \(error\)[\s\S]{0,160}setMuted\(/,
    "the optimistic write no longer reverts on error — a dropped request would leave the " +
      "switch claiming a state the database does not have",
  );
});

test("trainer-only events stay off a client's screen", () => {
  const code = codeOnly(readFileSync(SCREEN, "utf8"));
  assert.match(
    code,
    /isTrainer \|\| !e\.trainerOnly/,
    "the trainer-only filter is gone; clients would see 'Messages from clients', which they never receive",
  );
});
