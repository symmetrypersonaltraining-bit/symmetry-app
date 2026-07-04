"use client";
import { useEffect, useState } from "react";

const COLORS = ["#ff6b6b", "#ff9f5a", "#ffd36e", "#5ec9a3", "#7c9cf5", "#8b6ff0", "#e5399b"];

/**
 * Full-screen one-shot confetti burst. Fixed overlay, pointer-events:none so it
 * can never block the UI. Self-removes after `duration`. Respects reduced-motion.
 * Purely presentational — no data access.
 */
export default function Confetti({
  pieces = 90,
  duration = 2200,
  onDone,
}: {
  pieces?: number;
  duration?: number;
  onDone?: () => void;
}) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setOn(false);
      onDone && onDone();
      return;
    }
    const t = setTimeout(() => {
      setOn(false);
      onDone && onDone();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);
  if (!on) return null;
  const bits = Array.from({ length: pieces }, (_, i) => {
    const left = Math.random() * 100;
    const cx = (Math.random() * 2 - 1) * 40;
    const cy = 60 + Math.random() * 40;
    const cr = Math.random() * 720 - 360;
    const delay = Math.random() * 0.2;
    const size = 6 + Math.random() * 8;
    const color = COLORS[i % COLORS.length];
    const style: React.CSSProperties = {
      position: "absolute",
      top: "-5vh",
      left: left + "%",
      width: size,
      height: size * 0.6,
      background: color,
      borderRadius: 2,
      ["--cx" as any]: cx + "vw",
      ["--cy" as any]: cy + "vh",
      ["--cr" as any]: cr + "deg",
      animation: `cw-confetti-fall ${duration}ms cubic-bezier(.2,.6,.4,1) ${delay}s forwards`,
    };
    return <span key={i} style={style} />;
  });
  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}
    >
      {bits}
    </div>
  );
}
