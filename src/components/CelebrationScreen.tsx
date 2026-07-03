"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import CountUp from "@/components/CountUp";

/**
 * CelebrationScreen — workout-complete celebration (5 rotating concepts,
 * chosen per client+day). Fully self-contained and presentational: it
 * computes volume from the raw sets object with defensive guards and never
 * fetches or mutates data, so it is safe to overlay on the existing
 * "Session done" screen. Mounted as a fixed overlay in WorkoutLogger; the
 * original screen stays mounted behind it and the mount is one revertible
 * block.
 */

type SetRow = {
  done?: boolean;
  weight_lbs?: number | string | null;
  weight?: number | string | null;
  reps?: number | string | null;
};

type Props = {
  sets: unknown;
  doneSets: number;
  minutes?: number;
  prs?: number;
  clientId?: string | null;
  clientName?: string | null;
  dayLabel?: string | null;
  doneHref: string;
};

const HEADLINES: [string, string][] = [
  ["LOCAL LEGEND MOVES {V} LBS", "Gravity reportedly 'filing a complaint'"],
  ["AREA HUMAN REFUSES TO SKIP LEG DAY", "Elevator futures plummet on the news"],
  ["{V} LBS RELOCATED IN ONE SESSION", "Moving companies fear for their jobs"],
  ["SCIENTISTS BAFFLED BY {S}-SET PERFORMANCE", "'We never see someone actually do the program'"],
  ["BREAKING: DUMBBELLS REPORT FEELING 'USED'", "Full story after this cooldown"],
];

const UNITS: [string, number, string][] = [
  ["washing machines", 220, "🌀"],
  ["vending machines", 900, "🥤"],
  ["grand pianos", 1000, "🎹"],
  ["canoes (with two guys in them)", 600, "🛶"],
  ["IKEA wardrobes (unassembled)", 320, "📦"],
  ["hot tubs (empty, thankfully)", 800, "🛁"],
  ["riding lawnmowers", 500, "🚜"],
  ["office copy machines", 300, "🖨️"],
];

const FORTUNES: string[] = [
  "Your biceps are entering their renaissance era. Expect masterpieces.",
  "A great weight has been lifted. By you. Just now.",
  "The dumbbells whisper your name now. This is normal. Do not be alarmed.",
  "Consistency is your superpower. Capes remain optional.",
  "You and the stair master will meet again. It knows.",
];

const LUCKY = ["Incline DB Press", "Goblet Squat", "Lat Pulldown", "Face Pull", "Romanian Deadlift"];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const COLS = ["#7c9cf5", "#5ec9a3", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function CelebrationScreen({
  sets,
  doneSets,
  minutes = 0,
  prs = 0,
  clientId,
  clientName,
  dayLabel,
  doneHref,
}: Props) {
  const volume = useMemo(() => {
    try {
      let v = 0;
      const groups =
        sets && typeof sets === "object" ? Object.values(sets as Record<string, unknown>) : [];
      for (const arr of groups) {
        if (!Array.isArray(arr)) continue;
        for (const s of arr as SetRow[]) {
          if (!s || !s.done) continue;
          const w = Number(s.weight_lbs ?? s.weight ?? 0) || 0;
          const r = Number(s.reps ?? 0) || 0;
          v += w * r;
        }
      }
      return Math.max(0, Math.round(v));
    } catch {
      return 0;
    }
  }, [sets]);

  const setCount = Number(doneSets) || 0;
  const min = Number(minutes) || 0;
  const prCount = Number(prs) || 0;
  const firstName = ((clientName || "").split(" ")[0] || "Champion").trim();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const seed = hashStr(String(clientId || "") + today);
  const variant = seed % 5;

  const [tapIdx, setTapIdx] = useState(0);
  const [reroll, setReroll] = useState(0);
  const [cracked, setCracked] = useState(false);

  const vStr = volume.toLocaleString();
  const unit = UNITS[(seed + reroll) % UNITS.length];
  const unitCount = Math.max(1, Math.round(volume / unit[1]));
  const headline = HEADLINES[(seed + tapIdx) % HEADLINES.length];
  const fortune = FORTUNES[(seed + tapIdx) % FORTUNES.length];
  const lucky = LUCKY[seed % LUCKY.length];

  const confetti = (n: number) =>
    Array.from({ length: n }).map((_, i) => (
      <span
        key={i}
        style={{
          position: "absolute",
          top: -14,
          left: Math.random() * 95 + "%",
          width: 8,
          height: 12,
          opacity: 0.9,
          background: COLS[i % COLS.length],
          animation:
            "cs-fall " + (2 + Math.random() * 2.2) + "s linear " + Math.random() * 0.9 + "s forwards",
        }}
      />
    ));

  const StatRow = (
    <div style={{ display: "flex", gap: 8, width: "100%" }}>
      <div style={statBox}>
        <b style={statNum}>
          <CountUp end={volume} duration={1200} />
        </b>
        <span style={statLbl}>LBS MOVED</span>
      </div>
      <div style={statBox}>
        <b style={statNum}>{setCount}</b>
        <span style={statLbl}>SETS</span>
      </div>
      {min > 0 && (
        <div style={statBox}>
          <b style={statNum}>{min}</b>
          <span style={statLbl}>MINUTES</span>
        </div>
      )}
      {prCount > 0 && (
        <div style={statBox}>
          <b style={statNum}>{prCount} 🏆</b>
          <span style={statLbl}>NEW PR</span>
        </div>
      )}
    </div>
  );

  let content: React.ReactNode = null;

  if (variant === 0) {
    content = (
      <div style={bigCard}>
        {confetti(24)}
        <span style={bnBand}>🔴 BREAKING NEWS</span>
        <div style={bnHead}>
          {headline[0].replace("{V}", vStr).replace("{S}", String(setCount))}
        </div>
        <div style={bnSub}>{headline[1]}</div>
        <button style={ghostBtn} onClick={() => setTapIdx((i) => i + 1)}>
          Another take 📰
        </button>
      </div>
    );
  } else if (variant === 1) {
    content = (
      <div style={bigCard}>
        {confetti(16)}
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-text-secondary)", letterSpacing: 1 }}>
          TODAY YOU LIFTED THE EQUIVALENT OF
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", margin: "12px 0" }}>
          <div style={reel}>{unitCount}</div>
          <button style={lever} onClick={() => setReroll((r) => r + 1)}>
            🎰
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {unit[2]} {unit[0]}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 6 }}>
          ({vStr} lbs total — pull the lever for a second opinion)
        </div>
      </div>
    );
  } else if (variant === 2) {
    content = (
      <div style={{ ...bigCard, justifyContent: "flex-start" }}>
        <div style={stamp}>APPROVED</div>
        <div style={letter}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#8a8163", fontWeight: 700 }}>
            DEPARTMENT OF GRAVITY — COMPLAINTS DIVISION
          </div>
          <br />
          RE: <b>Excessive resistance to our services</b>
          <br />
          <br />
          Dear {firstName},
          <br />
          <br />
          It has come to our attention that today you repeatedly and without remorse moved{" "}
          <b>{vStr} lbs</b> in a direction we specifically did not intend, across <b>{setCount} sets</b>.
          <br />
          <br />
          We ask that you cease immediately. We both know you will not.
          <br />
          <br />
          Sincerely,
          <div style={{ fontFamily: "'Segoe Script', cursive", fontSize: 16, marginTop: 10 }}>G. Ravity</div>
          <div style={{ fontSize: 10, color: "#8a8163" }}>Regional Manager, Downward Forces</div>
        </div>
      </div>
    );
  } else if (variant === 3) {
    content = (
      <div style={{ ...bigCard, ...poster }}>
        {confetti(20)}
        <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 800 }}>★ STEP RIGHT UP ★</div>
        <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "Georgia, serif", margin: "6px 0", textTransform: "uppercase" }}>
          The Astonishing
          <br />
          {firstName}!
        </div>
        <div style={{ fontSize: 13, fontStyle: "italic" }}>witnessed this day hoisting a mighty</div>
        <div style={{ fontSize: 42, fontWeight: 900, fontFamily: "Georgia, serif", margin: "10px 0" }}>
          <CountUp end={volume} duration={1400} />
        </div>
        <div style={{ fontSize: 13, fontStyle: "italic" }}>POUNDS!</div>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>
          {setCount} SETS
          {min > 0 ? " • " + min + " MINUTES" : ""}
          {prCount > 0 ? " • " + prCount + " NEW PR" : ""}
          <br />
          Crowds gasped. Plates trembled. Legs remained un-skipped.
        </div>
      </div>
    );
  } else {
    content = (
      <div style={bigCard}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-text-secondary)", letterSpacing: 1, marginBottom: 8 }}>
          {cracked ? "YOUR LIFT FORTUNE" : "TAP THE COOKIE"}
        </div>
        {!cracked ? (
          <div style={{ fontSize: 84, cursor: "pointer", userSelect: "none" }} onClick={() => setCracked(true)}>
            🥠
          </div>
        ) : (
          <>
            <div style={fortuneCard}>
              &ldquo;{fortune}&rdquo;
              <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 8 }}>
                🍀 Lucky exercise tomorrow: <b>{lucky}</b>
              </div>
            </div>
            <button style={{ ...ghostBtn, marginTop: 14 }} onClick={() => setTapIdx((i) => i + 1)}>
              Crack another 🥠
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={overlay}>
      <style>{CSS}</style>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-primary)", letterSpacing: 1.5 }}>
        ✓ WORKOUT COMPLETE
      </div>
      {dayLabel ? <div style={{ fontSize: 12, color: "var(--brand-text-secondary)" }}>{dayLabel}</div> : null}
      {StatRow}
      {content}
      <Link href={doneHref} style={doneBtn}>
        Done ✓
      </Link>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  background: "var(--brand-bg)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "22px 16px",
  maxWidth: 440,
  margin: "0 auto",
  overflowY: "auto",
};
const statBox: React.CSSProperties = { flex: 1, background: "var(--brand-surface)", borderRadius: 16, padding: 10, textAlign: "center", boxShadow: "0 8px 26px rgba(20,30,55,.08)" };
const statNum: React.CSSProperties = { fontSize: 18, color: "var(--brand-text)", display: "block", fontVariantNumeric: "tabular-nums" };
const statLbl: React.CSSProperties = { fontSize: 9.5, color: "var(--brand-text-secondary)", fontWeight: 700, letterSpacing: 0.5 };
const bigCard: React.CSSProperties = { background: "var(--brand-surface)", borderRadius: 24, boxShadow: "0 8px 26px rgba(20,30,55,.08)", padding: 18, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", position: "relative", overflow: "hidden" };
const bnBand: React.CSSProperties = { background: "#c0111f", color: "#fff", fontWeight: 900, fontSize: 11, letterSpacing: 2, padding: "6px 12px", borderRadius: 8, display: "inline-block" };
const bnHead: React.CSSProperties = { fontSize: 24, fontWeight: 900, color: "var(--brand-text)", lineHeight: 1.15, margin: "14px 0", fontFamily: "Georgia, serif" };
const bnSub: React.CSSProperties = { fontSize: 12, color: "var(--brand-text-secondary)", fontStyle: "italic" };
const reel: React.CSSProperties = { background: "#1f2937", color: "#fff", borderRadius: 14, padding: "12px 14px", fontSize: 26, fontWeight: 900, minWidth: 86, fontVariantNumeric: "tabular-nums", boxShadow: "inset 0 -6px 12px rgba(0,0,0,.4)" };
const lever: React.CSSProperties = { width: 54, height: 54, borderRadius: "50%", background: "#f59e0b", border: "none", fontSize: 22, cursor: "pointer", boxShadow: "0 6px 0 #b45309" };
const letter: React.CSSProperties = { background: "#fdfaf3", border: "1px solid #e8e0cc", borderRadius: 6, padding: "18px 16px", textAlign: "left", fontFamily: "Georgia, serif", color: "#3b3629", fontSize: 12.5, lineHeight: 1.7, boxShadow: "0 8px 26px rgba(20,30,55,.08)", transform: "rotate(-.6deg)" };
const stamp: React.CSSProperties = { position: "absolute", top: 14, right: 14, border: "3px solid #c0111f", color: "#c0111f", fontWeight: 900, fontSize: 11, padding: "4px 8px", borderRadius: 6, transform: "rotate(12deg)", letterSpacing: 1, opacity: 0.9, animation: "cs-stamp .4s .6s both" };
const poster: React.CSSProperties = { background: "#f7ecd8", border: "6px double #a4443c", color: "#5b2b26" };
const fortuneCard: React.CSSProperties = { background: "#fff", border: "1px solid var(--brand-border)", borderRadius: 4, padding: "12px 16px", fontSize: 13, color: "var(--brand-text)", boxShadow: "0 8px 26px rgba(20,30,55,.08)", maxWidth: 280, lineHeight: 1.6 };
const ghostBtn: React.CSSProperties = { marginTop: 14, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "var(--brand-text)", borderRadius: 999, padding: "10px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const doneBtn: React.CSSProperties = { textAlign: "center", background: "var(--brand-primary)", color: "#fff", borderRadius: 999, padding: "13px 0", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const CSS = "@keyframes cs-fall{to{transform:translateY(760px) rotate(720deg)}}@keyframes cs-stamp{from{transform:rotate(12deg) scale(3);opacity:0}to{transform:rotate(12deg) scale(1);opacity:.9}}";
