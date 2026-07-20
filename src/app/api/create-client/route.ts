import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { buildInviteEmailHtml } from "@/lib/inviteEmail";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "https://mkfiginpiesospsnktea.supabase.co/storage/v1/object/public/app-downloads/symmetry.apk";

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
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name, email, phone, date_of_birth, start_date,
    experience_level, primary_goal, injuries_limitations,
    training_frequency, current_fees, notes, send_invite,
  } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const admin = createAdminClient();

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
      name,
      email,
      phone: phone || null,
      date_of_birth: date_of_birth || null,
      start_date: start_date || new Date().toISOString().split("T")[0],
      experience_level: experience_level || null,
      primary_goal: primary_goal || null,
      injuries_limitations: injuries_limitations || null,
      training_frequency: training_frequency ? Number(training_frequency) : null,
      current_fees: current_fees ? Number(current_fees) : null,
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

  // If invited: create client_app_settings so login redirect works, then send email
  if (send_invite && authUserId && clientRow?.id) {
    await admin.from("client_app_settings").upsert({
      client_id: clientRow.id,
      password_is_temporary: true,
      first_login_completed: false,
    }, { onConflict: "client_id" });

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const firstName = name.split(" ")[0];
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
        to: email,
        subject: "You're invited to the Symmetry Training App",
        html: buildInviteEmailHtml({ firstName, email, tempPassword: tempPassword ?? "", apkUrl: APK_URL }),
      });
    }
  }

  return NextResponse.json({
    success: true,
    clientId: clientRow.id,
    name: clientRow.name,
    invited: !!send_invite && !!authUserId,
    // Include temp password in response for trainer to copy if Resend not configured
    tempPassword: send_invite && !process.env.RESEND_API_KEY ? tempPassword : undefined,
  });
}
