"use client";
import { createClient } from "@/lib/supabase/client";
import { startDictation } from "@/lib/dictation";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { isTrainerEmail } from "@/lib/trainer";
import AiBadge from "@/components/AiBadge";

interface Change { op: string }
interface Proposal { scheduled_workout_id: string; reason: string; summary: string; changes: Change[] }
interface Series { count: number; label: string; date: string }
interface Message {
  role: "user" | "assistant";
  content: string;
  /** base64 data URL, session-only — see the note on persistence below. */
  image?: string;
  proposal?: Proposal;
  series?: Series;
  applied?: boolean;
}

/**
 * Shrink a photo before it leaves the phone.
 *
 * A modern phone camera produces 4-8MB. Sending that over a gym's wifi is slow
 * enough to read as a hang, and the model gains nothing past about 1200px — it
 * is looking at posture and barbell positions, not counting pores. This gets a
 * typical photo to a couple of hundred KB.
 */
async function shrinkImage(file: File, maxDim = 1200, quality = 0.82): Promise<{ data: string; mediaType: string } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", quality);
    const comma = url.indexOf(",");
    if (comma < 0) return null;
    return { data: url.slice(comma + 1), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

function prettyDate(iso: string): string {
  const p = iso.split("-").map(Number);
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p[1] - 1] + " " + p[2];
}

