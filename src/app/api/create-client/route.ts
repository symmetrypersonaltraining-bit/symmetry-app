import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { buildInviteEmailHtml } from "@/lib/inviteEmail";
import { isTrainerEmail } from "@/lib/trainer";

// Falls back to THIS instance's own storage bucket, never a hardcoded project.
// The APK is a thin shell that loads a fixed server URL, so shipping another
// instance's build sends the client to somebody else's login screen — an
// invite that works perfectly and lands on the wrong app.
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL
  || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app-downloads/symmetry.apk`;

function generateTempPassword(): string {
  // 10-char: 2 uppercase + 2 digits + 6 lowercase - readable, no ambiguous chars
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(digits), pick(digits),
    ...Array.from({ length: 6 }, () => pick(lower))];
  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function POST(req: NextRequest) {
  // Auth check - trainer only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isTrainerEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const body = await req.json();
  const {
    name, email, phone, date_of_birth, start_date,
    experience_level, primary_goal, injuries_limitations,
    training_frequency, current_fees, notes, send_invite,
    billing_cadence, first_payment_date, training_days, session_rate, days_per_week,
  } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // WHOSE ROSTER THIS CLIENT LANDS ON.
  //
  // These routes run with the ADMIN client, where auth.uid() is null — so the
  // stamp_client_trainer() trigger cannot see who is creating the client and
  // falls back to the owner. Every client Stephanie created would have appeared
  // on Dustin's roster and vanished from hers.
  //
  // The route knows who is signed in, so it says so explicitly.
  let creatorTrainerId: string | null = null;
  {
    const { data: tRows } = await admin
      .from("trainers")
      .select("id")
      .eq("auth_user_id", user.id)
      .limit(1);
    creatorTrainerId = (tRows?.[0] as { id?: string } | undefined)?.id ?? null;
  }

  // The creating coach's first name, for the invite email's signature.
  let creatorFirstName: string | null = null;
  if (creatorTrainerId) {
    const { data: nRows } = await admin
      .from("trainers")
      .select("first_name, name")
      .eq("id", creatorTrainerId)
      .limit(1);
    const row = nRows?.[0] as { first_name?: string | null; name?: string | null } | undefined;
    creatorFirstName = (row?.first_name || (row?.name || "").split(/\s+/)[0] || null);
  }

  // Check if client record already exists
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A client with that email already exists" }, { status: 409 });
  }

  let authUserId: string | undefined;
  let tempPassword: string | undefined;

  if (send_invite) {
    // Create auth user with temp password (not magic link - enables login page redirect)
    tempPassword = generateTempPassword();
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: name, email_verified: true },
    });
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    authUserId = newUser.user?.id;
  }

  // Create the client record
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .insert({
      // Explicit: the trigger cannot see the creator through the admin client.
      ...(creatorTrainerId ? { trainer_id: creatorTrainerId } : {}),
      name,
      email,
      phone: phone || null,
      date_of_birth: date_of_birth || null,
      start_date: start_date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }), // Central, not UTC: after 7pm Central the UTC date is already tomorrow
      experience_level: experience_level || null,
      primary_goal: primary_goal || null,
      injuries_limitations: injuries_limitations || null,
      training_frequency: training_frequency ? Number(training_frequency) : (days_per_week ? Number(days_per_week) : null),
      days_per_week: days_per_week ? Number(days_per_week) : (training_frequency ? Number(training_frequency) : null),
      training_days: Array.isArray(training_days) ? training_days.join(",") : (training_days || null),
      current_fees: current_fees ? Number(current_fees) : null,
      session_rate: session_rate ? Number(session_rate) : null,
      billing_cadence: billing_cadence || "monthly",
      notes: notes || null,
      auth_user_id: authUserId,
      onboarding_complete: false,
      payment_reminders_enabled: true,
      slug,
    })
    .select("id, name")
    .single();

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }

  // Create the first payment reminder immediately (editable on the Payments page).
  let reminderCreated = false;
  const feeNum = current_fees ? Number(current_fees) : null;
  if (feeNum && feeNum > 0) {
    const dueDate = first_payment_date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // Central, not UTC: after 7pm Central the UTC date is already tomorrow
    const { error: rErr } = await admin.from("payment_reminders").insert({
      client_id: clientRow.id,
      due_date: dueDate,
      amount_due: feeNum,
      billing_credits: 0,
      notification_status: "pending",
    });
    reminderCreated = !rErr;
  }

  // If invited: create client_app_settings so login redirect works, then send email
  if (send_invite && authUserId && clientRow?.id) {
    // Checked: without this row the first-login redirect never fires and the
    // client keeps the temporary password forever, having been told to expect a
    // prompt that never comes.
    const { error: casErr } = await admin.from("client_app_settings").upsert({
      client_id: clientRow.id,
      password_is_temporary: true,
      first_login_completed: false,
    }, { onConflict: "client_id" });
    if (casErr) {
      return NextResponse.json({
        error: `${name} was created and a login exists, but the first-login password reset could not be set up: ${casErr.message}. Do not send the invite yet.`,
      }, { status: 500 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const firstName = name.split(" ")[0];
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
        to: email,
        subject: "You're invited to the Symmetry Training App",
  // Signed by the coach who created them, not by whoever the module constant
  // names. `buildInviteEmailHtml` falls back to COACH_FIRST_NAME when no
  // coachFirstName is passed, so omitting it does not look like a bug — it
  // looks like an email, and it tells a client of Stephanie's that Dustin has
  // set up their account. /api/invite-client already does this correctly.
        html: buildInviteEmailHtml({ firstName, email, tempPassword: tempPassword ?? "", apkUrl: APK_URL, ...(creatorFirstName ? { coachFirstName: creatorFirstName } : {}) }),
      });
    }
  }

  return NextResponse.json({
    success: true,
    clientId: clientRow.id,
    name: clientRow.name,
    reminderCreated,
    invited: !!send_invite && !!authUserId,
    // Include temp password in response for trainer to copy if Resend not configured
    tempPassword: send_invite && !process.env.RESEND_API_KEY ? tempPassword : undefined,
  });
}
