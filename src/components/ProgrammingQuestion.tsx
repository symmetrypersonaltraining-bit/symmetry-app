"use client";

// The fortnightly programming question, asked where the client already is.
//
// Dustin wants to know, every couple of weeks, whether anything about someone's
// programming should change. The obvious version of this is an email or a
// survey, and the obvious version does not get answered. This sits on the
// dashboard next to their week, disappears the moment it is answered, and takes
// one sentence to reply to.
//
// It renders NOTHING unless there is an open question, so on the eleven weeks
// out of twelve when nothing is being asked it costs the client nothing.
//
// Answers go two places (see /api/program-feedback): substantive ones to
// Dustin's inbox with the question attached, and every one onto the client's
// record so it is in front of him when he next writes their block.

import { useCallback, useEffect, useState } from "react";
import { fx } from "@/lib/fx";

interface OpenQuestion {
  id: string;
  question: string;
  week_start: string;
}

export default function ProgrammingQuestion() {
  const [q, setQ] = useState<OpenQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/program-feedback", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setQ((j?.question as OpenQuestion) || null);
    } catch {
      /* a check-in prompt must never break the dashboard */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (busy || !q || !answer.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/program-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id, answer: answer.trim() }),
      });
      if (res.ok) {
        fx("complete");
        setDone(true);
      }
    } catch {
      /* leave the text on screen so nothing they typed is lost */
    } finally {
      setBusy(false);
    }
  }

  if (!q) return null;

  if (done) {
    return (
      <div
        style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderRadius: 16,
          padding: "14px 16px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--brand-primary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <i className="ti ti-circle-check" style={{ fontSize: 18 }} />
        Got it — Dustin will see this before he writes your next block.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-primary)",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: "var(--brand-primary)",
          }}
        >
          CHECK-IN FROM DUSTIN
        </span>
      </div>

      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--brand-text)", fontWeight: 600, marginBottom: 11 }}>
        {q.question}
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Tell him straight — this is how your programming gets changed."
        style={{
          width: "100%",
          fontSize: 13.5,
          lineHeight: 1.5,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--brand-border)",
          background: "var(--brand-card, var(--brand-bg))",
          color: "var(--brand-text)",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <button
        onClick={submit}
        disabled={busy || !answer.trim()}
        style={{
          width: "100%",
          marginTop: 9,
          padding: 12,
          borderRadius: 12,
          border: "none",
          background: "var(--brand-primary)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: answer.trim() ? "pointer" : "default",
          opacity: busy || !answer.trim() ? 0.55 : 1,
        }}
      >
        {busy ? "Sending…" : "Send to Dustin"}
      </button>
    </div>
  );
}
