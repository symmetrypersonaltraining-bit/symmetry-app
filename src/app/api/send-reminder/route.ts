import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

function buildSmsMessage(clientName: string, amount: number, dueDate: string): string {
  const d = new Date(dueDate + "T00:00:00");
  const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const first = clientName.split(" ")[0];
  return (
    `Hi ${first}! This is Dustin from Symmetry Personal Training. ` +
    `Just a friendly reminder that your session payment of $${amount.toLocaleString()} ` +
    `is due on ${dateStr}. ` +
    `Questions? Reply here or text Dustin directly. Thanks!`
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reminderId } = await req.json();
  if (!reminderId) return NextResponse.json({ error: "reminderId required" }, { status: 400 });

  const { data: reminder, error } = await supabase
    .from("payment_reminders")
    .select("id, due_date, amount_due, client_id, clients!inner(id, name, phone, payment_reminders_enabled)")
    .eq("id", reminderId)
    .single();

  if (error || !reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  const client = (reminder as any).clients;

  if (!client?.payment_reminders_enabled) {
    return NextResponse.json({ error: "SMS reminders disabled for this client" }, { status: 400 });
  }
  if (!client?.phone) {
    return NextResponse.json({ error: "No phone number on file" }, { status: 400 });
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!from || !sid || !token) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
  }

  const message = buildSmsMessage(client.name, Number(reminder.amount_due), reminder.due_date);

  try {
    const tc = twilio(sid, token);
    await tc.messages.create({ body: message, from, to: client.phone });

    await supabase
      .from("payment_reminders")
      .update({
        sms_sent_at: new Date().toISOString(),
        sms_message: message,
        notification_status: "sent",
      })
      .eq("id", reminderId);

    return NextResponse.json({ ok: true, message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
