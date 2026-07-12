"use client";

/**
 * SlackerScreen — full-screen lighthearted "welcome back slacker" takeover.
 *
 * Shows when a client hasn't logged ANYTHING (meal adherence, workout, cardio,
 * or weigh-in) in 3+ days. Same condition as the orange flash on the trainer
 * client list. Picks a random variant from the approved rotation each time.
 *
 * INTEGRATION (one line): render <SlackerGate clientId={client.id} /> at the
 * top of the client home page/layout (client-facing routes only — it renders
 * nothing for trainer view since it's only mounted on the client home).
 *
 * Frequency: shows at most once per calendar day per client while lapsed
 * (localStorage key). Resets automatically once they log again.
 *
 * NOT AI UI — pure static component, safe on all client apps per gating rules.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient() as any;

const LAPSE_DAYS = 3;
const VARIANTS = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
type VariantId = (typeof VARIANTS)[number];

interface SlackerGateProps {
  clientId: string;
}

interface ScreenProps {
  daysOut: number;
  onDismiss: () => void;
}

function daysBetween(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date(todayKey() + "T00:00:00");
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

function todayKey(): string {
  // Central time — house rule: never toISOString for dates (UTC flips after 6pm CT)
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export default function SlackerGate({ clientId }: SlackerGateProps) {
  const [show, setShow] = useState(false);
  const [daysOut, setDaysOut] = useState(3);
  const [variant, setVariant] = useState<VariantId>(1);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const storageKey = `symmetry_slacker_shown_${clientId}`;
      if (typeof window !== "undefined" && localStorage.getItem(storageKey) === todayKey()) {
        return; // already shown today
      }

      const [meals, workouts, cardio, metrics] = await Promise.all([
        supabase
          .from("meal_adherence_logs")
          .select("log_date")
          .eq("client_id", clientId)
          .order("log_date", { ascending: false })
          .limit(1),
        supabase
          .from("workout_logs")
          .select("log_date")
          .eq("client_id", clientId)
          .order("log_date", { ascending: false })
          .limit(1),
        supabase
          .from("cardio_logs")
          .select("log_date")
          .eq("client_id", clientId)
          .order("log_date", { ascending: false })
          .limit(1),
        supabase
          .from("metrics")
          .select("metric_date")
          .eq("client_id", clientId)
          .order("metric_date", { ascending: false })
          .limit(1),
      ]);

      const dates: string[] = [];
      if (meals.data?.[0]?.log_date) dates.push(meals.data[0].log_date as string);
      if (workouts.data?.[0]?.log_date) dates.push(workouts.data[0].log_date as string);
      if (cardio.data?.[0]?.log_date) dates.push(cardio.data[0].log_date as string);
      if (metrics.data?.[0]?.metric_date) dates.push(metrics.data[0].metric_date as string);

      if (dates.length === 0) return; // brand-new client — no nagging before first log

      const latest = dates.sort().reverse()[0];
      const gap = daysBetween(latest);
      if (gap < LAPSE_DAYS) return;

      if (!cancelled) {
        setDaysOut(gap);
        setVariant(VARIANTS[Math.floor(Math.random() * VARIANTS.length)]);
        setShow(true);
        localStorage.setItem(storageKey, todayKey());
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const dismiss = useCallback(() => setShow(false), []);

  if (!show) return null;

  const props: ScreenProps = { daysOut, onDismiss: dismiss };
  return (
    <div className="ss-overlay">
      <SharedStyles />
      {variant === 1 && <GhostTown {...props} />}
      {variant === 3 && <ExcuseAnalyzer {...props} />}
      {variant === 4 && <HrMemo {...props} />}
      {variant === 5 && <Reboot {...props} />}
      {variant === 6 && <MissingPoster {...props} />}
      {variant === 7 && <Clinical {...props} />}
      {variant === 8 && <BreakingNews {...props} />}
      {variant === 9 && <DisappointedDad {...props} />}
      {variant === 10 && <Intervention {...props} />}
      {variant === 11 && <AreYouStillThere {...props} />}
      {variant === 12 && <MissedCalls {...props} />}
      {variant === 13 && <DeliveryDelayed {...props} />}
      {variant === 14 && <GainsPet {...props} />}
      {variant === 15 && <CaseFile {...props} />}
    </div>
  );
}

/* ================================================================== */
/* Shared styles                                                       */
/* ================================================================== */

function SharedStyles() {
  return (
    <style>{`
.ss-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif}
.ss-card{border-radius:18px;padding:30px 22px 24px;max-width:360px;width:100%;text-align:center;position:relative;z-index:10;margin:auto}
.ss-badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 13px;border-radius:50px;margin-bottom:16px}
.ss-dot{width:6px;height:6px;border-radius:50%;animation:ssblink 1s infinite}
@keyframes ssblink{0%,100%{opacity:1}50%{opacity:.2}}
.ss-emoji{font-size:58px;display:block;margin-bottom:10px;animation:ssbob 1.4s ease-in-out infinite}
@keyframes ssbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.ss-h{font-size:23px;font-weight:900;line-height:1.2;margin-bottom:8px;letter-spacing:-.4px}
.ss-sub{font-size:12.5px;line-height:1.65;margin-bottom:18px}
.ss-box{border-radius:12px;padding:14px 16px;margin-bottom:16px;text-align:left}
.ss-boxtitle{font-size:9.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
.ss-row{display:flex;align-items:flex-start;gap:9px;font-size:12px;margin-bottom:7px;line-height:1.45}
.ss-row:last-child{margin-bottom:0}
.ss-ri{font-size:15px;flex-shrink:0}
.ss-btn{border:none;border-radius:11px;padding:14px 20px;font-size:14px;font-weight:800;width:100%;cursor:pointer;margin-bottom:9px;letter-spacing:.2px}
.ss-btn2{background:none;border:1px solid;border-radius:11px;padding:11px 20px;font-size:12px;font-weight:600;width:100%;cursor:pointer}
.ss-foot{font-size:10px;margin-top:14px;line-height:1.5;opacity:.5}
.ss-bar-label{display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:7px}
.ss-track{border-radius:50px;height:7px;overflow:hidden;width:100%}
.ss-fill{height:100%;border-radius:50px;animation:ssfill 1.5s .5s ease forwards;width:0}
@keyframes ssfill{to{width:var(--w)}}
@keyframes ssroll{0%{left:-80px;transform:rotate(0)}100%{left:110%;transform:rotate(720deg)}}
@keyframes ssticker{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}
@keyframes sspulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes sswilt{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
`}</style>
  );
}

/* ================================================================== */
/* 01 — Ghost Town                                                     */
/* ================================================================== */

function GhostTown({ daysOut, onDismiss }: ScreenProps) {
  const [excuse, setExcuse] = useState("I was just resting my eyes");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#1a1206", zIndex: -1 }} />
      <div style={{ position: "fixed", fontSize: 38, top: "42%", left: -70, animation: "ssroll 3.5s linear infinite", opacity: 0.5 }}>🌿</div>
      <div style={{ position: "fixed", fontSize: 24, top: "55%", left: -50, animation: "ssroll 4.2s linear 1.2s infinite", opacity: 0.3 }}>🍂</div>
      <div style={{ position: "fixed", fontSize: 56, opacity: 0.2, top: -6, left: -6 }}>🕸️</div>
      <div style={{ position: "fixed", fontSize: 56, opacity: 0.2, top: -6, right: -6, transform: "scaleX(-1)" }}>🕸️</div>
      <div className="ss-card" style={{ background: "#221c0d", border: "1.5px solid #3d3210", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
        <div className="ss-badge" style={{ background: "#2d2000", border: "1px solid #ff9500", color: "#ff9500" }}>
          <div className="ss-dot" style={{ background: "#ff9500" }} />
          {daysOut} days since your last log
        </div>
        <span className="ss-emoji">🏜️</span>
        <div className="ss-h" style={{ color: "#fff" }}>
          It&apos;s giving<br /><span style={{ color: "#ff9500" }}>abandoned log.</span>
        </div>
        <div className="ss-sub" style={{ color: "#7a6a40" }}>
          Tumbleweeds. Cobwebs. A lone coyote howling at your missing macros. We&apos;ve seen ghost towns with more activity.
        </div>
        <div className="ss-box" style={{ background: "#1a1206" }}>
          <div className="ss-boxtitle" style={{ color: "#5a4a20" }}>🔎 What we found</div>
          <div className="ss-row" style={{ color: "#7a6a40" }}><span className="ss-ri">🦗</span><span>Workout log: just crickets and vibes</span></div>
          <div className="ss-row" style={{ color: "#7a6a40" }}><span className="ss-ri">🕸️</span><span>Meal tracking: fully cobwebbed over</span></div>
          <div className="ss-row" style={{ color: "#7a6a40" }}><span className="ss-ri">🌵</span><span>Your scale has turned into a cactus</span></div>
          <div className="ss-row" style={{ color: "#7a6a40" }}><span className="ss-ri">👻</span><span>Dustin is haunted by your absence</span></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="ss-bar-label" style={{ color: "#5a4a20" }}>
            <span>Momentum remaining</span>
            <span style={{ color: "#ff9500", fontWeight: 700 }}>critically low</span>
          </div>
          <div className="ss-track" style={{ background: "#2d2510" }}>
            <div className="ss-fill" style={{ background: "linear-gradient(90deg,#ff9500,#ff3b00)", ["--w" as string]: "15%" }} />
          </div>
        </div>
        <button className="ss-btn" style={{ background: "#ff9500", color: "#000" }} onClick={onDismiss}>
          🌅 Alright, I&apos;m back. Let&apos;s ride.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#3d3210", color: "#5a4a20" }} onClick={() => setExcuse("The ghost town does not accept excuses.")}>
          {excuse}
        </button>
        <div className="ss-foot" style={{ color: "#3d3210" }}>Symmetry PT · Princeton TX · Dustin is watching 👀</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 03 — Excuse Analyzer                                                */
/* ================================================================== */

function ExcuseAnalyzer({ daysOut, onDismiss }: ScreenProps) {
  const [excuse, setExcuse] = useState("Submit a new excuse");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#0a0a14", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#10101e", border: "1.5px solid #2a2a4a", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
        <div className="ss-badge" style={{ background: "#1a0030", border: "1px solid #bf5af2", color: "#bf5af2" }}>
          <div className="ss-dot" style={{ background: "#bf5af2" }} />
          Excuse analysis · day {daysOut}
        </div>
        <span className="ss-emoji" style={{ animation: "ssbob 3s ease-in-out infinite" }}>🔬</span>
        <div className="ss-h" style={{ color: "#fff" }}>
          We&apos;re analyzing<br /><span style={{ color: "#bf5af2" }}>your excuses.</span>
        </div>
        <div className="ss-sub" style={{ color: "#666" }}>
          Our system cross-referenced your absence against a database of 4,200 known excuses. Results below.
        </div>
        {[
          ["\u201CI was super busy this week\u201D", "❌ Rejected"],
          ["\u201CI forgot my login\u201D", "❌ Rejected"],
          ["\u201CI was sick\u201D", "❌ Rejected"],
          ["\u201CI was having a moment\u201D", "⏳ Analyzing..."],
        ].map(([text, status], i) => (
          <div
            key={text}
            style={{
              background: "#1a1a2e",
              border: `1px solid ${i === 3 ? "#bf5af2" : "#2a2a4a"}`,
              borderRadius: 10,
              padding: "11px 14px",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: i < 3 ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 12, color: "#888", textDecoration: i < 3 ? "line-through" : "none", textAlign: "left" }}>{text}</span>
            <span style={{ fontSize: 12 }}>{status}</span>
          </div>
        ))}
        <div style={{ background: "#1a0030", border: "1px solid #bf5af2", borderRadius: 10, padding: "12px 14px", margin: "10px 0 16px", fontSize: 12, color: "#bf5af2", lineHeight: 1.5 }}>
          📊 <strong>Verdict:</strong> All excuses reviewed. None accepted. However — you showing back up? That one counts. Welcome back.
        </div>
        <button className="ss-btn" style={{ background: "#bf5af2", color: "#fff" }} onClick={onDismiss}>
          ✅ Fair enough. Let&apos;s go.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#2a2a4a", color: "#555" }} onClick={() => setExcuse("Excuse #4,201 submitted. Also rejected.")}>
          {excuse}
        </button>
        <div className="ss-foot" style={{ color: "#333" }}>Excuse database updated daily. Success rate: 0%. 💜</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 04 — HR Memo                                                        */
/* ================================================================== */

function HrMemo({ daysOut, onDismiss }: ScreenProps) {
  const [dispute, setDispute] = useState("I dispute this memo");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#f5f0e8", zIndex: -1 }} />
      <div
        className="ss-card"
        style={{
          background: "#faf7f0",
          border: "1px solid #d4c8a8",
          borderRadius: 4,
          fontFamily: "Georgia, 'Times New Roman', serif",
          textAlign: "left",
          boxShadow: "0 4px 20px rgba(0,0,0,.12), inset 0 0 0 8px #fff, inset 0 0 0 9px #d4c8a8",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #222", paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: "#222" }}>Symmetry Corrective</div>
          <div style={{ fontSize: 9, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Princeton, TX · Internal Memorandum</div>
        </div>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 14, lineHeight: 2 }}>
          <strong style={{ color: "#222", display: "inline-block", width: 50 }}>TO:</strong> You, specifically<br />
          <strong style={{ color: "#222", display: "inline-block", width: 50 }}>FROM:</strong> Dustin (HR, CEO, Coach)<br />
          <strong style={{ color: "#222", display: "inline-block", width: 50 }}>RE:</strong> Your recent logging situation<br />
          <strong style={{ color: "#222", display: "inline-block", width: 50 }}>DATE:</strong> Right now
        </div>
        <div style={{ fontSize: 12.5, color: "#333", lineHeight: 1.8, marginBottom: 16 }}>
          It has come to our attention that your workout and nutrition logs have been <em>conspicuously absent</em> for the past {daysOut} days.
          <br /><br />
          This is your <em>formal</em> notice that such behavior has been noted, documented, and judged — lightly, but thoroughly.
          <br /><br />
          You are hereby requested to resume normal logging activities immediately. Failure to comply will result in additional dad jokes at your next session.
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ background: "#c0392b", color: "#fff", border: "3px solid #c0392b", borderRadius: 4, display: "inline-block", padding: "5px 14px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", transform: "rotate(-8deg)", opacity: 0.85 }}>
            ⚠️ Noted
          </div>
        </div>
        <button className="ss-btn" style={{ background: "#222", color: "#fff", borderRadius: 4, fontFamily: "Arial, sans-serif" }} onClick={onDismiss}>
          ✍️ Acknowledged. I&apos;m logging now.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#d4c8a8", color: "#888", borderRadius: 4, fontFamily: "Arial, sans-serif" }} onClick={() => setDispute("HR memo filed under: nice try.")}>
          {dispute}
        </button>
        <div style={{ borderTop: "1px solid #d4c8a8", paddingTop: 14, marginTop: 12, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
          Warm regards (barely),<br />
          <strong style={{ color: "#222", display: "block", fontSize: 13, marginTop: 4 }}>Dustin Gautreaux</strong>
          Head of Accountability · Symmetry PT
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 05 — Reboot (terminal)                                              */
/* ================================================================== */

function Reboot({ daysOut, onDismiss }: ScreenProps) {
  const [err, setErr] = useState("> submit_excuse");
  const line = (text: string, color: string) => (
    <div style={{ fontSize: 12, lineHeight: 2, color }}>{text}</div>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "transparent", fontFamily: "'Courier New', monospace", textAlign: "left", maxWidth: 360 }}>
        {line("SYMMETRY_OS v2.0 — boot sequence", "#007a20")}
        <div style={{ borderTop: "1px solid #003d10", margin: "12px 0" }} />
        {line("✓ Program loaded ............... OK", "#30d158")}
        {line("✓ Meal plan found .............. OK", "#30d158")}
        {line("✓ Schedule verified ............ OK", "#30d158")}
        {line(`✗ Last log entry ......... ${daysOut} DAYS AGO`, "#ff3b30")}
        {line("✗ Momentum ............... CRITICALLY LOW", "#ff3b30")}
        {line("✗ Accountability chip .... OFFLINE", "#ff3b30")}
        {line("⚠ Dustin sadness detected ....... TRUE", "#ff9500")}
        <div style={{ borderTop: "1px solid #003d10", margin: "12px 0" }} />
        {line("INITIATING CLIENT REBOOT...", "#ff9500")}
        {line("Purging excuses ............... DONE", "#007a20")}
        {line("Reloading motivation .......... DONE", "#007a20")}
        {line("Welcome back module ........... READY", "#30d158")}
        <div style={{ borderTop: "1px solid #003d10", margin: "12px 0" }} />
        <div style={{ fontSize: 22, fontWeight: 900, color: "#00ff41", margin: "16px 0 6px", lineHeight: 1.3 }}>
          SYSTEM READY.<br />You&apos;re back online. _
        </div>
        <div style={{ fontSize: 11.5, color: "#007a20", marginBottom: 20, lineHeight: 1.6 }}>
          No permanent damage detected. Your program is exactly where you left it. Let&apos;s get to work.
        </div>
        <button className="ss-btn" style={{ background: "#00ff41", color: "#000", borderRadius: 4, fontFamily: "'Courier New', monospace" }} onClick={onDismiss}>
          &gt; RESUME_SESSION --now
        </button>
        <button className="ss-btn2" style={{ borderColor: "#003d10", color: "#007a20", borderRadius: 4, fontFamily: "'Courier New', monospace" }} onClick={() => setErr("> ERROR: excuse_not_found")}>
          {err}
        </button>
      </div>
    </>
  );
}

/* ================================================================== */
/* 06 — Missing Poster                                                 */
/* ================================================================== */

function MissingPoster({ daysOut, onDismiss }: ScreenProps) {
  const [deny, setDeny] = useState("I wasn't even gone that long");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#fffbf0", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#fffbf0", border: "3px solid #222", borderRadius: 4, boxShadow: "4px 4px 0 #222", maxWidth: 330 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 5, color: "#222", textTransform: "uppercase", marginBottom: 10 }}>🚨 Missing 🚨</div>
        <div style={{ background: "#f0e8d0", border: "2px solid #222", width: 130, height: 130, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 68, borderRadius: 4 }}>🙈</div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#555", marginBottom: 4 }}>Client — Last seen logging</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#222", marginBottom: 14, lineHeight: 1.5 }}>&quot;Went to get gains.<br />Never came back.&quot;</div>
        <div style={{ textAlign: "left", border: "1px dashed #aaa", borderRadius: 4, padding: 12, marginBottom: 14, background: "#fff" }}>
          <div style={{ fontSize: 11.5, color: "#555", marginBottom: 5 }}><strong style={{ color: "#222" }}>Missing since:</strong> {daysOut} days ago</div>
          <div style={{ fontSize: 11.5, color: "#555", marginBottom: 5 }}><strong style={{ color: "#222" }}>Last known location:</strong> The app, briefly</div>
          <div style={{ fontSize: 11.5, color: "#555", marginBottom: 5 }}><strong style={{ color: "#222" }}>Description:</strong> Someone who owns workout gear and claims to use it</div>
          <div style={{ fontSize: 11.5, color: "#555" }}><strong style={{ color: "#222" }}>Distinguishing feature:</strong> Gets results when they actually show up</div>
        </div>
        <div style={{ background: "#ffe066", border: "2px solid #222", borderRadius: 4, padding: 10, marginBottom: 14, fontSize: 13, fontWeight: 900, color: "#222" }}>
          🏆 REWARD IF FOUND
          <span style={{ fontSize: 10, display: "block", fontWeight: 400, marginTop: 2, color: "#555" }}>One clean slate + zero judgment (from the app, anyway)</span>
        </div>
        <button className="ss-btn" style={{ background: "#222", color: "#fff", borderRadius: 4 }} onClick={onDismiss}>
          🙋 Found! (It was me. I&apos;m back.)
        </button>
        <button className="ss-btn2" style={{ border: "2px solid #222", color: "#222", borderRadius: 4, fontWeight: 700 }} onClick={() => setDeny("We know. That's why you're here.")}>
          {deny}
        </button>
        <div style={{ fontSize: 9, color: "#aaa", marginTop: 10, letterSpacing: 1 }}>tear here for a fresh start ✂ ·········</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 07 — Clinical Assessment                                            */
/* ================================================================== */

function Clinical({ daysOut, onDismiss }: ScreenProps) {
  const [selfDx, setSelfDx] = useState("I self-diagnosed as fine");
  const vital = (label: string, val: string, bg: string, color: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ fontSize: 12, color: "#555" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 50, background: bg, color }}>{val}</span>
    </div>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#f0f4ff", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 8px 30px rgba(0,80,255,.1)", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #e8eaf0" }}>
          <div style={{ background: "#0050ff", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏥</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Symmetry Accountability Clinic</div>
            <div style={{ fontSize: 10, color: "#888" }}>Dr. Gautreaux, Head of Gains</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="ss-badge" style={{ background: "#fff3cd", border: "1px solid #ffc107", color: "#856404" }}>
            <div className="ss-dot" style={{ background: "#ffc107" }} />
            Check-up required
          </div>
          <span className="ss-emoji" style={{ fontSize: 52 }}>🩺</span>
          <div className="ss-h" style={{ color: "#111", fontSize: 20 }}>We need to talk.</div>
          <div className="ss-sub" style={{ color: "#666" }}>Your last log was {daysOut} days ago. We&apos;ve run the numbers. The results are in.</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          {vital("💪 Momentum", "Critical", "#fee", "#c00")}
          {vital("🥗 Meal Tracking", "Absent", "#fee", "#c00")}
          {vital("🏋️ Workout Log", "Missing", "#fee", "#c00")}
          {vital("😤 Dustin Concern", "Elevated", "#fff8e1", "#856404")}
          {vital("💚 Comeback Potential", "Excellent", "#e8f8ec", "#1a7a3a")}
        </div>
        <div style={{ background: "#f8f9ff", border: "1px solid #dee2ff", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#3d5af1", lineHeight: 1.6 }}>
          <strong style={{ display: "block", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#aab", marginBottom: 4 }}>Dr. Gautreaux&apos;s Diagnosis</strong>
          Acute case of logging avoidance. Prognosis: excellent. Prescribed treatment — open the app, log one thing, repeat daily. Side effects include results.
        </div>
        <button className="ss-btn" style={{ background: "#0050ff", color: "#fff", borderRadius: 10 }} onClick={onDismiss}>
          💊 Take the medicine. Let&apos;s go.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#e0e0e0", color: "#888", borderRadius: 10 }} onClick={() => setSelfDx("Self-diagnosis rejected. Log something.")}>
          {selfDx}
        </button>
      </div>
    </>
  );
}

/* ================================================================== */
/* 08 — Breaking News                                                  */
/* ================================================================== */

function BreakingNews({ daysOut, onDismiss }: ScreenProps) {
  const [claim, setClaim] = useState("I was working out offline");
  const tickerText = `🔴 BREAKING: Local gym-goer not seen logging in ${daysOut} days · Dustin concerned · Momentum at historic lows · Coach issues formal statement · More at 11 `;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#111", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#111", border: "1.5px solid #1e1e1e", borderRadius: 12, padding: 0, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.7)" }}>
        <div style={{ background: "#e53935", color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "6px 0", whiteSpace: "nowrap", overflow: "hidden" }}>
          <div style={{ animation: "ssticker 9s linear infinite", display: "inline-block", paddingLeft: "100%" }}>{tickerText}{tickerText}</div>
        </div>
        <div style={{ background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #222" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#e53935", letterSpacing: 1 }}>SPT NEWS</div>
          <div style={{ background: "#e53935", color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 4, letterSpacing: 1.5, animation: "ssblink 1.5s infinite" }}>LIVE</div>
        </div>
        <div style={{ padding: "22px 18px 20px" }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "#e53935", letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>🔴 Breaking News</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 12 }}>Client Goes<br />Off-Grid</div>
          <div style={{ background: "#e53935", color: "#fff", padding: "10px 16px", margin: "0 -18px 16px", textAlign: "left" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", opacity: 0.8 }}>Developing story</div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>Logs: absent · Dustin: concerned</div>
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, marginBottom: 16 }}>
            Sources confirm the client has not been seen logging in {daysOut} days. Investigators are baffled. The program is sitting there, untouched.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              [String(daysOut), "Days missing"],
              ["0", "Logs filed"],
              ["💯", "Comeback odds"],
            ].map(([num, label]) => (
              <div key={label} style={{ flex: 1, background: "#1a1a1a", borderRadius: 8, padding: "12px 8px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#e53935" }}>{num}</div>
                <div style={{ fontSize: 9.5, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginTop: 2, lineHeight: 1.3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#1a1a1a", borderLeft: "3px solid #e53935", borderRadius: "0 8px 8px 0", padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#aaa", lineHeight: 1.6, textAlign: "left", fontStyle: "italic" }}>
            &quot;They were doing so well. We just want them to come back. The program misses them.&quot;
            <div style={{ fontSize: 10, color: "#e53935", fontWeight: 700, fontStyle: "normal", marginTop: 4 }}>— Dustin Gautreaux, Head Coach</div>
          </div>
          <button className="ss-btn" style={{ background: "#e53935", color: "#fff", borderRadius: 10 }} onClick={onDismiss}>
            📡 I&apos;m here. I&apos;m back. Stand down.
          </button>
          <button className="ss-btn2" style={{ borderColor: "#222", color: "#555", borderRadius: 10 }} onClick={() => setClaim("Sources could not verify this claim.")}>
            {claim}
          </button>
          <div className="ss-foot" style={{ color: "#333", textAlign: "center" }}>SPT News · Fair, Balanced, Slightly Judgmental</div>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 09 — Disappointed Dad                                               */
/* ================================================================== */

function DisappointedDad({ daysOut, onDismiss }: ScreenProps) {
  const [ghost, setGhost] = useState("Leave him on read again");
  const bar = (label: string, width: string, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11.5, color: "#8e8e93", width: 120, textAlign: "left" }}>{label}</span>
      <div style={{ flex: 1, background: "#3a3a3c", borderRadius: 50, height: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 50, background: color, width }} />
      </div>
    </div>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#1c1c1e", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#2c2c2e", borderRadius: 20, boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#3a3a3c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, margin: "0 auto 14px", border: "3px solid #48484a" }}>👨‍💼</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Dustin Gautreaux</div>
        <div style={{ fontSize: 11, color: "#636366", marginBottom: 20 }}>Head Coach · Symmetry PT · Princeton, TX</div>
        <div style={{ background: "#1c1c1e", borderRadius: "16px 16px 16px 4px", padding: "14px 16px", marginBottom: 8, textAlign: "left" }}>
          <div style={{ fontSize: 13, color: "#e5e5ea", lineHeight: 1.65 }}>Hey. It&apos;s been {daysOut} days. I&apos;m not mad. I&apos;m just... disappointed. 😔</div>
        </div>
        <div style={{ background: "#1c1c1e", borderRadius: "16px 16px 16px 4px", padding: "14px 16px", marginBottom: 12, textAlign: "left" }}>
          <div style={{ fontSize: 13, color: "#e5e5ea", lineHeight: 1.65 }}>
            I built you a whole program. I calculated your macros. I&apos;m sitting here checking the dashboard every day like a golden retriever waiting by the door. All I&apos;m asking is for you to log something. Anything. I&apos;m rooting for you. We all are.
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#48484a", marginBottom: 18 }}>Read · Just now · delivered to your guilt</div>
        <div style={{ background: "#1c1c1e", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#48484a", textTransform: "uppercase", marginBottom: 12, textAlign: "left" }}>Current status</div>
          {bar("Dustin worry level", "70%", "#ffd60a")}
          {bar("Your momentum", "15%", "#ff453a")}
          {bar("Comeback potential", "95%", "#30d158")}
        </div>
        <button className="ss-btn" style={{ background: "#30d158", color: "#000", borderRadius: 12 }} onClick={onDismiss}>
          💚 I&apos;m back. I won&apos;t let you down.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#3a3a3c", color: "#636366", borderRadius: 12 }} onClick={() => setGhost("The golden retriever is still waiting. 🐕")}>
          {ghost}
        </button>
      </div>
    </>
  );
}

/* ================================================================== */
/* 10 — Intervention                                                   */
/* ================================================================== */

function Intervention({ daysOut, onDismiss }: ScreenProps) {
  const [minute, setMinute] = useState("I need a minute");
  const letter = (from: string, text: string, color: string) => (
    <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 14px", marginBottom: 8, textAlign: "left", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, color }}>{from}</div>
      <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5, fontStyle: "italic" }}>{text}</div>
    </div>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.94)", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 20, boxShadow: "0 30px 60px rgba(0,0,0,.8)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#ff9500", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          Intervention
          <span style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
        </div>
        <span className="ss-emoji" style={{ fontSize: 52 }}>🫂</span>
        <div className="ss-h" style={{ color: "#fff" }}>We need to<br />have a chat.</div>
        <div className="ss-sub" style={{ color: "#666" }}>
          It&apos;s been {daysOut} days. Some people who care about you wanted to say a few words. We&apos;re all here because we believe in you. And your log.
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          {["💪", "🥗", "📊", "😤"].map((e) => (
            <div key={e} style={{ background: "#1e1e1e", border: "2px solid #2a2a2a", borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, margin: "0 -4px" }}>{e}</div>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: "#555", marginBottom: 18 }}>Your program, your macros, your data, and Dustin</div>
        {letter("From: Your Program", "\u201CI've been sitting here. Ready. Waiting. Just... logging in every day. Hoping.\u201D", "#ff9500")}
        {letter("From: Your Macro Targets", "\u201CWe're not angry. We're just numbers. But we miss being hit. Even approximately.\u201D", "#30d158")}
        {letter("From: Dustin", "\u201CI built this for you. Log one thing. That's all. Let's go — I'm not giving up on you.\u201D", "#bf5af2")}
        <button className="ss-btn" style={{ background: "linear-gradient(135deg,#ff9500,#ff6b00)", color: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(255,149,0,.3)", marginTop: 10 }} onClick={onDismiss}>
          🫶 I hear you all. I&apos;m back.
        </button>
        <button className="ss-btn2" style={{ borderColor: "#2a2a2a", color: "#444", borderRadius: 12 }} onClick={() => setMinute("The intervention will continue until morale improves.")}>
          {minute}
        </button>
      </div>
    </>
  );
}

/* ================================================================== */
/* 11 — Are You Still Training                                          */
/* ================================================================== */

function AreYouStillThere({ daysOut, onDismiss }: ScreenProps) {
  const [rest, setRest] = useState("Just 5 more minutes of rest…");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#0a0a0a", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#141414", border: "1.5px solid #262626", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
        <div className="ss-badge" style={{ background: "#2a0a0a", border: "1px solid #e50914", color: "#e50914" }}>
          <div className="ss-dot" style={{ background: "#e50914" }} />
          {daysOut} days since your last log
        </div>
        <span className="ss-emoji" style={{ animation: "sspulse 2s infinite" }}>⏸️</span>
        <div className="ss-h" style={{ color: "#fff" }}>
          Are you still<br /><span style={{ color: "#e50914" }}>training?</span>
        </div>
        <div className="ss-sub" style={{ color: "#888" }}>
          Your program has been paused for {daysOut} days. We&apos;ll keep your spot… but the couch is starting to think it won.
        </div>
        <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>CONTINUE TRAINING</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 26 }}>🎬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>Your Program · Next Up</div>
              <div style={{ height: 4, background: "#333", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "12%", background: "#e50914" }} />
              </div>
              <div style={{ fontSize: 9.5, color: "#666", marginTop: 3 }}>You left mid-set, legend</div>
            </div>
          </div>
        </div>
        <button className="ss-btn" style={{ background: "#e50914", color: "#fff" }} onClick={onDismiss}>
          ▶ Resume the season
        </button>
        <button className="ss-btn2" style={{ borderColor: "#333", color: "#555" }} onClick={() => setRest("The couch counts that as a win.")}>
          {rest}
        </button>
        <div className="ss-foot" style={{ color: "#333" }}>SymmetriX · Skip intro · Skip excuses</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 12 — Missed Calls                                                   */
/* ================================================================== */

function MissedCalls({ daysOut, onDismiss }: ScreenProps) {
  const [decline, setDecline] = useState("Decline (they'll call again)");
  const callRow = (emoji: string, name: string, sub: string, extra: React.ReactNode, radius: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", background: "rgba(255,255,255,.05)", borderRadius: radius, marginTop: 1 }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
          {name} {extra}
        </div>
        <div style={{ fontSize: 10.5, color: "#8ea0be" }}>{sub}</div>
      </div>
      <div style={{ color: "#30d158" }}>📞</div>
    </div>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg,#1a2a3a,#0a1220)", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "rgba(20,28,44,.7)", border: "1px solid #2a3850", backdropFilter: "blur(6px)" }}>
        <div style={{ fontSize: 44, fontWeight: 200, color: "#fff", margin: "2px 0 4px" }}>9:41</div>
        <div className="ss-badge" style={{ background: "#2a1500", border: "1px solid #ff9500", color: "#ff9500" }}>
          <div className="ss-dot" style={{ background: "#ff9500" }} />
          {daysOut} days · 3 missed calls
        </div>
        <div style={{ width: "100%", margin: "6px 0 14px" }}>
          {callRow("🏋️", "Leg Day", "missed call · every day this week", <span style={{ color: "#ff453a" }}>(7)</span>, "12px 12px 4px 4px")}
          {callRow("🥗", "Your Macros", "missed call · “u up?”", null, "4px")}
          {callRow("👨‍💼", "Dustin", "voicemail · 0:04", null, "4px 4px 12px 12px")}
        </div>
        <div style={{ background: "rgba(255,149,0,.1)", border: "1px solid #ff950044", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#ffb761", textAlign: "left", lineHeight: 1.5, marginBottom: 14 }}>
          🎙️ <strong>Voicemail:</strong> &ldquo;Hey it&apos;s your dumbbells. We&apos;re all just sittin&apos; here. Rackin&apos; up. Call us back, yeah?&rdquo;
        </div>
        <button className="ss-btn" style={{ background: "#30d158", color: "#000" }} onClick={onDismiss}>
          📲 Call them back — I&apos;m in
        </button>
        <button className="ss-btn2" style={{ borderColor: "#2a3850", color: "#5f6f8c" }} onClick={() => setDecline("They left another voicemail.")}>
          {decline}
        </button>
      </div>
    </>
  );
}

/* ================================================================== */
/* 13 — Delivery Delayed                                               */
/* ================================================================== */

function DeliveryDelayed({ daysOut, onDismiss }: ScreenProps) {
  const [couch, setCouch] = useState("Leave it with the couch");
  const step = (icon: string, color: string, label: React.ReactNode, connector: string | null) => (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ color }}>{icon}</div>
        <div style={{ fontSize: 12, color: "#333" }}>{label}</div>
      </div>
      {connector && <div style={{ borderLeft: connector, height: 12, marginLeft: 6 }} />}
    </>
  );
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#f3f4f6", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,.15)" }}>
        <div className="ss-badge" style={{ background: "#fff4e5", border: "1px solid #f59e0b", color: "#b45309" }}>
          <div className="ss-dot" style={{ background: "#f59e0b" }} />
          Delivery exception · day {daysOut}
        </div>
        <span className="ss-emoji">📦</span>
        <div className="ss-h" style={{ color: "#111" }}>
          Your gains are<br /><span style={{ color: "#b45309" }}>stuck in transit.</span>
        </div>
        <div className="ss-sub" style={{ color: "#666" }}>
          Out for delivery, but the recipient hasn&apos;t been home in {daysOut} days.
        </div>
        <div style={{ width: "100%", textAlign: "left", marginBottom: 16 }}>
          {step("✓", "#22c55e", <span><strong>Ordered</strong> — you signed up, hyped</span>, "2px solid #22c55e")}
          {step("✓", "#22c55e", <span><strong>Shipped</strong> — program built &amp; loaded</span>, "2px solid #22c55e")}
          {step("✓", "#22c55e", <span><strong>Out for delivery</strong> — {daysOut} days ago</span>, "2px dashed #f59e0b")}
          {step("✗", "#ef4444", <span><strong>Delivered</strong> — <span style={{ color: "#ef4444" }}>FAILED: nobody home</span></span>, null)}
        </div>
        <button className="ss-btn" style={{ background: "#111", color: "#fff" }} onClick={onDismiss}>
          🏠 I&apos;m home! Deliver my gains
        </button>
        <button className="ss-btn2" style={{ borderColor: "#e5e7eb", color: "#999" }} onClick={() => setCouch("The couch signed for it. Uh oh.")}>
          {couch}
        </button>
        <div className="ss-foot" style={{ color: "#bbb" }}>Symmetry Logistics · handle with grit</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 14 — Gains Pet                                                      */
/* ================================================================== */

function GainsPet({ daysOut, onDismiss }: ScreenProps) {
  const [nap, setNap] = useState("Let Gainz nap (rude)");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#0d1a12", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#12241a", border: "1.5px solid #1f4a30", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
        <div className="ss-badge" style={{ background: "#08130d", border: "1px solid #3ad29f", color: "#3ad29f" }}>
          <div className="ss-dot" style={{ background: "#3ad29f" }} />
          Gainz hasn&apos;t been fed in {daysOut} days
        </div>
        <div style={{ background: "#9bbf3a", border: "5px solid #2a2a2a", borderRadius: 14, padding: "16px 10px", marginBottom: 14, boxShadow: "inset 0 0 0 3px #7a9a2e" }}>
          <div style={{ fontSize: 56, animation: "sswilt 1.6s ease-in-out infinite" }}>🥀</div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 800, color: "#2a3a10", marginTop: 4 }}>GAINZ · Lv.14 · 😵</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8, fontFamily: "'Courier New', monospace", fontSize: 9, color: "#2a3a10", fontWeight: 700 }}>
            <span>HUNGER</span>
            <div style={{ width: 90, height: 8, background: "#5a7020", border: "1px solid #2a3a10" }}>
              <div style={{ height: "100%", width: "14%", background: "#d43a2a" }} />
            </div>
          </div>
        </div>
        <div className="ss-h" style={{ color: "#fff", fontSize: 20 }}>
          Your gains pet is<br /><span style={{ color: "#3ad29f" }}>wilting.</span>
        </div>
        <div className="ss-sub" style={{ color: "#7a9a70" }}>
          Gainz eats logged workouts. It&apos;s been {daysOut} days. Don&apos;t let Gainz go dark.
        </div>
        <button className="ss-btn" style={{ background: "#3ad29f", color: "#04120c" }} onClick={onDismiss}>
          🍖 Feed Gainz a workout
        </button>
        <button className="ss-btn2" style={{ borderColor: "#1f4a30", color: "#5a7a60" }} onClick={() => setNap("Gainz did the sad pixel wobble.")}>
          {nap}
        </button>
        <div className="ss-foot" style={{ color: "#2a4a35" }}>Tamagotchi mode · Gainz remembers everything</div>
      </div>
    </>
  );
}

/* ================================================================== */
/* 15 — Detective Case File                                            */
/* ================================================================== */

function CaseFile({ daysOut, onDismiss }: ScreenProps) {
  const [plead, setPlead] = useState("Plead the fifth");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "#14110c", zIndex: -1 }} />
      <div className="ss-card" style={{ background: "#ede4d0", border: "1px solid #cbbfa0", boxShadow: "0 20px 50px rgba(0,0,0,.7)", transform: "rotate(-.6deg)" }}>
        <div style={{ position: "absolute", top: -8, right: 14, background: "#c0392b", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: 2, padding: "5px 12px", transform: "rotate(6deg)", borderRadius: 2 }}>CASE REOPENED</div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "#8a7a55", textTransform: "uppercase", marginBottom: 6 }}>Case File #0043</div>
        <span className="ss-emoji">🕵️</span>
        <div className="ss-h" style={{ color: "#2a2318", fontFamily: "Georgia, serif" }}>The Missing Client</div>
        <div className="ss-sub" style={{ color: "#6a5d42" }}>
          Day {daysOut} of the disappearance. Detective Gautreaux is back on the case, coffee going cold.
        </div>
        <div style={{ background: "#fbf7ec", border: "1px solid #d8cdb0", borderRadius: 4, padding: "12px 14px", textAlign: "left", marginBottom: 14, fontFamily: "'Courier New', monospace" }}>
          <div style={{ fontSize: 11, color: "#3a3020", lineHeight: 1.9 }}>
            <strong>SUBJECT:</strong> Owns gym gear. Uses it &ldquo;sometimes.&rdquo;<br />
            <strong>LAST SEEN:</strong> The app, {daysOut} days ago, mid-set<br />
            <strong>EVIDENCE:</strong> Untouched program 🔍<br />
            <strong>MOTIVE:</strong> The couch. Always the couch.<br />
            <strong style={{ color: "#c0392b" }}>STATUS:</strong> <span style={{ color: "#c0392b" }}>SOLVABLE — one log cracks it</span>
          </div>
        </div>
        <button className="ss-btn" style={{ background: "#2a2318", color: "#f0e8d5", borderRadius: 4 }} onClick={onDismiss}>
          🔦 Turn myself in — I&apos;m back
        </button>
        <button className="ss-btn2" style={{ borderColor: "#cbbfa0", color: "#8a7a55", borderRadius: 4 }} onClick={() => setPlead("Denied. The evidence is right there.")}>
          {plead}
        </button>
        <div className="ss-foot" style={{ color: "#8a7a55" }}>Symmetry Bureau of Investigation · Princeton, TX</div>
      </div>
    </>
  );
}
