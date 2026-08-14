"use client";

// THE GOAL CARD — the chart, the status, and the meter.
//
// Every number on this card comes from analyseGoal() in lib/goals.ts, and
// nothing is recomputed here. That is the rule the whole feature hangs on: the
// card, the chart and the coach must be incapable of disagreeing, because a
// client who catches the screen contradicting itself stops believing the parts
// that were right.
//
// ── THE CHART'S ONE IDEA ───────────────────────────────────────────────────
//
// x runs from the goal's START to its TARGET DATE — not to today. That is what
// makes it a journey rather than a line: the goal always sits on the right
// edge, and the empty space between "now" and that edge is the part still to
// do. A chart that ends at today can never show you that, which is the whole
// reason the existing weight chart does not answer "am I going to make it".

import { useMemo, useRef, useState } from "react";
import AiBadge from "@/components/AiBadge";
import {
  analyseGoal, UNITS, METRIC_LABEL, STALL_DAYS,
  type Goal, type Reading,
} from "@/lib/goals";

const DAY = 86_400_000;
const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const fmtD = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Green under target, amber behind, grey when there is not enough to say. */
const TONE = {
  on_track: "#15803D",
  hit: "#15803D",
  behind: "#B45309",
  too_thin: "#4E6080",
} as const;

export default function GoalCard({
  goal, readings, today, unitOverride, onLogWeighIn, onAdjust,
}: {
  goal: Goal;
  readings: Reading[];
  today: string;
  unitOverride?: string;
  onLogWeighIn?: () => void;
  onAdjust?: () => void;
}) {
  const a = useMemo(() => analyseGoal(goal, readings, today), [goal, readings, today]);
  const [hover, setHover] = useState<{ x: number; y: number; r: Reading; delta: number | null } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!a) return null;
  const unit = unitOverride ?? UNITS[goal.metric];
  const tone = TONE[a.status];

  // ── chart geometry ───────────────────────────────────────────────────────
  const W = 340, H = 172, L = 32, R = 56, T = 14, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const sorted = [...readings].sort((x, y) => ms(x.date) - ms(y.date));
  // The domain has to cover every point it draws. Taking x0 straight off
  // goal.startDate put Dustin's pre-goal weigh-ins at a NEGATIVE x, and because
  // the svg is overflow:visible for the labels, the line ran out of the left
  // edge of the card and across the page. Widen to the earliest thing on the
  // chart instead of dropping readings — history before the goal was set is
  // still part of the journey, and hiding it would make the card disagree with
  // the weight chart directly underneath it.
  const x0 = Math.min(ms(goal.startDate ?? sorted[0].date), ms(sorted[0].date));
  const x1 = ms(goal.targetDate);
  const vals = sorted.map((r) => r.value).concat([goal.targetValue], a.projected != null ? [a.projected] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(1.2, (hi - lo) * 0.16);
  lo -= pad; hi += pad;
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * pw;
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;

  const pts = sorted.map((r) => ({ r, x: X(ms(r.date)), y: Y(r.value) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(T + ph).toFixed(1)} L${pts[0].x.toFixed(1)},${(T + ph).toFixed(1)} Z`;
  const goalY = Y(goal.targetValue);
  const last = pts[pts.length - 1];

  // Both right-edge labels — the goal and where this rate lands — sit at the
  // same x, so when the projection is close to the target they print on top of
  // each other. On the live screen it read "185 g̶o̶a̶l̶ 182.2 / this rate", which
  // is the one thing this card cannot do: be unreadable about the two numbers
  // the client came here for. Nudge the projection's TEXT clear while its dot
  // stays on the true value.
  const projY = a.projected != null ? Y(a.projected) : null;
  const projTextY =
    projY == null ? 0
    : Math.abs(projY - goalY) >= 24 ? projY
    : projY >= goalY ? goalY + 24 : goalY - 24;
  const ticks = [...new Set([lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].map((v) => Math.round(v)))];

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = (("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width * W;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const d = Math.abs(p.x - cx); if (d < bd) { bd = d; best = p; } }
    const i = pts.indexOf(best);
    setHover({ x: best.x, y: best.y, r: best.r, delta: i > 0 ? Math.round((best.r.value - pts[i - 1].r.value) * 10) / 10 : null });
  }

  const statusText =
    a.status === "hit" ? "Goal reached"
    : a.status === "too_thin" ? `Only ${sorted.length} weigh-in${sorted.length === 1 ? "" : "s"} — can't project yet`
    : a.flatDays >= STALL_DAYS ? `Behind pace — flat ${a.flatDays} days`
    : a.status === "behind" && a.projected != null ? `Behind — lands ~${Math.round(Math.abs(a.projected - goal.targetValue) * 10) / 10} ${unit} short`
    : a.status === "behind" ? "Behind pace"
    : a.arrivesOn ? `On track — arriving ~${fmtD(ms(a.arrivesOn))}` : "On track";

  return (
    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, color: "var(--brand-primary)" }}>
          {METRIC_LABEL[goal.metric].toUpperCase()}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--brand-text-secondary)", background: "var(--brand-card, var(--brand-bg))", padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
          {goal.setBy === "trainer" ? "set by your coach" : "your goal"}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "7px 0 1px" }}>
        <span style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "var(--brand-text)" }}>{a.now}</span>
        <span style={{ fontSize: 13, color: "var(--brand-text-secondary)", fontWeight: 600 }}>{unit}</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: TONE.on_track }}>
          {a.start > a.now ? "−" : "+"}{Math.round(Math.abs(a.start - a.now) * 10) / 10} {unit}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginBottom: 9 }}>
        goal {goal.targetValue} {unit} by {new Date(ms(goal.targetDate)).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
      </div>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
        {statusText}
      </span>

      {/* CAP THE CHART'S WIDTH.
          The viewBox is 340 wide and every font-size inside it is in viewBox
          units, so `width: 100%` on a 1,250px trainer-desktop column scaled the
          axis labels to about 40px — caught on the live screen a minute after
          shipping, not in review, because at phone width it looks perfect.
          A chart does not get more readable past ~480px; it just gets louder. */}
      <div style={{ position: "relative", touchAction: "none", marginTop: 12, maxWidth: 480 }}>
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
          role="img"
          aria-label={`${METRIC_LABEL[goal.metric]} from ${a.start} to ${a.now} ${unit}, goal ${goal.targetValue} by ${fmtD(x1)}. ${statusText}.`}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          onTouchStart={onMove} onTouchMove={onMove} onTouchEnd={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} stroke="var(--brand-border)" strokeWidth={1} opacity={0.5} />
              <text x={L - 5} y={Y(v) + 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--brand-text-secondary)" }}>{v}</text>
            </g>
          ))}

          {/* the goal, as a place on the chart rather than a number in a corner */}
          <line x1={L} x2={L + pw + 4} y1={goalY} y2={goalY} stroke="var(--brand-primary)" strokeWidth={1.5} strokeDasharray="2 3" opacity={0.55} />
          <text x={L + pw + 7} y={goalY - 5} style={{ fontSize: 10, fontWeight: 800, fill: "var(--brand-primary)" }}>{goal.targetValue}</text>
          <text x={L + pw + 7} y={goalY + 7} style={{ fontSize: 9, fontWeight: 600, fill: "var(--brand-text-secondary)" }}>goal</text>

          <path d={area} fill="var(--brand-primary)" opacity={0.08} />
          <path d={line} fill="none" stroke="var(--brand-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {a.projected != null && (
            <>
              <path d={`M${last.x.toFixed(1)},${last.y.toFixed(1)} L${X(x1).toFixed(1)},${Y(a.projected).toFixed(1)}`}
                fill="none" stroke={tone} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" opacity={0.9} />
              <circle cx={X(x1)} cy={Y(a.projected)} r={4.5} fill={tone} stroke="var(--brand-surface)" strokeWidth={2} />
              <text x={X(x1) + 7} y={projTextY + 3} style={{ fontSize: 10, fontWeight: 800, fill: tone }}>{a.projected}</text>
              <text x={X(x1) + 7} y={projTextY + 14} style={{ fontSize: 9, fontWeight: 600, fill: "var(--brand-text-secondary)" }}>this rate</text>
            </>
          )}
          {a.projected == null && (
            <text x={last.x + 9} y={last.y + 4} style={{ fontSize: 9, fontWeight: 600, fill: "var(--brand-text-secondary)" }}>
              need more<tspan x={last.x + 9} dy={10}>weigh-ins</tspan>
            </text>
          )}

          {hover && <line x1={hover.x} x2={hover.x} y1={T} y2={T + ph} stroke="var(--brand-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3.2} fill="var(--brand-primary)" stroke="var(--brand-surface)" strokeWidth={2} />
          ))}
          {hover && <circle cx={hover.x} cy={hover.y} r={6.5} fill="none" stroke="var(--brand-primary)" strokeWidth={2} />}

          {/* The FIRST PLOTTED POINT'S own value — not a.start.
              Once the domain widened to cover weigh-ins from before the goal
              was set, those two stopped being the same number, and the chart
              was labelling a 198 lb dot "212". The goal's start value is
              already on the card twice over (the −23.4 delta and the meter);
              what the leftmost dot needs is the truth about itself. */}
          <text x={pts[0].x} y={Math.max(9, pts[0].y - 10)} style={{ fontSize: 10, fontWeight: 800, fill: "var(--brand-text)" }}>{pts[0].r.value}</text>
          <text x={pts[0].x} y={H - 5} style={{ fontSize: 9, fontWeight: 600, fill: "var(--brand-text-secondary)" }}>{fmtD(x0)}</text>
          {/* Anchored at its END, not centred. Centred, it spilled to the right
              of the plot area and printed straight through "this rate". */}
          <text x={L + pw} y={H - 5} textAnchor="end" style={{ fontSize: 9, fontWeight: 600, fill: "var(--brand-text-secondary)" }}>{fmtD(x1)}</text>
        </svg>

        {hover && (
          <div style={{
            position: "absolute", pointerEvents: "none", background: "#0D1B2E", color: "#fff",
            borderRadius: 9, padding: "7px 9px", fontSize: 10.5, lineHeight: 1.45, whiteSpace: "nowrap",
            left: `calc(${(hover.x / W) * 100}% - 40px)`, top: `calc(${(hover.y / H) * 100}% - 52px)`,
            boxShadow: "0 4px 14px rgba(0,0,0,.28)", zIndex: 5,
          }}>
            <b style={{ fontSize: 12 }}>{hover.r.value} {unit}</b><br />
            {new Date(ms(hover.r.date)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            {hover.delta != null && <><br />{hover.delta > 0 ? "+" : ""}{hover.delta} since last</>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 11, marginTop: 8, fontSize: 10, color: "var(--brand-text-secondary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 15, borderTop: "2px solid var(--brand-primary)", display: "inline-block" }} /> weigh-ins
        </span>
        {a.projected != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 15, borderTop: `2px dashed ${tone}`, display: "inline-block" }} /> where this rate lands
          </span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 15, borderTop: "2px dotted var(--brand-primary)", display: "inline-block", opacity: 0.6 }} /> goal
        </span>
      </div>

      <div style={{ marginTop: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--brand-text-secondary)", fontWeight: 700, marginBottom: 5 }}>
          <span>{a.percent}% of the way there</span>
          <span>{Math.max(0, a.remaining)} {unit} to go</span>
        </div>
        <div style={{ height: 9, borderRadius: 99, background: "var(--brand-border)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, width: `${a.percent}%`, background: tone, transition: "width 1s cubic-bezier(.22,1,.36,1)" }} />
          {[25, 50, 75].map((m) => (
            <div key={m} style={{ position: "absolute", top: -3, left: `${m}%`, width: 2, height: 15, background: "var(--brand-surface)", opacity: 0.9 }} />
          ))}
        </div>
      </div>

      {(onAdjust || onLogWeighIn) && (
        <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
          {onAdjust && (
            <button onClick={onAdjust} style={btn}>Adjust goal</button>
          )}
          {onLogWeighIn && (
            <button onClick={onLogWeighIn} style={btn}>Log a weigh-in</button>
          )}
        </div>
      )}

      {/* The stall sentence. Said HERE rather than only in the coach card,
          because somebody who never opens the coach still needs to know the
          trend and the last fortnight disagree. */}
      {a.flatDays >= STALL_DAYS && a.trendProjected != null && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start", background: "var(--brand-bg)", borderRadius: 11, padding: "9px 11px" }}>
          <AiBadge size={18} mood="thinking" title="" />
          <span style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--brand-text-secondary)" }}>
            Your six-week trend would get you there — but the number hasn&rsquo;t moved in {a.flatDays} days,
            so that&rsquo;s the one to trust today.
          </span>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, padding: "10px 6px",
  borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-surface)",
  color: "var(--brand-text)", minHeight: 42, cursor: "pointer",
};
