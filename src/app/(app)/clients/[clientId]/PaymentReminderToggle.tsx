"use client";

import { useState } from "react";

interface Props {
  clientId: string;
  clientName: string;
  enabled: boolean;
  upcomingReminders: { date: string; amount: number; status: string }[];
  clientPhone: string | null;
}

const GRAPE = "#7C3AED";
const GRAPE_LIGHT = "#EDE9FE";

export default function PaymentReminderToggle({
  clientId,
  clientName,
  enabled: initialEnabled,
  upcomingReminders,
  clientPhone,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

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

  async function sendNow() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendResult(`Error: ${json.error}`);
        return;
      }
      const sent = json.results?.filter((r: any) => r.status === "sent").length ?? 0;
      const skipped = json.results?.filter((r: any) => r.status?.startsWith("skipped")).length ?? 0;
      if (sent > 0) setSendResult(`✓ Sent ${sent} reminder${sent > 1 ? "s" : ""}`);
      else if (skipped > 0) setSendResult("Nothing to send right now (no due reminders or phone missing)");
      else if (json.count === 0) setSendResult("No pending reminders due in the next 3 days");
      else setSendResult("Done");
    } catch {
      setSendResult("Network error — try again");
    } finally {
      setSending(false);
    }
  }

  const statusLabel = (s: string) => {
    if (s === "paused") return { label: "Paused", bg: "#FEF3C7", color: "#92400E" };
    if (s === "sent") return { label: "Sent", bg: "#D1FAE5", color: "#065F46" };
    if (s === "approved") return { label: "Approved", bg: "#DDEEFF", color: "#0F4C81" };
    return { label: "Pending", bg: "#F0F4F8", color: "#4E6080" };
  };

  const pendingReminders = upcomingReminders.filter((r) => r.status === "pending");

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
              {enabled
                ? clientPhone
                  ? `SMS to ${clientPhone}`
                  : "Enabled — add phone number to send SMS"
                : "Reminders disabled for this client"}
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

        {/* Send now button — only if enabled, has phone, has pending reminders */}
        {enabled && clientPhone && pendingReminders.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid #EDF2F7" }}>
            <div className="flex items-center gap-3">
              <button
                onClick={sendNow}
                disabled={sending}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-medium transition-opacity"
                style={{
                  background: GRAPE_LIGHT,
                  color: GRAPE,
                  opacity: sending ? 0.6 : 1,
                }}
              >
                <i className={`ti ${sending ? "ti-loader animate-spin" : "ti-send"} text-sm`} />
                {sending ? "Sending