// Extend Window for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function AIAssistant() {
  const [_ok, _setOk] = useState(false);
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      _setOk(isTrainerEmail(data.user?.email));
    });
  }, []);
  const [isTrainer, setIsTrainer] = useState(false);
  useEffect(() => {
    (async () => { try { const sb: any = createClient(); const { data } = await sb.auth.getUser(); if (isTrainerEmail(data?.user?.email)) setIsTrainer(true); } catch {} })();
  }, []);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("symmetry:open-ai", h as EventListener);
    return () => window.removeEventListener("symmetry:open-ai", h as EventListener);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [pendingImage, setPendingImage] = useState<{ data: string; mediaType: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const pathname = usePathname();
  // On a workout page (/workout/<scheduled-workout-id>) the assistant becomes a
  // workout-aware programming partner scoped to THAT workout + its client.
  const focusWorkoutId = (() => { const m = (pathname || "").match(/^\/workout\/([^/?#]+)/); return m ? m[1] : null; })();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  // Bring back the last conversation. The drawer used to hold it in React state
  // only, so walking to the gym floor and coming back left Dustin with a blank
  // box — for a tool used between clients that is the difference between a
  // conversation and a series of unrelated questions. Server-side, so it also
  // survives moving from his phone to a laptop.
  useEffect(() => {
    if (!open || !isTrainer || restored.current) return;
    restored.current = true;
    (async () => {
      try {
        const res = await fetch("/api/agent/session", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        const saved = Array.isArray(j?.messages) ? (j.messages as Message[]) : [];
        if (saved.length) setMessages((cur) => (cur.length ? cur : saved));
      } catch {
        /* a missing memory is not a reason to break the drawer */
      }
    })();
  }, [open, isTrainer]);

  const clearThread = useCallback(async () => {
    setMessages([]);
    setPendingImage(null);
    setError(null);
    try { await fetch("/api/agent/session", { method: "DELETE" }); } catch { /* noop */ }
  }, []);

  const attachPhoto = useCallback(async (file: File | null) => {
    if (!file) return;
    setAttaching(true);
    setError(null);
    try {
      const shrunk = await shrinkImage(file);
      if (!shrunk) setError("Couldn't read that image — try a different one.");
      else setPendingImage(shrunk);
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const getContext = useCallback(() => {
    return `Current page: ${pathname}. Trainer mode: ${isTrainer}. Time: ${new Date().toLocaleTimeString()}.`;
  }, [pathname, isTrainer]);

  const sendMessage = useCallback(async (text: string) => {
    // A photo on its own is a legitimate message — "what do you make of this?"
    // is implied. Requiring text alongside it would be pedantry.
    if ((!text.trim() && !pendingImage) || loading) return;
    setError(null);
    const img = pendingImage;
    const userMsg: Message = {
      role: "user",
      content: text.trim() || (img ? "What do you make of this?" : ""),
      image: img ? `data:${img.mediaType};base64,${img.data}` : undefined,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setPendingImage(null);
    setLoading(true);

    try {
      // Full agent for the trainer: can look up any client and read/adjust
      // anything (esp. programming) via tools. Passes what he's currently
      // viewing so it can act on the workout/page in front of him.
      const endpoint = isTrainer ? "/api/agent" : "/api/ai-assistant";
      const pageContext = `Current page: ${pathname}.` + (focusWorkoutId ? ` Currently viewing scheduled workout id ${focusWorkoutId}.` : "");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Turns with a photo go up as Anthropic content blocks; everything else
        // stays a plain string, so nothing about the existing path changes.
        body: JSON.stringify(
          isTrainer
            ? {
                messages: updated.map((m) =>
                  m.image
                    ? {
                        role: m.role,
                        content: [
                          { type: "image", source: { type: "base64", media_type: m.image.slice(5, m.image.indexOf(";")), data: m.image.slice(m.image.indexOf(",") + 1) } },
                          { type: "text", text: m.content },
                        ],
                      }
                    : { role: m.role, content: m.content },
                ),
                pageContext,
              }
            : { messages: updated, context: getContext() },
        ),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "AI assistant unavailable. Please try again later.");
        return;
      }
      const data = await res.json();
      if (data.error) setError(data.error);
      else setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, getContext, focusWorkoutId, isTrainer, pathname, pendingImage]);

  const applyChange = useCallback(async (idx: number, proposal: Proposal, applyScope: "one" | "series") => {
    if (applyingIdx != null) return;
    setApplyingIdx(idx);
    try {
      const res = await fetch("/api/workout-assist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: proposal, applyScope, focusWorkoutId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setMessages(prev => prev.map((m, i) => (i === idx ? { ...m, applied: true } : m)));
        setMessages(prev => [...prev, { role: "assistant", content: "✅ " + (data.message || "Applied.") }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: (data && data.message) || "Couldn't apply that — try again." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error applying the change — try again." }]);
    } finally { setApplyingIdx(null); }
  }, [applyingIdx, focusWorkoutId]);

  const startVoice = useCallback(() => {
    // Unified dictation: works in the native app (Capacitor speech plugin) AND
    // the browser. The raw webkitSpeechRecognition path is dead inside the APK.
    recognitionRef.current = startDictation({
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
      onResult: (transcript) => {
        if (transcript) { setInput(transcript); sendMessage(transcript); }
      },
      onUnavailable: () => { setListening(false); setError("Voice input isn't available here."); },
    });
  }, [sendMessage]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Clearing has to reach the SERVER now, or the thread comes back on the next
  // open and the bin button reads as broken.
  const clearChat = () => { void clearThread(); };

  // Initial greeting
  const isEmpty = messages.length === 0;

  if (!_ok) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="!hidden fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--brand-primary)" }}
          aria-label="Open AI assistant"
        >
          <AiBadge size={40} mood="neutral" ring={false} title="" />
        </button>
      )}

      {/* Chat drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 pointer-events-auto"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className="relative pointer-events-auto flex flex-col rounded-t-2xl lg:rounded-2xl shadow-2xl"
            style={{
              background: "var(--brand-surface)",
              width: "min(420px, 100vw)",
              height: "min(600px, 85vh)",
              marginBottom: 0,
              border: "1px solid var(--brand-border)",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-t-2xl flex-shrink-0"
              style={{ background: "var(--brand-primary)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              {/* The face, not a sparkles glyph. This is the trainer's own AI and
                  it was the only assistant in the app with no face at all —
                  which made it the one surface where "is this the app or a
                  person" had no visual answer. */}
              <AiBadge size={32} mood="explaining" ring={false} title="" />
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Symmetry AI</p>
                <p className="text-white/60 text-xs">Powered by Claude</p>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearChat}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                    <i className="ti ti-trash text-sm" />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                  <i className="ti ti-x text-sm" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isEmpty && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="mb-4"><AiBadge size={64} mood="neutral" ring={false} title="" /></div>
                  <p className="font-semibold text-sm mb-1" style={{ color: "var(--brand-text)" }}>Symmetry AI Assistant</p>
                  <p className="text-xs mb-4" style={{ color: "var(--brand-text-secondary)" }}>
                    Ask me about programming, exercises, client progress, or any training question.
                  </p>
                  {isTrainer && (
                    <div className="w-full space-y-2">
                      {[
                        "Write a P2 upper body workout for a client with rounded shoulders",
                        "What progression markers should I look for before moving to P3?",
                        "Suggest accessory exercises for knee stability",
                      ].map((s) => (
                        <button key={s} onClick={() => sendMessage(s)}
                          className="w-full text-left text-xs px-3 py-2.5 rounded-xl transition-colors"
                          style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {!isTrainer && (
                    <div className="w-full space-y-2">
                      {[
                        "What is today's workout?",
                        "Why are we doing corrective exercises?",
                        "How do I know if I'm making progress?",
                      ].map((s) => (
                        <button key={s} onClick={() => sendMessage(s)}
                          className="w-full text-left text-xs px-3 py-2.5 rounded-xl transition-colors"
                          style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i}>
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="mr-2 mt-1 flex-shrink-0"><AiBadge size={28} mood="explaining" title="" /></div>
                    )}
                    <div
                      className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed"
                      style={{
                        background: m.role === "user" ? "var(--brand-primary)" : "var(--brand-card)",
                        color: m.role === "user" ? "white" : "var(--brand-text)",
                        borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                      }}
                    >
                      {m.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.image} alt="Sent" style={{ maxWidth: "100%", borderRadius: 10, marginBottom: m.content ? 6 : 0, display: "block" }} />
                      )}
                      {m.content}
                    </div>
                  </div>
                  {m.proposal && (
                    <div className="ml-9 mt-2 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--brand-primary) 7%, transparent)", border: "1px solid var(--brand-primary)" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--brand-primary)", letterSpacing: 0.3, marginBottom: 4 }}>PROPOSED CHANGE</div>
                      <div style={{ fontSize: 12.5, color: "var(--brand-text)", lineHeight: 1.5, marginBottom: 4 }}>{m.proposal.summary}</div>
                      {m.proposal.reason && <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginBottom: 9 }}>Why: {m.proposal.reason}</div>}
                      {m.applied ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#16A34A" }}>✓ Applied</div>
                      ) : m.series && m.series.count > 1 ? (
                        <div>
                          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginBottom: 6 }}>Just this session, or all {m.series.count} upcoming {m.series.label} sessions?</div>
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => applyChange(i, m.proposal!, "one")} disabled={applyingIdx != null} style={{ fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--brand-primary)", background: "var(--brand-surface)", color: "var(--brand-primary)", cursor: "pointer" }}>{applyingIdx === i ? "…" : `Just ${prettyDate(m.series.date)}`}</button>
                            <button onClick={() => applyChange(i, m.proposal!, "series")} disabled={applyingIdx != null} style={{ fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 9, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer" }}>{applyingIdx === i ? "Applying…" : `All ${m.series.count} sessions`}</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => applyChange(i, m.proposal!, "one")} disabled={applyingIdx != null} style={{ fontSize: 12.5, fontWeight: 800, padding: "8px 14px", borderRadius: 9, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer" }}>{applyingIdx === i ? "Applying…" : "Apply change"}</button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  {/* `thinking` while it thinks — the mood registry exists so the
                      face can carry state the copy hasn't got round to saying. */}
                  <div className="mr-2 mt-1 flex-shrink-0"><AiBadge size={28} mood="thinking" title="" /></div>
                  <div className="rounded-2xl px-4 py-3 flex items-center gap-1.5"
                    style={{ background: "var(--brand-card)", borderRadius: "4px 18px 18px 18px" }}>
                    {[0, 1, 2].map(d => (
                      <div key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: "var(--brand-text-secondary)", animationDelay: `${d * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl px-3 py-2 text-xs"
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {pendingImage && (
              <div className="flex items-center gap-2 px-3 pt-2 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${pendingImage.mediaType};base64,${pendingImage.data}`} alt="Attached"
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
                <span className="text-xs flex-1" style={{ color: "var(--brand-text-secondary)" }}>Photo attached</span>
                <button onClick={() => setPendingImage(null)} className="text-xs font-semibold" style={{ background: "none", border: "none", color: "var(--brand-primary)", cursor: "pointer" }}>Remove</button>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--brand-border)" }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => attachPhoto(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading || attaching}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}
                title="Attach a photo"
              >
                <i className={`ti ${attaching ? "ti-loader-2" : "ti-photo"} text-base`}
                  style={{ color: "var(--brand-text-secondary)", animation: attaching ? "spin 0.8s linear infinite" : "none" }} />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={focusWorkoutId ? "Ask or adjust this workout…" : "Ask anything about training…"}
                className="flex-1 text-sm px-3.5 py-2.5 rounded-xl outline-none"
                style={{
                  background: "var(--brand-bg)",
                  color: "var(--brand-text)",
                  border: "1px solid var(--brand-border)",
                }}
                disabled={loading}
              />
              <button
                onClick={listening ? stopVoice : startVoice}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  background: listening ? "#ef4444" : "var(--brand-card)",
                  border: "1px solid var(--brand-border)",
                }}
                title={listening ? "Stop recording" : "Voice input"}
              >
                <i className={`ti ${listening ? "ti-microphone-off" : "ti-microphone"} text-base`}
                  style={{ color: listening ? "white" : "var(--brand-text-secondary)" }} />
              </button>
              <button
                onClick={() => sendMessage(input)}
                disabled={(!input.trim() && !pendingImage) || loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: (input.trim() || pendingImage) && !loading ? "var(--brand-primary)" : "var(--brand-card)",
                  border: "1px solid var(--brand-border)",
                }}
              >
                <i className="ti ti-send text-base"
                  style={{ color: (input.trim() || pendingImage) && !loading ? "white" : "var(--brand-text-secondary)" }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
