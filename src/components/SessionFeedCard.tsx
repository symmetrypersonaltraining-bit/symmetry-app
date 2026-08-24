"use client";

import { useEffect, useState } from "react";

/**
 * Share my booked sessions — the Settings card behind the published feed.
 *
 * Dustin, 24 Aug 2026: other trainers at Sevens need to see where he has
 * clients. PushPress cannot be written to (its API has one appointment
 * operation and it is a GET), so the sessions are published as a calendar and
 * subscribed to. See src/lib/sessionFeed.ts.
 *
 * Every trainer gets this card. Off until they switch it on.
 */

type State = {
  enabled: boolean;
  nameStyle: string;
  url: string | null;
  mirrorEnabled: boolean;
  mirrorCalendarId: string | null;
  mirrorSyncedAt: string | null;
  mirrorError: string | null;
};

export default function SessionFeedCard() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/calendar/feed-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j && !j.error) setS(j as State);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const act = async (action: string, nameStyle?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/feed-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, nameStyle }),
      });
      const j = await res.json();
      if (!j.error) setS(j as State);
      else alert(j.error);
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
            <i className="ti ti-calendar-share mr-1.5" style={{ color: "var(--brand-primary)" }} />
            Share my booked sessions
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
            {s.enabled
              ? "On — anyone with the link sees your client sessions, and nothing else"
              : "Off — give the other trainers a read-only view of when you have clients"}
          </p>
        </div>
        <div
          className="w-11 h-6 rounded-full relative transition-colors"
          style={{
            background: s.enabled ? "var(--brand-primary)" : "var(--brand-border)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
          onClick={() => !busy && act(s.enabled ? "off" : "on")}
        >
          <div
            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
            style={{ left: s.enabled ? "calc(100% - 20px)" : "4px" }}
          />
        </div>
      </div>

      {s.enabled && s.url && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)" }}>
              Subscribe link — in Google Calendar this is{" "}
              <strong>Other calendars → From URL</strong>. Works in Apple Calendar and Outlook too.
            </p>
            <div
              className="text-[11px] px-2.5 py-2 rounded-lg break-all"
              style={{
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
                color: "var(--brand-text-secondary)",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {s.url}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(s.url!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  alert("Could not copy — select the link above instead.");
                }
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
              style={{ background: "var(--brand-primary)", border: "none", cursor: "pointer" }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>

            <button
              onClick={() => act("names", s.nameStyle === "full" ? "initial" : "full")}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
                color: "var(--brand-text)",
                cursor: "pointer",
              }}
            >
              {s.nameStyle === "full" ? "Showing full names" : "Showing first name + initial"}
            </button>

            {/* The revoke. Anyone who has the link keeps it forever otherwise —
                a subscribed calendar does not ask again. */}
            <button
              onClick={() => {
                if (
                  !confirm(
                    "Make a new link?\n\nThe old one stops working straight away, so anyone already subscribed will need the new one.",
                  )
                )
                  return;
                act("rotate");
              }}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                background: "transparent",
                border: "1px solid var(--brand-border)",
                color: "var(--brand-text-secondary)",
                cursor: "pointer",
              }}
            >
              New link
            </button>
          </div>

          <p className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>
            Booked sessions show as busy under the client&apos;s name. A session you turn orange in
            Google shows as <strong>CANCELLED</strong> and the slot reads as free. Nothing else
            leaves the app — no notes, no numbers, no programme.
          </p>
        </div>
      )}

      {/* ── The Google calendar the gym's PushPress can read ─────────────────
          A subscribe link is fine for a colleague's own calendar, but PushPress
          Grow's Two-Way / Smart Sync connects to a Google ACCOUNT. Pointing it
          at the primary calendar would put the dentist and the school run on
          the gym's shared calendar, so the app writes a calendar of its own. */}
      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--brand-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
              <i className="ti ti-calendar-plus mr-1.5" style={{ color: "#4285F4" }} />
              Put them on their own Google calendar
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              {s.mirrorEnabled
                ? "On — “Symmetry — Client Sessions” in your Google account. This is the one to give PushPress."
                : "For gym software that reads a Google calendar. Your own calendar is never touched."}
            </p>
          </div>
          <div
            className="w-11 h-6 rounded-full relative transition-colors"
            style={{
              background: s.mirrorEnabled ? "var(--brand-primary)" : "var(--brand-border)",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
            }}
            onClick={() => !busy && act(s.mirrorEnabled ? "mirror_off" : "mirror_on")}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
              style={{ left: s.mirrorEnabled ? "calc(100% - 20px)" : "4px" }}
            />
          </div>
        </div>

        {s.mirrorEnabled && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={async () => {
                  setPublishing(true);
                  setPublishNote(null);
                  try {
                    const res = await fetch("/api/calendar/mirror", { method: "POST" });
                    const j = await res.json();
                    if (j.error) setPublishNote("Failed: " + j.error);
                    else if (j.skipped) setPublishNote(j.reason);
                    else
                      setPublishNote(
                        `${j.published} session${j.published === 1 ? "" : "s"} published` +
                          (j.removed ? `, ${j.removed} removed` : "") +
                          (j.createdCalendar ? " — calendar created" : "") +
                          (j.errors?.length ? ` — ${j.errors.length} problem(s)` : ""),
                      );
                    // Pick up the stored calendar id and the run's error state.
                    const r2 = await fetch("/api/calendar/feed-settings");
                    const j2 = await r2.json();
                    if (!j2.error) setS(j2 as State);
                  } catch (e) {
                    setPublishNote("Failed: " + (e as Error).message);
                  } finally {
                    setPublishing(false);
                  }
                }}
                disabled={publishing}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ background: "#4285F4", border: "none", cursor: "pointer", opacity: publishing ? 0.6 : 1 }}
              >
                {publishing ? "Publishing…" : s.mirrorCalendarId ? "Publish now" : "Create it and publish"}
              </button>
              {s.mirrorSyncedAt && (
                <span className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>
                  last published{" "}
                  {new Date(s.mirrorSyncedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}
                </span>
              )}
            </div>

            {publishNote && (
              <p className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>
                {publishNote}
              </p>
            )}

            {/* The last run's problems, kept rather than cleared. A mirror that
                half-works silently is how the gym's calendar goes wrong. */}
            {s.mirrorError && (
              <p className="text-[11px]" style={{ color: "#f87171" }}>
                Last run reported: {s.mirrorError}
              </p>
            )}

            <p className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>
              Don&apos;t edit that calendar by hand — it gets rewritten. Change the session in your
              own calendar and it follows.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
