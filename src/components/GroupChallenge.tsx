"use client";

import { useCallback, useEffect, useState } from "react";
import ShareToGroup from "@/components/ShareToGroup";
import { fx } from "@/lib/fx";

/**
 * GroupChallenge — a SLIM pinned bar at the top of the group chat that opens a
 * full drawer with the scoreboard, instructions, and a one-tap Join. 2026-07-26.
 *
 * The old card was tall and covered the thread; now the thread stays visible and
 * the details live in a drawer. Clients can JOIN (opt into the named board) right
 * from here instead of digging through Settings.
 *
 * PRIVACY: standings come from /api/challenge, which honours the same opt-in as
 * the consistency board. Non-opted-in people still count toward the group total;
 * they're just not named until they Join. Ranks days shown up, never weight/size.
 */

interface Challenge { id: string; title: string; metric: string; starts_on: string; ends_on: string; }
interface Standing { first: string; score: number; rank: number; isMe: boolean; }

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string { const [, m, d] = iso.split("-").map(Number); return MON[m - 1] + " " + d; }
function todayCT(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); }
function daysLeft(endIso: string): number { return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(todayCT())) / 86400000)); }

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
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
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
    } catch { /* silent — a challenge board must never break the chat */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), metric, days }) });
      if (res.ok) { fx("complete"); setCreating(false); await load(); }
    } catch { /* form stays open to retry */ } finally { setBusy(false); }
  }

  async function end() {
    if (busy || !ch) return;
    if (!window.confirm("End this challenge now? The board stops updating.")) return;
    setBusy(true);
    try { await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", id: ch.id }) }); await load(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }

  async function join() {
    if (joining) return;
    setJoining(true);
    try {
      const res = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join" }) });
      if (res.ok) { fx("complete"); setOptedIn(true); await load(); }
    } catch { /* ignore */ } finally { setJoining(false); }
  }

  if (!loaded) return null;
  if (!ch && !isTrainer) return null;

  const left = ch ? daysLeft(ch.ends_on) : 0;
  const me = standings.find((s) => s.isMe) || null;
  const unit = ch?.metric === "logging" ? "days logged" : "days trained";
  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : String(r));
  const howCounts = ch?.metric === "logging"
    ? "Every day you log ANYTHING (a meal or a workout) counts as 1."
    : "Every day you train AND log the session counts as 1.";

  const shareText = ch
    ? "🏁 " + ch.title + " — " + groupTotal + " " + unit + " as a group so far" +
      (left > 0 ? ", " + left + (left === 1 ? " day" : " days") + " to go" : ", final day") +
      (standings[0] ? " · " + standings[0].first + " leads with " + standings[0].score : "")
    : "";

  // ── Slim pinned bar (keeps the thread visible) ────────────────────────────
  const bar = (
    <div style={{ margin: "8px 12px 0" }}>
      <button
        onClick={() => { setOpen(true); if (!ch && isTrainer) setCreating(true); }}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 12, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 10px rgba(20,30,55,0.06)" }}
      >
        <span style={{ fontSize: 15, flex: "0 0 auto" }}>🏁</span>
        {ch ? (
          <>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</span>
            {optedIn && me ? (
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-primary)", flex: "0 0 auto" }}>You&apos;re #{me.rank}</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "var(--brand-primary)", borderRadius: 999, padding: "3px 9px", flex: "0 0 auto" }}>Join</span>
            )}
            <span style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", flex: "0 0 auto" }}>{left > 0 ? left + "d left" : "last day"}</span>
          </>
        ) : (
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--brand-primary)" }}>Start a group challenge</span>
        )}
        <i className="ti ti-chevron-right" style={{ fontSize: 16, color: "var(--brand-text-secondary)", flex: "0 0 auto" }} />
      </button>
    </div>
  );

  return (
    <>
      {bar}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(10,12,20,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", background: "var(--brand-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: "0 -8px 40px rgba(0,0,0,0.3)" }}>
            {/* Hero */}
            <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "18px 18px 16px", borderTopLeftRadius: 20, borderTopRightRadius: 20, position: "relative" }}>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 18, cursor: "pointer" }}>×</button>
              {ch ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, letterSpacing: 0.4 }}>GROUP CHALLENGE</div>
                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3, paddingRight: 34 }}>🏁 {ch.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 5 }}>
                    {pretty(ch.starts_on)} – {pretty(ch.ends_on)} · {left > 0 ? left + (left === 1 ? " day left" : " days left") : "last day"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    {groupTotal} {unit} as a group{contributors > 0 ? " · " + contributors + " people in" : ""}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 20, fontWeight: 900, paddingRight: 34 }}>🏁 New group challenge</div>
              )}
            </div>

            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Trainer create form (no challenge running) */}
              {!ch && isTrainer && creating && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)", marginBottom: 8 }}>Pick one or write your own</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {PRESETS.map((p) => (
                      <button key={p.title} onClick={() => { setTitle(p.title); setMetric(p.metric); setDays(p.days); }}
                        style={{ textAlign: "left", fontSize: 12.5, padding: "9px 11px", borderRadius: 10, cursor: "pointer", background: title === p.title ? "color-mix(in srgb, var(--brand-primary) 14%, transparent)" : "var(--brand-surface)", border: "1px solid " + (title === p.title ? "var(--brand-primary)" : "var(--brand-border)"), color: "var(--brand-text)" }}>{p.title}</button>
                    ))}
                  </div>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Or write your own…" style={{ width: "100%", fontSize: 13, padding: "10px 11px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "var(--brand-text)", marginBottom: 10 }} />
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "var(--brand-text-secondary)" }}>Counts</span>
                    {([["sessions", "days trained"], ["logging", "days anything logged"]] as const).map(([k, lbl]) => (
                      <button key={k} onClick={() => setMetric(k)} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer", background: metric === k ? "var(--brand-primary)" : "var(--brand-surface)", color: metric === k ? "#fff" : "var(--brand-text-secondary)", border: "1px solid " + (metric === k ? "var(--brand-primary)" : "var(--brand-border)") }}>{lbl}</button>
                    ))}
                    <span style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginLeft: 4 }}>for</span>
                    {[7, 14, 28].map((d) => (
                      <button key={d} onClick={() => setDays(d)} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer", background: days === d ? "var(--brand-primary)" : "var(--brand-surface)", color: days === d ? "#fff" : "var(--brand-text-secondary)", border: "1px solid " + (days === d ? "var(--brand-primary)" : "var(--brand-border)") }}>{d}d</button>
                    ))}
                  </div>
                  <button onClick={start} disabled={busy || !title.trim()} style={{ width: "100%", fontSize: 14, fontWeight: 800, padding: 13, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Starting…" : "Start challenge"}</button>
                </div>
              )}

              {ch && (
                <>
                  {/* How it works */}
                  <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 7 }}>How to compete</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--brand-text-secondary)" }}>
                      1. {howCounts}<br />
                      2. Your streak of days builds your score automatically — no manual entry.<br />
                      3. Highest total when the clock runs out wins. It ranks days shown up, never weight or size.<br />
                      4. Share your wins right here in the group chat to keep everyone fired up — use the button below to drop the standings.
                    </div>
                  </div>

                  {/* Join / your status */}
                  {!optedIn ? (
                    <div style={{ background: "color-mix(in srgb, var(--brand-primary) 8%, transparent)", border: "1px solid var(--brand-primary)", borderRadius: 14, padding: 14 }}>
                      <div style={{ fontSize: 12.5, color: "var(--brand-text)", lineHeight: 1.5, marginBottom: 10 }}>
                        You&apos;re at <b style={{ color: "var(--brand-primary)" }}>{myScore}</b> and already counting toward the group total — but you&apos;re not on the named board yet. Join to show up by name and compete.
                      </div>
                      <button onClick={join} disabled={joining} style={{ width: "100%", fontSize: 14, fontWeight: 800, padding: 12, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", opacity: joining ? 0.6 : 1 }}>{joining ? "Joining…" : "🙌 Join the challenge"}</button>
                    </div>
                  ) : me ? (
                    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 14, padding: "11px 14px", fontSize: 13, fontWeight: 800, color: "var(--brand-primary)" }}>
                      You&apos;re in — #{me.rank} with {me.score} {unit}. 🔥
                    </div>
                  ) : (
                    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 14, padding: "11px 14px", fontSize: 12.5, color: "var(--brand-text-secondary)" }}>
                      You&apos;re in — log a day to get on the board.
                    </div>
                  )}

                  {/* Scoreboard */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 8 }}>Scoreboard</div>
                    {standings.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>Nobody&apos;s on the named board yet — be the first. Tap Join above and log a day.</div>
                    ) : (
                      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 14, overflow: "hidden" }}>
                        {standings.map((s, i) => (
                          <div key={s.first + s.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderTop: i === 0 ? "none" : "1px solid var(--brand-border)", background: s.isMe ? "color-mix(in srgb, var(--brand-primary) 8%, transparent)" : "transparent", fontWeight: s.isMe ? 800 : 600, color: s.isMe ? "var(--brand-primary)" : "var(--brand-text)" }}>
                            <span style={{ width: 22, fontSize: 13, textAlign: "center", flex: "0 0 auto" }}>{medal(s.rank)}</span>
                            <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.first}{s.isMe ? " (you)" : ""}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, flex: "0 0 auto" }}>{s.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <ShareToGroup text={shareText} label="📣 Post the standings" style={{ padding: "10px 16px", fontSize: 13 }} />
                    {isTrainer && (
                      <button onClick={end} disabled={busy} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-text-secondary)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>End challenge</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
