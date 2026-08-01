"use client";

// A pull-to-refresh you have to MEAN.
//
// The old version armed on any downward swipe that began at scroll-top, which
// left it guessing between "refresh" and "scroll down" on every single gesture.
// The guesses were tuned with a 64px threshold, a 2.2x resistance factor, a
// fixed/sticky-ancestor check and a ten-route blocklist for screens where an
// accidental reload would destroy typed work — and it still fired when people
// meant to scroll, and stopped firing when they meant to refresh.
//
// This is a grab handle instead. It is a real element, it is only at the top of
// the page, and nothing else on screen can be mistaken for it. Pull it down and
// the page reloads; pull it a little and let go and nothing happens. Because
// intent is unambiguous, there is no blocklist and no route where refresh is
// unavailable — Dustin's ask was that it work on every page.
//
// Pointer events, not touch: one code path for finger, pen and mouse, and
// setPointerCapture means the gesture survives the finger leaving the element.

import { useCallback, useRef, useState } from "react";
import { fx } from "@/lib/fx";

const TRIGGER = 56; // px of pull that commits to a reload
const MAX = 88; // px the handle can travel
const RESISTANCE = 1.6; // finger travel : handle travel

export default function RefreshHandle() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const fired = useRef(false);

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    startY.current = e.clientY;
    fired.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — the gesture still works while the finger stays put */
    }
  }, [busy]);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (startY.current == null || busy) return;
    const raw = e.clientY - startY.current;
    if (raw <= 0) {
      setPull(0);
      return;
    }
    // The handle is touch-action: none, so the browser is not scrolling for us
    // and there is nothing to fight. No preventDefault needed.
    const next = Math.min(MAX, raw / RESISTANCE);
    if (next >= TRIGGER && !fired.current) {
      fired.current = true;
      fx("tap"); // haptic the moment it arms, so you know before you let go
    } else if (next < TRIGGER) {
      fired.current = false;
    }
    setPull(next);
  }, [busy]);

  const onUp = useCallback(() => {
    const armed = fired.current;
    startY.current = null;
    fired.current = false;
    if (armed) {
      setBusy(true);
      setPull(TRIGGER);
      fx("complete");
      // A real reload, not router.refresh(). "Refresh" here means "I don't
      // trust what is on this screen" — a soft refresh keeps client state,
      // which is often the thing that is wrong.
      try {
        window.location.reload();
      } catch {
        setBusy(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }, []);

  const armed = pull >= TRIGGER;

  return (
    <div
      data-no-refresh
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label="Pull down to refresh"
      role="button"
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        height: 16 + pull,
        cursor: "grab",
        overflow: "hidden",
        transition: pull === 0 ? "height 180ms ease" : "none",
        flexShrink: 0,
      }}
    >
      {pull > 6 && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.3,
            marginBottom: 4,
            color: armed ? "var(--brand-primary)" : "var(--brand-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <i
            className={`ti ${busy ? "ti-loader-2" : "ti-refresh"}`}
            style={{
              fontSize: 13,
              display: "inline-block",
              transform: `rotate(${busy ? 0 : Math.round((pull / TRIGGER) * 180)}deg)`,
              animation: busy ? "spin 0.8s linear infinite" : "none",
            }}
          />
          {busy ? "Refreshing…" : armed ? "Release to refresh" : "Pull to refresh"}
        </span>
      )}
      {/* The grab bar. Small and quiet when idle — it is a handle, not a
          feature — and it colours up as soon as the pull arms. */}
      <span
        style={{
          width: armed ? 54 : 38,
          height: 4,
          borderRadius: 999,
          background: armed ? "var(--brand-primary)" : "var(--brand-border)",
          marginBottom: 5,
          transition: "width 140ms ease, background 140ms ease",
        }}
      />
    </div>
  );
}
