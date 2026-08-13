import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOCK THE WORKOUT LOGGER LAYOUT.
 *
 * This screen has produced the same class of bug at least five times:
 *
 *   48d246f  sets compressed by the keyboard, only one set visible
 *   457328e  header-hide condition reintroduced by a concurrent branch
 *   4cb50a1  a visualViewport listener fighting itself in a scroll loop
 *   8654a38  tall exercise pushed the footer and tabs off screen, no way out
 *   8/1      the fix for 8654a38 put the sets in the flexible box, so the
 *            keyboard sheared them in half again
 *
 * Every one of them was someone reasonably rearranging this layout without
 * knowing which properties were load-bearing. Dustin, 8/1: "Make sure that
 * format gets locked in permanently. We can't keep reintroducing that same
 * bug."
 *
 * So the invariants are asserted here rather than described in a comment
 * somebody will edit around. If you are here because this test failed, read
 * the rule it names before changing the assertion — the assertion is the
 * cheap part, the bug it prevents costs Dustin a training session.
 */

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

/**
 * The source with comments stripped.
 *
 * The bans below have to be checked against CODE, not prose. The comment
 * explaining why visualViewport is banned necessarily contains the word
 * "visualViewport", and a test that cannot tell those apart punishes the
 * documentation that stops the bug coming back.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Index of a marker, asserting it exists exactly once. */
function at(marker: string, label: string): number {
  const first = SRC.indexOf(marker);
  assert.notEqual(first, -1, `logger layout: expected to find ${label} (${marker})`);
  assert.equal(
    SRC.indexOf(marker, first + 1),
    -1,
    `logger layout: ${label} appears more than once; the order check below cannot be trusted`,
  );
  return first;
}

test("session view is pinned to a stable height, not inset-0", () => {
  // inset-0 resolves against the LAYOUT viewport, which the Android WebView
  // shrinks when the keyboard opens — the whole view reflows and the exercise
  // header disappears. The height comes from useStableViewportHeight, which
  // never adopts a shorter viewport WHILE A KEYBOARD IS UP, so the keyboard
  // covers the bottom of the screen instead of resizing it.
  //
  // 8/10: that hook used to be grow-only, which fixed the keyboard and caused
  // the tab row below to vanish (see the next test). It can now come back down
  // for genuine viewport changes only — three guards, pinned in
  // tests/unit/stableViewportHeight.test.ts. The keyboard rule is unchanged.
  assert.ok(
    SRC.includes("useStableViewportHeight"),
    "logger must pin its height with useStableViewportHeight so the keyboard cannot resize it",
  );
  assert.ok(
    SRC.includes('height: stableH ?? "100dvh"'),
    "session root must use the stable height",
  );
  assert.ok(
    !/className="fixed inset-0 flex flex-col z-\[999\]"/.test(CODE),
    "session root must NOT use inset-0 — the keyboard shrinks that viewport",
  );
});

test("set rows are pinned outside the scroll region, in the right order", () => {
  // The order IS the fix. Sets above notes means the keyboard eats the notes
  // card; notes above sets means it eats a set row. Sets inside the scroll
  // region means they compress. Both have shipped as bugs.
  const scrollRegion = at('{/* /scroll region', "the end of the scroll region");
  const sets = at("{/* Sets — a PINNED sibling", "the pinned sets block");
  const notes = at("{/* Per-exercise notes", "the notes card");
  const spacer = at("{/* Spacer.", "the flex spacer");
  const footer = at("{/* Bottom controls", "the Prev/Next footer");

  assert.ok(scrollRegion < sets, "sets must come AFTER the scroll region closes — inside it they compress");
  assert.ok(sets < notes, "notes must come AFTER the sets — the keyboard is allowed to cover notes, never a set row");
  assert.ok(notes < spacer, "the spacer belongs below the notes so it is what collapses first");
  assert.ok(spacer < footer, "the footer holds the bottom");
});

test("the scroll region does not grow", () => {
  // flex-1 on the scroll box makes it eat every spare pixel and shove the sets
  // to the bottom of the screen, hundreds of px from the exercise they belong
  // to. It takes its natural height and shrinks only when it must.
  assert.ok(
    SRC.includes('flexGrow: 0, flexShrink: 1, flexBasis: "auto"'),
    "the exercise-header scroll box must be flex: 0 1 auto, never flex-1",
  );
});

