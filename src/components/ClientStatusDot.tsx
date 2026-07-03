"use client";

/**
 * ClientStatusDot — pulsing roster status indicator (visual-polish #10).
 * green = on track, amber = missed a recent log, red = needs attention.
 * Self-contained: keyframe is inlined so no globals.css dependency.
 */
const CONFIG = {
  green: { color: "#22c55e", label: "On track" },
  amber: { color: "#f59e0b", label: "Missed a recent log" },
  red: { color: "#ef4444", label: "Needs attention" },
} as const;

export default function ClientStatusDot({
  status,
}: {
  status: "green" | "amber" | "red";
}) {
  const cfg = CONFIG[status];
  return (
    <span
      title={cfg.label}
      aria-label={cfg.label}
      style={{
        position: "relative",
        width: 11,
        height: 11,
        borderRadius: "50%",
        background: cfg.color,
        flexShrink: 0,
        display: "inline-block",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: cfg.color,
          animation: "cw-dot-ping 1.8s ease-out infinite",
        }}
      />
      <style>{"@keyframes cw-dot-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}"}</style>
    </span>
  );
}
