"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Confetti from "./Confetti";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

type Badge = { id: string; label: string; icon: string; kind: "sessions" | "streak"; threshold: number };
const BADGES: Badge[] = [
  { id: "first", label: "First Workout", icon: "🎯", kind: "sessions", threshold: 1 },
  { id: "s10", label: "10 Sessions", icon: "🔥", kind: "sessions", threshold: 10 },
  { id: "s25", label: "25 Sessions", icon: "💪", kind: "sessions", threshold: 25 },
  { id: "s50", label: "50 Sessions", icon: "🏅", kind: "sessions", threshold: 50 },
  { id: "s100", label: "100 Sessions", icon: "🏆", kind: "sessions", threshold: 100 },
  { id: "st7", label: "7-Day Streak", icon: "⚡", kind: "streak", threshold: 7 },
  { id: "st30", label: "30-Day Streak", icon: "🌟", kind: "streak", threshold: 30 },
  { id: "st90", label: "90-Day Streak", icon: "👑", kind: "streak", threshold: 90 },
];

/**
 * Self-contained milestone badges strip. Derives earned achievements from the
 * client's own completed workout_logs (session count + current streak) — no new
 * tables, read-only. Fires a one-shot confetti burst when a new badge is earned
 * (once per badge per device). "Share" opens the group chat so the client can
 * post it — nothing auto-sends. Returns null on any error or when nothing earned,
 * so it can never break the home screen.
 */
export default function MilestoneBadges() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [ready, setReady] = useState(false);
  const [celebrate, setCelebrate] = useState<Badge | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase: any = createClient();
        const forClient = searchParams?.get("forClient");
        let clientId: string | null = null;
        const { data: auth } = await supabase.auth.getUser();
        const email = auth?.user?.email || "";
        if (forClient) {
          clientId = forClient;
        } else if (email === TRAINER_EMAIL) {
          const { data: d } = await supabase.from("clients").select("id").ilike("name", "%Dustin%").maybeSingle();
          clientId = d?.id || null;
        } else if (auth?.user) {
          const { data: d } = await supabase.from("clients").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
          clientId = d?.id || null;
        }
        if (!clientId) return;
        const { data: logs } = await supabase
          .from("workout_logs")
          .select("log_date")
          .eq("client_id", clientId)
          .eq("completed", true)
          .order("log_date", { ascending: false });
        if (cancelled) return;
        const rows = logs || [];
        const count = rows.length;
        const dates = new Set(rows.map((r: any) => r.log_date));
        const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        let s = 0;
        const cur = new Date();
        if (!dates.has(fmt(cur))) cur.setDate(cur.getDate() - 1);
        while (dates.has(fmt(cur))) {
          s++;
          cur.setDate(cur.getDate() - 1);
        }
        setSessions(count);
        setStreak(s);
        setReady(true);

        const earnedIds = BADGES.filter((b) => (b.kind === "sessions" ? count : s) >= b.threshold).map((b) => b.id);
        const key = "symmetry_badges_seen_" + clientId;
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem(key) || "[]");
        } catch {}
        const fresh = earnedIds.filter((id) => !seen.includes(id));
        if (fresh.length) {
          const b = BADGES.find((x) => x.id === fresh[fresh.length - 1]) || null;
          setCelebrate(b);
          try {
            localStorage.setItem(key, JSON.stringify(earnedIds));
          } catch {}
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (!ready || sessions === null) return null;
  const earned = BADGES.filter((b) => (b.kind === "sessions" ? sessions : streak) >= b.threshold);
  if (earned.length === 0) return null;
  const next = BADGES.find((b) => (b.kind === "sessions" ? sessions : streak) < b.threshold);

  return (
    <div style={{ marginTop: 20 }}>
      {celebrate && <Confetti onDone={() => setCelebrate(null)} />}
      <h2 className="text-base font-bold mb-2.5" style={{ color: "var(--brand-text)" }}>
        Milestones
      </h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {earned.map((b) => (
          <div
            key={b.id}
            className="cw-lift flex flex-col items-center justify-center rounded-2xl px-3 py-2.5 flex-shrink-0"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", minWidth: 84 }}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }}>{b.icon}</span>
            <span className="text-[11px] font-semibold mt-1 text-center" style={{ color: "var(--brand-text)" }}>
              {b.label}
            </span>
            <button
              onClick={() => router.push("/messages?client=group")}
              className="text-[10px] font-semibold mt-1"
              style={{ color: "var(--brand-primary)" }}
            >
              Share 🎉
            </button>
          </div>
        ))}
        {next && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl px-3 py-2.5 flex-shrink-0 opacity-50"
            style={{ background: "var(--brand-card)", border: "1px dashed var(--brand-border)", minWidth: 84 }}
          >
            <span style={{ fontSize: 26, lineHeight: 1, filter: "grayscale(1)" }}>{next.icon}</span>
            <span className="text-[11px] font-semibold mt-1 text-center" style={{ color: "var(--brand-text-secondary)" }}>
              {next.label}
            </span>
            <span className="text-[10px] mt-1" style={{ color: "var(--brand-text-secondary)" }}>
              {next.kind === "sessions" ? sessions + "/" + next.threshold : streak + "/" + next.threshold}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