test("no keyboard-conditioned layout anywhere in the logger", () => {
  // This is the rule that has been broken most often, usually by adding a
  // scroll-the-focused-input handler that then fights the keyboard animation.
  assert.ok(
    !CODE.includes("useKeyboardInset"),
    "the logger must not react to keyboard height — pin the container instead",
  );
  assert.ok(
    !/visualViewport/.test(CODE),
    "no visualViewport listeners in the logger; that is how 4cb50a1's scroll loop happened",
  );
  assert.ok(
    !/scrollIntoView/.test(CODE),
    "no scrollIntoView in the logger; moving the view on focus is what 48d246f removed",
  );
});

test("nothing on this screen has unbounded height", () => {
  // A data-driven block with no cap is how the 7/31 lock-out happened: enough
  // prior notes and the footer went off the bottom with nothing scrollable.
  assert.ok(
    /maxHeight: 96, overflowY: "auto"/.test(SRC),
    "the prior-notes list must stay capped and scrollable, or it can push the footer off screen",
  );
});

test("session mode does not leak its history entry", () => {
  // Entering session mode pushes an entry so Back exits the session instead of
  // the page. Leaving by Cancel/Complete used to leave that entry as the
  // current one, so the next Back popped a dead entry with the same URL and
  // looked like it did nothing.
  assert.ok(
    SRC.includes("poppedByBack"),
    "session-mode back handling must clean up its own history entry when it was not consumed by Back",
  );
});

test("the app tab row is present, and is the last thing in the session view", () => {
  // Removed on 8/1 to buy back height and put straight back at Dustin's
  // request — he uses them mid-session. Then on 8/10 they vanished again
  // WITHOUT anyone editing this file: useStableViewportHeight was grow-only, so
  // any moment the viewport was briefly taller became a permanent pin, the
  // container ended up taller than the screen, and the bottom row hung below
  // the fold. The tab row is the bottom row, so it is what disappeared.
  //
  // Two things are asserted. That the tabs still EXIST, because deleting them
  // is the tempting way to reclaim height and it has been done once. And that
  // they come after the Prev/Next controls, because being last is exactly why
  // they are the canary — anything that overshoots the viewport eats them
  // first, and a reordering would hide that signal.
  const controls = at("{/* Bottom controls (Prev/Next/Complete). */}", "the Prev/Next footer");
  const tabs = at("{/* App tabs.", "the app tab row");
  assert.ok(
    tabs > controls,
    "the app tab row must stay last in the session view — it is the first thing an over-tall container pushes off screen",
  );
  assert.ok(
    /ti-home/.test(SRC) && /ti-salad/.test(SRC),
    "the tab row must still render its links; removing them to reclaim height was tried on 8/1 and reverted",
  );
});

test("finishing a session done EARLY moves its scheduled slot instead of adding one", () => {
  // Sara Prince, 11 Aug: mobility done Sunday to get ahead created a SECOND
  // session on Sunday and left the original sitting later in the week, so her
  // week read 30% adherence for being ahead of schedule.
  //
  // The completion lookup checked today, then checked BACKWARDS for a missed
  // session, then inserted. There was no case for doing something early. This
  // asserts the forward case exists and still runs through the shared rule
  // rather than a second hand-rolled copy of it.
  assert.ok(
    SRC.includes("findSlotToPullForward"),
    "completing a session must reuse the shared pull-forward rule, not re-implement it",
  );
  const forward = at('.gt("scheduled_date", __today)', "the forward lookup for an early session");
  const insert = SRC.indexOf('source: "client_self_assign"');
  assert.ok(insert > -1, "the create-a-new-row fallback should still exist for genuinely unplanned work");
  assert.ok(
    forward < insert,
    "the forward lookup must run BEFORE the insert, or an early session still creates a duplicate",
  );
});

test("the note you are typing is never the thing the keyboard covers", () => {
  // Dustin, 12 Aug: "when adding notes in logger you cant see the text box."
  //
  // He was right, and it was the price of the rule two tests above: notes sit
  // LAST so the keyboard eats them instead of a set row. That protects the
  // sets and hides what you are typing. Both cannot be true in one column.
  //
  // So typing moved into a sheet whose input is at the TOP. The Android
  // WebView already shrinks the layout viewport when the keyboard opens, so a
  // fixed full-height panel occupies whatever is left and the field at its top
  // stays visible — WITHOUT measuring anything. The logger behind is untouched
  // because it is pinned to stableH.
  //
  // What must not happen: someone "simplifying" this back to an inline input
  // in the card, which is the covered state Dustin reported.
  assert.ok(
    SRC.includes("noteSheetOpen"),
    "the note sheet must exist — an inline input in the notes card is covered by the keyboard",
  );

  const sheet = SRC.indexOf("z-[1200]");
  assert.notEqual(sheet, -1, "the note sheet must render as a fixed overlay above the logger");

  // Inside the sheet, the input must come BEFORE the earlier-notes list. That
  // ordering IS the fix: whatever is last is what the keyboard reaches first.
  const input = SRC.indexOf("type=\"text\" autoFocus value={exNoteText}");
  const prior = SRC.indexOf("Earlier notes fill whatever is left");
  assert.ok(input > sheet, "the note input must live inside the sheet");
  assert.ok(
    input < prior,
    "the input must come BEFORE the earlier-notes list in the sheet — last is what the keyboard covers",
  );
});

test("the note sheet did not smuggle keyboard code back in", () => {
  // The whole point is that it reacts to nothing. If a future change needs a
  // measurement to keep the field visible, the layout is wrong, not the
  // measurement missing.
  assert.ok(!/visualViewport/.test(CODE), "still no visualViewport in the logger");
  assert.ok(!/scrollIntoView/.test(CODE), "still no scrollIntoView in the logger");
  assert.ok(!CODE.includes("useKeyboardInset"), "still no keyboard-inset hook in the logger");
});

test("the log button does not look like a play button", () => {
  // Dustin, 12 Aug: "that button that looks like a play button to log stuff
  // needs to change icons, that's confusing."
  //
  // It never played anything — it logs the set. With a countdown arriving in
  // the same row, a play triangle next to a time is actively misleading about
  // which control starts the timer.
  //
  // There is now no play triangle anywhere on this screen at all. The detached
  // TimerWheel owned the last one; the per-set timer starts with a clock and
  // pauses with two bars, because a ▶ sitting next to a countdown is exactly
  // the ambiguity being removed.
  const plays = (CODE.match(/ti-player-play/g) ?? []).length;
  assert.equal(
    plays, 0,
    "no play icon belongs in the logger — the set button logs, the timer button starts a clock",
  );
  // 13 Aug, from the mockups: the BARE check, no enclosing circle. Biggest and
  // most legible at the distance this is actually read from.
  assert.match(
    SRC,
    /ti ti-check/,
    "the unlogged set button must draw a check",
  );
  assert.ok(
    !/ti ti-circle-check/.test(SRC),
    "the circle around the check was dropped on 13 Aug — bare check, chosen from the mockups",
  );
  assert.ok(
    !/<circle cx="26" cy="26"/.test(SRC),
    "the logged-state animation draws the bare tick too; the ring came off with it",
  );
});

/**
 * THE PER-SET TIMER.
 *
 * Dustin, 12 Aug: "movements that track time you set timer or stop watch right
 * there where you log it, hit start, when time is up it logs as complete."
 * 13 Aug: "we need to be able to toggle from timer to stopwatch starting from
 * zero", and the switch goes above the sets.
 *
 * A running clock is the first thing on this screen that changes state over
 * time, which is a new way for the layout bugs above to come back. These pin
 * the properties that stop it.
 */
test("the timer never reacts to the keyboard or moves the view", () => {
  // Same three bans as everywhere else in this file, restated here so a future
  // "the timer should scroll its row into view" change fails loudly.
  assert.ok(!/visualViewport/.test(CODE), "the timer must not listen to the visual viewport");
  assert.ok(!/scrollIntoView/.test(CODE), "the timer must not scroll anything into view");
  assert.ok(!CODE.includes("useKeyboardInset"), "the timer must not measure the keyboard");
});

test("the timer is driven by the wall clock, not by counting ticks", () => {
  // setInterval(() => secs--, 1000) throttles when the phone backgrounds or the
  // screen locks, so a 60-second hold comes back reading 41. The interval here
  // only forces a repaint; every number is derived from Date.now() inside
  // src/lib/setTimer.ts, which is unit-tested against ten-minute jumps.
  assert.ok(
    SRC.includes('from "@/lib/setTimer"'),
    "the timer logic lives in src/lib/setTimer.ts, where it can be tested without waiting in real time",
  );
  assert.ok(
    /only has to force a render/.test(SRC),
    "keep the note explaining why the interval does not drive the clock",
  );
  assert.ok(
    !/setInterval\([^)]*\)\s*=>\s*set\w*\(\w+\s*[-+]/.test(CODE),
    "no interval may increment or decrement the displayed time",
  );
});

test("the timer switch only appears on movements that track time", () => {
  // Dustin, 13 Aug: "yes hide it on non-time movements, but it needs to come up
  // if we toggle time on."
  //
  // Both halves come from the same condition: the switch is rendered off the
  // LIVE field list, so a weight-and-reps movement never pays the ~34px, and
  // switching the Time chip on brings it up in the same tap. Making it
  // unconditional is the tempting simplification and it costs every exercise
  // height that the set rows need.
  assert.ok(
    SRC.includes('{xFields.includes("time") && renderTimerModeSwitch(currentExercise.id)}'),
    "session view: the mode switch must be conditional on the live tracked-field list",
  );
  assert.ok(
    SRC.includes("{sTimer && renderTimerModeSwitch(pe.id)}"),
    "list view: same rule",
  );
  assert.ok(
    SRC.includes('{xFields.includes("time") && renderSetTimerButton(currentExercise.id, si)}'),
    "the per-set timer button is conditional too — a reps-only row has no clock",
  );
});

test("the column headers sit over the boxes they name", () => {
  // Both views listed TIME and DIST in the opposite order to the inputs
  // underneath, so "DIST (ft)" sat over the seconds box and vice versa. It was
  // unreachable until 12 Aug — no movement could carry both fields, because
  // distance was not renderable — and became visible the moment it could.
  //
  // Asserted as ORDER rather than exact markup so a restyle does not fail it.
  const before = (a: string, b: string, label: string) => {
    const ia = SRC.indexOf(a), ib = SRC.indexOf(b);
    assert.notEqual(ia, -1, `expected to find ${a}`);
    assert.notEqual(ib, -1, `expected to find ${b}`);
    assert.ok(ia < ib, label);
  };
  // Session view renders time, then distance.
  before(
    'style={{ color: "rgba(255,255,255,0.3)" }}>TIME (min)',
    'style={{ color: "rgba(255,255,255,0.3)" }}>DIST (ft)',
    "session header: TIME must come before DIST, matching the inputs",
  );
  // List view renders distance, then time.
  before(
    'style={{ color: "var(--brand-text-secondary)" }}>DIST (ft)',
    'style={{ color: "var(--brand-text-secondary)" }}>TIME (min)',
    "list header: DIST must come before TIME, matching the inputs",
  );
});

test("a finished timer hands its value straight to logSet", () => {
  // logSet reads `sets` from the render that created it. updateSet() followed
  // by logSet() therefore writes the time the box held BEFORE the timer touched
  // it — a 30-second hold recorded as whatever was there previously. The
  // override argument is the only version that cannot race the state update.
  assert.ok(
    /async function logSet\(peId: string, si: number, overrides\?: Partial<SetData>\)/.test(SRC),
    "logSet must accept an override so a timer can log the value it just measured",
  );
  assert.ok(
    SRC.includes("logSetRef.current(peId, si, { time: text })"),
    "the expiry path must pass the measured time in rather than relying on state having settled",
  );
  // ...and through a ref, because that call site lives inside an interval that
  // is only rebuilt when a clock starts or stops. Calling logSet directly there
  // logs the weight the box held when the timer started, not the one typed
  // during the hold.
  assert.ok(
    SRC.includes("logSetRef.current = logSet"),
    "the interval must reach logSet through a ref kept current every render",
  );
});
