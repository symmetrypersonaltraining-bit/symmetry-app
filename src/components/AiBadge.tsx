"use client";

// The face the app wears when the APP is talking.
//
// Dustin's rule, 2026-08-01: the cartoon marks AI-generated content; his real
// photo (CoachBadge) marks things that came from him. That distinction is worth
// enforcing rather than leaving to whoever writes the next card, because it is
// doing real work in both directions:
//
//   A client reading "Dustin: your focus this week is…" should be able to tell
//   whether Dustin wrote that sentence. If everything wears his face, nothing
//   does, and his actual coaching stops carrying any extra weight.
//
//   And an AI line that looks like a human line is the kind of small dishonesty
//   people notice eventually and then distrust everything around.
//
// So: <AiBadge /> for the weekly focus when it was AI-written, the food-logger
// insight, the coach chat. <CoachBadge /> only where he is genuinely the author.
//
// Same artwork as Coach Bot in the group chat, deliberately — one AI face
// across the whole app, so clients learn it once. "One face" means one face
// PER COACH: the group room keeps the bot of the coach who runs it, and a
// client's own screens wear their own coach's set.

// One face across the app, but not one EXPRESSION. Which sticker gets used is
// decided by mood in src/lib/ai/faces.ts — read the header there for why the
// expression is carrying part of the message rather than decorating it.
import { centralToday } from "@/lib/central-time";
import { faceSrc, type Mood } from "@/lib/ai/faces";
import { useCoach } from "@/lib/useCoach";

export default function AiBadge({
  size = 30,
  ring = true,
  title = "Written by the app",
  mood = "neutral",
  seed,
}: {
  size?: number;
  /** Purple ring — the same tint bot messages get in the group chat. */
  ring?: boolean;
  title?: string;
  /**
   * Which face. Defaults to the plain portrait so every call site that predates
   * the sticker set keeps its current look; surfaces that know the emotional
   * register of what they are showing pass their own.
   */
  mood?: Mood;
  /**
   * WHICH of the coach's faces, when they have uploaded several for this mood.
   *
   * Stable for a given seed, so a card does not change face between renders and
   * a server-rendered one does not mismatch on hydration. Pass something that
   * identifies the THING being shown — a message id, a date, a client id — and
   * the face varies across those while staying put within one.
   *
   * Left unset it rotates by the day: a trainer who uploads five neutrals sees
   * all five over a week rather than the same one forever.
   */
  seed?: string | number | null;
}) {
  // The VIEWER's coach's set. Same rule as CoachBadge: this art is a cartoon of
  // a specific person, so a client of Stephanie's must not be shown a cartoon
  // of Dustin telling them how their week went.
  const { botSet, faces } = useCoach();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={faceSrc(mood, botSet, faces, seed ?? centralToday())}
      alt=""
      title={title}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flex: "0 0 auto",
        background: "color-mix(in srgb, #8b5cf6 14%, transparent)",
        boxShadow: ring ? "0 0 0 1.5px rgba(139,92,246,0.55)" : "none",
      }}
    />
  );
}
