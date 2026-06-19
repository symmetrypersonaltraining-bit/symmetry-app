import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsClient from "./PaymentsClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  const { data: reminders } = await supabase
    .from("payment_reminders")
    .select("id, client_id, due_date, amount_due, billing_credits, notification_status, sms_sent_at, sms_message, notes, clients(id, name, email)")
    .order("due_date", { ascending: true });

  const mapped = (reminders || []).map((r: any) => ({
    id: r.id,
    clientId: r.clients?.id || r.client_id,
    clientName: r.clients?.name || "Unknown",
    clientEmail: r.clients?.email || null,
    dueDate: r.due_date,
    amountDue: Number(r.amount_due),
    billingCredits: Number(r.billing_credits || 0),
    notificationStatus: r.notification_status || "pending",
    smsSentAt: r.sms_sent_at,
    smsMessage: r.sms_message,
    notes: r.notes,
  }));

  return <PaymentsClient reminders={mapped} />;
}
