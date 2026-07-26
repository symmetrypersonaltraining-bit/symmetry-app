"use client";

// Home-screen "Coach's Read" — an AI coaching focus about the client's training
// side (workout adherence, streak, weigh-in cadence, body-comp trend), separate
// from the nutrition coach. It congratulates, encourages, adds a little humor,
// and poses ONE simple question. When the client answers, their answer + the
// question are routed to Dustin's inbox (the `messages` table) for him to review.
//
// The focus is generated at most once per client per day (server-cached), so
// mounting this on every home load costs an AI call only on the first visit.

import { useEffect, useState } from "react";
import { sendClientMessage } from "@/app/(app)/home/messageActions";
import CoachBadge from "@/components/CoachBadge";

interface FocusData { message: string; question: string | null; }

export default function CoachFocusCard() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        let clientId: string | null = null;
        try { clientId = new URLSearchParams(window.location.search).get("forClient"); } catch { clientId = null; }
        if (on) setPreviewClientId(clientId);
        const res = await fetch("/api/coach/focus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientId ? { clientId } : {}),
        });
        if (!res.ok) { if (on) { setFailed(true); setLoading(false); } return; }
        const json = await res.json();
        if (!on) return;
        if (json?.message) setData({ message: json.message, question: json.question || null });
        else setFailed(true);
      } catch {
        if (on) setFailed(true);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  async function submitAnswer() {
    if (!data || !data.question || !answer.trim() || sending) return;
    setSending(true);
    try {
      await sendClientMessage(`[Coach's Read — Dustin to review]\nQ: ${data.question}\nA: ${answer.trim()}`);
      // Clear this week's question so it won't reappear until the next cycle.
      try {
        await fetch("/api/coach/focus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAnswered: true, ...(previewClientId ? { clientId: previewClientId } : {}) }),
        });
      } catch { /* best-effort; the 7-day gate still prevents re-posing */ }
      setSent(true);
    } catch {
      // Surface a soft failure without blocking the card.
      setSent(false);
      alert("Couldn't send that to Dustin just now — try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  // Don't take up space until we know there's something to show.
  if (loading) {
    return (
      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, padding: 14, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", flex: "0 0 auto" }} />
          <div style={{ height: 10, flex: 1, borderRadius: 6, background: "var(--brand-card)" }} />
        </div>
        <div style={{ height: 10, marginTop: 10, borderRadius: 6, background: "var(--brand-card)", width: "85%" }} />
        <div style={{ height: 10, marginTop: 6, borderRadius: 6, background: "var(--brand-card)", width: "60%" }} />
      </div>
    );
  }
  if (failed || !data) return null;

  return (
    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, padding: 14, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>🧠 Coach&rsquo;s Read</div>
        <div style={{ fontSize: 10, color: "var(--brand-text-secondary)", fontWeight: 600, letterSpacing: 0.3 }}>TODAY</div>
      </div>

      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#eef2ff", border: "1px solid #dbe4ff", borderRadius: 14, padding: 11 }}>
        <CoachBadge size={30} />
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--brand-text)" }}>{data.message}</div>
      </div>

      {data.question && (
      <div style={{ marginTop: 11 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-text)", marginBottom: 7 }}>{data.question}</div>
        {sent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12, padding: "9px 11px", fontSize: 12.5, color: "#047857", fontWeight: 600 }}>
            <i className="ti ti-circle-check" /> Sent to Dustin — he&rsquo;ll see it in your messages.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }}
              placeholder="Your answer for Dustin…"
              style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", outline: "none" }}
            />
            <button
              onClick={submitAnswer}
              disabled={sending || !answer.trim()}
              style={{ flex: "0 0 auto", fontSize: 13, fontWeight: 700, padding: "10px 14px", borderRadius: 12, border: "none", color: "#fff", background: answer.trim() ? "var(--brand-primary)" : "#c7ccd6", cursor: answer.trim() ? "pointer" : "default" }}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
