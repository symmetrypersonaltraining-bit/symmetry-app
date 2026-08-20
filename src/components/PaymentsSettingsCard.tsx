"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PayLinksRow from "./PayLinksRow";
import type { PayDestination } from "@/lib/pay-links";

type DueReminder = { id: string; due_date: string; amount_due: number };

export default function PaymentsSettingsCard() {
  const [due, setDue] = useState<DueReminder[]>([]);
  const [payTo, setPayTo] = useState<PayDestination | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient() as any;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoaded(true);
          return;
        }
        const { data: client } = await supabase
          .from("clients")
          .select("id, trainer_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (!client) {
          setLoaded(true);
          return;
        }
        // Their trainer's payment details, not the business's.
        if (client.trainer_id) {
          const { data: t } = await supabase
            .from("trainers")
            .select("name, pay_display_name, venmo_username, zelle_email, cashapp_handle, pay_phone")
            .eq("id", client.trainer_id)
            .limit(1);
          const tr = t?.[0];
          if (tr) {
            setPayTo({
              recipientName: tr.pay_display_name || tr.name || "",
              venmoUsername: tr.venmo_username ?? null,
              zelleEmail: tr.zelle_email ?? null,
              zellePhone: tr.pay_phone ?? null,
              cashtag: tr.cashapp_handle ?? null,
            });
          }
        }
        const { data } = await supabase
          .from("payment_reminders")
          .select("id, due_date, amount_due")
          .eq("client_id", client.id)
          .eq("notification_status", "sent")
          .order("due_date");
        setDue(Array.isArray(data) ? data : []);
      } catch {
        /* fail silent — never break settings */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded || due.length === 0) return null;

  const fmtDate = (d: string) => {
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <section
      className="rounded-3xl p-5"
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        boxShadow: "0 8px 26px rgba(20,30,55,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: 18 }}>💳</span>
        <p style={{ fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>Payments</p>
      </div>
      {due.map((d) => (
        <div
          key={d.id}
          className="rounded-2xl p-4 mb-3"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--brand-text)" }}>
            {"$" + Number(d.amount_due).toFixed(2)}
          </div>
          <div style={{ fontSize: 13, color: "var(--brand-text-secondary)", marginBottom: 10 }}>
            {"Due " + fmtDate(d.due_date)}
          </div>
          <PayLinksRow amount={Number(d.amount_due)} to={payTo} />
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--brand-text-secondary)", margin: 0 }}>
        Your current balance due. Tap a button above to pay.
      </p>
    </section>
  );
}
