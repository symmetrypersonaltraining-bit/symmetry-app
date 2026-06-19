import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

// Called by Vercel Cron (vercel.json) or manually by trainer
// Vercel Cron passes Authorization: Bearer <CRON_SECRET>
// Trainer calls POST /api/reminders/send with { clientId? } to target one client

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio env vars not set");
  return twilio(sid, token);
}

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
  // Auth: Vercel cron secret OR trainer session
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isTrainer = user?.email === TRAINER_EMAIL;

  if (!isCron && !isTrainer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: target a single client
  let targetClientId: string | null = null;
  try {
    const body = await req.json();
    targetClientId = body?.clientId ?? null;
  } catch {
    // no body — that's fine for cron calls
  }

  // Find reminders due in the next 3 days that haven't been SMS'd yet
  const today = new Date();
  const in3 = new Date();
  in3.setDate(today.getDate() + 3);

  let query = supabase
    .from("payment_reminders")
    .select(`
      id, due_date, amount_due, client_id,
      clients!inner(id, name, phone, payment_reminders_enabled)
    `)
    .eq("notification_status", "pending")
    .is("sms_sent_at", null)
    .gte("due_date", today.toISOString().split("T")[0])
    .lte("due_date", in3.toISOString().split("T")[0]);

  if (targetClientId) {
    query = query.eq("client_id", targetClientId);
  }

  const { data: reminders, error: fetchErr } = await query;

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    return NextResponse.json({ error: "TWILIO_PHONE_NUMBER not set" }, { status: 500 });
  }

  const results: { reminderId: string; status: string; error?: string }[] = [];

  for (const reminder of reminders ?? []) {
    const client = (reminder as any).clients;
    if (!client?.payment_reminders_enabled) {
      results.push({ reminderId: reminder.id, status: "skipped_disabled" });
      continue;
    }
    if (!client?.phone) {
      results.push({ reminderId: reminder.id, status: "skipped_no_phone" });
      continue;
    }

    const message = buildSmsMessage(client.name, Number(reminder.amount_due), reminder.due_date);

    try {
      const tc = twilioClient();
      await tc.messages.create({ body: message, from, to: client.phone });

      await supabase
        .from("payment_reminders")
        .update({
          sms_sent_at: new Date().toISOString(),
          sms_message: message,
          notification_status: "sent",
        })
        .eq("id", reminder.id);

      results.push({ reminderId: reminder.id, status: "sent" });
    } catch (err: any) {
      results.push({ reminderId: reminder.id, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ ok: true, results, count: results.length });
}

// Vercel Cron also hits GET — redirect to POST logic
export async function GET(req: NextRequest) {
  return POST(req);
}
