"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Extend Window for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function AIAssistant({ isTrainer }: { isTrainer: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const getContext = useCallback(() => {
    return `Current page: ${pathname}. Trainer mode: ${isTrainer}. Time: ${new Date().toLocaleTimeString()}.`;
  }, [pathname, isTrainer]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setError(null);
    const userMsg: Message = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, context: getContext() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "AI assistant unavailable. Please try again later.");
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, getContext]);

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice not supported in this browser. Use Chrome.");
      return;
    }
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Voice error. Try again."); };
    recognition.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript) {
        setInput(transcript);
        sendMessage(transcript);
      }
    };
    recognition.start();
  }, [sendMessage]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  // Initial greeting
  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--brand-primary)" }}
          aria-label="Open AI assistant"
        >
          <i className="ti ti-sparkles text-2xl" style={{ color: "white" }} />
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
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <i className="ti ti-sparkles text-sm" style={{ color: "white" }} />
              </div>
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
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: "var(--brand-primary)" + "20" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--brand-primary)" aria-hidden="true">
                      <path d="M12 2l1.7 4.6L18 8.3l-4.3 1.7L12 14.6l-1.7-4.6L6 8.3l4.3-1.7z"/>
                      <path d="M18.5 13l.85 2.15L21.5 16l-2.15.85L18.5 19l-.85-2.15L15.5 16l2.15-.85z"/>
                    </svg>
                  </div>
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
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0"
                      style={{ background: "var(--brand-primary)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                    </div>
                  )}
                  <div
                    className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed"
                    style={{
                      background: m.role === "user" ? "var(--brand-primary)" : "var(--brand-card)",
                      color: m.role === "user" ? "white" : "var(--brand-text)",
                      borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0"
                    style={{ background: "var(--brand-primary)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                  </div>
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
            <div className="flex items-center gap-2 p-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--brand-border)" }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Ask anything about trainingâ¦"
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
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: input.trim() && !loading ? "var(--brand-primary)" : "var(--brand-card)",
                  border: "1px solid var(--brand-border)",
                }}
              >
                <i className="ti ti-send text-base"
                  style={{ color: input.trim() && !loading ? "white" : "var(--brand-text-secondary)" }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
