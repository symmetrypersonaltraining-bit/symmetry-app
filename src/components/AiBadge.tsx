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
// across the whole app, so clients learn it once.

const SRC = "/coachbot.png";

export default function AiBadge({
  size = 30,
  ring = true,
  title = "Written by the app",
}: {
  size?: number;
  /** Purple ring — the same tint bot messages get in the group chat. */
  ring?: boolean;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC}
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
