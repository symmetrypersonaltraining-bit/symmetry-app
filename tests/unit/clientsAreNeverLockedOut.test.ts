// ============================================================================
// NO SCREEN STANDS BETWEEN A CLIENT AND THEIR OWN LOGGED WORK.
//
// Three lockouts in three days, three different mechanisms, one shape:
//
//   1 Sep  the rest timer auto-opened a full-screen overlay on every logged set
//          -> Jenn: "new pop up anytime I click to check"
//   1 Sep  a move rewrote the workout log's date, so a finished session left
//          the week it happened in
//          -> Jenn: "still can't view previous weeks"
//   2 Sep  the completion screen was gated on a flag seeded from the database,
//          so a finished workout could never be reopened
//          -> Lauren: one set of nine logged, then locked out
//
// Dustin: "we have to be able to view/edit past workouts always. 3rd time on
// this... I need to move the app forward figure out a way for bugs to not
// reoccur over n over."
//
// So the rule, checked here rather than remembered:
//
//   A screen that covers or replaces the client's own data must be gated on
//   something that happened in THIS VISIT, and must always offer a way out.
//   State read from the database describes the data; it does not get to stand
//   in front of it.
//
// These assert on structure, which is coarse — but each one fails against the
// code as it was when the corresponding client reported it, which is the bar
// that matters (docs/AUDIT.md: "a check that cannot fail is not a check").
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the workout logger", () => {
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));

  it("never replaces the screen on a flag seeded from the database", () => {
    // workoutComplete is read from workout_logs.completed on mount. It may
    // hide Cancel; it may not hide the workout.
    assert.ok(
      !/if \(workoutComplete\)\s*\{[\s\S]{0,1200}?return \(/.test(logger),
      "a full-screen return is gated on workoutComplete again — that is the flag seeded from the database, and seeding it locks every finished workout",
    );
  });

  it("has exactly two screens that replace the logger, and both are escapable", () => {
    // justCompleted: set in this visit by finishing. sessionMode: entered by
    // tapping Start, left by the Exit control and by the back button.
    const replacements = logger.match(/^ +if \((justCompleted|sessionMode &&[^)]*)\) \{/gm) || [];
    assert.equal(replacements.length, 2,
      `found ${replacements.length} screens replacing the logger; expected justCompleted and sessionMode. A new one needs an escape and a this-visit gate.`);
    assert.match(logger, /setSessionMode\(false\)/,
      "session mode has no way out");
    assert.match(logger, /aria-label="Exit to previous screen"/,
      "session mode's exit control is gone");
  });

  it("does not open the rest timer without being asked", () => {
    const start = logger.indexOf("async function logSet(");
    const logSet = logger.slice(start, logger.indexOf("async function saveTypedSet(", start));
    assert.ok(logSet.length > 200, "logSet body not found — this test is asserting on nothing");
    assert.ok(!/setRestTimer\s*\(/.test(logSet),
      "logging a set opens the rest timer again");
  });
});

describe("client takeovers", () => {
  const t = strip(read("src/components/ClientTakeovers.tsx"));

  it("gives every takeover a way out", () => {
    // One branch per takeover kind. Each must offer dismiss() before the next
    // branch begins, or that takeover is a dead end for whoever it picks.
    const kinds = ["birthday", "askdob", "winner", "pastdue", "announcement", "lapse"];
    const starts = kinds.map((k) => ({ k, i: t.indexOf(`pick.kind === "${k}"`) }));
    for (const { k, i } of starts) {
      assert.ok(i > 0, `takeover branch "${k}" not found — the kinds have changed and this test needs updating`);
    }
    const ordered = [...starts].sort((a, b) => a.i - b.i);
    for (let n = 0; n < ordered.length; n++) {
      const from = ordered[n].i;
      const to = n + 1 < ordered.length ? ordered[n + 1].i : t.length;
      assert.match(t.slice(from, to), /dismiss\(/,
        `the "${ordered[n].k}" takeover has no dismiss control — it covers the app with no way out`);
    }
  });

  it("closes before it writes, so a failed write cannot strand anyone", () => {
    const d = t.slice(t.indexOf("const dismiss = useCallback"));
    const close = d.indexOf("setPick(null)");
    const write = d.indexOf("await supabase");
    assert.ok(close > -1, "dismiss no longer closes the takeover");
    assert.ok(write === -1 || close < write,
      "dismiss awaits a database write before closing — if that write fails or hangs, the client is held behind the takeover");
  });
});

describe("the AI limit takeover", () => {
  const a = strip(read("src/components/AiLimitTakeover.tsx"));
  it("can be closed", () => {
    assert.match(a, /if \(!open \|\| !mounted\) return null/,
      "the takeover no longer honours its open flag");
    assert.match(a, /e\.key === "Escape"/, "Escape no longer closes it");
    assert.match(a, /onClick=\{onClose\}/, "there is no close control");
  });
});
