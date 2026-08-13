"use client";

// The review queue itself.
//
// Design constraint that drove everything here: this is 151 decisions, and a
// screen that takes ten seconds a decision is a screen that gets abandoned at
// number twenty. So each candidate shows the three things the decision actually
// turns on — the movement, the length, and the video playing — and then two
// buttons. No forms, no modals, no navigation between items.
//
// The thumbnail is a still, not an embedded player, until it is clicked. 151
// iframes would make the page unusable, and a still plus a title is enough to
// reject most of the bad ones without ever pressing play.

import { useMemo, useState } from "react";

export type Candidate = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  url: string;
  title: string | null;
  channel: string | null;
  duration_sec: number | null;
  confidence: string | null;
  note: string | null;
  status: string;
};

function videoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/embed\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function fmt(sec: number | null): string {
  if (sec == null) return "not checked";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Green under 20, amber to 30, red past it — Dustin's rule, read at a glance. */
function lengthTone(sec: number | null): string {
  if (sec == null) return "#6B7280";
  if (sec <= 20) return "#16A34A";
  if (sec <= 30) return "#CA8A04";
  return "#DC2626";
}

export default function VideoQueueClient({
  candidates,
  unverifiedCount,
}: {
  candidates: Candidate[];
  unverifiedCount: number;
}) {
  const [rows, setRows] = useState(candidates);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(unverifiedCount);

  // Shortest first among the verified, because those are the ones most likely
  // to be a straight yes. Unverified sink to the bottom — they cannot be
  // approved anyway until the duration check has run over them.
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if ((a.duration_sec == null) !== (b.duration_sec == null)) return a.duration_sec == null ? 1 : -1;
        return (a.duration_sec ?? 0) - (b.duration_sec ?? 0);
      }),
    [rows],
  );

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/video-candidates/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || "That did not save.");
        return;
      }
      // Approving supersedes the other candidates for the same exercise, so
      // drop those from the list too rather than leaving rows that would 404
      // on the next click.
      const done = rows.find((r) => r.id === id);
      setRows((prev) =>
        prev.filter((r) =>
          action === "approve" && done ? r.exercise_id !== done.exercise_id : r.id !== id,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * Runs the duration check in batches until it reports nothing left.
   *
   * It has to be driven from here rather than from the sandbox: the machine
   * these candidates were found on cannot reach youtube.com at all, so the only
   * place with a real route to it is the deployed app itself. Capped so a
   * pathological loop cannot run forever against someone's function budget.
   */
  async function verifyAll() {
    setVerifying(true);
    setVerifyMsg("Checking lengths…");
    try {
      let guard = 20;
      let totalOk = 0;
      let totalLong = 0;
      let totalDead = 0;
      while (guard-- > 0) {
        const res = await fetch("/api/video-candidates/verify", { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          setVerifyMsg(j?.error || "The check failed.");
          return;
        }
        totalOk += j.ok || 0;
        totalLong += j.too_long || 0;
        totalDead += j.dead || 0;
        setUnverified(j.remaining ?? 0);
        setVerifyMsg(`Checked ${totalOk + totalLong + totalDead}… ${j.remaining} to go`);
        // No progress and nothing left to try means every remaining row failed
        // to yield a length. Stop rather than spin.
        if (!j.checked || !j.remaining) break;
      }
      setVerifyMsg(
        `${totalOk} under ${30}s · ${totalLong} too long · ${totalDead} dead. Reload to see the queue re-sorted.`,
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      {unverified > 0 && (
        <div
          style={{
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-border, #e5e7eb)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-text)" }}>
            {unverified} candidate{unverified === 1 ? "" : "s"} have no verified length
          </div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
            They cannot be approved until they have been checked — that is what stops a
            fourteen-minute review video ending up in front of a client. This runs from the
            live app because that is the only place with a route to YouTube.
          </div>
          <button
            onClick={verifyAll}
            disabled={verifying}
            style={{
              marginTop: 10,
              background: verifying ? "#9CA3AF" : "#E53935",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "9px 16px",
              fontWeight: 800,
              fontSize: 13,
              cursor: verifying ? "default" : "pointer",
            }}
          >
            {verifying ? "Checking…" : "Check lengths"}
          </button>
          {verifyMsg && (
            <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginTop: 8 }}>{verifyMsg}</div>
          )}
        </div>
      )}

      {sorted.length === 0 && (
        <div style={{ fontSize: 14, color: "var(--brand-text-secondary)", padding: 24, textAlign: "center" }}>
          Nothing waiting. Every candidate found so far has been decided.
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {sorted.map((c) => {
          const vid = videoId(c.url);
          return (
            <div
              key={c.id}
              style={{
                background: "var(--brand-surface)",
                border: "1px solid var(--brand-border, #e5e7eb)",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <button
                onClick={() => setPlaying(playing === c.id ? null : c.id)}
                style={{
                  width: 132,
                  flex: "0 0 auto",
                  border: "none",
                  padding: 0,
                  background: "#000",
                  borderRadius: 10,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                title="Play"
              >
                {playing === c.id && vid ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${vid}?autoplay=1`}
                    style={{ width: 132, height: 78, border: "none", display: "block" }}
                    allow="autoplay; encrypted-media"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : ""}
                    alt=""
                    style={{ width: 132, height: 78, objectFit: "cover", display: "block" }}
                  />
                )}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-text)" }}>{c.exercise_name}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--brand-text-secondary)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.title || c.url}
                  {c.channel ? ` · ${c.channel}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: lengthTone(c.duration_sec) }}>
                    {fmt(c.duration_sec)}
                  </span>
                  {c.confidence && (
                    <span style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
                      match: {c.confidence}
                    </span>
                  )}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: "#2563EB" }}
                  >
                    open on YouTube
                  </a>
                </div>
                {c.note && (
                  <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 4 }}>{c.note}</div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                <button
                  onClick={() => decide(c.id, "approve")}
                  disabled={busy === c.id || c.duration_sec == null}
                  title={c.duration_sec == null ? "Check its length first" : "Use this video"}
                  style={{
                    background: c.duration_sec == null ? "#D1D5DB" : "#16A34A",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    padding: "8px 14px",
                    fontWeight: 800,
                    fontSize: 12.5,
                    cursor: c.duration_sec == null ? "not-allowed" : "pointer",
                  }}
                >
                  Use it
                </button>
                <button
                  onClick={() => decide(c.id, "reject")}
                  disabled={busy === c.id}
                  style={{
                    background: "transparent",
                    color: "#DC2626",
                    border: "1px solid #DC2626",
                    borderRadius: 9,
                    padding: "8px 14px",
                    fontWeight: 800,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  No
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
