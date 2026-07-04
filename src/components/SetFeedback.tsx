"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SetFeedback — set-complete pop + personal-best glow (visual-polish #2/#7).
 * Isolated, fixed overlay with pointer-events:none so it can NEVER intercept
 * taps or block the logger. Purely reactive to the sets/prevByPe props; it
 * fetches and mutates nothing. On its first run it baselines the current
 * done-count and existing PRs so resuming a session does not fire spurious
 * effects. Every computation is wrapped so a bad prop shape is a no-op.
 */

type SetRow = {
  done?: boolean;
  weight_lbs?: number | string | null;
  weight?: number | string | null;
  reps?: number | string | null;
};

type Prev = Record<string, Record<number, { weight: string; reps: string }>>;

export default function SetFeedback({
  sets,
  prevByPe,
}: {
  sets: unknown;
  prevByPe?: Prev;
}) {
  const [popTick, setPopTick] = useState(0);
  const [popOn, setPopOn] = useState(false);
  const [pr, setPr] = useState<string | null>(null);
  const [prog, setProg] = useState({ done: 0, total: 0 });

  const prevDone = useRef<number | null>(null);
  const prSeen = useRef<Set<string>>(new Set());
  const ready = useRef(false);

  useEffect(() => {
    try {
      const groups =
        sets && typeof sets === "object" ? Object.entries(sets as Record<string, unknown>) : [];

      let done = 0;
      for (const entry of groups) {
        const arr = entry[1];
        if (Array.isArray(arr)) {
          for (const s of arr as SetRow[]) if (s && s.done) done++;
        }
      }

      const firstRun = !ready.current;

      if (!firstRun && prevDone.current !== null && done > prevDone.current) {
        setPopTick((t) => t + 1);
        setPopOn(true);
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
        } catch {
          /* ignore */
        }
      }
      prevDone.current = done;

      if (prevByPe && typeof prevByPe === "object") {
        for (const entry of groups) {
          const peId = entry[0];
          const arr = entry[1];
          if (!Array.isArray(arr)) continue;
          let curBest = 0;
          for (const s of arr as SetRow[]) {
            if (!s || !s.done) continue;
            const w = Number(s.weight_lbs ?? s.weight ?? 0) || 0;
            if (w > curBest) curBest = w;
          }
          const pv = prevByPe[peId];
          if (!pv || curBest <= 0) continue;
          let prevBest = 0;
          for (const k of Object.keys(pv)) {
            const rec = pv[k as unknown as number];
            const w = Number(rec && rec.weight ? rec.weight : 0) || 0;
            if (w > prevBest) prevBest = w;
          }
          const key = peId + ":" + curBest;
          if (prevBest > 0 && curBest > prevBest && !prSeen.current.has(key)) {
            prSeen.current.add(key);
            if (!firstRun) setPr("+" + Math.round(curBest - prevBest) + " lb");
          }
        }
      }

      ready.current = true;
    } catch {
      /* non-fatal: feedback overlay simply stays idle */
    }
  }, [sets, prevByPe]);

  useEffect(() => {
    if (!popOn) return;
    const t = setTimeout(() => setPopOn(false), 620);
    return () => clearTimeout(t);
  }, [popOn, popTick]);

  useEffect(() => {
    if (!pr) return;
    const t = setTimeout(() => setPr(null), 2200);
    return () => clearTimeout(t);
  }, [pr]);

  useEffect(() => {
    try {
      const groups = sets && typeof sets === "object" ? Object.entries(sets as Record<string, unknown>) : [];
      let d = 0, t = 0;
      for (const entry of groups) {
        const arr = entry[1];
        if (Array.isArray(arr)) { t += arr.length; for (const s of arr as SetRow[]) if (s && s.done) d++; }
      }
      setProg({ done: d, total: t });
    } catch {}
  }, [sets]);

  return (
    <div style={wrap}>
      <style>{CSS}</style>
      {popOn && (
        <div key={popTick} style={popBox}>
          <span style={burst} />
          <span style={{ position: "relative", fontSize: 26, fontWeight: 900 }}>✓</span>
        </div>
      )}
      {pr && <div style={prToast}>🏆 NEW PR · {pr}</div>}
      {prog.total > 0 && (
        <div style={progWrap}>
          <div style={{ ...progFill, width: `${Math.round((prog.done / prog.total) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 130,
  pointerEvents: "none",
  overflow: "hidden",
};
const popBox: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "46%",
  width: 64,
  height: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#5ec9a3",
  transform: "translate(-50%,-50%)",
  animation: "cw-setpop 0.5s ease",
};
const burst: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  border: "2px solid #5ec9a3",
  animation: "cw-burst 0.5s ease-out",
};
const prToast: React.CSSProperties = {
  position: "absolute",
  top: 72,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#f59e0b",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  padding: "8px 14px",
  borderRadius: 999,
  boxShadow: "0 0 0 3px rgba(245,158,11,.35), 0 8px 26px rgba(245,158,11,.45)",
  animation: "cw-prin 0.4s cubic-bezier(.34,1.56,.64,1)",
  whiteSpace: "nowrap",
};
const CSS =
  "@keyframes cw-setpop{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}40%{transform:translate(-50%,-50%) scale(1.25);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}@keyframes cw-burst{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.4);opacity:0}}@keyframes cw-prin{from{transform:translateX(-50%) translateY(-12px) scale(.8);opacity:0}to{transform:translateX(-50%) translateY(0) scale(1);opacity:1}}";


const progWrap: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 4,
  background: "rgba(127,140,170,0.18)",
};
const progFill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, var(--brand-primary), var(--brand-accent))",
  transition: "width .4s ease",
};
