"use client";

import { useCallback, useEffect, useState } from "react";
import ShareToGroup from "@/components/ShareToGroup";
import { fx } from "@/lib/fx";

/**
 * GroupChallenge — the pinned challenge board at the top of the group chat.
 * 2026-07-25.
 *
 * A time-boxed community goal ("28 sessions in 7 days") with live standings,
 * so the group thread has something to talk about that isn't the trainer
 * posting into silence.
 *
 * PRIVACY: standings come from /api/challenge, which honours the same opt-in
 * as the consistency board. Someone who hasn't opted in still sees the
 * challenge and the group total — they're just not named or ranked. The card
 * says so plainly rather than silently omitting them.
 *
 * Ranks days shown up, never weight or size. Trainer sees start/end controls;
 * clients see the board only. Renders nothing when no challenge is running and
 * the viewer isn't the trainer.
 */

interface Challenge {
  id: string;
  title: string;
  metric: string;
  starts_on: string;
  ends_on: string;
}
interface Standing {
  first: string;
  score: number;
  rank: number;
  isMe: boolean;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return MON[m - 1] + " " + d;
}
function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function daysLeft(endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(todayCT())) / 86400000));
}

const PRESETS: { title: string; metric: string; days: number }[] = [
  { title: "Show up 4 times this week", metric: "sessions", days: 7 },
  { title: "Everybody logs something, every day", metric: "logging", days: 7 },
  { title: "Two-week consistency push", metric: "sessions", days: 14 },
];

export default function GroupChallenge({ isTrainer }: { isTrainer: boolean }) {
  const [ch, setCh] = useState<Challenge | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [optedIn, setOptedIn] = useState(true);
  const [groupTotal, setGroupTotal] = useState(0);
  const [contributors, setContributors] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(PRESETS[0].title);
  const [metric, setMetric] = useState(PRESETS[0].metric);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/challenge", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setCh((j?.challenge as Challenge) || null);
      setStandings(Array.isArray(j?.standings) ? (j.standings as Standing[]) : []);
      setOptedIn(j?.optedIn !== false);
      setGroupTotal(Number(j?.groupTotal) || 0);
      setContributors(Number(j?.contributors) || 0);
      setMyScore(Number(j?.myScore) || 0);
    } catch {
      /* silent — a challenge board must never break the chat */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), metric, days }),
      });
      if (res.ok) {
        fx("complete");
        setCreating(false);
        await load();
      }
    } catch {
      /* ignore — the form stays open so they can retry */
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (busy || !ch) return;
    if (!window.confirm("End this challenge now? The board stops updating.")) return;
    setBusy(true);
    try {
      await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", id: ch.id }),
      });
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (!ch && !isTrainer) return null;

  // ── Trainer, nothing running ──────────────────────────────────────────────
  if (!ch) {
    return (
      <div style={{ margin: "10px 12px 0", padding: "11px 13px", borderRadius: 14, background: "var(--brand-surface)", border: "1px dashed var(--brand-border)" }}>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, color: "var(--brand-primary)" }}
          >
            🏁 Start a group challenge
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)", marginBottom: 8 }}>New challenge</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.title}
                  onClick={() => { setTitle(p.title); setMetric(p.metric); setDays(p.days); }}
                  style={{
                    textAlign: "left", fontSize: 11.5, padding: "7px 9px", borderRadius: 9, cursor: "pointer",
                    background: title === p.title ? "color-mix(in srgb, var(--brand-primary) 14%, transparent)" : "var(--brand-bg)",
                    border: "1px solid " + (title === p.title ? "var(--brand-primary)" : "var(--brand-border)"),
                    color: "var(--brand-text)",
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Or write your own…"
              style={{ width: "100%", fontSize: 12.5, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>Counts</span>
              {([["sessions", "days trained"], ["logging", "days anything logged"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setMetric(k)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
                    background: metric === k ? "var(--brand-primary)" : "var(--brand-bg)",
                    color: metric === k ? "#fff" : "var(--brand-text-secondary)",
                    border: "1px solid " + (metric === k ? "var(--brand-primary)" : "var(--brand-border)"),
                  }}
                >
                  {lbl}
                </button>
              ))}
              <span style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginLeft: 4 }}>for</span>
              {[7, 14, 28].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
                    background: days === d ? "var(--brand-primary)" : "var(--brand-bg)",
                    color: days === d ? "#fff" : "var(--brand-text-secondary)",
                    border: "1px solid " + (days === d ? "var(--brand-primary)" : "var(--brand-border)"),
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={start}
                disabled={busy || !title.trim()}
                style={{ flex: 1, fontSize: 12.5, fontWeight: 800, padding: "9px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Starting…" : "Start it"}
              </button>
              <button
                onClick={() => setCreating(false)}
                style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "none", background: "none", color: "var(--brand-text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Live challenge ────────────────────────────────────────────────────────
  const left = daysLeft(ch.ends_on);
  // The headline number is the WHOLE group, not just the people on the named
  // board — otherwise the challenge reads as dead until everyone opts in.
  const total = groupTotal;
  const shown = expanded ? standings : standings.slice(0, 5);
  const me = standings.find((s) => s.isMe) || null;
  const unit = ch.metric === "logging" ? "days logged" : "days trained";
  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : String(r));

  const shareText =
    "🏁 " + ch.title + " — " + total + " " + unit + " as a group so far" +
    (left > 0 ? ", " + left + (left === 1 ? " day" : " days") + " to go" : ", final day") +
    (standings[0] ? " · " + standings[0].first + " leads with " + standings[0].score : "");

  return (
    <div style={{ margin: "10px 12px 0", borderRadius: 16, overflow: "hidden", border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
      <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "11px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, minWidth: 0 }}>🏁 {ch.title}</div>
          <div style={{ fontSize: 10.5, opacity: 0.9, flex: "0 0 auto" }}>
            {left > 0 ? left + (left === 1 ? " day left" : " days left") : "Last day"}
          </div>
        </div>
        <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
          {pretty(ch.starts_on)} – {pretty(ch.ends_on)} · {total} {unit} as a group
          {contributors > 0 ? " · " + contributors + " people in" : ""}
        </div>
      </div>

      <div style={{ padding: "9px 13px 11px" }}>
        {standings.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", padding: "6px 0", lineHeight: 1.45 }}>
            The whole group counts toward the total above. Nobody has turned on the named board yet — flip on
            the consistency board in Settings → Experience to show up by name.
          </div>
        ) : (
          <>
            {shown.map((s) => (
              <div
                key={s.first + s.rank}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "5px 0",
                  fontWeight: s.isMe ? 800 : 600,
                  color: s.isMe ? "var(--brand-primary)" : "var(--brand-text)",
                }}
              >
                <span style={{ width: 20, fontSize: 12, textAlign: "center", flex: "0 0 auto" }}>{medal(s.rank)}</span>
                <span style={{ flex: 1, fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.first}{s.isMe ? " (you)" : ""}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, flex: "0 0 auto" }}>{s.score}</span>
              </div>
            ))}
            {standings.length > 5 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{ width: "100%", marginTop: 4, fontSize: 11.5, fontWeight: 700, color: "var(--brand-primary)", background: "none", border: "none", cursor: "pointer" }}
              >
                {expanded ? "Show less ▴" : "Show all " + standings.length + " ▾"}
              </button>
            )}
            {me && !shown.some((s) => s.isMe) && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--brand-border)", fontSize: 11.5, color: "var(--brand-primary)", fontWeight: 800 }}>
                You&apos;re #{me.rank} with {me.score}
              </div>
            )}
          </>
        )}

        {!optedIn && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--brand-text-secondary)", lineHeight: 1.4 }}>
            You&apos;re at <b style={{ color: "var(--brand-primary)" }}>{myScore}</b> and it counts toward the group
            total. Turn on the consistency board in Settings → Experience if you want your name on the list.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ShareToGroup text={shareText} label="Post the standings" style={{ padding: "8px 14px", fontSize: 12 }} />
          {isTrainer && (
            <button
              onClick={end}
              disabled={busy}
              style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-text-secondary)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}
            >
              End challenge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
