"use client";

// Trainer's in-app AI to review + adjust ONE client's scheduled workouts.
// Chat → the AI answers or returns a proposed change to a specific scheduled
// workout; the trainer taps Apply to commit it. Applying clones the shared
// library day into a client-owned copy and repoints only that scheduled
// session — the master library is never touched. Trainer-only surface.

import { useState } from "react";

interface Change { op: string; to_exercise?: string; exercise?: string; }
interface Proposal { scheduled_workout_id: string; reason: string; summary: string; changes: Change[]; }
interface Turn { role: "you" | "ai"; text: string; proposal?: Proposal; applied?: boolean; }

export default function ClientWorkoutAI({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const first = (clientName || "this client").split(/\s+/)[0];

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "you", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/workout-assist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, message }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) {
        setTurns((t) => [...t, { role: "ai", text: (j && j.error) || "Something went wrong — try again." }]);
      } else {
        setTurns((t) => [...t, { role: "ai", text: j.reply || "(no reply)", proposal: j.proposal || undefined }]);
      }
    } catch {
      setTurns((t) => [...t, { role: "ai", text: "Network error — try again." }]);
    } finally { setBusy(false); }
  }

  async function apply(idx: number, proposal: Proposal) {
    if (applyingIdx != null) return;
    setApplyingIdx(idx);
    try {
      const res = await fetch("/api/workout-assist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, apply: proposal }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setTurns((t) => t.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
        setTurns((t) => [...t, { role: "ai", text: "✅ " + (j.message || "Applied to " + first + "'s scheduled workout. The library is untouched.") }]);
      } else {
        setTurns((t) => [...t, { role: "ai", text: (j && j.message) || "Couldn't apply that — try again." }]);
      }
    } catch {
      setTurns((t) => [...t, { role: "ai", text: "Network error applying the change — try again." }]);
    } finally { setApplyingIdx(null); }
  }

  const card: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", padding: 14, marginBottom: 14 };

  return (
    <div style={card}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <span style={{ fontSize: 16 }}>🤖</span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>AI Workout Assist</span>
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 16, color: "var(--brand-text-secondary)" }} />
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
            Ask about or adjust {first}&rsquo;s upcoming workouts — e.g. <i>&ldquo;{first}&rsquo;s knee hurts on the leg press this week, swap it for something pain-free.&rdquo;</i> Changes apply only to {first}&rsquo;s scheduled sessions, never the library.
          </div>

          {turns.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 380, overflowY: "auto" }}>
              {turns.map((t, i) => (
                <div key={i}>
                  <div style={{ alignSelf: t.role === "you" ? "flex-end" : "flex-start", background: t.role === "you" ? "var(--brand-primary)" : "var(--brand-card)", color: t.role === "you" ? "#fff" : "var(--brand-text)", borderRadius: 12, padding: "9px 12px", fontSize: 13, lineHeight: 1.5, maxWidth: "90%", marginLeft: t.role === "you" ? "auto" : 0 }}>
                    {t.text}
                  </div>
                  {t.proposal && (
                    <div style={{ marginTop: 8, background: "color-mix(in srgb, var(--brand-primary) 7%, transparent)", border: "1px solid var(--brand-primary)", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-primary)", letterSpacing: 0.3, marginBottom: 4 }}>PROPOSED CHANGE</div>
                      <div style={{ fontSize: 13, color: "var(--brand-text)", lineHeight: 1.5, marginBottom: 4 }}>{t.proposal.summary}</div>
                      {t.proposal.reason && <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginBottom: 10 }}>Why: {t.proposal.reason}</div>}
                      {t.applied ? (
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#16A34A" }}>✓ Applied to {first}&rsquo;s workout</div>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => apply(i, t.proposal!)} disabled={applyingIdx != null} style={{ fontSize: 13, fontWeight: 800, padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", opacity: applyingIdx != null ? 0.6 : 1 }}>{applyingIdx === i ? "Applying…" : "Apply to " + first + "'s workout"}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={`Ask or adjust ${first}'s workouts…`}
              style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", outline: "none" }}
            />
            <button onClick={send} disabled={busy || !input.trim()} style={{ flex: "0 0 auto", fontSize: 13, fontWeight: 800, padding: "10px 16px", borderRadius: 12, border: "none", color: "#fff", background: input.trim() ? "var(--brand-primary)" : "#c7ccd6", cursor: input.trim() ? "pointer" : "default" }}>{busy ? "…" : "Send"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
