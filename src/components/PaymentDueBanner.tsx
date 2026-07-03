"use client";

// Client-home payment notification. Shows when the trainer has APPROVED
// ("sent") a reminder for this client. Persists until the client taps it
// (sets client_ack_at). Never shows for clients without reminder rows.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Due { id: string; due: string; amount: number; note: string | null; acked: boolean; }

export default function PaymentDueBanner() {
  const [dues, setDues] = useState<Due[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const sup = createClient() as any;
        const { data: userData } = await sup.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;
        const { data: me } = await sup.from("clients").select("id").eq("auth_user_id", uid).limit(1);
        const cid = me?.[0]?.id;
        if (!cid) return;
        const { data: rems } = await sup
          .from("payment_reminders")
          .select("id, due_date, amount_due, sms_message, client_ack_at")
          .eq("client_id", cid)
          .eq("notification_status", "sent")
          .lte("due_date", new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
          .order("due_date");
        setDues((rems || []).map((r: any) => ({
          id: r.id, due: r.due_date, amount: Number(r.amount_due), note: r.sms_message, acked: !!r.client_ack_at,
        })));
      } catch {
        // never break client home
      }
    })();
  }, []);

  const ack = async (id: string) => {
    setDues((p) => p.map((d) => (d.id === id ? { ...d, acked: true } : d)));
    try {
      const sup = createClient() as any;
      await sup.rpc("ack_payment_reminder", { reminder_id: id });
    } catch {}
  };

  const open = dues.filter((d) => !d.acked);
  if (open.length === 0) return null;

  return (
    <div className="space-y-2">
      {open.map((d) => (
        <button key={d.id} onClick={() => ack(d.id)} className="block w-full text-left rounded-3xl p-3"
          style={{ background: "#7c9cf518", border: "1px solid var(--brand-primary)" }}>
          <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
            {"💳 Payment due " + d.due.slice(5).replace("-", "/") + ": $" + d.amount}
          </div>
          <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {d.note || "Tap to dismiss — thank you!"}
          </div>
        </button>
      ))}
    </div>
  );
}
