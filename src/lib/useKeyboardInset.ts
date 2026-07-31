"use client";

// Feedback 602efaf8: "the keyboard covers the input when logging meals".
//
// Every logging UI in the app is a bottom sheet — `position: fixed` pinned to
// the bottom of the LAYOUT viewport. When the Android/iOS soft keyboard opens,
// the layout viewport does NOT shrink; only the VISUAL viewport does. So the
// sheet stays exactly where it was and the keyboard is drawn on top of it,
// hiding whatever input the client just tapped.
//
// This hook reports how many pixels of the sheet the keyboard is covering, so a
// sheet can lift itself clear of it. Returns 0 when no keyboard is up, and on
// browsers with no visualViewport support (where nothing changes anyway).
//
// Usage on the fixed backdrop element:
//   const kb = useKeyboardInset();
//   <div className="fixed inset-0 flex items-end" style={{ bottom: kb }}>
// and cap the panel with maxHeight so it can still scroll in the space left.

import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      // How much of the bottom of the layout viewport is hidden right now.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Ignore small deltas — browser chrome (collapsing URL bar) moves the
      // visual viewport by 40-60px and must NOT be mistaken for a keyboard.
      setInset(covered > 90 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

// Scroll the focused field into the middle of whatever space is left above the
// keyboard. Attach to a sheet's scrolling container: the keyboard animates in
// AFTER focus fires, so the scroll is deferred past the animation.
export function scrollFocusedIntoView(e: React.FocusEvent<HTMLElement>) {
  const el = e.target as HTMLElement | null;
  if (!el || !("scrollIntoView" in el)) return;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;
  setTimeout(() => {
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* older webviews: the lift from useKeyboardInset is already enough */
    }
  }, 300);
}
