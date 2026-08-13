"use client";

import { useEffect } from "react";

/**
 * InteractionFX — global tap ripple. 2026-07-25.
 *
 * Adds a material-style ripple originating from the exact touch point on any
 * button / [role=button] / [data-fx]. Purely presentational and fully
 * delegated: it mounts one listener on document and never touches component
 * state, so it cannot break a screen. Every DOM operation is wrapped, and the
 * ripple node removes itself.
 *
 * Deliberately skips:
 *  - anything marked [data-no-fx]
 *  - inputs, selects, textareas (a ripple under a caret looks wrong)
 *  - elements inside the session logger's set grid ([data-no-swipe]) so the
 *    rebuilt logger is untouched visually
 *  - users who asked for reduced motion
 *
 * Revert = remove <InteractionFX /> from layout.tsx and delete this file.
 */
export default function InteractionFX() {
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* noop */
    }
    if (reduce) return;

    const onPointerDown = (e: PointerEvent) => {
      try {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const el = t.closest<HTMLElement>('button, [role="button"], [data-fx]');
        if (!el) return;
        if (el.closest("[data-no-fx], [data-no-swipe], input, select, textarea")) return;
        if ((el as HTMLButtonElement).disabled) return;

        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;

        // The ripple is absolutely positioned inside the button, so the button
        // has to be a containing block and has to clip the overflow. Those are
        // two separate jobs, and they are applied separately now, because doing
        // both from one class broke every floating button in the app.
        //
        // `position: relative` landing on a button that was `position: fixed`
        // drops it out of the viewport and into normal document flow, MID-PRESS.
        // The pointer goes down on the button, the button teleports to wherever
        // it falls in the page, pointerup lands on whatever is now under the
        // finger, and the browser fires `click` on their common ancestor
        // instead. The handler never runs. The class is never removed, so it
        // stays that way.
        //
        // Dustin, of the nutrition ✦: "the button disappears when you click it,
        // nothing happens." It was doing precisely that, literally.
        //
        // Clipping is always safe. The containing block is only needed when the
        // element is `static`; anything already positioned is a containing block
        // already, and re-declaring it is the whole of the damage.
        el.classList.add("cw-ripple-clip");
        if (getComputedStyle(el).position === "static") el.classList.add("cw-ripple-host");

        const d = Math.max(r.width, r.height);
        const span = document.createElement("span");
        span.className = "cw-ripple";
        span.style.width = span.style.height = `${d}px`;
        span.style.left = `${e.clientX - r.left - d / 2}px`;
        span.style.top = `${e.clientY - r.top - d / 2}px`;
        el.appendChild(span);
        window.setTimeout(() => {
          try {
            span.remove();
          } catch {
            /* noop */
          }
        }, 600);
      } catch {
        /* never let a visual effect break an interaction */
      }
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
