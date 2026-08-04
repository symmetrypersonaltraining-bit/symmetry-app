import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { buildInviteEmailHtml } from "@/lib/inviteEmail";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app-omega.vercel.app";
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "https://mkfiginpiesospsnktea.supabase.co/storage/v1/object/public/app-downloads/symmetry.apk";

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

  // ── The one-tap link ──────────────────────────────────────────────────────
  //
  // Dustin, 8/4: "id like an easier start up for clients... the flow is
  // currently very sloppy for new clients."
  //
  // It was: read a 10-character password out of an email, switch apps, type it
  // into a phone keyboard without a typo, then set a real one. Every step is a
  // place to give up, and the temp password is the worst of them.
  //
  // Supabase can mint a recovery link that signs them in and lands them on
  // /welcome, where they choose a password with a session already in hand. The
  // temp password stays in the email as a fallback — links expire and mail
  // clients mangle them, and "the button didn't work" must not mean "you cannot
  // get in".
  let oneTapUrl: string | null = null;
  try {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: client.email,
      options: { redirectTo: `${APP_URL}/auth/callback?next=/welcome` },
    });
    oneTapUrl = link?.properties?.action_link ?? null;
  } catch { /* the password path below still works */ }

  // Send invite email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
      to: client.email,
      subject: "You're invited to the Symmetry Training App",
      html: buildInviteEmailHtml({ firstName, email: client.email, tempPassword, apkUrl: APK_URL, oneTapUrl }),
    });
  }

  return NextResponse.json({
    success: true,
    email: client.email,
    name: client.name,
    // Include temp password in response for trainer to copy if Resend not configured
    tempPassword: resendKey ? undefined : tempPassword,
    emailSent: !!resendKey,
    // Returned so the trainer can show it as a QR in the studio — the fastest
    // onboarding there is, since he is standing next to them.
    oneTapUrl,
  });
}
