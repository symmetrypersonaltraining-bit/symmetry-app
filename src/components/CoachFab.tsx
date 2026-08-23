"use client";

// The one floating ✦.
//
// Dustin, 2026-08-12: "everywhere is fine but you need to be extremely careful
// where you mount it. it needs to fit on every screen and cannot cover
// anything." And, on the logger specifically: "when the keyboard comes up, it
// can cover things."
//
// So the rules are in ONE component rather than re-derived at each mount site:
//
//   · it sits above the bottom nav, in the safe area, on the right;
//   · it disappears entirely while a soft keyboard is up — a 52px circle
//     floating over a numeric keypad is exactly the thing that covers the field
//     you are typing into;
//   · it sits UNDER the sheets (z 1100 vs 1200), so opening one never leaves
//     the button hovering on top of its own panel;
//   · it wears a face, chosen by surface, so the coach reads as the same
//     character everywhere instead of a generic sparkle.

import { faceSrc, type Mood } from "@/lib/ai/faces";
import { useCoach } from "@/lib/useCoach";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

/** Big enough for the face to read, small enough not to be in the way. */
const SIZE = 56;

export default function CoachFab({
  onClick,
  mood = "neutral",
  label = "Ask your coach",
  /** Extra lift, for a screen with something else already in that corner. */
  liftPx = 0,
}: {
  onClick: () => void;
  mood?: Mood;
  label?: string;
  liftPx?: number;
}) {
  // The viewer's own coach's face set — see faceSrc().
  const { botSet, faces } = useCoach();
  const kb = useKeyboardInset();
  // Not "moved up" — gone. There is no position on a phone where a floating
  // button and an open keyboard both fit without one covering something.
  if (kb > 0) return null;

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed flex items-center justify-center"
      style={{
        right: 16,
        // The extra var is set by SessionDock while a workout is in progress: that
        // bar lives in the same corner and the coach would sit on its text.
        bottom: `calc(env(safe-area-inset-bottom) + ${82 + liftPx}px + var(--sym-dock-lift, 0px))`,
        zIndex: 1100,
        width: SIZE,
        height: SIZE,
        padding: 0,
        border: "none",
        // No coloured disc behind it and no circular clip. The sticker already
        // IS a disc with its own white ring, and clipping a 56px circle out of
        // it shaved the arms off every flexing pose. The drop-shadow follows
        // the alpha, so it hugs the artwork instead of boxing it.
        background: "transparent",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={faceSrc(mood, botSet, faces)}
        alt=""
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE,
          height: SIZE,
          objectFit: "contain",
          display: "block",
          filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))",
        }}
      />
    </button>
  );
}
