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
// keyboard is simply a value we do not adopt — no keyboard detection, no
// threshold to tune, no visualViewport listener that can fire mid-scroll. The
// content below the fold is then genuinely off-screen and the keyboard draws
// over it, which is exactly the intent.
//
// Orientation change resets the high-water mark, because a landscape height is
// not a stale portrait one.
//
// Returns null until it has measured, so the caller can render a sane fallback
// on the server and on the first paint.

import { useEffect, useState } from "react";

export function useStableViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let tallest = 0;
    let lastWidth = window.innerWidth;

    const update = () => {
      // Width changing means a rotation (or a desktop resize) — the previous
      // high-water mark describes a different screen shape and must not carry
      // over. A keyboard never changes the width.
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        tallest = 0;
      }
      const h = window.innerHeight;
      if (h > tallest) {
        tallest = h;
        setHeight(h);
      }
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return height;
}
