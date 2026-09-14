"use client";

/**
 * THE PHONE'S BACK BUTTON CLOSES WHAT IS ON TOP, NOT THE PAGE.
 *
 * Dustin's rule, set 11 Sep 2026 and repeated on the 13th when the Nutrition
 * sheets broke it: *"When you hit either button, it needs to go back one page —
 * the previous screen you were looking at."*
 *
 * An overlay — a sheet, a modal, a zoomed photo — is a screen to the person
 * looking at it. It was not a history entry, so Back popped the whole PAGE and
 * landed wherever they came from, usually Home. The screen they were actually
 * looking at before was that page with the overlay shut, and the control
 * everyone reaches for could not get there.
 *
 * `BackButtonGuard` does not cover any of this: it only binds inside a
 * Capacitor shell, and Capacitor is deliberately out of package.json, so on a
 * real phone this is the browser's own Back with nothing listening.
 *
 * ── WHY THIS IS NOT THE SENTINEL backFromHere.ts FORBIDS ─────────────────────
 *
 * That file warns, in capitals, never to push an invented history entry so that
 * Back "has somewhere to go". It is right, and this is a different thing.
 *
 * The sentinel was pushed on a PAGE, with the same URL as the page under it, so
 * popping it re-rendered the identical screen and read as a dead press — and a
 * reload re-armed it, so the dead presses accumulated. That was BackButtonGuard
 * v2 and v3, twice.
 *
 * Here an entry exists only while an overlay is open, and popping it visibly
 * closes that overlay. Nothing is pushed on a page with nothing open, so no
 * press can land on an entry that is not a real change.
 *
 * ── IT MUST NEVER BREAK THE SCREEN IT IS ON ─────────────────────────────────
 *
 * Dustin, granting this for the workout logger: *"crash safe on logger."* Every
 * window and history access is wrapped. A browser that refuses pushState (some
 * embedded webviews throttle it), a missing History API, SSR — all of it
 * degrades to the old behaviour, which is Back leaving the page. Worse than the
 * fix, better than a logger that will not render mid-set.
 */

import { useEffect, useRef } from "react";

/**
 * @param depth  How many overlay levels are open. A single modal passes
 *               `open ? 1 : 0`; a stack passes its length.
 * @param closeOne  Close exactly ONE level — the top one. Two deep, Back lands
 *                  on the one underneath, which is the previous screen they
 *                  were looking at.
 */
export function useBackClosesOverlay(depth: number, closeOne: () => void): void {
  const pushed = useRef(0);
  const selfPop = useRef(false);
  // The callback is read at pop time rather than captured, so a caller that
  // redefines it every render (most of them do) does not re-bind the listener.
  const closeRef = useRef(closeOne);
  closeRef.current = closeOne;

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onPop() {
      try {
        // Our own history.go() below fires this too. That one is bookkeeping,
        // not somebody pressing Back.
        if (selfPop.current) { selfPop.current = false; return; }
        if (pushed.current > 0) {
          pushed.current -= 1;
          closeRef.current();
        }
      } catch {
        /* a history listener must never take the screen down with it */
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // UNMOUNTING WITH AN ENTRY STILL PUSHED.
  //
  // Half the overlays in this app are rendered only while open — the parent
  // drops them and they pass a constant depth of 1. Those never see depth fall
  // to 0, so the entry has to be handed back on unmount instead.
  //
  // GUARDED, because a router navigation also unmounts them: calling back()
  // then would undo the page the person just asked for. Only give the entry
  // back if the entry on top is still OURS. Same guard VideoZoom has used since
  // it shipped, which is the reason that one has never misbehaved.
  useEffect(() => {
    return () => {
      try {
        if (typeof window === "undefined" || pushed.current <= 0) return;
        const st = window.history.state as { symOverlay?: number } | null;
        if (st && typeof st.symOverlay === "number") {
          selfPop.current = true;
          window.history.go(-pushed.current);
        }
        pushed.current = 0;
      } catch {
        /* noop */
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.history || typeof window.history.pushState !== "function") return;

      if (depth > pushed.current) {
        for (let i = pushed.current; i < depth; i++) {
          window.history.pushState({ symOverlay: i + 1 }, "");
        }
        pushed.current = depth;
      } else if (depth < pushed.current) {
        // Closed from inside the app (✕, Save, Cancel, a tap outside). Give the
        // entries back, or the history grows every time something is opened and
        // shut and Back needs as many presses as overlays ever opened.
        const excess = pushed.current - depth;
        pushed.current = depth;
        selfPop.current = true;
        window.history.go(-excess);
        // If that go() produces no popstate — already at the bottom of the
        // stack, say — the flag would stay armed and swallow the NEXT real
        // Back. This app has shipped a dead Back button twice already; it is
        // not doing it a third time over an unset boolean.
        window.setTimeout(() => { selfPop.current = false; }, 300);
      }
    } catch {
      /* see the header: degrade to the old behaviour, never throw */
    }
  }, [depth]);
}
