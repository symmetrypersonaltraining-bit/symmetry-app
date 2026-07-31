"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Take a client off the active roster, or put them back.
 *
 * Archiving is a soft state (clients.archived_at) — nothing is deleted. Their
 * logs, messages, programs and payment history all stay exactly where they are
 * and still resolve by id. What changes is reach: an archived client drops out
 * of group messages and broadcasts, the attention/nudge sweeps, the weekly
 * digest, leaderboard and challenge ranking, payment reminders, and every
 * client picker. Restoring puts them straight back with nothing lost.
 */
export default function ArchiveClientButton({
  clientId,
  archived,
}: {
  clientId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "working" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function apply(nextArchived: boolean) {
    setStep("working");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived_at: nextArchived ? new Date().toISOString() : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      setStep("idle");
      router.refresh();
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "Error");
      setStep("error");
      setTimeout(() => setStep("idle"), 3000);
    }
  }

  if (step === "working") {
    return (
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
      >
        {archived ? "Restoring…" : "Archiving…"}
      </span>
    );
  }

  if (step === "error") {
    return (
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(239,68,68,0.4)", color: "white" }}
      >
        {errMsg || "Error"}
      </span>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-white/70">Off the roster? History stays.</span>
        <button
          onClick={() => apply(true)}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(239,68,68,0.85)", color: "white" }}
        >
          Archive
        </button>
        <button
          onClick={() => setStep("idle")}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (archived) {
    return (
      <button
        onClick={() => apply(false)}
        className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
        style={{ background: "rgba(34,197,94,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.4)" }}
      >
        {"↩"} Restore to roster
      </button>
    );
  }

  return (
    <button
      onClick={() => setStep("confirm")}
      className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
      style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.4)" }}
    >
      {"🗄"} Archive
    </button>
  );
}
