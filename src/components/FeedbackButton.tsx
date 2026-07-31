"use client";
import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { startDictation, type DictationHandle } from "@/lib/dictation";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const dictRef = useRef<DictationHandle | null>(null);

  function toggleMic() {
    if (listening) { dictRef.current?.stop(); setListening(false); return; }
    dictRef.current = startDictation({
      onResult: (t) => setMsg(m => (m ? m.trim() + " " : "") + t),
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
      onUnavailable: () => { setListening(false); alert("Voice input isn't available on this device — you can type your feedback."); },
    });
  }

  async function submit() {
    if (!msg.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("app_feedback").insert({
      source: user?.email ?? "client",
      client_context: typeof window !== "undefined" ? window.location.pathname : null,
      transcript: msg.trim(),
      status: "new",
    });
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
              &#10003; Thanks! Dustin will follow up.
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--brand-text,#2a3147)" }}>Send feedback to Dustin</div>
              <textarea
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder="Tell us what\'s working or what needs fixing…"
                rows={4}
                style={{
                  width: "100%", border: "1px solid var(--brand-border,#e3e9f3)", borderRadius: 10,
                  padding: "8px 10px", fontSize: 13, resize: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                  color: "var(--brand-text,#2a3147)", background: "var(--brand-bg,#f4f6fb)",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={toggleMic}
                  aria-label={listening ? "Stop dictation" : "Dictate feedback"}
                  style={{
                    flex: "0 0 44px", width: 44, background: listening ? "#e5393518" : "var(--brand-bg,#f4f6fb)",
                    color: listening ? "#e53935" : "var(--brand-primary,#7c9cf5)", border: "1px solid var(--brand-border,#e3e9f3)",
                    borderRadius: 10, fontSize: 18, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <i className={`ti ${listening ? "ti-player-stop-filled" : "ti-microphone"}`} />
                </button>
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
