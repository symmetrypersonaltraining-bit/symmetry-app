import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
      to: [to],
      subject,
      html,
    }),
  });
  return res.ok;
}

function reminderEmailHtml(clientName: string, amountDue: number, dueDate: string, notes?: string | null) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0F4C81;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">Symmetry Corrective</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px">Payment Reminder</p>
  </div>
  <div style="background:#fff;border:1px solid #C8D8EC;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="color:#0D1B2E;font-size:16px;margin:0 0 16px">Hi ${clientName},</p>
    <p style="color:#4E6080;font-size:15px;margin:0 0 20px">
      This is a friendly reminder that a payment is due from your Symmetry Corrective account.
    </p>
    <div style="background:#EDF2F7;border-radius:8px;padding:16px;margin:0 0 20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#4E6080;font-size:14px">Amount Due</span>
        <span style="color:#0D1B2E;font-size:18px;font-weight:700">${fmt.format(amountDue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#4E6080;font-size:14px">Due Date</span>
        <span style="color:#0D1B2E;font-size:14px;font-weight:600">${dueDate}</span>
      </div>
    </div>
    ${notes ? `<p style="color:#4E6080;font-size:14px;font-style:italic;margin:0 0 20px">${notes}</p>` : ""}
    <p style="color:#4E6080;font-size:14px;margin:0">
      Questions? Reply to this email or contact Dustin directly.
    </p>
  </div>
  <p style="color:#4E6080;font-size:12px;text-align:center;margin:16px 0 0">
    © ${new Date().getFullYear()} Symmetry Corrective
  </p>
</div>`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { reminderId } = body;

  if (!reminderId) {
    return NextResponse.json({ error: "reminderId required" }, { status: 400 });
  }

  // Fetch the reminder with client info
  const { data: reminder, error } = await supabase
    .from("payment_reminders")
    .select("*, clients(name, email, payment_reminders_enabled, flat_billing)")
    .eq("id", reminderId)
    .maybeSingle();

  if (error || !reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  const client = (reminder as any).clients;
  if (!client?.email) {
    return NextResponse.json({ error: "Client has no email address" }, { status: 400 });
  }

  const dueDate = new Date(reminder.due_date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  // amount_due is the FINAL amount the client owes — cancellation/flat credits are already
  // baked into it by the reminder editor. Do NOT subtract billing_credits again here (that
  // double-counted the credit and under-billed the client).
  const netDue = parseFloat(reminder.amount_due) || 0;

  const sent = await sendEmail(
    client.email,
    `Payment Reminder — $${netDue.toFixed(2)} due ${new Date(reminder.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    reminderEmailHtml(client.name, netDue, dueDate, reminder.notes)
  );

  if (!sent) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  // Update reminder status
  await supabase
    .from("payment_reminders")
    .update({
      notification_status: "sent",
      email_sent_at: new Date().toISOString(),
      reminder_sent_at: new Date().toISOString(),
    })
    .eq("id", reminderId);

  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  // Vercel Cron endpoint (disabled for now — activate in Settings)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ message: "Cron disabled — activate in Settings" });
}
