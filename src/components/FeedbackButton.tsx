"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitFeedback } from "@/lib/feedback";
import MicButton from "@/components/MicButton";

import { useCoach } from "@/lib/useCoach";

export default function FeedbackButton() {
  const { firstName: coachFirstName } = useCoach();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  // The dictation handle and toggleMic that used to live here are MicButton's
  // job now. `listening` stays only to tint this button's own chrome. The
  // "which failure is it" wording this file pioneered was promoted INTO
  // MicButton, so every mic in the app says it now instead of just this one.

  async function submit() {
    if (!msg.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await submitFeedback(supabase, { source: user?.email ?? "client", transcript: msg.trim() });
    setSent(true);
    setSending(false);
    setMsg("");
    setTimeout(() => { setSent(false); setOpen(false); }, 2500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Send feedback"
        style={{
          position: "fixed", bottom: 80, right: 16, zIndex: 9000,
          background: "var(--brand-primary,#7c9cf5)", color: "#fff",
          border: "none", borderRadius: "50%", width: 44, height: 44,
          fontSize: 20, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        &#128172;
      </button>
      {open && (
        <div style={{
          position: "fixed", bottom: 134, right: 16, zIndex: 9001,
          // Themed rather than hardcoded white (f6d884cd sweep): this popover
          // sits on top of every page, so in a dark theme a stark white card
          // was the brightest thing on screen at 5am.
          background: "var(--brand-surface,#fff)", borderRadius: 18, padding: 18, width: 270,
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid var(--brand-border,#e3e9f3)",
        }}>
          {sent ? (
            <div style={{ textAlign: "center", padding: "12px 0", fontWeight: 700, color: "#5ec9a3", fontSize: 15 }}>
              &#10003; Thanks! {coachFirstName} will follow up.
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--brand-text,#2a3147)" }}>Send feedback to {coachFirstName}</div>
              <textarea
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder="Tell us what's working or what needs fixing…"
                rows={4}
                style={{
                  width: "100%", border: "1px solid var(--brand-border,#e3e9f3)", borderRadius: 10,
                  padding: "8px 10px", fontSize: 13, resize: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                  color: "var(--brand-text,#2a3147)", background: "var(--brand-bg,#f4f6fb)",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <MicButton
                  size={44}
                  onText={(t) => setMsg((m) => (m ? m.trim() + " " : "") + t)}
                  onListeningChange={setListening}
                  style={{
                    flex: "0 0 44px", borderRadius: 10,
                    background: listening ? "#ef4444" : "var(--brand-bg,#f4f6fb)",
                    color: listening ? "#fff" : "var(--brand-primary,#7c9cf5)",
                    border: "1px solid var(--brand-border,#e3e9f3)",
                  }}
                />
                <button
                  onClick={submit}
                  disabled={sending || !msg.trim()}
                  style={{
                    flex: 1, background: "var(--brand-primary,#7c9cf5)",
                    color: "#fff", border: "none", borderRadius: 10, padding: "10px 0",
                    fontWeight: 700, fontSize: 14, cursor: sending || !msg.trim() ? "default" : "pointer",
                    opacity: sending || !msg.trim() ? 0.6 : 1,
                  }}
                >
                  {sending ? "Sending…" : listening ? "Listening…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
