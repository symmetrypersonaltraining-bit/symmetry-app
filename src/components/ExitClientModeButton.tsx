"use client";

export default function ExitClientModeButton() {
  function exit() {
    window.location.href = "/api/set-client-mode?mode=0";
  }
  return (
    <button
      onClick={exit}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        background: "var(--brand-accent, #6C63FF)",
        color: "#fff",
        border: "none",
        borderRadius: 20,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      ← Trainer View
    </button>
  );
}
