"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleInvite() {
    if (state !== "idle") return;
    setState("sending");
    try {
      const res = await fetch("/api/invite-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("sent");
      setTimeout(() => router.refresh(), 1500);
    } catch (e: any) {
      setErrMsg(e.message);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  if (state === "sent") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(34,197,94,0.3)", color: "white" }}>
        \u2713 Invite sent!
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(239,68,68,0.4)", color: "white" }}>
        {errMsg || "Error"}
      </span>
    );
  }

  return (
    <button
      onClick={handleInvite}
      disabled={state === "sending"}
      className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
      style={{ background: "rgba(255,255,255,0.25)", color: "white", border: "1px solid rgba(255,255,255,0.4)" }}
    >
      {state === "sending" ? "Sending..." : "\u2709 Invite to App"}
    </button>
  );
}
