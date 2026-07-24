"use client";

// ============================================================================
// Nutrition v3 — AI coach chat: floating ✦ button → bottom-sheet chat.
// Talks to POST /api/nutrition-ai/coach { question, clientId } (cookie-auth,
// metered server-side: 429 {capExceeded} per-client daily cap, 200 {paused}
// global kill switch — both rendered as friendly coach bubbles).
// suggestions[] from the coach render as one-tap "Apply to today" chips; the
// parent applies each delta as a quick-log extra row (positions 6/7) via the
// existing v3 write helpers, so the macro bar updates instantly.
// Conversation is in-memory per open — closing the sheet resets it.
// Respects client_app_settings.coach_enabled (button hidden when false; a
// missing column / read error fails open so the coach stays available).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { kcalOf } from "@/lib/nutrition/dailyTotals";
import Sheet from "./Sheet";

export interface CoachSuggestion {
  label: string;
  delta: { p: number; c: number; f: number; kcal: number };
}

interface Msg {
  role: "client" | "coach";
  text: string;
  suggestions?: CoachSuggestion[];
}

const QUICK_CHIPS = [
  "How's my adherence this week?",
  "Am I on track with protein today?",
  "What should I adjust?",
];

const CAP_MESSAGE =
  "You've maxed out Coach for today — I'll be back with fresh answers tomorrow. Everything you log still counts as normal.";
const GREETING =
  "Hey — I'm your coach. I can see your logs, targets and trends. Ask me anything, or tap a question below.";

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function parseSuggestions(raw: unknown): CoachSuggestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CoachSuggestion[] = [];
  for (const s of raw.slice(0, 3)) {
    if (!s || typeof s !== "object") continue;
    const o = s as { label?: unknown; delta?: Record<string, unknown> | null };
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label || !o.delta || typeof o.delta !== "object") continue;
    const p = num(o.delta.p), c = num(o.delta.c), f = num(o.delta.f);
    const kcal = o.delta.kcal != null ? num(o.delta.kcal) : kcalOf(p, c, f);
    if (!p && !c && !f && !kcal) continue;
    out.push({ label, delta: { p, c, f, kcal } });
  }
  return out.length ? out : undefined;
}

function fmtDelta(d: CoachSuggestion["delta"]): string {
  const sign = (n: number) => (n > 0 ? "+" : "") + Math.round(n);
  const parts: string[] = [];
  if (d.p) parts.push(`${sign(d.p)}P`);
  if (d.c) parts.push(`${sign(d.c)}C`);
  if (d.f) parts.push(`${sign(d.f)}F`);
  parts.push(`${sign(d.kcal)} cal`);
  return parts.join(" · ");
}

export default function CoachChatSheet({
  clientId,
  onApplySuggestion,
}: {
  clientId: string;
  /** Writes the delta as a quick-log extra row (positions 6/7) for today. */
  onApplySuggestion: (s: CoachSuggestion) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(true); // client_app_settings.coach_enabled
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [capped, setCapped] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set()); // "msgIdx:sugIdx"
  const [applying, setApplying] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("client_app_settings")
          .select("coach_enabled")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!on || error) return; // column not deployed yet → coach stays on
        if ((data as { coach_enabled?: boolean | null } | null)?.coach_enabled === false) setEnabled(false);
      } catch { /* fail open */ }
    })();
    return () => { on = false; };
  }, [supabase, clientId]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, sending, open]);

  function openChat() {
    // Fresh conversation each open (no persistence tonight).
    setMsgs([{ role: "coach", text: GREETING }]);
    setInput("");
    setCapped(false);
    setApplied(new Set());
    setApplying(null);
    setOpen(true);
  }

  async function send(q: string) {
    const question = q.trim();
    if (!question || sending || capped) return;
    setMsgs((m) => [...m, { role: "client", text: question }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/nutrition-ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, clientId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { message?: string; suggestions?: unknown; error?: string; paused?: boolean; capExceeded?: boolean }
        | null;
      if (res.status === 429 || json?.capExceeded) {
        setCapped(true);
        setMsgs((m) => [...m, { role: "coach", text: CAP_MESSAGE }]);
        return;
      }
      if (json?.paused) {
        // Global kill switch — server sends a friendly body with HTTP 200.
        setMsgs((m) => [...m, {
          role: "coach",
          text: json.message || json.error || "AI features are taking a short break this month — you can still log everything manually.",
        }]);
        return;
      }
      if (!res.ok || !json || (!json.message && !json.error)) {
        setMsgs((m) => [...m, { role: "coach", text: "Hmm — I couldn't answer that one. Give it another try in a moment." }]);
        return;
      }
      if (!json.message && json.error) {
        setMsgs((m) => [...m, { role: "coach", text: json.error! }]);
        return;
      }
      setMsgs((m) => [...m, { role: "coach", text: json.message!, suggestions: parseSuggestions(json.suggestions) }]);
    } catch {
      setMsgs((m) => [...m, { role: "coach", text: "Network hiccup — check your connection and try again." }]);
    } finally {
      setSending(false);
    }
  }

  async function apply(mi: number, si: number, s: CoachSuggestion) {
    const key = mi + ":" + si;
    if (applied.has(key) || applying) return;
    setApplying(key);
    try {
      await onApplySuggestion(s);
      setApplied((prev) => new Set(prev).add(key));
    } finally {
      setApplying(null);
    }
  }

  if (!enabled) return null;

  const canSend = !!input.trim() && !sending && !capped;

  return (
    <>
      {!open && (
        <button
          onClick={openChat}
          aria-label="Ask your coach"
          className="fixed flex items-center justify-center"
          style={{
            right: 16,
            bottom: "calc(env(safe-area-inset-bottom) + 82px)", // clears the bottom nav
            zIndex: 1100, // under the sheets (z-1200)
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--brand-primary)",
            color: "#fff",
            fontSize: 22,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          ✦
        </button>
      )}

      {open && (
        <Sheet title="✦ Coach" subtitle="Grounded in your logs, targets & trends" onClose={() => setOpen(false)}>
          <style>{`@keyframes coachdot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }`}</style>
          <div style={{ display: "flex", flexDirection: "column", height: "62vh" }}>
            {/* messages */}
            <div ref={listRef} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: 8 }}>
              {msgs.map((msg, mi) => (
                <div key={mi} className="flex flex-col mb-2" style={{ alignItems: msg.role === "client" ? "flex-end" : "flex-start" }}>
                  <div
                    className="text-[13px] leading-relaxed"
                    style={{
                      maxWidth: "82%",
                      padding: "9px 13px",
                      whiteSpace: "pre-wrap",
                      ...(msg.role === "client"
                        ? { background: "var(--brand-primary)", color: "#fff", borderRadius: "16px 16px 4px 16px" }
                        : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: "16px 16px 16px 4px" }),
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.suggestions?.map((s, si) => {
                    const key = mi + ":" + si;
                    const done = applied.has(key);
                    const busy = applying === key;
                    return (
                      <button
                        key={si}
                        onClick={() => apply(mi, si, s)}
                        disabled={done || !!applying}
                        className="mt-1.5 text-left"
                        style={{
                          maxWidth: "82%",
                          minHeight: 44,
                          padding: "8px 13px",
                          borderRadius: 14,
                          background: done ? "rgba(34,197,94,0.12)" : "var(--brand-surface)",
                          border: `1px solid ${done ? "rgba(34,197,94,0.5)" : "var(--brand-primary)"}`,
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <span className="block text-xs font-bold" style={{ color: done ? "#22c55e" : "var(--brand-primary)" }}>
                          {done ? "✓ Added to today" : busy ? "Adding…" : "＋ Apply to today"}
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text)" }}>
                          {s.label} <span style={{ color: "var(--brand-text-secondary)" }}>({fmtDelta(s.delta)})</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {sending && (
                <div className="flex mb-2">
                  <div className="flex items-center gap-1" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: "16px 16px 16px 4px", padding: "12px 14px" }} aria-label="Coach is typing">
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-text-secondary)", display: "inline-block", animation: `coachdot 1.1s ease-in-out ${i * 0.18}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* quick chips */}
            <div className="flex gap-1.5 pt-2 pb-2" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", flexShrink: 0 }}>
              {QUICK_CHIPS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending || capped}
                  className="text-xs font-semibold whitespace-nowrap"
                  style={{
                    minHeight: 44,
                    padding: "0 14px",
                    borderRadius: 999,
                    background: "var(--brand-bg)",
                    border: "1px solid var(--brand-border)",
                    color: "var(--brand-text)",
                    opacity: sending || capped ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* input row */}
            <div className="flex gap-2" style={{ flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSend) send(input); }}
                placeholder={capped ? "Coach is done for today" : "Ask your coach…"}
                disabled={capped}
                maxLength={1500}
                enterKeyHint="send"
                className="flex-1 min-w-0 text-sm"
                style={{
                  height: 44,
                  padding: "0 14px",
                  borderRadius: 14,
                  background: "var(--brand-bg)",
                  border: "1px solid var(--brand-border)",
                  color: "var(--brand-text)",
                  outline: "none",
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!canSend}
                aria-label="Send"
                className="flex items-center justify-center flex-shrink-0 font-extrabold"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: canSend ? "var(--brand-primary)" : "var(--brand-bg)",
                  border: canSend ? "none" : "1px solid var(--brand-border)",
                  color: canSend ? "#fff" : "var(--brand-text-secondary)",
                  fontSize: 17,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
