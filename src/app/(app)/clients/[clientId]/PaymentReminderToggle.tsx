"use client";

import { useState } from "react";

interface Props {
  clientId: string;
  clientName: string;
  enabled: boolean;
  upcomingReminders: { date: string; amount: number; status: string }[];
}

const GRAPE = "#7C3AED";
const GRAPE_LIGHT = "#EDE9FE";

export default function PaymentReminderToggle({
  clientId,
  clientName,
  enabled: initialEnabled,
  upcomingReminders,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !enabled;
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_reminders_enabled: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = (s: string) => {
    if (s === "paused") return { label: "Paused", bg: "#FEF3C7", color: "#92400E" };
    if (s === "sent") return { label: "Sent", bg: "#D1FAE5", color: "#065F46" };
    if (s === "approved") return { label: "Approved", bg: "#DDEEFF", color: "#0F4C81" };
    return { label: "Pending", bg: "#F0F4F8", color: "#4E6080" };
  };

  return (
    <>
      <p className="label mt-4">billing &amp; reminders</p>
      <div className="card">
        {/* Toggle row */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: "#0D1B2E" }}>
              Payment reminders
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>
              {enabled ? "SMS reminders active" : "Reminders disabled for this client"}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={saving}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{
              background: enabled ? GRAPE : "#C8D8EC",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: enabled ? "translateX(22px)" : "translateX(4px)" }}
            />
          </button>
        </div>

        {/* Upcoming reminders list */}
        {upcomingReminders.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid #EDF2F7" }}>
            <div className="text-xs font-medium mb-2" style={{ color: "#4E6080" }}>
              Upcoming
            </div>
            {upcomingReminders.map((r, i) => {
              const d = new Date(r.date + "T00:00:00");
              const label = d.toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              });
              const badge = statusLabel(r.status);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2 border-b last:border-b-0 -mx-4 px-4"
                  style={{ borderColor: "#EDF2F7" }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: GRAPE_LIGHT }}
                  >
                    <i className="ti ti-credit-card text-sm" style={{ color: GRAPE }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: "#0D1B2E" }}>
                      ${Number(r.amount).toLocaleString()}
                    </div>
                    <div className="text-xs" style={{ color: "#4E6080" }}>{label}</div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {upcomingReminders.length === 0 && (
          <div className="mt-3 pt-3 text-xs" style={{ borderTop: "0.5px solid #EDF2F7", color: "#4E6080" }}>
            No upcoming reminders scheduled for {clientName.split(" ")[0]}.
          </div>
        )}
      </div>
    </>
  );
}
