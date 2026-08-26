"use client";

// Is the calendar sync actually working?
//
// Dustin, 20 Aug: "my gcal ... is not syncing reliable to the app calendar" and
// "I have manual sync in app but its not picking up everything."
//
// Every run has been logged to `gcal_sync_runs` since 1 Aug — request id,
// status, the full response — and NOTHING in the app has ever read it. Grepping
// src/ for the table name returned zero hits. The table even carries an RLS
// policy written specifically to expose it, commented "The trainer needs to see
// sync health in the app." The screen to do that was never built.
//
// So a sync broken for weeks looked exactly like a healthy one. It has happened:
// the sync was fully dead from 31 July and was found only by reverse-engineering
// a Google token-refresh timestamp, because that was the sole remaining signal.
//
// Two things this shows that the old GcalSyncButton could not:
//   - HOW LONG AGO. "Synced 9 hours ago" is the whole answer to "why isn't my
//     change showing up".
//   - WHAT WAS DROPPED. ~2,000 events a run match no client and vanish silently.
//     Most are his own diary; a mistyped client name is indistinguishable from
//     it, and that is a lost session nobody is told about.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import GcalSyncButton from "@/components/GcalSyncButton";

interface Run {
  queued_at: string;
  ok: boolean | null;
  status_code: number | null;
  response: Record<string, unknown> | null;
  error: string | null;
  /** "instance" for the owner, "mine" for anyone else. */
  scope?: string | null;
}

function ago(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return mins + " min ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? " day ago" : " days ago");
}

/** Over this and the sync is not keeping up, whatever the last run said. */
const STALE_MINUTES = 150;

export default function SyncHealth() {
  const [run, setRun] = useState<Run | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sup = createClient() as any;
        // WHOSE SYNC. `gcal_sync_runs` is owner-only (20260821d) because a run
        // row covers every trainer at once, so this card - the one thing that
        // says whether a trainer's calendar is working - rendered as `null` for
        // everyone but Dustin. That is the exact silent failure it was written
        // to end, still fully present for anyone else.
        //
        // my_gcal_sync_health() hands the owner the whole run and every other
        // trainer only their own entry out of it. The table stays shut.
        const { data } = await sup.rpc("my_gcal_sync_health");
        setRun((data || [])[0] ?? null);
      } catch {
        /* never break the home screen over a status widget */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded || !run) return null;

  const r = (run.response || {}) as Record<string, any>;
  const errs: string[] = Array.isArray(r.errors) ? r.errors : [];
  const unmatched = Number(r.unmatched ?? 0);
  const samples: string[] = Array.isArray(r.unmatched_samples) ? r.unmatched_samples : [];
  const minsOld = Math.round((Date.now() - Date.parse(run.queued_at)) / 60000);
  const stale = minsOld > STALE_MINUTES;
  // `ok` is derived from the HTTP status, so a 200 carrying ten errors logs as
  // success — and a disabled or disconnected calendar returns 200 with
  // {skipped:true}. Neither is healthy. Judge the payload, not the status code.
  const skipped = r.skipped === true;
  // A RUN THAT NEVER ANSWERED IS NOT A HEALTHY RUN.
  //
  // Dustin, 26 Aug, screenshot: a green dot, "Calendar in sync", 27 min ago —
  // above the words "Timeout of 55000 ms reached" in green text. The sync had
  // not completed for a day and the card said it was fine.
  //
  // Two holes, both here. `ok` is NULL when the scheduler gave up waiting (it
  // is only false on a real HTTP failure), and `run.error` — which is where a
  // timeout lands — was rendered on screen but never consulted in the verdict.
  // So the card printed the reason it was broken in the colour for "healthy".
  //
  // `ok !== true` rather than `ok === false`: unknown is not success. A status
  // card that reads the opposite of its own error text is worse than no card.
  const timedOut = !!run.error;
  const bad = run.ok !== true || timedOut || errs.length > 0 || skipped || stale;

  const tone = bad ? "#ef4444" : "#22c55e";
  const headline = run.ok === false || timedOut
    ? "Calendar sync failed"
    : run.ok !== true
      ? "Calendar sync did not finish"
    : skipped
      ? "Calendar sync is switched off"
      : errs.length > 0
        ? "Calendar synced with errors"
        : stale
          ? "Calendar sync is behind"
          : "Calendar in sync";

  return (
    <div className="rounded-2xl px-3.5 py-3"
      style={{ background: "var(--brand-card)", border: "1px solid " + (bad ? tone + "55" : "var(--brand-border)") }}>
      <div className="flex items-center gap-2.5">
        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: tone }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{headline}</div>
          <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {ago(run.queued_at) + (r.synced != null ? " · " + r.synced + " sessions" : "")}
            {r.window ? " · " + r.window : ""}
          </div>
        </div>
        {/* The manual sync sits ON the status bar. Dustin, 21 Aug: "move the
            actual manual sync button onto the cal in sync bar on the right side
            as a button on top of it." Knowing the sync is behind and being able
            to do something about it are one thought, not two controls. */}
        <div style={{ flexShrink: 0 }}><GcalSyncButton compact /></div>
      </div>

      {skipped && r.reason && (
        <div className="text-xs mt-2" style={{ color: tone }}>{String(r.reason)}</div>
      )}
      {run.error && (
        <div className="text-xs mt-2" style={{ color: tone }}>{run.error.slice(0, 160)}</div>
      )}
      {errs.map((e, i) => (
        <div key={i} className="text-xs mt-1.5" style={{ color: tone }}>{"⚠️ " + String(e).slice(0, 200)}</div>
      ))}

      {unmatched > 0 && (
        <div className="mt-2">
          <button onClick={() => setOpenList((o) => !o)}
            className="text-xs"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brand-text-secondary)", textDecoration: "underline" }}>
            {unmatched + " event" + (unmatched === 1 ? "" : "s") + " matched no client"}
          </button>
          {openList && samples.length > 0 && (
            <div className="mt-1.5 rounded-xl px-2.5 py-2 text-xs"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
              <div style={{ marginBottom: 4, opacity: 0.75 }}>
                Mostly your own diary. Anything here that IS a client is a session
                nobody is being billed for — check the spelling against their name.
              </div>
              {samples.slice(0, 25).map((t, i) => (
                <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
