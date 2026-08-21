"use client";

// Did this week's focus lines actually get written?
//
// Dustin, 21 Aug, on what should happen when there is no fresh line: "notify me
// to find the cause of failure and get it fixed asap."
//
// This is the in-app half of that. It exists because the weekly sweep failed on
// 15 Aug and NOBODY KNEW for six days — the failure looked exactly like a quiet
// week, and the client week card cheerfully went on showing a line from 8 Aug
// as if it were current. The same disease SyncHealth was built for, on a
// different pipeline.
//
// It also answers the other half of what he asked for: "mainly client but id
// like to see it as well to make sure it's serving the function i want." The
// lines are one tap away, collapsed by default, so this is a status strip and
// not the Week ahead roster he took off this screen on 21 Aug.
//
// RLS does the multi-trainer scoping: he sees his clients, Stephanie sees hers,
// and each gets a count that means something to them.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** The Sunday that starts the week containing `dateStr`. Matches the sweep. */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const p = iso.split("-").map(Number);
  return MON[p[1] - 1] + " " + p[2];
}

interface Row {
  id: string;
  name: string | null;
  weekly_focus: string | null;
  weekly_focus_week: string | null;
  weekly_focus_source: string | null;
}

export default function WeeklyFocusHealth() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const sup = createClient() as any;
        const { data } = await sup
          .from("clients")
          .select("id, name, weekly_focus, weekly_focus_week, weekly_focus_source")
          .is("archived_at", null)
          .order("name");
        if (on) setRows((data || []) as Row[]);
      } catch {
        /* never break the home screen over a status widget */
        if (on) setRows([]);
      }
    })();
    return () => { on = false; };
  }, []);

  if (!rows || rows.length === 0) return null;

  const week = weekStartOf(todayCT());
  const withFocus = rows.filter(
    (r) => r.weekly_focus_week === week && !!(r.weekly_focus || "").trim(),
  );
  const missing = rows.length - withFocus.length;

  // Green only when every client has one. A partial sweep is the failure mode
  // that hides best — 30 of 34 written looks fine in aggregate and means four
  // people are reading nothing.
  const bad = withFocus.length === 0;
  const partial = !bad && missing > 0;

  // SILENT WHEN HEALTHY, as of 21 Aug. Dustin: "now that daily focus is auto we
  // can get rid of that block on trainer dashboard correct?" — correct, there
  // is nothing to action when it worked. But this is also the surface that
  // reports a FAILED sweep, and deleting it would take the in-app half of the
  // alarm with it. So it disappears on a good week and speaks on a bad one.
  // Today's Admin carries the same failure as a red row.
  if (!bad && !partial) return null;
  const tone = bad ? "#ef4444" : partial ? "#f59e0b" : "#22c55e";

  const headline = bad
    ? "No focus written for this week"
    : partial
      ? missing + " client" + (missing === 1 ? " has" : "s have") + " no focus this week"
      : "Focus written for all " + rows.length;

  return (
    <div
      className="rounded-2xl px-3.5 py-3"
      style={{
        background: "var(--brand-card)",
        border: "1px solid " + (bad || partial ? tone + "55" : "var(--brand-border)"),
      }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: tone }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{headline}</div>
          <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {"Week of " + pretty(week) + " · written automatically late Saturday"}
          </div>
        </div>
      </div>

      {bad && (
        <div className="text-xs mt-2" style={{ color: tone }}>
          The Saturday sweep did not write. Clients see no focus line at all
          rather than an old one — check the Vercel cron log for
          /api/cron/weekly-ai.
        </div>
      )}

      {withFocus.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs"
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "var(--brand-text-secondary)", textDecoration: "underline",
            }}
          >
            {open ? "Hide the lines" : "Read this week's " + withFocus.length + " lines"}
          </button>
          {open && (
            <div
              className="mt-1.5 rounded-xl px-2.5 py-2 text-xs"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}
            >
              {withFocus.map((r) => (
                <div key={r.id} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "var(--brand-text)" }}>{r.name || "—"}</span>
                  {r.weekly_focus_source === "trainer" && (
                    <span style={{ opacity: 0.7 }}>{" (yours)"}</span>
                  )}
                  <div>{r.weekly_focus}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {partial && (
        <div className="text-xs mt-2" style={{ color: tone }}>
          {rows
            .filter((r) => !(r.weekly_focus_week === week && (r.weekly_focus || "").trim()))
            .map((r) => r.name || "—")
            .slice(0, 12)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
