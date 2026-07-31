"use client";

// The weekly programming brief, shown at the top of a trainer-run session.
//
// Feedback 117353cd: "Give trainer app a summary on first session of each
// client for the week of what the programming looks like that week, any
// changes, focus on, etc."
//
// Deliberately an INLINE card, not a full-screen takeover. Dustin opens this
// standing next to a client with the session about to start — a modal he has
// to dismiss before he can log a set would be worse than no feature. It opens
// expanded on the first session of the client's week and collapsed after that;
// the collapsed state is a single tappable strip so it's always one tap away.
//
// Trainer-only: the route refuses anyone else, and this component is only
// mounted when isTrainerSession is true. Nothing here is ever shown to a client
// — "Cable Row has sat at 90 lb for 4 sessions" is a coaching prompt, not a
// verdict to hand someone.
//
// The card must read fine with no AI line at all; `line` is garnish.

import { useEffect, useState } from "react";

interface Change {
  kind: "phase" | "new-movement" | "progressed" | "stalled" | "adherence";
  text: string;
}
interface Track {
  program: string;
  phase: string | null;
}
interface BriefDay {
  date: string;
  day: string;
  labels: string[];
  done: number;
}
interface Brief {
  weekStart: string;
  clientName: string;
  tracks: Track[];
  headline: string;
  days: BriefDay[];
  changes: Change[];
  focus: { text: string; source: "week-ahead" | "derived" | "note" } | null;
  empty: boolean;
}

// The focus line is labelled by where it came from. "Week Ahead" is the focus
// he already set for this client — it's written to the client and it's what
// they see on their own home screen, so it's shown as theirs, not as a note to
// himself.
const FOCUS_LABEL: Record<NonNullable<Brief["focus"]>["source"], string> = {
  "week-ahead": "Week Ahead",
  derived: "Focus",
  note: "Last note",
};

const ICON: Record<Change["kind"], string> = {
  phase: "ti-stairs-up",
  "new-movement": "ti-sparkles",
  progressed: "ti-trending-up",
  stalled: "ti-alert-triangle",
  adherence: "ti-calendar-x",
};
const TINT: Record<Change["kind"], string> = {
  phase: "#7c3aed",
  "new-movement": "#0891b2",
  progressed: "#16a34a",
  stalled: "#ea580c",
  adherence: "#6b7280",
};

export default function WeeklyBriefCard({ clientId }: { clientId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/weekly-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        if (!res.ok) return; // a client account, or no session — just show nothing
        const j = (await res.json()) as { brief: Brief | null; line: string | null; seen: boolean };
        if (!on || !j.brief || j.brief.empty) return;
        setBrief(j.brief);
        setLine(j.line ?? null);
        setOpen(!j.seen); // first session of the week opens it; later ones don't
        setLoaded(true);
      } catch {
        /* the brief is never worth breaking a session over */
      }
    })();
    return () => { on = false; };
  }, [clientId]);

  // Mark read once he's actually seen it expanded, so it stays collapsed on the
  // next session — and on his other device, which is why this is a server write.
  useEffect(() => {
    if (!loaded || !open || !brief) return;
    fetch("/api/weekly-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ack: true }),
    }).catch(() => { /* worst case it opens once more */ });
  }, [loaded, open, brief, clientId]);

  if (!brief) return null;

  const first = brief.clientName.split(" ")[0];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium"
        style={{ background: "#111827", color: "#d1d5db" }}
      >
        <i className="ti ti-clipboard-text text-sm" />
        <span>This week for {first}</span>
        {brief.changes.length > 0 && (
          <span
            className="px-1.5 rounded-full text-[10px] font-bold"
            style={{ background: "#374151", color: "#f9fafb" }}
          >
            {brief.changes.length}
          </span>
        )}
        <i className="ti ti-chevron-down text-sm ml-auto" />
      </button>
    );
  }

  return (
    <div style={{ background: "#111827", color: "#e5e7eb" }} className="px-4 pt-3 pb-3">
      <div className="flex items-start gap-2 mb-2">
        <i className="ti ti-clipboard-text text-base mt-0.5" style={{ color: "#9ca3af" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: "#f9fafb" }}>
            This week for {first}
          </p>
          {/* Only when there's exactly one program. A client on three would
              turn this into a second paragraph, and the phase lines below
              already say which one moved. */}
          {brief.tracks.length === 1 && (
            <p className="text-[11px]" style={{ color: "#9ca3af" }}>
              {[brief.tracks[0].program, brief.tracks[0].phase].filter(Boolean).join(" · ")}
            </p>
          )}
          {brief.tracks.length > 1 && (
            <p className="text-[11px]" style={{ color: "#9ca3af" }}>
              {brief.tracks.length} programs running
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse brief"
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <i className="ti ti-chevron-up text-sm" style={{ color: "#d1d5db" }} />
        </button>
      </div>

      {line && (
        <p className="text-[13px] leading-snug mb-2 pl-6" style={{ color: "#f3f4f6" }}>
          {line}
        </p>
      )}

      {/* The week, one row per day. Flat it ran to ten-plus entries on clients
          with a daily walk — grouped it's four short lines he can scan. */}
      <p className="text-[12px] leading-snug pl-6 mb-1.5" style={{ color: "#9ca3af" }}>
        {brief.headline}
      </p>

      {brief.days.length > 0 && (
        <ul className="pl-6 mb-2 space-y-0.5">
          {brief.days.map((d) => (
            <li key={d.date} className="flex items-start gap-2 text-[12px] leading-snug">
              <span
                className="font-bold shrink-0 w-8"
                style={{ color: d.done === d.labels.length ? "#16a34a" : "#9ca3af" }}
              >
                {d.day}
              </span>
              <span className="flex-1 min-w-0" style={{ color: "#e5e7eb" }}>
                {d.labels.join(" · ")}
              </span>
              {d.done > 0 && (
                <i className="ti ti-check text-sm shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
              )}
            </li>
          ))}
        </ul>
      )}

      {brief.changes.length > 0 && (
        <ul className="pl-6 space-y-1.5 mb-2">
          {brief.changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] leading-snug">
              <i className={`ti ${ICON[c.kind]} text-sm mt-0.5 shrink-0`} style={{ color: TINT[c.kind] }} />
              <span style={{ color: "#e5e7eb" }}>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      {brief.focus && (
        <div
          className="ml-6 px-2.5 py-1.5 rounded-lg text-[12px] leading-snug"
          style={{ background: "rgba(255,255,255,0.06)", color: "#f3f4f6" }}
        >
          <span className="font-bold" style={{ color: "#fbbf24" }}>{FOCUS_LABEL[brief.focus.source]} </span>
          {brief.focus.source === "note" ? `“${brief.focus.text}”` : brief.focus.text}
        </div>
      )}
    </div>
  );
}
