"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { drawShareCard, canvasToBlob, ShareCardData } from "@/lib/shareCard";
import ShareToGroup from "@/components/ShareToGroup";
import { fx } from "@/lib/fx";

/**
 * AchievementCard — "Share my week" as an actual image. 2026-07-25.
 *
 * Pulls the person's real week (sessions, sets, volume, best lift), draws a
 * branded card on a canvas, and offers three ways out:
 *   1. Share — the native sheet, with the PNG attached, when the device
 *      supports sharing files (Android WebView + iOS both do).
 *   2. Save image — a plain download, always available as the fallback.
 *   3. Share to group — posts the text version into the group chat via the
 *      existing ShareToGroup button, so wins land where the community is.
 *
 * SAFETY: read-only, client-side, under the caller's own RLS. If anything
 * fails — no canvas, no data, no share API — the button either never renders
 * or degrades to the download path. Nothing here can affect logging.
 */

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dowOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function pretty(iso: string): string {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, d] = iso.split("-").map(Number);
  return MON[m - 1] + " " + d;
}

interface Week {
  sessions: number;
  sets: number;
  volume: number;
  bestLift: { name: string; weight: number } | null;
  start: string;
  end: string;
}

export default function AchievementCard({ clientId, name }: { clientId: string; name?: string | null }) {
  const [week, setWeek] = useState<Week | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const supabase: any = createClient();
        const today = todayCT();
        const start = addDays(today, -dowOf(today));
        const logs = await supabase
          .from("workout_logs")
          .select("id, log_date")
          .eq("client_id", clientId)
          .eq("completed", true)
          .gte("log_date", start)
          .lte("log_date", today);
        const rows = (logs.data || []) as { id: string; log_date: string }[];
        if (!rows.length) {
          if (alive) setWeek({ sessions: 0, sets: 0, volume: 0, bestLift: null, start, end: today });
          return;
        }
        const ids = rows.map((r) => r.id);
        const sl = await supabase
          .from("set_logs")
          .select("weight_lbs, reps, completed, exercises(name)")
          .in("workout_log_id", ids)
          .eq("completed", true);
        let sets = 0;
        let volume = 0;
        let bestLift: { name: string; weight: number } | null = null;
        for (const s of ((sl.data || []) as Record<string, unknown>[])) {
          sets++;
          const w = Number(s.weight_lbs) || 0;
          const r = Number(s.reps) || 0;
          volume += w * r;
          const nm = ((s.exercises as { name?: string } | null)?.name) || "";
          if (nm && w > 0 && (!bestLift || w > bestLift.weight)) bestLift = { name: nm, weight: w };
        }
        if (!alive) return;
        setWeek({
          sessions: new Set(rows.map((r) => r.log_date)).size,
          sets,
          volume,
          bestLift,
          start,
          end: today,
        });
      } catch {
        /* silent — the button simply won't appear */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  const cardData: ShareCardData | null = week
    ? {
        name: name ? name.split(" ")[0] : null,
        headline: week.sessions + (week.sessions === 1 ? " SESSION" : " SESSIONS"),
        subhead: pretty(week.start) + " – " + pretty(week.end),
        stats: [
          { label: "sets", value: String(week.sets) },
          { label: "lbs moved", value: week.volume >= 1000 ? Math.round(week.volume / 1000) + "k" : String(Math.round(week.volume)) },
          ...(week.bestLift ? [{ label: "top set", value: Math.round(week.bestLift.weight) + " lb" }] : []),
        ],
        note: week.bestLift ? "Heaviest: " + week.bestLift.name : null,
      }
    : null;

  // Render the preview into the modal when it opens.
  useEffect(() => {
    if (!open || !cardData || !previewRef.current) return;
    try {
      const canvas = drawShareCard(cardData);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.borderRadius = "14px";
      canvas.style.display = "block";
      previewRef.current.innerHTML = "";
      previewRef.current.appendChild(canvas);
    } catch {
      setMsg("Couldn't draw the card on this device.");
    }
    // cardData is derived from `week`; re-running on `week` is the honest dep.
  }, [open, week]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!week || week.sessions === 0 || !cardData) return null;

  const shareText =
    (name ? name.split(" ")[0] + " — " : "") +
    week.sessions +
    (week.sessions === 1 ? " session" : " sessions") +
    " this week · " +
    week.sets +
    " sets · " +
    Math.round(week.volume).toLocaleString() +
    " lbs moved" +
    (week.bestLift ? " · top set " + Math.round(week.bestLift.weight) + " lb " + week.bestLift.name : "") +
    " 💪";

  async function saveImage() {
    if (!cardData || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const canvas = drawShareCard(cardData);
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "symmetry-week-" + (week ? week.end : "") + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      fx("complete");
      setMsg("Saved to your downloads.");
    } catch {
      setMsg("Couldn't save the image on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function nativeShare() {
    if (!cardData || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const canvas = drawShareCard(cardData);
      const blob = await canvasToBlob(canvas);
      const nav = navigator as Navigator & {
        canShare?: (d: { files?: File[] }) => boolean;
        share?: (d: { files?: File[]; text?: string; title?: string }) => Promise<void>;
      };
      if (blob && nav.share && nav.canShare) {
        const file = new File([blob], "symmetry-week.png", { type: "image/png" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], text: shareText, title: "My week" });
          fx("complete");
          return;
        }
      }
      // No file sharing on this device — fall back to the download.
      await saveImage();
    } catch {
      // A user-cancelled share throws too; say nothing rather than cry wolf.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setMsg(null); }}
        data-fx-own
        style={{
          width: "100%",
          marginBottom: 12,
          padding: "13px 16px",
          borderRadius: 16,
          border: "1px solid var(--brand-border)",
          background: "var(--brand-surface)",
          color: "var(--brand-text)",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        🏆 Share my week
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-text-secondary)" }}>
          {week.sessions + (week.sessions === 1 ? " session" : " sessions")}
        </span>
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--brand-bg)",
              borderRadius: "22px 22px 0 0",
              padding: 16,
              paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
              maxHeight: "92dvh",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-text)" }}>Your week</div>
              <button
                onClick={() => setOpen(false)}
                style={{ border: "none", background: "transparent", color: "var(--brand-text-secondary)", fontSize: 13, cursor: "pointer" }}
              >
                Close
              </button>
            </div>

            <div ref={previewRef} style={{ marginBottom: 14 }} />

            {msg && (
              <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginBottom: 10, textAlign: "center" }}>
                {msg}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                onClick={nativeShare}
                disabled={busy}
                data-fx-own
                className="cw-sweep"
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "none",
                  background: "var(--grad-cta, var(--brand-primary))",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Share
              </button>
              <button
                onClick={saveImage}
                disabled={busy}
                data-fx-own
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "1px solid var(--brand-border)",
                  background: "var(--brand-surface)",
                  color: "var(--brand-text)",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Save image
              </button>
            </div>

            <ShareToGroup
              text={shareText}
              label="Post it in the group"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
