"use client";
import { useState } from "react";

/**
 * GcalSyncButton — trainer-facing manual "sync now" for the Google Calendar → app
 * sync. Calls the read-only /api/gcal-sync endpoint and shows a transient result.
 * Isolated/additive; safe to drop anywhere in the trainer app.
 *
 * `compact` renders it as a small button that sits ON the SyncHealth bar rather
 * than a full-width control beneath it — the status and the way to act on it
 * are one thought. The full-width form is kept for anywhere else it is dropped.
 */
export default function GcalSyncButton({ compact = false }: { compact?: boolean } = {}) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function sync() {
    if (status === "syncing") return;
    setStatus("syncing");
    setMsg("");
    try {
      const r = await fetch("/api/gcal-sync", { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j && j.ok) {
        setStatus("done");
        const n = typeof j.synced === "number" ? j.synced : null;
        setMsg(n !== null ? `Calendar synced · ${n} events` : "Calendar synced");
      } else {
        setStatus("error");
        setMsg("Sync failed — try again");
      }
    } catch {
      setStatus("error");
      setMsg("Sync failed — try again");
    }
    setTimeout(() => {
      setStatus("idle");
      setMsg("");
    }, 4500);
  }

  const label =
    status === "syncing" ? (compact ? "…" : "Syncing…") :
    status === "done" ? (compact ? "✓" : "✓ " + msg) :
    status === "error" ? (compact ? "⚠" : "⚠ " + msg) :
    compact ? "↻ Sync" : "↻ Sync calendar now";

  const color =
    status === "done" ? "#22c55e" :
    status === "error" ? "#ef4444" :
    "var(--brand-primary)";

  return (
    <button
      onClick={sync}
      disabled={status === "syncing"}
      aria-label="Sync calendar now"
      style={{
        width: compact ? "auto" : "100%",
        padding: compact ? "6px 11px" : "10px 14px",
        whiteSpace: "nowrap",
        borderRadius: compact ? 9 : 12,
        border: "1px solid " + color,
        background: "var(--brand-surface)",
        color,
        fontWeight: 700,
        fontSize: compact ? 12 : 13,
        cursor: status === "syncing" ? "default" : "pointer",
        opacity: status === "syncing" ? 0.7 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {label}
    </button>
  );
}
