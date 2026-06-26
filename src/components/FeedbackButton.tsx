"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<"like" | "change" | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const buzz = (ms: number | number[]) => { try { (navigator as any).vibrate && (navigator as any).vibrate(ms as any); } catch {} };

  async function submit() {
    if (!msg.trim() && !sentiment) return;
    setSending(true);
    buzz([10, 40, 10]);
    try {
      const supabase: any = createClient();
      let source = "app";
      try { const m = localStorage.getItem("symmetry_view_mode"); if (m) source = m + "-app"; } catch {}
      const tag = sentiment === "like" ? "[LIKE] " : sentiment === "change" ? "[CHANGE] " : "";
      await supabase.from("app_feedback").insert({
        source,
        client_context: typeof window !== "undefined" ? window.location.pathname : null,
        transcript: tag + msg.trim(),
        status: "new",
      });
      setDone(true);
      setMsg("");
      setSentiment(null);
      setTimeout(() => { setDone(false); setOpen(false); }, 1700);
    } catch {
      setSending(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        aria-label="Send feedback"
        onClick={() => { buzz(12); setOpen((o) => !o); }}
        style={{ position: "fixed", right: 16, bottom: 96, zIndex: 1000, width: 52, height: 52, borderRadius: 16, border: "none", background: "var(--brand-primary)", color: "#fff", fontSize: 22, boxShadow: "0 8px 24px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        {open ? "\u00d7" : "\u2728"}
      </button>

      {open && (
        <div style={{ position: "fixed", right: 16, bottom: 168, zIndex: 1000, width: 290, maxWidth: "calc(100vw - 32px)", background: "var(--brand-card, #1b1f2a)", color: "var(--brand-text, #fff)", border: "1px solid var(--brand-border, rgba(255,255,255,.12))", borderRadius: 18, padding: 16, boxShadow: "0 16px 48px rgba(0,0,0,.5)" }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "18px 6px", fontWeight: 600 }}>Sent &mdash; thanks, I&apos;m on it.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Send feedback</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={() => { buzz(12); setSentiment("like"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 11, cursor: "pointer", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: sentiment === "like" ? "var(--brand-primary)" : "transparent", color: sentiment === "like" ? "#fff" : "inherit", fontWeight: 600 }}>Like</button>
                <button onClick={() => { buzz(12); setSentiment("change"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 11, cursor: "pointer", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: sentiment === "change" ? "var(--brand-primary)" : "transparent", color: sentiment === "change" ? "#fff" : "inherit", fontWeight: 600 }}>Change</button>
              </div>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="What do you like, or what should change?" style={{ width: "100%", resize: "vertical", borderRadius: 11, padding: "9px 10px", fontSize: 14, background: "var(--brand-surface, rgba(0,0,0,.25))", color: "inherit", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", boxSizing: "border-box" }} />
              <button onClick={submit} disabled={sending} style={{ marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: sending ? 0.6 : 1 }}>{sending ? "Sending..." : "Send to Coach Claude"}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
