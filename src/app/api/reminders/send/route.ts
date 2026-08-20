import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCronRequest } from "@/lib/cron-auth";
import { isTrainerEmail, COACH_FIRST_NAME } from "@/lib/trainer";

// Scheduled in vercel.json. A route handler Next decides to render statically
// is served from cache and never executes — the same shape of silence as the
// nudge sweep's missing GET. This one reads request headers so it is dynamic in
// practice; saying so explicitly means it cannot quietly stop being.
export const dynamic = "force-dynamic";

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

// `coachFirstName` is a parameter, not the module constant it used to read.
//
// This email asks somebody for money and then tells them who to talk to about
// it. Signed with COACH_FIRST_NAME it told every client of Stephanie's to
// contact Dustin about a bill she is owed — the one message in the app where
// naming the wrong coach has a number attached to it.
function reminderEmailHtml(clientName: string, amountDue: number, dueDate: string, coachFirstName: string, notes?: string | null) {
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
      Questions? Reply to this email or contact ${coachFirstName} directly.
    </p>
  </div>
  <p style="color:#4E6080;font-size:12px;text-align:center;margin:16px 0 0">
    © ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 4)} Symmetry Corrective
  </p>
</div>`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isTrainerEmail(user.email)) {
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
    .select("*, clients(name, email, payment_reminders_enabled, flat_billing, trainer_id)")
    .eq("id", reminderId)
    .maybeSingle();

  if (error || !reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  const client = (reminder as any).clients;
  if (!client?.email) {
    return NextResponse.json({ error: "Client has no email address" }, { status: 400 });
  }

  // ── THE PROVISIONAL WINDOW, ENFORCED WHERE IT MATTERS ────────────────────
  //
  // Dustin, 2026-08-20: "add back in provisional windows on payments so I cant
  // send until 7 days before."
  //
  // The cycle closes seven days before the due date and the amount is not final
  // until it does — every orange mark he adds before then changes it. A reminder
  // sent early quotes a client a number they will not be charged.
  //
  // This check is HERE, and not only on the payments screen, because a disabled
  // button is not a guard. The older PaymentsClient list can call this route
  // directly, an approval can be retried from a stale tab, and the screen's own
  // idea of "today" comes from the browser's clock. The route is the one place
  // every send has to pass through.
  const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const cycleEnd = new Date(reminder.due_date + "T12:00:00Z");
  cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 7);
  const cycleEndCT = cycleEnd.toISOString().slice(0, 10);
  if (todayCT < cycleEndCT) {
    return NextResponse.json(
      {
        error:
          "That cycle closes " + cycleEndCT + ", so the amount can still change. " +
          "This reminder can be sent from " + cycleEndCT + ".",
        provisional: true,
        sendsFrom: cycleEndCT,
      },
      { status: 409 },
    );
  }

  // Central, not UTC: a date-only string parses as midnight UTC, which renders as the previous day in Central.
  const dueDate = new Date(reminder.due_date + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "America/Chicago", weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  // amount_due is the FINAL amount the client owes — cancellation/flat credits are already
  // baked into it by the reminder editor. Do NOT subtract billing_credits again here (that
  // double-counted the credit and under-billed the client).
  const netDue = parseFloat(reminder.amount_due) || 0;

  // Whose bill this is. Falls back to the owner's name rather than a blank —
  // an unsigned demand for money is worse than one signed by the wrong person,
  // and the fallback is only reachable if the client has no trainer row at all.
  let coachFirstName: string = COACH_FIRST_NAME;
  if (client.trainer_id) {
    const { data: tRows } = await supabase
      .from("trainers").select("first_name, name").eq("id", client.trainer_id).limit(1);
    const t = tRows?.[0] as { first_name?: string | null; name?: string | null } | undefined;
    coachFirstName = t?.first_name || (t?.name || "").split(/\s+/)[0] || COACH_FIRST_NAME;
  }

  const sent = await sendEmail(
    client.email,
    `Payment Reminder — $${netDue.toFixed(2)} due ${new Date(reminder.due_date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })}`,
    reminderEmailHtml(client.name, netDue, dueDate, coachFirstName, reminder.notes)
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
  // Vercel Cron endpoint (still a stub — the daily 0 14 * * * entry in
  // vercel.json hits this and gets the message below; activate in Settings).
  //
  // This used to compare against `Bearer ${process.env.CRON_SECRET}`. CRON_SECRET
  // is unset on this project, so that compared against the literal string
  // "Bearer undefined" — meaning anyone sending exactly that header
  // authenticated, while Vercel's real scheduler did not. isCronRequest fails
  // closed and recognises the platform's own x-vercel-cron header.
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ message: "Cron disabled — activate in Settings" });
}
