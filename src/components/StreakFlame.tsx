"use client";

/**
 * StreakFlame — the flame gets bigger and hotter the longer the run. (#61)
 * 2026-07-25.
 *
 * A streak counter is a number; a flame that visibly grows is a thing people
 * don't want to put out. Six tiers, so there's always a next one visible, and
 * the jumps land on the intervals that actually mean something in training:
 * a week, two weeks, a month, two months, a quarter.
 *
 * The emoji itself changes at the top tier — 🔥 becomes ☄️ at 90 days, which
 * is rare enough that most people will never have seen it on someone else's
 * screen.
 *
 * Purely presentational. No data fetching, no state, no side effects.
 */

interface Tier {
  min: number;
  size: number; // px
  glow: number; // 0–1
  speed: number; // seconds per flicker cycle — faster = hotter
  emoji: string;
  label: string;
}

// Ordered high to low so the first match wins.
const TIERS: Tier[] = [
  { min: 90, size: 25, glow: 1.0, speed: 0.85, emoji: "☄️", label: "Ninety days. That's a different person." },
  { min: 60, size: 23, glow: 0.85, speed: 1.0, emoji: "🔥", label: "Two months unbroken." },
  { min: 30, size: 21, glow: 0.7, speed: 1.15, emoji: "🔥", label: "A full month." },
  { min: 14, size: 19, glow: 0.5, speed: 1.3, emoji: "🔥", label: "Two weeks running." },
  { min: 7, size: 17.5, glow: 0.34, speed: 1.45, emoji: "🔥", label: "A week straight." },
  { min: 1, size: 16, glow: 0.18, speed: 1.6, emoji: "🔥", label: "It's lit." },
];

function tierFor(days: number): Tier {
  for (const t of TIERS) if (days >= t.min) return t;
  return TIERS[TIERS.length - 1];
}

export default function StreakFlame({
  days,
  milestone = false,
}: {
  days: number;
  /** Overrides the flame with a celebration mark on milestone days. */
  milestone?: boolean;
}) {
  if (days <= 0) return null;
  const t = tierFor(days);

  // Warm the colour with the tier: amber at the bottom, white-hot at the top.
  const glowColor = `rgba(255, ${Math.round(170 - t.glow * 60)}, ${Math.round(60 + t.glow * 40)}, ${0.25 + t.glow * 0.5})`;

  return (
    <span
      title={t.label}
      aria-label={days + " day streak"}
      style={{
        display: "inline-block",
        fontSize: t.size,
        lineHeight: 1,
        filter: t.glow > 0.25 ? `drop-shadow(0 0 ${2 + t.glow * 7}px ${glowColor})` : undefined,
        animation: `cw-flame-rise ${t.speed}s ease-in-out infinite`,
        transformOrigin: "50% 90%",
      }}
    >
      {milestone ? "🎉" : t.emoji}
    </span>
  );
}
