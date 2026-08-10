// The rules that keep the workout logger's session view from moving.
//
// Dustin's condition when he approved this change: it must not reintroduce the
// keyboard moving the screen or covering anything higher up. That is what these
// tests are for. The failure mode is a screen that shifts under someone
// mid-set — nobody catches that by clicking around, and it has regressed more
// than once, so the rules live in a pure function and are pinned here.

import test from "node:test";
import assert from "node:assert/strict";
import {
  nextPinnedHeight,
  MAX_SHRINK_RATIO,
  SETTLE_MS,
} from "../../src/lib/useStableViewportHeight.ts";

const TALL = 800; // viewport with no keyboard
const KEYBOARD = 460; // same screen with a soft keyboard up (~340px bite)
const CHROME_HIDDEN = 800;
const CHROME_SHOWN = 700; // address / nav bar visible (~100px)

// ─── growing ────────────────────────────────────────────────────────────────

test("first measurement pins immediately", () => {
  assert.equal(nextPinnedHeight({ pinned: 0, measured: TALL, keyboardOpen: false, settled: true }), TALL);
});

test("a taller viewport is adopted immediately, even mid-keyboard", () => {
  // A keyboard never makes the viewport taller, so a bigger number cannot be
  // keyboard noise and needs no debounce — waiting would be visible lag.
  assert.equal(
    nextPinnedHeight({ pinned: CHROME_SHOWN, measured: CHROME_HIDDEN, keyboardOpen: true, settled: false }),
    CHROME_HIDDEN,
  );
});

test("an unchanged height changes nothing", () => {
  assert.equal(nextPinnedHeight({ pinned: TALL, measured: TALL, keyboardOpen: false, settled: true }), null);
});

// ─── THE KEYBOARD RULE — nothing may move ───────────────────────────────────

test("keyboard opening does NOT shrink the pin", () => {
  assert.equal(
    nextPinnedHeight({ pinned: TALL, measured: KEYBOARD, keyboardOpen: true, settled: true }),
    null,
  );
});

test("keyboard open and unsettled does NOT shrink the pin", () => {
  assert.equal(
    nextPinnedHeight({ pinned: TALL, measured: KEYBOARD, keyboardOpen: true, settled: false }),
    null,
  );
});

test("THE BLUR RACE: focus already gone but the keyboard is still animating away", () => {
  // The dangerous window. blur fires BEFORE the keyboard finishes closing, so
  // there is a moment where nothing is focused and the viewport is still
  // keyboard-short. Adopting then would collapse the view — the original bug.
  // `settled: false` is what closes the hole.
  assert.equal(
    nextPinnedHeight({ pinned: TALL, measured: KEYBOARD, keyboardOpen: false, settled: false }),
    null,
  );
});

test("a keyboard-sized drop is refused even when focus is gone AND it settled", () => {
  // Belt and braces: if focus detection and the timer both somehow lie, the
  // sheer SIZE of the drop still says keyboard. 340px of 800 is 42%, way past
  // the chrome threshold.
  assert.equal(
    nextPinnedHeight({ pinned: TALL, measured: KEYBOARD, keyboardOpen: false, settled: true }),
    null,
  );
});

test("every keyboard-shaped drop across plausible screen sizes is refused", () => {
  // Real keyboards take roughly 40-55% of a phone viewport. None may pass,
  // regardless of what the focus and settle signals claim.
  for (const tall of [640, 720, 800, 880, 960]) {
    for (const bite of [0.35, 0.4, 0.45, 0.5, 0.55]) {
      const measured = Math.round(tall * (1 - bite));
      assert.equal(
        nextPinnedHeight({ pinned: tall, measured, keyboardOpen: false, settled: true }),
        null,
        `a ${Math.round(bite * 100)}% drop on a ${tall}px screen must not be adopted`,
      );
    }
  }
});

// ─── the bug this change exists to fix ──────────────────────────────────────

test("browser chrome reappearing DOES shrink the pin, once settled and unfocused", () => {
  // The actual fix: ~100px of address/nav bar is not a keyboard, and leaving
  // the pin too tall is what pushed the logger's tab row below the fold.
  assert.equal(
    nextPinnedHeight({ pinned: CHROME_HIDDEN, measured: CHROME_SHOWN, keyboardOpen: false, settled: true }),
    CHROME_SHOWN,
  );
});

test("but not while an input is focused", () => {
  assert.equal(
    nextPinnedHeight({ pinned: CHROME_HIDDEN, measured: CHROME_SHOWN, keyboardOpen: true, settled: true }),
    null,
  );
});

test("and not before it has settled", () => {
  assert.equal(
    nextPinnedHeight({ pinned: CHROME_HIDDEN, measured: CHROME_SHOWN, keyboardOpen: false, settled: false }),
    null,
  );
});

test("chrome-sized drops are accepted right up to the threshold, and refused past it", () => {
  const pinned = 800;
  const atLimit = Math.round(pinned * (1 - MAX_SHRINK_RATIO)); // exactly 25%
  assert.equal(
    nextPinnedHeight({ pinned, measured: atLimit, keyboardOpen: false, settled: true }),
    atLimit,
  );
  const pastLimit = atLimit - 20;
  assert.equal(
    nextPinnedHeight({ pinned, measured: pastLimit, keyboardOpen: false, settled: true }),
    null,
  );
});

// ─── fail closed ────────────────────────────────────────────────────────────

test("nonsense measurements are ignored rather than pinned", () => {
  for (const bad of [0, -100, NaN, Infinity]) {
    assert.equal(
      nextPinnedHeight({ pinned: TALL, measured: bad, keyboardOpen: false, settled: true }),
      null,
      `${bad} must not become a pinned height`,
    );
  }
});

test("the settle delay is long enough to outlast a keyboard animation", () => {
  // Android keyboard show/hide animates in ~250-350ms. The delay has to clear
  // that or the blur race reopens.
  assert.ok(SETTLE_MS >= 400, `SETTLE_MS=${SETTLE_MS} is too short to outlast a keyboard animation`);
});

test("the shrink threshold sits between browser chrome and a keyboard", () => {
  // ~120px of chrome on the shortest plausible phone must pass; the smallest
  // plausible keyboard must not.
  assert.ok(120 / 640 < MAX_SHRINK_RATIO, "tall browser chrome would be refused");
  assert.ok(MAX_SHRINK_RATIO < 0.35, "a small keyboard would be accepted");
});
