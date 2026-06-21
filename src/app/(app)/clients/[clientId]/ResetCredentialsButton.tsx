"use client";

import { useState } from "react";

export default function ResetCredentialsButton({ clientId }: { clientId: string }) {
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleReset() {
    setStep("sending");
    try {
      const res = await fetch("/api/invite-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset");
      setStep("done");
      setTimeout(() => setStep("idle"), 3000);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "Error");
      setStep("error");
      setTimeout(() => setStep("idle"), 3000);
    }
  }

  if (step === "confirm") {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500">Reset login?</span>
        <button
          onClick={handleReset}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-500 text-white"
        >
          Confirm
        </button>
        <button
          onClick={() => setStep("idle")}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (step === "sending") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
        Resetting...
      </span>
    );
  }

  if (step === "done") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(34,197,94,0.3)", color: "white" }}>
        {'✓'} Invite resent!
      </span>
    );
  }

  if (step === "error") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(239,68,68,0.4)", color: "white" }}>
        {errMsg || "Error"}
      </span>
    );
  }

  return (
    <button
      onClick={() => setStep("confirm")}
      className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
      style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.4)" }}
    >
      {'↺'} Reset Login
    </button>
  );
}
