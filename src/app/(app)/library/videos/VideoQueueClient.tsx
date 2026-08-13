"use client";

// Two lists, and the order matters.
//
// FIRST: what went in automatically. This is the list Dustin actually needs,
// because it is the one that is already live in front of clients. Every row has
// a thumbnail, a length, and an Undo — checking is optional and costs one tap,
// which is the only version of checking that gets done.
//
// SECOND: the ones that did not go in, and why. Mostly "that exercise already
// had a video" (never overwritten on purpose) and "longer than 30s" (his rule,
// but his call to break for the only decent demo of a movement).
//
// The thumbnail is a still until it is clicked. 400 iframes would make the page
// unusable, and a still plus a title is enough to spot a wrong movement without
// ever pressing play.

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
  applied_at: string | null;
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
  applied,
  waiting,
  unverifiedCount,
}: {
  applied: Candidate[];
  waiting: Candidate[];
  unverifiedCount: number;
}) {
  const [live, setLive] = useState(applied);
  const [rest, setRest] = useState(waiting);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(unverifiedCount);

  // Longest first among what went in: if anything is wrong it is most likely to
  // be the long one, so the rows worth a second look are at the top.
  const liveSorted = useMemo(
    () => [...live].sort((a, b) => (b.duration_sec ?? 0) - (a.duration_sec ?? 0)),
    [live],
  );

  async function undo(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/video-candidates/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "undo" }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || "That did not save.");
        return;
      }
      setLive((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  async function use(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/video-candidates/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "approve" }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || "That did not save.");
        return;
      }
      const row = rest.find((r) => r.id === id);
      setRest((prev) => prev.filter((r) => (row ? r.exercise_id !== row.exercise_id : r.id !== id)));
      if (row) setLive((prev) => [{ ...row, status: "approved", applied_at: new Date().toISOString() }, ...prev]);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Measure and fill, in batches, until there is nothing left to measure.
   *
   * Has to be driven from a browser (or the database scheduler) rather than
   * from a build sandbox: the machine these candidates were found on has no
   * route to youtube.com at all. Capped so a pathological loop cannot run away
   * with someone's function budget.
   */
  async function runFill() {
    setRunning(true);
    setRunMsg("Measuring…");
    try {
      let guard = 25;
      let filled = 0;
      let seen = 0;
      while (guard-- > 0) {
        const res = await fetch("/api/video-candidates/verify", { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          setRunMsg(j?.error || "That failed.");
          return;
        }
        filled += j.applied || 0;
        seen += j.checked || 0;
        setUnverified(j.remaining ?? 0);
        setRunMsg(`${filled} videos in · ${j.remaining} left to measure`);
        if (!j.checked || !j.remaining) break;
      }
      setRunMsg(`Done — ${filled} videos added from ${seen} checked. Reload to see them.`);
    } finally {
      setRunning(false);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--brand-surface)",
    border: "1px solid var(--brand-border, #e5e7eb)",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  };

  function Row({ c, action }: { c: Candidate; action: "undo" | "use" }) {
    const vid = videoId(c.url);
    return (
      <div style={card}>
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
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-text)" }}>
            {c.exercise_name}
          </div>
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
            {c.status === "too_long" && (
              <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700 }}>over 30s</span>
            )}
            <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563EB" }}>
              open on YouTube
            </a>
          </div>
        </div>

        <button
          onClick={() => (action === "undo" ? undo(c.id) : use(c.id))}
          disabled={busy === c.id}
          style={{
            flex: "0 0 auto",
            background: action === "undo" ? "transparent" : "#16A34A",
            color: action === "undo" ? "#DC2626" : "#fff",
            border: action === "undo" ? "1px solid #DC2626" : "none",
            borderRadius: 9,
            padding: "8px 14px",
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {busy === c.id ? "…" : action === "undo" ? "Wrong one" : "Use it"}
        </button>
      </div>
    );
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
            {unverified} candidate{unverified === 1 ? "" : "s"} still to measure
          </div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
            Anything that comes back under 30 seconds goes straight onto its exercise. Nothing
            with an unreadable length is used — that is what keeps a fourteen-minute review video
            off a client&rsquo;s screen mid-set. Exercises that already have a video are never
            touched.
          </div>
          <button
            onClick={runFill}
            disabled={running}
            style={{
              marginTop: 10,
              background: running ? "#9CA3AF" : "#E53935",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "9px 16px",
              fontWeight: 800,
              fontSize: 13,
              cursor: running ? "default" : "pointer",
            }}
          >
            {running ? "Working…" : "Measure and fill them in"}
          </button>
          {runMsg && (
            <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginTop: 8 }}>{runMsg}</div>
          )}
        </div>
      )}

      {liveSorted.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-text)", margin: "4px 0 4px" }}>
            Added automatically — live now
          </h2>
          <p style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
            Longest first, since that is where a wrong one is most likely to be hiding. Tap a
            thumbnail to watch it; &ldquo;Wrong one&rdquo; pulls it back off the exercise
            immediately.
          </p>
          <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
            {liveSorted.map((c) => (
              <Row key={c.id} c={c} action="undo" />
            ))}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-text)", margin: "4px 0 4px" }}>
            Found, but not used
          </h2>
          <p style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
            Either the exercise already had a video, or this one is over 30 seconds. Both are
            yours to override.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {rest.map((c) => (
              <Row key={c.id} c={c} action="use" />
            ))}
          </div>
        </>
      )}

      {liveSorted.length === 0 && rest.length === 0 && unverified === 0 && (
        <div style={{ fontSize: 14, color: "var(--brand-text-secondary)", padding: 24, textAlign: "center" }}>
          Nothing staged. Next session sources candidates for the exercises still without one.
        </div>
      )}
    </div>
  );
}
