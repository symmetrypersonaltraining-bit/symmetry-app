import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app-omega.vercel.app";

function generateTempPassword(): string {
  // 10-char: 2 uppercase + 2 digits + 6 lowercase — readable, no ambiguous chars
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "Client has no email on file" }, { status: 400 });

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const firstName = client.name.split(" ")[0];

  let authUserId: string | null = client.auth_user_id || null;

  // If client already has an auth user, reset their password + re-flag as temporary
  if (authUserId) {
    const { error: pwErr } = await admin.auth.admin.updateUserById(authUserId, {
      password: tempPassword,
    });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });
  } else {
    // Create fresh account — no magic link, no email confirmation loop
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email: client.email,
      password: tempPassword,
      email_confirm: true, // bypass email confirmation step
      user_metadata: { full_name: client.name },
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    authUserId = newUser.user.id;

    // Link auth user to client record
    await supabase.from("clients").update({ auth_user_id: authUserId }).eq("id", clientId);
  }

  // Mark password as temporary in client_app_settings (upsert)
  await admin.from("client_app_settings").upsert({
    client_id: clientId,
    password_is_temporary: true,
    first_login_completed: false,
  }, { onConflict: "client_id" });

  // Send invite email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
      to: client.email,
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
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Corrective</p>
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
          <strong>Email:</strong> ${client.email}
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
      <p style="margin: 0; font-size: 12px; color: #999;">Symmetry Corrective · Sevens Gym</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });
  }

  return NextResponse.json({
    success: true,
    email: client.email,
    name: client.name,
    // Include temp password in response for trainer to copy if Resend not configured
    tempPassword: resendKey ? undefined : tempPassword,
    emailSent: !!resendKey,
  });
}
