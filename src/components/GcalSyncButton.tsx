"use client";
import { useState } from "react";

/**
 * GcalSyncButton — trainer-facing manual "sync now" for the Google Calendar → app
 * sync. Calls the read-only /api/gcal-sync endpoint and shows a transient result.
 * Isolated/additive; safe to drop anywhere in the trainer app.
 */
export default function GcalSyncButton() {
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
    status === "syncing" ? "Syncing…" :
    status === "done" ? "✓ " + msg :
    status === "error" ? "⚠ " + msg :
    "↻ Sync calendar now";

  const color =
    status === "done" ? "#22c55e" :
    status === "error" ? "#ef4444" :
    "var(--brand-primary)";

  return (
    <button
      onClick={sync}
      disabled={status === "syncing"}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid " + color,
        background: "var(--brand-surface)",
        color,
        fontWeight: 700,
        fontSize: 13,
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
