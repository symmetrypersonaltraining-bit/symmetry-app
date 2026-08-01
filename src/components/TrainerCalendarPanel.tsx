"use client";

// Collapsed week strip that expands into the full calendar.
//
// The trainer home rendered the entire month calendar inline, which pushed
// everything else off the screen and meant a glance at "who is in today"
// required scrolling past a grid built for editing. This shows seven days with
// client initials, and expands to the real <TrainerCalendar /> on tap.
//
// IMPORTANT: this wraps TrainerCalendar, it does not replace or reimplement it.
// The calendar owns Google Calendar sync behaviour, drag-to-move, and the
// appointment editing that payments and schedule proposals depend on. None of
// that is touched — this component only decides whether it is on screen.

import { useMemo, useState } from "react";
import TrainerCalendar from "@/app/(app)/home/TrainerCalendar";

// Take the prop types from the calendar itself. Redeclaring AE here would give
// two structurally identical types that TypeScript treats as unrelated, and
// worse, would silently drift the day someone adds a field to the real one.
type CalProps = React.ComponentProps<typeof TrainerCalendar>;

interface Props {
  clients: CalProps["clients"];
  appointmentMap: CalProps["appointmentMap"];
  workoutMap: CalProps["workoutMap"];
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function ctToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function isCancelled(s: string) {
  return s === "cancelled" || s === "cancelled_client" || s === "cancelled_trainer";
}

export default function TrainerCalendarPanel({ clients, appointmentMap, workoutMap }: Props) {
  const [open, setOpen] = useState(false);

  const week = useMemo(() => {
    const today = ctToday();
    const dow = new Date(today + "T12:00:00").getDay();
    const start = addDays(today, -dow);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const rows = (appointmentMap[date] ?? []).filter((a) => !isCancelled(a.status));
      return {
        date,
        dow: DOW[i],
        dayNum: Number(date.slice(8, 10)),
        isToday: date === today,
        names: rows.map((r) => r.clientName).filter(Boolean),
      };
    });
  }, [appointmentMap]);

  const total = week.reduce((n, d) => n + d.names.length, 0);

  if (open) {
    return (
      <div className="max-w-lg mx-auto px-4">
        <button
          onClick={() => setOpen(false)}
          className="w-full flex items-center justify-center gap-2 mb-3"
          style={{
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-border)",
            borderRadius: 12,
            padding: 10,
            fontSize: 12.5,
            fontWeight: 800,
            color: "var(--brand-primary)",
            cursor: "pointer",
          }}
        >
          <i className="ti ti-arrows-minimize" /> Collapse to week
        </button>
        <TrainerCalendar
          clients={clients}
          appointmentMap={appointmentMap}
          workoutMap={workoutMap}
          startDate=""
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-4">
      <div className="metric-card">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
            📅 This week
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)",
              color: "var(--brand-primary)",
            }}
          >
            {total} session{total === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {week.map((d) => (
            <div
              key={d.date}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 11,
                padding: "6px 3px 7px",
                textAlign: "center",
                background: d.isToday
                  ? "color-mix(in srgb, var(--brand-primary) 13%, transparent)"
                  : "var(--brand-card)",
                border: d.isToday ? "1px solid var(--brand-primary)" : "1px solid transparent",
              }}
            >
              <div style={{ fontSize: 8.5, fontWeight: 800, color: "var(--brand-text-secondary)" }}>
                {d.dow}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-text)", lineHeight: 1.15 }}>
                {d.dayNum}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 2,
                  justifyContent: "center",
                  marginTop: 3,
                  minHeight: 14,
                }}
              >
                {d.names.length === 0 ? (
                  <span style={{ fontSize: 8.5, color: "var(--brand-text-secondary)" }}>—</span>
                ) : (
                  <>
                    {d.names.slice(0, 3).map((n, i) => (
                      <span
                        key={i}
                        title={n}
                        style={{
                          fontSize: 7,
                          fontWeight: 800,
                          borderRadius: 999,
                          padding: "1.5px 3px",
                          lineHeight: 1.15,
                          background: "var(--brand-primary)",
                          color: "#fff",
                        }}
                      >
                        {initials(n)}
                      </span>
                    ))}
                    {d.names.length > 3 && (
                      <span
                        style={{
                          fontSize: 7,
                          fontWeight: 800,
                          color: "var(--brand-text-secondary)",
                          lineHeight: 1.15,
                          padding: "1.5px 1px",
                        }}
                      >
                        +{d.names.length - 3}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 mt-2.5 pt-2.5"
          style={{
            borderTop: "1px dashed var(--brand-border)",
            background: "none",
            border: "none",
            borderTopWidth: 1,
            borderTopStyle: "dashed",
            borderTopColor: "var(--brand-border)",
            fontSize: 11.5,
            fontWeight: 800,
            color: "var(--brand-primary)",
            cursor: "pointer",
          }}
        >
          <i className="ti ti-arrows-maximize" /> Open full calendar
        </button>
      </div>
    </div>
  );
}
