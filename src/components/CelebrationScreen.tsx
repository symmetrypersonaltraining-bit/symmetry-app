"use client";

import { useEffect, useMemo, useState } from "react";
import Confetti from "./Confetti";
import { loadLabel } from "@/lib/loadDirection";
import Link from "next/link";
import CountUp from "@/components/CountUp";
import ShareToGroup from "@/components/ShareToGroup";
import { sendGroupMessage } from "@/app/(app)/home/messageActions";
import { fx } from "@/lib/fx";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import AiBadge from "@/components/AiBadge";
import { winMood } from "@/lib/ai/faces";

/**
 * CelebrationScreen — workout-complete celebration (28 rotating concepts,
 * chosen per client+day, plus one PR-gated takeover that sits outside the
 * rotation — see "The Apparition"). Fully self-contained and presentational: it
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

// Speech-bubble lines for Coach Mode (variant 26). His voice — short, dry, no
// exclamation marks — rerolled by tapping the figure, same interaction as the
// newspaper headline and the fortune cookie.
const COACH_LINES: string[] = [
  "{S} sets. Every one of them logged. That's the whole job.",
  "{V} lb moved. I counted. It counted.",
  "You didn't negotiate with the last set. I noticed.",
  "Good. Now go eat something with protein in it.",
  "That's the one I wanted. Same again next week.",
  "Nothing fancy. Just done. That's how this actually works.",
];

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
  // Denominator for the Full Send rings; falls back to the done count so the
  // ring reads as complete rather than dividing by zero.
  const totalSetsForRings = setCount > 0 ? setCount : 1;
  const firstName = ((clientName || "").split(" ")[0] || "Champion").trim();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const seed = hashStr(String(clientId || "") + today);
  // 25 original concepts + The Ledger (24) + Full Send (25) + Coach Mode (26);
  // the terminal else (Gains Facts) catches 27. Every earlier concept stays in
  // the rotation exactly as it was — this only widens the wheel.
  const variant = seed % 28;

  const [tapIdx, setTapIdx] = useState(0);
  const [reroll, setReroll] = useState(0);
  const [cracked, setCracked] = useState(false);

  // ── AI personalisation (2026-07-25) ──────────────────────────────────────
  // Fetches one personal line + real PR detection from /api/celebration. Purely
  // additive: it renders ABOVE the existing concept, so all 25 rotating
  // concepts gain personalisation without any of them being rewritten. Every
  // failure path leaves aiLine null and the screen behaves exactly as before.
  const [aiLine, setAiLine] = useState<string | null>(null);
  // Only used to pick which face sits next to that line — a 30-day streak
  // deserves the one that is on fire.
  const [streakDays, setStreakDays] = useState<number>(0);
  const [aiPrs, setAiPrs] = useState<{ movement: string; weight: number; reps: number; previous: number | null; assistance?: boolean }[]>([]);
  // 80f43c91: "Add how many coach Dustin's you lifted for workout celebrations."
  // His real weigh-in, served by /api/celebration, so the joke tracks his cut
  // instead of quietly drifting out of date. null until it lands (or forever,
  // if he hasn't weighed in) — every use below is guarded.
  const [coachWeight, setCoachWeight] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/celebration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: clientId ?? null }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as {
          line?: string | null;
          prs?: { movement: string; weight: number; reps: number; previous: number | null }[];
          coachWeight?: number | null;
          stats?: { streakDays?: number | null } | null;
        };
        if (cancelled) return;
        if (j.line) setAiLine(j.line);
        if (typeof j.coachWeight === "number" && j.coachWeight > 0) setCoachWeight(j.coachWeight);
        if (typeof j.stats?.streakDays === "number") setStreakDays(j.stats.streakDays);
        if (Array.isArray(j.prs) && j.prs.length) {
          setAiPrs(j.prs.slice(0, 3));
          fx("pr");
        }
      } catch {
        /* celebration must never break on a failed fetch */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const topPr = aiPrs[0] || null;

  // A "big" PR, for the floating-head takeover below. Deliberately strict: a
  // first-ever lift on a movement has no previous best to beat, so it isn't
  // one, and neither is nudging 100 lb to 102.5. Ten pounds up, or five
  // percent up, is the bar. That keeps the head rare on its own — no extra
  // dice roll needed, because big PRs are already occasional.
  // On an assisted machine the gain is the amount taken OFF the stack, so the
  // subtraction runs the other way. Written as one `gain` rather than two
  // branches, because a threshold that is right in one place and inverted in
  // another is how the whole assisted-lift problem started. See lib/loadDirection.
  const prGain = topPr && topPr.previous
    ? (topPr.assistance ? topPr.previous - topPr.weight : topPr.weight - topPr.previous)
    : 0;
  const bigPr = !!(
    topPr &&
    topPr.previous &&
    topPr.previous > 0 &&
    (prGain >= 10 || prGain >= topPr.previous * 0.05)
  );

  const vStr = volume.toLocaleString();

  // "How many coach Dustins did you lift?" — one decimal, because 4.7 Dustins
  // is funnier and more honest than a rounded 5. Only meaningful once there's
  // actual volume AND a real weigh-in to divide by.
  const dustins = coachWeight && volume > 0 ? Math.round((volume / coachWeight) * 10) / 10 : null;

  // The slot machine gets him too. Appended rather than folded into the UNITS
  // constant so the list stays a plain module constant and the coach entry only
  // exists on the sessions where we actually know his weight.
  const units: [string, number, string][] = coachWeight
    ? [...UNITS, [`coach ${COACH_FIRST_NAME}s (` + coachWeight + " lb, and cutting)", coachWeight, "🧍‍♂️"]]
    : UNITS;
  const unit = units[(seed + reroll) % units.length];
  const unitCount = Math.max(1, Math.round(volume / unit[1]));

  const shareText = topPr
    ? `🏆 ${firstName} just hit a PR — ${topPr.movement} ${loadLabel(topPr.weight, !!topPr.assistance)} × ${topPr.reps}` +
      (topPr.previous ? ` (was ${loadLabel(topPr.previous, !!topPr.assistance)})` : "")
    : `💪 ${firstName} just finished ${dayLabel || "a session"} — ${setCount} sets, ${vStr} lb moved` +
      (dustins ? ` — that's ${dustins} coach ${COACH_FIRST_NAME}${dustins === 1 ? "" : "s"}.` : ".");
  // ── PR auto-share ────────────────────────────────────────────────────────
  // {COACH_FIRST_NAME}: PRs go to the group on their own, with no notification.
  //
  // The Share button stays — sharing an ordinary session is still a choice —
  // but a PR is the thing most worth the group seeing and the thing a client is
  // least likely to broadcast about themselves. Waiting for them to tap means
  // the best moments never make it into the thread.
  //
  // Silent on purpose: the message lands in the group and shows as unread, but
  // does not push. Buzzing thirty-five phones every time someone hits a PR is
  // how a group chat gets muted, and a muted group chat ends the whole feature.
  //
  // Guarded by a per-PR key in sessionStorage so a re-render, a back-navigation
  // or a second look at the celebration cannot post it twice.
  useEffect(() => {
    if (!topPr) return;
    const key =
      "sym:prshare:" + (clientId || "me") + ":" + topPr.movement + ":" + topPr.weight + ":" + topPr.reps;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return; // no storage = no idempotency guarantee = don't post
    }
    void sendGroupMessage(shareText, null, true).catch(() => {
      try { sessionStorage.removeItem(key); } catch { /* noop */ }
    });
    // shareText is derived from topPr; keying on topPr alone keeps this to one
    // run per PR rather than one per re-render of the rotating copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topPr?.movement, topPr?.weight, topPr?.reps, clientId]);

  const headline = HEADLINES[(seed + tapIdx) % HEADLINES.length];
  const fortune = FORTUNES[(seed + tapIdx) % FORTUNES.length];
  const lucky = LUCKY[seed % LUCKY.length];
  const coachLine = COACH_LINES[(seed + tapIdx) % COACH_LINES.length]
    .replace("{S}", String(setCount))
    .replace("{V}", vStr);

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
          Crowds gasped. Plates trembled. Not a single set was skipped.
        </div>
      </div>
    );
  } else if (variant === 4) {
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
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
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
  } else if (variant === 5) {
    content = (
      <div style={{ ...bigCard, background: "#1c2440" }}>
        <div style={{ background: "#e53935", color: "#fff", fontWeight: 900, fontSize: 11, letterSpacing: 2, padding: "6px 12px", borderRadius: 8, animation: "cs-blink 1.1s infinite" }}>⚠️ EMERGENCY ALERT ⚠️</div>
        <div style={{ fontSize: 23, fontWeight: 900, color: "#fff", margin: "14px 0 8px" }}>SEVERE GAINS WARNING</div>
        <div style={{ fontSize: 13, color: "#cdd6f4", lineHeight: 1.6 }}>
          {"The National Gains Service has detected a Category " + Math.min(5, prCount + 3) + " workout in your area. Witnesses report " + vStr + " lbs being lifted repeatedly, on purpose. Seek protein immediately."}
        </div>
        <div style={{ fontSize: 11, color: "#8fa2d4", marginTop: 10 }}>Advisory in effect until the soreness subsides.</div>
      </div>
    );
  } else if (variant === 6) {
    content = (
      <div style={{ ...bigCard, background: "#124a2c" }}>
        <div style={{ fontSize: 40 }}>🎙️</div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginTop: 12, fontSize: 14, lineHeight: 1.55, fontStyle: "italic", color: "#1a2233" }}>
          {"\"UNBELIEVABLE, folks! " + setCount + " sets" + (prCount > 0 ? " — " + prCount + " personal record" + (prCount > 1 ? "s" : "") + " —" : "") + " and the crowd is ON THEIR FEET! I have been calling workouts for 30 years and I have NEVER — I need a moment…\""}
        </div>
        <div style={{ fontSize: 11.5, color: "#a7e3c3", marginTop: 10 }}>{"— Partner announcer: \"He is crying again, Jim.\""}</div>
      </div>
    );
  } else if (variant === 7) {
    content = (
      <div style={{ ...bigCard, background: "#2c421f" }}>
        <div style={{ fontSize: 40 }}>🌿</div>
        <div style={{ color: "#eef4dd", fontSize: 14, lineHeight: 1.65, fontStyle: "italic", marginTop: 12 }}>
          {"…and here, in the fluorescent savanna, we observe " + firstName + " completing a " + setCount + "-set display. Note the determined grimace — behaviour seen only in apex lifters. Truly… remarkable."}
        </div>
        <div style={{ fontSize: 11, color: "#b7cf8f", marginTop: 10 }}>Narrated in a very soft British accent.</div>
      </div>
    );
  } else if (variant === 8) {
    content = (
      <div style={{ ...bigCard, background: "#2a2f3e" }}>
        <div style={{ background: "#fffef5", width: 230, padding: 16, fontFamily: "'Courier New', monospace", fontSize: 12, textAlign: "left", color: "#222", boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
          <div style={{ textAlign: "center", fontWeight: 700 }}>SYMMETRY FITNESS<br />★ OFFICIAL RECEIPT ★</div>
          <hr style={{ borderStyle: "dashed", margin: "8px 0" }} />
          {"SETS ......... x" + setCount}<br />
          {"LBS MOVED .... " + vStr}<br />
          {min > 0 ? "MINUTES ...... " + min : "SWEAT ........ PLENTY"}<br />
          {"EXCUSES ...... 0.00"}<br />
          {prCount > 0 ? "PRs .......... x" + prCount + " 🔥" : "EFFORT ....... MAXED"}
          <hr style={{ borderStyle: "dashed", margin: "8px 0" }} />
          <b>TOTAL: PAID IN FULL</b>
          <div style={{ textAlign: "center", marginTop: 8 }}>NO REFUNDS.<br />GAINS FINAL SALE.</div>
        </div>
      </div>
    );
  } else if (variant === 9) {
    content = (
      <div style={{ ...bigCard, background: "#0a0a1a", fontFamily: "'Courier New', monospace" }}>
        <div style={{ color: "#39ff88", fontSize: 20, fontWeight: 700, animation: "cs-blink 1s infinite" }}>★ NEW HIGH SCORE ★</div>
        <div style={{ color: "#ffe14d", fontSize: 38, fontWeight: 900, margin: "12px 0" }}><CountUp end={volume} duration={1400} /></div>
        <div style={{ color: "#77ddff", fontSize: 13, fontWeight: 700 }}>{"RANK #1 — " + firstName.toUpperCase()}</div>
        <div style={{ color: "#889", fontSize: 11, marginTop: 12 }}>INSERT PROTEIN TO CONTINUE</div>
      </div>
    );
  } else if (variant === 10) {
    content = (
      <div style={{ ...bigCard, background: "#3b2a1a" }}>
        <div style={{ background: "#e8d5a9", border: "6px double #6b4a2a", padding: 16, color: "#4a3418", width: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3 }}>WANTED</div>
          <div style={{ fontSize: 46, margin: "6px 0" }}>🏋️</div>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>FOR REPEATED CRIMES<br />AGAINST GRAVITY</div>
          <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            {"Last seen moving " + vStr + " lbs that were minding their own business. Considered strong and extremely sore."}
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, marginTop: 8 }}>{prCount > 0 ? "REWARD: " + prCount + " PR" + (prCount > 1 ? "s" : "") : "REWARD: ETERNAL GLORY"}</div>
        </div>
      </div>
    );
  } else if (variant === 11) {
    content = (
      <div style={{ ...bigCard, background: "#16223f" }}>
        <div style={{ background: "#fff", borderRadius: 14, width: 250, textAlign: "left", overflow: "hidden" }}>
          <div style={{ background: "var(--brand-primary)", color: "#fff", padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>SWOLE AIR ✈ FIRST CLASS</div>
          <div style={{ padding: "12px 14px", fontSize: 12, color: "#1a2233", lineHeight: 1.7 }}>
            <b style={{ fontSize: 14 }}>{firstName.toUpperCase() + " → GAINSVILLE"}</b><br />
            {"FLIGHT: SWL-" + ((seed % 900) + 100) + " · SEAT: 1A"}<br />
            {"BAGGAGE: " + vStr + " lbs (checked ✓)"}<br />
            <b style={{ color: "#22c55e" }}>{"STATUS: LANDED" + (prCount > 0 ? " — " + prCount + " PR COLLECTED" : "")}</b>
          </div>
          <div style={{ borderTop: "2px dashed #ccd", padding: "8px 14px", fontSize: 10, color: "#889" }}>Your muscles may feel like they are still in the air tomorrow.</div>
        </div>
      </div>
    );
  } else if (variant === 12) {
    content = (
      <div style={{ ...bigCard, background: "#2c1e4d" }}>
        <div style={{ color: "#ffe14d", fontSize: 26, fontWeight: 900, textShadow: "0 0 18px rgba(255,184,0,.6)" }}>LEVEL UP!</div>
        <div style={{ width: 210, height: 13, background: "#1a1230", borderRadius: 7, margin: "14px 0", overflow: "hidden" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg,#7c9cf5,#5ec9a3)", animation: "cs-xp 1.6s ease-out forwards" }} />
        </div>
        <div style={{ color: "#e6dcff", fontSize: 13, lineHeight: 1.8 }}>
          {"+" + vStr + " XP"}<br />
          {"STRENGTH +2 · GRIT +3 · SORENESS +" + Math.max(7, setCount * 2)}<br />
          <b style={{ color: "#ffe14d" }}>New ability unlocked:</b><br />
          {"\"Walking Funny Tomorrow\""}
        </div>
      </div>
    );
  } else if (variant === 13) {
    content = (
      <div style={{ ...bigCard, background: "#4a3626" }}>
        <div style={{ fontSize: 44 }}>🔨</div>
        <div style={{ color: "#f5e6c8", fontSize: 22, fontWeight: 900, margin: "10px 0" }}>VERDICT: GUILTY</div>
        <div style={{ color: "#e0cfa8", fontSize: 13, lineHeight: 1.6 }}>
          {"On " + setCount + " counts of excessive effort" + (prCount > 0 ? " and " + prCount + " count" + (prCount > 1 ? "s" : "") + " of record-breaking" : "") + ", this court finds " + firstName + " GUILTY. Sentence: one (1) large meal and a suspiciously smug attitude."}
        </div>
        <div style={{ color: "#c9b485", fontSize: 11, marginTop: 8 }}>{"Court adjourned. Gravity\u2019s lawyer stormed out."}</div>
      </div>
    );
  } else if (variant === 14) {
    content = (
      <div style={{ ...bigCard, background: "#060a14" }}>
        <div style={{ fontSize: 36 }}>🚀</div>
        <div style={{ fontFamily: "'Courier New', monospace", color: "#5ef2c5", fontSize: 12, textAlign: "left", background: "#0b1322", border: "1px solid #1d3050", borderRadius: 10, padding: 12, marginTop: 10, width: 240, lineHeight: 1.7 }}>
          {"> MISSION: " + (dayLabel || "TODAY").toUpperCase()}<br />
          {"> PAYLOAD: " + vStr + " LBS ... ✓"}<br />
          {"> SETS DEPLOYED: " + setCount + " ... ✓"}<br />
          {prCount > 0 ? "> PR BOOSTERS: " + prCount + " ... ✓" : "> ALL SYSTEMS ... NOMINAL"}<br />
          <span style={{ color: "#ffe14d", animation: "cs-blink 1s infinite" }}>{"> STATUS: THE GAINS HAVE LANDED"}</span>
        </div>
        <div style={{ color: "#7d93c4", fontSize: 11, marginTop: 10 }}>{"\"Houston, we have no problem whatsoever.\""}</div>
      </div>
    );
  } else if (variant === 15) {
    content = (
      <div style={{ ...bigCard, background: "#5c1238" }}>
        <div style={{ color: "#ffe14d", fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>BUT WAIT —<br />THERE&rsquo;S MORE!</div>
        <div style={{ color: "#ffd9ec", fontSize: 13.5, lineHeight: 1.6, marginTop: 12 }}>
          {"You did not just finish a workout — you got " + vStr + " lbs of value ABSOLUTELY FREE! Act in the next 24 hours and we will throw in complimentary DOMS* at no extra charge!"}
        </div>
        <div style={{ color: "#ff9ecb", fontSize: 10, marginTop: 10 }}>*Delayed Onset Muscle Soreness. Cannot be returned. Operators are standing by (you cannot).</div>
      </div>
    );
  } else if (variant === 16) {
    content = (
      <div style={{ ...bigCard, background: "#000", overflow: "hidden" }}>
        <div style={{ animation: "cs-credits 11s linear infinite", color: "#fff", fontSize: 13, lineHeight: 2, textAlign: "center" }}>
          <b style={{ fontSize: 18 }}>&ldquo;THE SESSION&rdquo;</b><br /><br />
          STARRING<br /><b>{firstName}</b><br /><br />
          VILLAIN<br /><b>Gravity</b> (defeated)<br /><br />
          SUPPORTING CAST<br />{setCount + " Sets · " + vStr + " lbs"}<br /><br />
          {prCount > 0 ? "STUNTS" : "SPECIAL EFFECTS"}<br />{prCount > 0 ? prCount + " Personal Record" + (prCount > 1 ? "s" : "") : "Pure Determination"}<br /><br />
          NO EXCUSES WERE HARMED<br />IN THE MAKING OF THIS WORKOUT
        </div>
      </div>
    );
  } else if (variant === 17) {
    content = (
      <div style={{ ...bigCard, background: "#221a44" }}>
        <div style={{ fontSize: 36 }}>🔮</div>
        <div style={{ color: "#d9c9ff", fontSize: 17, fontWeight: 800, margin: "10px 0" }}>TODAY&rsquo;S GYM HOROSCOPE</div>
        <div style={{ color: "#cbb8f5", fontSize: 13.5, lineHeight: 1.65, fontStyle: "italic" }}>
          {"\"With " + vStr + " lbs in your gravitational field, Mercury is not the only thing in retrograde — so is your old max. Expect great fortune, big meals, and mild difficulty with stairs.\""}
        </div>
        <div style={{ color: "#8f7cc9", fontSize: 11, marginTop: 8 }}>{"Lucky number: " + setCount + ". Lucky element: Iron."}</div>
      </div>
    );
  } else if (variant === 18) {
    content = (
      <div style={{ ...bigCard, background: "#5c3a20" }}>
        <div style={{ fontSize: 40 }}>🍳</div>
        <div style={{ color: "#ffe9cf", fontSize: 19, fontWeight: 900, margin: "10px 0" }}>*chef&rsquo;s kiss* MAGNIFIQUE!</div>
        <div style={{ color: "#f5d9b8", fontSize: 13.5, lineHeight: 1.6 }}>
          {"Today\u2019s special: muscles flamb\u00e9 — seared over " + setCount + " sets" + (min > 0 ? " for " + min + " minutes" : "") + (prCount > 0 ? ", finished with a reduction of " + prCount + " personal record" + (prCount > 1 ? "s" : "") : "") + ". The secret ingredient? You showed up."}
        </div>
        <div style={{ color: "#d9b183", fontSize: 11, marginTop: 8 }}>Pairs beautifully with an enormous dinner.</div>
      </div>
    );
  } else if (variant === 19) {
    content = (
      <div style={{ ...bigCard, background: "#4d1233" }}>
        <div style={{ color: "#ff8fc0", fontSize: 24, fontWeight: 900 }}>IT&rsquo;S A MATCH! 💘</div>
        <div style={{ display: "flex", gap: 14, margin: "16px 0", justifyContent: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--brand-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, border: "3px solid #fff" }}>💪</div>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#5ec9a3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, border: "3px solid #fff" }}>📈</div>
        </div>
        <div style={{ color: "#ffd3e8", fontSize: 13.5, lineHeight: 1.6 }}>
          {firstName + " and Results have liked each other. Results says: \"I do not usually show up this fast, but " + setCount + " sets? I will make an exception.\""}
        </div>
      </div>
    );
  } else if (variant === 20) {
    content = (
      <div style={{ ...bigCard, background: "#141024" }}>
        <div style={{ width: 240, borderRadius: 16, padding: 4, background: "linear-gradient(120deg,#ffe14d,#ff7ae0,#5ef2c5,#7c9cf5,#ffe14d)", backgroundSize: "300% 300%", animation: "cs-shimmer 3s linear infinite", boxShadow: "0 12px 30px rgba(0,0,0,.5)" }}>
          <div style={{ background: "#1a1330", borderRadius: 13, padding: 14, color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#ffe14d" }}>
              <span>★ LEGENDARY ★</span>
              <span>HP {vStr}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, margin: "6px 0 2px" }}>THE {firstName.toUpperCase()}</div>
            <div style={{ fontSize: 9.5, color: "#b9a9ef", letterSpacing: 1, textTransform: "uppercase" }}>Apex Lifter · Gravity-Type</div>
            <div style={{ background: "#0d0920", borderRadius: 10, fontSize: 52, padding: "14px 0", margin: "10px 0" }}>💪</div>
            <div style={{ textAlign: "left", fontSize: 11, lineHeight: 1.7, color: "#d9c9ff" }}>
              <b style={{ color: "#ffe14d" }}>⚡ MOVE:</b> Skips No Legs — deals {setCount} sets of damage.
              <br />
              <b style={{ color: "#5ef2c5" }}>🛡 PASSIVE:</b> Immune to excuses.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8f7cc9", marginTop: 10, borderTop: "1px solid #2c2350", paddingTop: 7 }}>
              <span>#{(seed % 900) + 100}/025</span>
              <span>RARITY ★★★★★</span>
              <span>HOLO ✦</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 12 }}>Add it to the collection. Gotta lift &rsquo;em all.</div>
      </div>
    );
  } else if (variant === 21) {
    content = (
      <div style={{ ...bigCard, background: "#08130d", color: "#fff", padding: 0 }}>
        <div style={{ width: "100%", background: "#0a1f16", color: "#5ec9a3", fontSize: 11, fontWeight: 800, padding: "7px 0", whiteSpace: "nowrap", overflow: "hidden", borderBottom: "1px solid #16412f" }}>
          <div style={{ display: "inline-block", animation: "cs-ticker 10s linear infinite" }}>
            {"$GAINS ▲ +420%   ·   $EXCUSES ▼ -100%   ·   $COUCH ▼ -88%   ·   $GRAVITY ▼ HALTED   ·   $GAINS ▲ +420%   ·   $EXCUSES ▼ -100%   ·   $COUCH ▼ -88%   ·   $GRAVITY ▼ HALTED   ·   "}
          </div>
        </div>
        <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#7bbfa0", letterSpacing: 1 }}>{"NASDAQ: $" + firstName.toUpperCase()}</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: "#5ec9a3", margin: "4px 0" }}>▲ 420%</div>
          <div style={{ fontSize: 12, color: "#9fe3c6" }}>
            Volume traded today: <b>{vStr} lbs</b>
          </div>
          <svg viewBox="0 0 200 60" style={{ width: 210, height: 64, margin: "14px 0" }}>
            <polyline points="0,52 30,48 60,50 90,36 120,30 150,16 200,4" fill="none" stroke="#5ec9a3" strokeWidth={3} />
            <polygon points="0,52 30,48 60,50 90,36 120,30 150,16 200,4 200,60 0,60" fill="#5ec9a322" />
          </svg>
          <div style={{ background: "#0a1f16", border: "1px solid #16412f", borderRadius: 12, padding: "12px 14px", fontSize: 12, lineHeight: 1.6, color: "#bfe6d5", textAlign: "left" }}>
            <b style={{ color: "#5ec9a3" }}>📈 Analyst note:</b> We are upgrading {firstName} to <b>STRONG BUY</b>. Gravity shorted this position and got margin-called. {setCount} sets of pure bullish momentum.
          </div>
        </div>
      </div>
    );
  } else if (variant === 22) {
    content = (
      <div style={{ ...bigCard, background: "var(--brand-surface)", color: "var(--brand-text)", justifyContent: "flex-start", padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 2 }}>Today&rsquo;s Session</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "var(--brand-primary)" }}>4.9</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "#f5a623", fontSize: 15 }}>★★★★★</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>1,204 muscle fibers reviewed</div>
          </div>
        </div>
        <div style={{ width: "100%", textAlign: "left", borderTop: "1px solid var(--brand-border)", paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>★★★★★ The Crowd</div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", lineHeight: 1.5, margin: "2px 0 10px" }}>&ldquo;Showed up, hit {setCount} sets, left it all on the floor. 10/10 would spot again.&rdquo;</div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>★★★★★ Future You</div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", lineHeight: 1.5, margin: "2px 0 10px" }}>&ldquo;I look great. Thank you for this. — sent from 6 months from now&rdquo;</div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>
            ★ Gravity <span style={{ fontSize: 9, background: "#fde", color: "#c0392b", padding: "1px 6px", borderRadius: 20, marginLeft: 4 }}>1 star</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", lineHeight: 1.5, marginTop: 2 }}>&ldquo;Would not recommend. Kept getting lifted against my will. Reporting to the Department of Downward Forces.&rdquo;</div>
        </div>
      </div>
    );
  } else if (variant === 23) {
    content = (
      <div style={{ ...bigCard, background: "#0b0f17", color: "#fff", justifyContent: "flex-start", padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>💪 The Muscle Group</div>
        <div style={{ fontSize: 10, color: "#8ea0be", marginBottom: 12 }}>Chest, Delts, Triceps, Core +3</div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          {[
            ["Chest", "bro. BRO. that last set 😮‍💨"],
            ["Triceps", "why do we do this to ourselves"],
            ["Core", "i wasn't even supposed to be here today and i STILL felt that"],
          ].map(([who, msg]) => (
            <div key={who} style={{ alignSelf: "flex-start", maxWidth: "82%" }}>
              <div style={{ fontSize: 9, color: "#8ea0be", marginBottom: 2, paddingLeft: 8 }}>{who}</div>
              <div style={{ background: "#2a3346", padding: "9px 12px", borderRadius: "14px 14px 14px 4px" }}>{msg}</div>
            </div>
          ))}
          <div style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
            <div style={{ background: "linear-gradient(135deg,#0EA5E9,#0F4C81)", padding: "9px 12px", borderRadius: "14px 14px 4px 14px" }}>worth it. see you all tomorrow 😤</div>
          </div>
          <div style={{ alignSelf: "flex-start", maxWidth: "82%" }}>
            <div style={{ fontSize: 9, color: "#8ea0be", marginBottom: 2, paddingLeft: 8 }}>Legs</div>
            <div style={{ background: "#2a3346", padding: "9px 12px", borderRadius: "14px 14px 14px 4px" }}>wait it&rsquo;s not our day right. RIGHT??</div>
          </div>
        </div>
      </div>
    );
  } else if (variant === 24) {
    // ── The Ledger — stats type out like a receipt, then stamp PAID IN FULL.
    // The calm, premium alternative to confetti. Pure CSS animation.
    const rows: [string, string][] = [
      ["Sets completed", String(setCount)],
      ["Total volume", `${vStr} lb`],
      ...(min > 0 ? ([["Session time", `${min} min`]] as [string, string][]) : []),
      ...(prCount > 0 ? ([["Personal records", String(prCount)]] as [string, string][]) : []),
      ["Status", "Complete"],
    ];
    content = (
      <div style={{ ...bigCard, background: "#0b1220", justifyContent: "flex-start", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 300, fontFamily: "ui-monospace, Menlo, monospace" }}>
          <div style={{ textAlign: "center", letterSpacing: 4, fontSize: 10, color: "#7f8ea3", marginBottom: 16 }}>
            SYMMETRY · RECEIPT
          </div>
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px dashed rgba(255,255,255,.14)",
                fontSize: 12.5,
                opacity: 0,
                animation: `cs-ledger .34s ${i * 0.28}s both`,
              }}
            >
              <span style={{ color: "#8ea0b8" }}>{k}</span>
              <span style={{ fontWeight: 800, color: "#fff" }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
            <div
              style={{
                border: "3px solid #e0a83e",
                color: "#e0a83e",
                padding: "7px 18px",
                borderRadius: 8,
                fontWeight: 900,
                letterSpacing: 3,
                fontSize: 12,
                animation: `cs-stamp .42s ${rows.length * 0.28 + 0.15}s both`,
                transform: "rotate(-8deg)",
              }}
            >
              PAID IN FULL
            </div>
          </div>
        </div>
      </div>
    );
  } else if (variant === 25) {
    // ── Full Send — three rings close one after another.
    const rings: [string, string, number][] = [
      ["Sets", "#3fb950", totalSetsForRings > 0 ? Math.min(1, setCount / totalSetsForRings) : 1],
      ["Volume", "#79C0FF", Math.min(1, volume / 15000)],
      ["Session", "#e0a83e", min > 0 ? Math.min(1, min / 45) : 1],
    ];
    content = (
      <div style={{ ...bigCard, background: "#04121a" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          {rings.map(([label, col, pct], i) => (
            <div key={label} style={{ textAlign: "center" }}>
              <svg width="76" height="76" aria-hidden>
                <circle cx="38" cy="38" r="31" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="7" />
                <circle
                  cx="38"
                  cy="38"
                  r="31"
                  fill="none"
                  stroke={col}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={195}
                  strokeDashoffset={195}
                  transform="rotate(-90 38 38)"
                  style={{ animation: `cs-ring .9s ${0.25 + i * 0.4}s both`, ["--ring-to" as string]: String(195 * (1 - pct)) }}
                />
              </svg>
              <div style={{ fontSize: 10, color: "#8ea0b8", marginTop: 4, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, fontSize: 20, fontWeight: 900, color: "#fff" }}>Full send, {firstName}.</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#9db4d4", maxWidth: 280 }}>
          {setCount} sets · {vStr} lb moved. Every ring closed.
        </div>
      </div>
    );
  } else if (variant === 26) {
    // ── Coach Mode — the man himself, flexing, with something to say about the
    // session. Tap him to hear a different opinion. The card is hardcoded dark
    // because the artwork is a cutout on a gym-wall backdrop, so every colour
    // inside it is hardcoded too (the fortune-slip rule, below).
    content = (
      <div style={{ ...bigCard, background: "radial-gradient(120% 90% at 50% 8%, #2b3550 0%, #131a2b 55%, #0a0e18 100%)", justifyContent: "flex-end", padding: "16px 14px 0" }}>
        {/* gym-wall spotlight + floor line, so he's standing somewhere */}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 26px)" }} />
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 78, background: "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55))" }} />

        <button
          type="button"
          onClick={() => {
            setTapIdx((n) => n + 1);
            fx("tap");
          }}
          style={{ all: "unset", cursor: "pointer", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}
          aria-label="Tap coach for another line"
        >
          <div style={coachBubble}>
            <span style={{ display: "block" }}>&ldquo;{coachLine}&rdquo;</span>
            <span style={coachBubbleTail} aria-hidden />
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/coach-flex.webp"
            alt={`Coach ${COACH_FIRST_NAME}, flexing`}
            style={{ width: 168, height: "auto", display: "block", marginTop: 10, filter: "drop-shadow(0 14px 22px rgba(0,0,0,.5))", animation: "cs-flex 2.6s ease-in-out .4s 3", transformOrigin: "50% 100%" }}
          />
        </button>

        <div style={{ position: "relative", zIndex: 1, background: "#E53935", color: "#fff", fontSize: 9.5, fontWeight: 900, letterSpacing: 2.5, padding: "5px 14px", borderRadius: "8px 8px 0 0" }}>
          COACH APPROVED
        </div>
      </div>
    );
  } else {
    content = (
      <div style={{ ...bigCard, background: "#20304a" }}>
        <div style={{ background: "#fff", color: "#000", width: 246, padding: "12px 14px", border: "2px solid #000", textAlign: "left", fontFamily: "Arial, Helvetica, sans-serif" }}>
          <div style={{ fontSize: 26, fontWeight: 900, borderBottom: "9px solid #000", paddingBottom: 2, lineHeight: 1 }}>Gains Facts</div>
          <div style={{ fontSize: 11, borderBottom: "1px solid #000", padding: "3px 0" }}>1 brutal session per container</div>
          <div style={{ fontSize: 11, fontWeight: 800, borderBottom: "5px solid #000", padding: "3px 0" }}>Amount Per Workout</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, borderBottom: "1px solid #000", padding: "4px 0" }}>
            <span>Volume</span>
            <span>{vStr} lbs</span>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, fontWeight: 800, borderBottom: "1px solid #000", padding: "2px 0" }}>% Daily Gains*</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, borderBottom: "1px solid #000", padding: "4px 0" }}>
            <span>
              <b>Sets</b> {setCount}
            </span>
            <span>
              <b>{Math.round((setCount / 12.5) * 100)}%</b>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, borderBottom: "1px solid #000", padding: "4px 0" }}>
            <span>
              <b>Effort</b> Maxed
            </span>
            <span>
              <b>100%</b>
            </span>
          </div>
          {prCount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, borderBottom: "1px solid #000", padding: "4px 0" }}>
              <span>
                <b>PRs</b> {prCount}
              </span>
              <span>
                <b>🔥</b>
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, borderBottom: "5px solid #000", padding: "4px 0" }}>
            <span>
              <b>Excuses</b> 0g
            </span>
            <span>
              <b>0%</b>
            </span>
          </div>
          <div style={{ fontSize: 8.5, paddingTop: 4, lineHeight: 1.35 }}>*Percent Daily Gains based on a diet of consistently showing up. Not a substitute for leg day.</div>
        </div>
      </div>
    );
  }

  // ── The Apparition — big PRs only ────────────────────────────────────────
  // Not part of the rotation on purpose. This one OVERRIDES whichever concept
  // rolled today, and only when the PR is genuinely big (see `bigPr` above),
  // so it stays a thing that happens to you a few times a year rather than a
  // card you get bored of. The PR plate above already carries the numbers, so
  // this card is the reaction, not a second scoreboard.
  if (bigPr && topPr) {
    const jump = Math.round(Math.abs(prGain));
    content = (
      <div style={{ ...bigCard, background: "radial-gradient(100% 80% at 50% 34%, #3a2c10 0%, #150f04 62%, #080602 100%)", padding: "22px 16px" }}>
        <div aria-hidden style={rays} />
        <div style={{ position: "relative", zIndex: 1, fontSize: 9.5, letterSpacing: 3.5, fontWeight: 900, color: "#e0a83e" }}>
          A DISTURBANCE IN THE GYM
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/coach-head.webp"
          alt={`Coach ${COACH_FIRST_NAME} has appeared`}
          style={{ width: 132, height: "auto", display: "block", margin: "14px 0 4px", position: "relative", zIndex: 1, filter: "drop-shadow(0 0 26px rgba(224,168,62,.55))", animation: "cs-bob 3.4s ease-in-out .3s infinite" }}
        />
        <div style={{ position: "relative", zIndex: 1, fontSize: 18.5, fontWeight: 900, color: "#ffe9b0", lineHeight: 1.25, marginTop: 8 }}>
          {topPr.assistance
            ? `${firstName} took ${jump} pound${jump === 1 ? "" : "s"} off the ${topPr.movement}.`
            : `${firstName} put ${jump} more pound${jump === 1 ? "" : "s"} on ${topPr.movement}.`}
        </div>
        <div style={{ position: "relative", zIndex: 1, fontSize: 12.5, color: "#d9c18a", marginTop: 8, maxWidth: 270, lineHeight: 1.55 }}>
          Coach {COACH_FIRST_NAME} has materialised. He only does this for the big ones. He
          will not be answering questions.
        </div>
      </div>
    );
  }

  return (
    <div style={overlay}>
      <Confetti />
      <style>{CSS}</style>
      {/* Everything scrolls; Done is pinned below it. Before 8/4 this was one
          flex column with overflowY:auto, and the big card carried `flex: 1` —
          which means basis 0, so it did not take its own height, it took
          whatever was left over. On a phone where the PR plate, the AI line,
          the stats and the coach-units line had already used the screen up,
          "left over" was less than the card's content, and `overflow: hidden`
          plus `justifyContent: center` sheared it at BOTH ends: the top of
          {COACH_FIRST_NAME}&rsquo;s head gone, the headline cut through the middle of a word,
          the paragraph under it missing entirely. Nothing scrolled, because a
          child that shrinks to fit never creates overflow to scroll. */}
      <div style={scrollArea}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-primary)", letterSpacing: 1.5 }}>
        ✓ WORKOUT COMPLETE
      </div>
      {dayLabel ? <div style={{ fontSize: 12, color: "var(--brand-text-secondary)" }}>{dayLabel}</div> : null}

      {/* PR plate ("The Forge") — only ever renders on a genuine personal
          record, so it stays rare and keeps its impact. */}
      {topPr ? (
        <div style={prPlate}>
          <div style={{ fontSize: 9.5, letterSpacing: 3, color: "#e0a83e", fontWeight: 900 }}>NEW PERSONAL RECORD</div>
          <div style={{ fontSize: 27, fontWeight: 900, color: "#ffe9b0", margin: "6px 0", letterSpacing: -0.5 }}>
            {topPr.weight} lb{topPr.assistance ? <span style={{ fontSize: 14, fontWeight: 800 }}> assist</span> : null}
          </div>
          <div style={{ fontSize: 12.5, color: "#d9c18a" }}>
            {topPr.movement} × {topPr.reps}
          </div>
          {topPr.previous ? (
            <div style={{ marginTop: 8, fontSize: 10.5, color: "#b9a071" }}>
              {/* "previous best 140 lb" next to "120 lb" reads like a step
                  backwards on an assisted machine. It is 20 lb less help. */}
              {topPr.assistance ? `was ${topPr.previous} lb assist — ${Math.round(prGain)} lb less help` : `previous best · ${topPr.previous} lb`}
            </div>
          ) : null}
          {aiPrs.length > 1 ? (
            <div style={{ marginTop: 8, fontSize: 10.5, color: "#b9a071" }}>+{aiPrs.length - 1} more today</div>
          ) : null}
        </div>
      ) : null}

      {/* One personal sentence from the AI, grounded in tonight's numbers — and
          the face that matches what it is saying. Dustin: "Celebration screen
          at the end needs to be one of the happier ones congratulating them or
          encouraging them to keep going", and "if it's a PR use a muscle one".
          The badge is also doing the honest work AiBadge exists for: this
          sentence was written by the app, not by him, and the photo variants
          elsewhere on this screen are him. */}
      {aiLine ? (
        <div style={aiLineBox}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AiBadge size={34} mood={winMood({ isPr: !!topPr, streakDays, hitGoal: bigPr, fullDayLogged: true })} title="Written by the app" />
            <span style={{ flex: 1, minWidth: 0 }}>{aiLine}</span>
          </div>
        </div>
      ) : null}

      {StatRow}

      {/* 80f43c91 — the coach-as-a-unit-of-measure line. Sits under the stats on
          every variant so it shows up regardless of which concept rolled, and
          disappears entirely if we couldn't read his weight. */}
      {dustins ? (
        <div style={dustinBox}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>🧍‍♂️</span>
          <span style={{ flex: 1, lineHeight: 1.45 }}>
            That&rsquo;s <b style={{ color: "var(--brand-primary)", fontSize: 15 }}>{dustins}</b> coach {COACH_FIRST_NAME}
            {dustins === 1 ? "" : "s"} lifted today.
            <span style={{ display: "block", fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
              He weighs {coachWeight} lb. He did not consent to this.
            </span>
          </span>
        </div>
      ) : null}

      {content}

      {/* Community: push the win into the group chat. */}
      {/* A PR has already posted itself (silently) — see the auto-share effect.
          Offering "Share this PR" again would double-post it. */}
      {!topPr && <ShareToGroup text={shareText} label="Share to group" />}
      {topPr && (
        <p style={{ fontSize: 12, fontWeight: 700, textAlign: "center", color: "rgba(255,255,255,0.6)", margin: "4px 0 8px" }}>
          👊 Posted to the group
        </p>
      )}

      </div>
      {/* Pinned, so a card tall enough to scroll can never put the only way out
          of this screen below the fold. */}
      <div style={doneBar}>
        <Link href={doneHref} style={doneBtn}>
          Done ✓
        </Link>
      </div>
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
  maxWidth: 440,
  margin: "0 auto",
  // The frame itself does not scroll — scrollArea does. Keeping the scroll on
  // an inner box is what lets Done stay pinned outside it.
  overflow: "hidden",
};
const scrollArea: React.CSSProperties = {
  flex: "1 1 auto",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "22px 16px 6px",
};
const doneBar: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "10px 16px calc(12px + env(safe-area-inset-bottom))",
  background: "var(--brand-bg)",
};
const statBox: React.CSSProperties = { flex: 1, background: "var(--brand-surface)", borderRadius: 16, padding: 10, textAlign: "center", boxShadow: "0 8px 26px rgba(20,30,55,.08)" };
const statNum: React.CSSProperties = { fontSize: 18, color: "var(--brand-text)", display: "block", fontVariantNumeric: "tabular-nums" };
const statLbl: React.CSSProperties = { fontSize: 9.5, color: "var(--brand-text-secondary)", fontWeight: 700, letterSpacing: 0.5 };
// flexGrow 1 / flexShrink 0 / basis auto — NOT `flex: 1`. Fill spare room when
// there is some; keep every pixel of your own height when there isn't, and let
// the page scroll instead. `flex: 1` is basis 0, which is what sheared the
// Apparition card in half on 8/4.
const bigCard: React.CSSProperties = { background: "var(--brand-surface)", borderRadius: 24, boxShadow: "0 8px 26px rgba(20,30,55,.08)", padding: 18, flexGrow: 1, flexShrink: 0, flexBasis: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", position: "relative", overflow: "hidden" };
const bnBand: React.CSSProperties = { background: "#c0111f", color: "#fff", fontWeight: 900, fontSize: 11, letterSpacing: 2, padding: "6px 12px", borderRadius: 8, display: "inline-block" };
const bnHead: React.CSSProperties = { fontSize: 24, fontWeight: 900, color: "var(--brand-text)", lineHeight: 1.15, margin: "14px 0", fontFamily: "Georgia, serif" };
const bnSub: React.CSSProperties = { fontSize: 12, color: "var(--brand-text-secondary)", fontStyle: "italic" };
const reel: React.CSSProperties = { background: "#1f2937", color: "#fff", borderRadius: 14, padding: "12px 14px", fontSize: 26, fontWeight: 900, minWidth: 86, fontVariantNumeric: "tabular-nums", boxShadow: "inset 0 -6px 12px rgba(0,0,0,.4)" };
const lever: React.CSSProperties = { width: 54, height: 54, borderRadius: "50%", background: "#f59e0b", border: "none", fontSize: 22, cursor: "pointer", boxShadow: "0 6px 0 #b45309" };
const letter: React.CSSProperties = { background: "#fdfaf3", border: "1px solid #e8e0cc", borderRadius: 6, padding: "18px 16px", textAlign: "left", fontFamily: "Georgia, serif", color: "#3b3629", fontSize: 12.5, lineHeight: 1.7, boxShadow: "0 8px 26px rgba(20,30,55,.08)", transform: "rotate(-.6deg)" };
const stamp: React.CSSProperties = { position: "absolute", top: 14, right: 14, border: "3px solid #c0111f", color: "#c0111f", fontWeight: 900, fontSize: 11, padding: "4px 8px", borderRadius: 6, transform: "rotate(12deg)", letterSpacing: 1, opacity: 0.9, animation: "cs-stamp .4s .6s both" };
const poster: React.CSSProperties = { background: "#f7ecd8", border: "6px double #a4443c", color: "#5b2b26" };
// The fortune slip is a PROP — a paper strip out of a cookie — so it keeps its
// hardcoded paper white in every theme. It used to pair that white with
// color:var(--brand-text), which in a dark theme is #E6EDF3: white on white.
// Both halves are hardcoded now, like the `letter` and `poster` props above.
const fortuneCard: React.CSSProperties = { background: "#fff", border: "1px solid #dfe3ea", borderRadius: 4, padding: "12px 16px", fontSize: 13, color: "#1a2233", boxShadow: "0 8px 26px rgba(20,30,55,.08)", maxWidth: 280, lineHeight: 1.6 };
const ghostBtn: React.CSSProperties = { marginTop: 14, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "var(--brand-text)", borderRadius: 999, padding: "10px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const doneBtn: React.CSSProperties = { textAlign: "center", background: "var(--brand-primary)", color: "#fff", borderRadius: 999, padding: "13px 0", fontSize: 14, fontWeight: 800, textDecoration: "none" };
// PR plate + AI line (2026-07-25). Additive styles only.
const prPlate: React.CSSProperties = { background: "linear-gradient(150deg,#3a2a12,#6b5227)", border: "2px solid #e0a83e", borderRadius: 16, padding: "16px 18px", textAlign: "center", boxShadow: "0 0 34px rgba(224,168,62,.35)" };
const dustinBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--brand-surface)",
  border: "1px solid var(--brand-border)",
  borderRadius: 12,
  padding: "10px 13px",
  fontSize: 12.5,
  color: "var(--brand-text)",
};

// Coach Mode + The Apparition (2026-07-31). Both cards hardcode a dark
// background, so — per the fortune-slip rule above — they hardcode every text
// colour that sits on them too. Nothing here reads var(--brand-text).
const coachBubble: React.CSSProperties = {
  position: "relative",
  background: "#fdfaf3",
  color: "#23201a",
  borderRadius: 14,
  padding: "11px 14px",
  fontSize: 12.5,
  lineHeight: 1.5,
  fontWeight: 600,
  maxWidth: 268,
  boxShadow: "0 10px 24px rgba(0,0,0,.4)",
};
const coachBubbleTail: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: -9,
  marginLeft: -8,
  width: 0,
  height: 0,
  borderLeft: "8px solid transparent",
  borderRight: "8px solid transparent",
  borderTop: "10px solid #fdfaf3",
};
const rays: React.CSSProperties = {
  position: "absolute",
  top: "-40%",
  left: "-40%",
  width: "180%",
  height: "180%",
  background:
    "repeating-conic-gradient(from 0deg at 50% 50%, rgba(224,168,62,.16) 0deg 7deg, transparent 7deg 20deg)",
  animation: "cs-rays 26s linear infinite",
};

const aiLineBox: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderLeft: "3px solid var(--brand-primary)", borderRadius: 12, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55, color: "var(--brand-text)", fontStyle: "italic" };
const CSS = "@keyframes cs-ledger{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}@keyframes cs-ring{to{stroke-dashoffset:var(--ring-to,0)}}@keyframes cs-flex{0%,100%{transform:scale(1) rotate(0)}42%{transform:scale(1.045) rotate(-1.1deg)}70%{transform:scale(1.02) rotate(.7deg)}}@keyframes cs-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}@keyframes cs-rays{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[style*='cs-ledger'],[style*='cs-ring'],[style*='cs-stamp'],[style*='cs-flex'],[style*='cs-bob'],[style*='cs-rays']{animation:none!important;opacity:1!important}}@keyframes cs-fall{to{transform:translateY(760px) rotate(720deg)}}@keyframes cs-blink{50%{opacity:.3}}@keyframes cs-xp{from{width:6%}to{width:85%}}@keyframes cs-credits{from{transform:translateY(100%)}to{transform:translateY(-100%)}}@keyframes cs-stamp{from{transform:rotate(12deg) scale(3);opacity:0}to{transform:rotate(12deg) scale(1);opacity:.9}}@keyframes cs-shimmer{0%{background-position:0% 0}100%{background-position:300% 0}}@keyframes cs-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}";
