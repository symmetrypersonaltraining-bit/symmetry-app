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

import { useCallback, useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
      try {
        const sup = createClient() as any;
        const { data } = await sup
          .from("clients")
          .select("id, name, weekly_focus, weekly_focus_week, weekly_focus_source")
          .is("archived_at", null)
          .order("name");
        setRows((data || []) as Row[]);
      } catch {
        /* never break the home screen over a status widget */
        setRows([]);
      }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── THE CARD THAT REPORTS THE FAILURE CAN NOW FIX IT ──────────────────────
  //
  // Dustin, 13 Sep: "it tells me clients need focus and shows me drafts when I
  // click but doesn't give me any options to regenerate or activate the
  // drafts."
  //
  // /api/cron/weekly-ai has taken a signed-in trainer POST for weeks — the
  // owner may sweep the whole roster — so the capability was already there and
  // simply had no control wired to it. Until now his only remedies were to wait
  // for Saturday or to go and read a cron log, which is what this card tells
  // him to do three lines further down.
  //
  // The sweep does not overwrite a line the trainer wrote himself: a client
  // whose focus is his comes back "focus-kept". So this only fills the gaps.
  async function sweep() {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const r = await fetch("/api/cron/weekly-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const wrote = Array.isArray(j?.results)
          ? j.results.filter((x: { status?: string }) => x?.status === "written").length
          : null;
        setNote(wrote != null ? `Wrote ${wrote} line${wrote === 1 ? "" : "s"}.` : "Done.");
        await load();
      } else {
        setNote(String(j?.error || "That didn't run — try again in a moment."));
      }
    } catch {
      setNote("That didn't run — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

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

      {/* One model call per client, so it says it is running and refuses a
          second tap while it does. */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={sweep}
          disabled={busy}
          className="text-xs font-semibold rounded-lg"
          style={{
            padding: "6px 11px",
            background: busy ? "var(--brand-bg)" : tone,
            color: busy ? "var(--brand-text-secondary)" : "#fff",
            border: "none",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Writing…" : "Write the missing ones"}
        </button>
        {note && (
          <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{note}</span>
        )}
      </div>

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
