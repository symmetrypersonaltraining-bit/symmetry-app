"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

// Global "Now training" dock. Reads the workout auto-save draft that WorkoutLogger
// writes to localStorage (key: symmetry_wl_{clientId}_{dayId}_{t|c}). Shows only when
// a session is LIVE (sessionMode:true) and you've navigated AWAY from the logger —
// tap to jump back in. Fully additive: renders null when there is no active session.
// Mounted in both the trainer layout and the client layout.
type Active = { clientId: string; dayId: string; savedAt: number };

function parseKey(k: string): { clientId: string; dayId: string } | null {
  // symmetry_wl_{clientId}_{dayId}_{t|c}  — clientId & dayId are UUIDs (or "me"); no underscores
  const m = /^symmetry_wl_(.+)_(.+)_[tc]$/.exec(k);
  if (!m) return null;
  return { clientId: m[1], dayId: m[2] };
}

export default function SessionDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    function scan() {
      try {
        if (typeof window === "undefined") { setActive(null); return; }
        // Hide while you're actually inside the logger page.
        if (pathname && pathname.includes("/workout")) { setActive(null); return; }
        let best: Active | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !/^symmetry_wl_.+_[tc]$/.test(k)) continue;
          const parsed = parseKey(k);
          if (!parsed) continue;
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          let d: any;
          try { d = JSON.parse(raw); } catch { continue; }
          if (!d || d.sessionMode !== true) continue;
          const savedAt = typeof d.savedAt === "number" ? d.savedAt : 0;
          if (savedAt && Date.now() - savedAt > 8 * 60 * 60 * 1000) continue; // stale > 8h
          if (!best || savedAt > best.savedAt) best = { clientId: parsed.clientId, dayId: parsed.dayId, savedAt };
        }
        setActive(best);
      } catch { setActive(null); }
    }
    scan();
    const id = setInterval(scan, 4000);
    return () => clearInterval(id);
  }, [pathname]);

  if (!active) return null;

  const resume = () => {
    const q = active.clientId && active.clientId !== "me" ? `?forClient=${active.clientId}` : "";
    router.push(`/workout/${active.dayId}${q}`);
  };

  return (
    <div
      onClick={resume}
      role="button"
      aria-label="Resume workout in progress"
      style={{
        position: "fixed", left: 10, right: 10,
        bottom: "calc(76px + env(safe-area-inset-bottom))",
        zIndex: 900, cursor: "pointer",
        maxWidth: 560, margin: "0 auto",
        background: "linear-gradient(135deg,#17294d,#20386b)",
        border: "1.5px solid #e0a83e", borderRadius: 15, padding: "10px 13px",
        display: "flex", alignItems: "center", gap: 11,
        boxShadow: "0 10px 26px rgba(0,0,0,0.32)",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0f1f3d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, border: "1px solid #e0a83e", flexShrink: 0 }}>🏋️</div>
      <div style={{ flex: 1, minWidth: 0, color: "#fff" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#e0a83e", letterSpacing: "0.04em" }}>● WORKOUT IN PROGRESS</div>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Tap to resume your session</div>
      </div>
      <div style={{ fontSize: 22, color: "#e0a83e", fontWeight: 800, flexShrink: 0 }}>⌃</div>
    </div>
  );
}
