"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

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
  // The in-studio path. Dustin is standing next to them — a QR they scan off his
  // phone beats an email that lands in spam and a password they have to type.
  const [qr, setQr] = useState<string | null>(null);

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
      if (data.oneTapUrl) {
        try {
          setQr(await QRCode.toDataURL(data.oneTapUrl, { width: 320, margin: 1 }));
        } catch { /* the email still went; the QR is a shortcut, not the flow */ }
      }
      setState("sent");
      setTimeout(() => router.refresh(), 1500);
    } catch (e: any) {
      setErrMsg(e.message);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  if (qr) {
    return (
      <div onClick={() => setQr(null)}
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(8,10,18,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <p style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: "0 0 4px" }}>{clientName}</p>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, margin: "0 0 16px", textAlign: "center", maxWidth: 280, lineHeight: 1.45 }}>
          Have them scan this with their phone camera. It signs them in, sets a
          password and puts the app on their home screen.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Invite QR code" style={{ width: 280, height: 280, borderRadius: 16, background: "#fff", padding: 10 }} />
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11.5, marginTop: 14 }}>
          The same link is in their email. Tap anywhere to close.
        </p>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: "rgba(34,197,94,0.3)", color: "white" }}>
        {'✓'} Invite sent!
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
      {state === "sending" ? "Sending..." : <>{'✉'} Invite to App</>}
    </button>
  );
}
