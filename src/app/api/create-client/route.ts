import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app-omega.vercel.app";

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
        from: "Symmetry Personal Training <noreply@symmetrypersonaltraining.com>",
        to: email,
        subject: "You're invited to the Symmetry Training App",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #E53935, #b71c1c); padding: 32px 32px 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">SYMMETRY</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Personal Training</p>
    </div>
    <!-- Body -->
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px; line-height: 1.5;">
        Dustin has set up your Symmetry Training App account. Your training, nutrition, and progress — all in one place.
      </p>

      <!-- App link -->
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="${APP_URL}" style="display: inline-block; background: #E53935; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">
          Open Your App →
        </a>
      </div>

      <!-- Credentials box -->
      <div style="background: #f8f8f8; border-radius: 10px; padding: 20px; margin: 0 0 24px; border: 1px solid #eee;">
        <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px;">Login Credentials</p>
        <p style="margin: 0 0 8px; font-size: 15px; color: #333;">
          <strong>Email:</strong> ${email}
        </p>
        <p style="margin: 0; font-size: 15px; color: #333;">
          <strong>Temporary Password:</strong>
          <span style="font-family: monospace; background: #E5393515; color: #E53935; padding: 2px 8px; border-radius: 4px; font-size: 16px; font-weight: 700;">${tempPassword}</span>
        </p>
      </div>

      <p style="color: #555; font-size: 14px; margin: 0 0 8px;">
        You'll be asked to set your own password right away.
      </p>

      <!-- PWA instructions -->
      <div style="background: #f0f7ff; border-radius: 10px; padding: 16px; margin: 24px 0; border: 1px solid #ddeeff;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #0066cc;">📱 Save the App to Your Phone</p>
        <p style="margin: 0 0 4px; font-size: 13px; color: #555;"><strong>iPhone:</strong> Tap Share → "Add to Home Screen"</p>
        <p style="margin: 0 0 4px; font-size: 13px; color: #555;"><strong>Android:</strong> Tap ⋮ → "Add to Home Screen"</p>
        <p style="margin: 0; font-size: 13px; color: #555;"><strong>Desktop:</strong> Click the install icon in the address bar</p>
      </div>

      <p style="color: #999; font-size: 13px; margin: 0; text-align: center;">
        Questions? Reply to this email or contact Dustin directly.
      </p>
    </div>
    <!-- Footer -->
    <div style="background: #f8f8f8; padding: 16px 32px; text-align: center; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 12px; color: #999;">Symmetry Personal Training · Sevens Gym</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
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
