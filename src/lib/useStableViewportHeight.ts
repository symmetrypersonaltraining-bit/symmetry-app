"use client";

// The height the screen HAD before the soft keyboard opened.
//
// The workout logger is a `fixed inset-0` full-screen view. `inset-0` resolves
// against the layout viewport, and on Android the WebView resizes that viewport
// when the keyboard opens — `interactive-widget=overlays-content` is set in the
// viewport meta, but the native activity's windowSoftInputMode wins over it, so
// the whole view really does get shorter. Everything inside then reflows into
// the smaller box: flexible children collapse, and the exercise header
// disappeared entirely. Dustin's rule for that screen is that NOTHING moves
// when the keyboard opens — the keyboard may cover the bottom, and that is all.
//
// You cannot satisfy that by choosing which children flex. Any reflow is
// movement. The container itself has to stop changing size.
//
// So: track the tallest innerHeight seen in the current orientation and pin the
// view to that. The keyboard makes the viewport shorter, never taller, so a
// keyboard is simply a value we do not adopt. The content below the fold is
// then genuinely off-screen and the keyboard draws over it, which is the intent.
//
// ── 2026-08-10: why the pin can now shrink, carefully ───────────────────────
//
// Grow-only had a second failure. The pin never came back down, and it is only
// reset by rotation, so ANY moment the viewport was briefly taller became
// permanent — an address bar auto-hiding, the Android nav bar hiding during a
// transition. The container then stayed taller than the screen and its bottom
// row hung below the fold. In the logger that bottom row is the app tab bar, so
// Dustin's tabs silently disappeared mid-session and only a rotation brought
// them back.
//
// Fixing that means letting the pin shrink — which is exactly the move that
// would reintroduce the keyboard bug if done naively. So a smaller height is
// adopted ONLY when all three of these hold:
//
//   1. Nothing is focused. A focused input means a keyboard, and focus state is
//      the signal that actually works here — visualViewport was tried and
//      rejected on 7/24.
//   2. The smaller height has been stable for SETTLE_MS. This is the one that
//      matters most: blur fires BEFORE the keyboard finishes animating away, so
//      there is a window where nothing is focused and the viewport is still
//      keyboard-short. Adopting during that window would collapse the view —
//      precisely the old bug. Waiting it out closes the hole.
//   3. The shrink is small relative to the pin. Browser chrome takes ~50-120px;
//      a soft keyboard takes 250-400px. A large drop is a keyboard no matter
//      what the other two signals say.
//
// Every guard fails CLOSED: if any is unsure, the pin is left alone and the
// behaviour is exactly the old grow-only behaviour. The worst case is that the
// tabs stay hidden until rotation — today's bug — never a moving screen.

import { useEffect, useRef, useState } from "react";

/** How long a smaller height must persist before it is believed. */
export const SETTLE_MS = 500;

/**
 * Largest shrink, as a fraction of the pinned height, still attributable to
 * browser chrome. Anything bigger is treated as a keyboard and ignored.
 */
export const MAX_SHRINK_RATIO = 0.25;

/**
 * The pure decision: what should the pinned height become?
 *
 * Split out from the hook with no DOM access so the rules above can actually be
 * tested — the whole point is that the failure mode is a screen that moves
 * under someone mid-set, which no one is going to catch by clicking around.
 *
 * Returns the height to pin to, or null to leave the pin unchanged.
 */
export function nextPinnedHeight(opts: {
  /** Currently pinned height (0 before the first measurement). */
  pinned: number;
  /** window.innerHeight right now. */
  measured: number;
  /** Is a text input / contenteditable focused? */
  keyboardOpen: boolean;
  /** Has `measured` held steady for SETTLE_MS? */
  settled: boolean;
  maxShrinkRatio?: number;
}): number | null {
  const { pinned, measured, keyboardOpen, settled } = opts;
  const maxShrink = opts.maxShrinkRatio ?? MAX_SHRINK_RATIO;

  if (!Number.isFinite(measured) || measured <= 0) return null;

  // Growing is always safe and always immediate: a keyboard never makes the
  // viewport taller, so a bigger number cannot be keyboard noise.
  if (measured > pinned) return measured;

  if (measured === pinned) return null;

  // ── shrinking: all three guards must agree ──
  if (keyboardOpen) return null;
  if (!settled) return null;
  if (pinned > 0 && (pinned - measured) / pinned > maxShrink) return null;

  return measured;
}

/** A focused text input means the soft keyboard is up (or about to be). */
function isKeyboardOpen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useStableViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let pinned = 0;
    let lastWidth = window.innerWidth;

    const clearPending = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const apply = (h: number) => {
      pinned = h;
      setHeight(h);
    };

    const update = () => {
      // Width changing means a rotation (or a desktop resize) — the previous
      // high-water mark describes a different screen shape and must not carry
      // over. A keyboard never changes the width.
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        pinned = 0;
        clearPending();
      }

      const measured = window.innerHeight;

      // Growing: immediate, no debounce. Waiting here would be visible lag.
      const grown = nextPinnedHeight({ pinned, measured, keyboardOpen: false, settled: true });
      if (measured > pinned && grown !== null) {
        clearPending();
        apply(grown);
        return;
      }

      if (measured === pinned) {
        clearPending();
        return;
      }

      // Shrinking: re-arm the settle timer. Every resize while the keyboard is
      // animating restarts it, so the pin can only come down once the viewport
      // has genuinely stopped moving AND nothing is focused at that moment.
      clearPending();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = nextPinnedHeight({
          pinned,
          measured: window.innerHeight,
          keyboardOpen: isKeyboardOpen(),
          settled: true,
        });
        if (next !== null) apply(next);
      }, SETTLE_MS);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      clearPending();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return height;
}
