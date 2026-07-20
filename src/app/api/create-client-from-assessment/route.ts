import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { buildInviteEmailHtml } from "@/lib/inviteEmail";

// Full onboarding from the assessment flow: save the assessment, create the
// client profile with ALL assessment info, create their login with a temporary
// password (client is routed to set-password on first login via
// client_app_settings.password_is_temporary), link the assessment to the client,
// and email the APK invite. Trainer-only.

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "https://mkfiginpiesospsnktea.supabase.co/storage/v1/object/public/app-downloads/symmetry.apk";

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(digits), pick(digits),
    ...Array.from({ length: 6 }, () => pick(lower))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const nn = (v: any) => (v === "" || v === undefined ? null : v);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, aiResult } = await req.json();
  if (!data?.first_name || !data?.last_name || !data?.email) {
    return NextResponse.json({ error: "First name, last name, and email are required to create a client." }, { status: 400 });
  }

  const email = String(data.email).trim();
  const name = `${data.first_name} ${data.last_name}`.trim();
  const admin = createAdminClient();

  // Don't collide with an existing client
  const { data: existing } = await supabase.from("clients").select("id").eq("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A client with that email already exists." }, { status: 409 });
  }

  // 1) Save the assessment
  const assessmentPayload: Record<string, any> = {
    first_name: data.first_name, last_name: data.last_name, email,
    phone: nn(data.phone), date_of_birth: nn(data.date_of_birth),
    emergency_contact_name: nn(data.emergency_contact_name), emergency_contact_phone: nn(data.emergency_contact_phone),
    medical_clearance: data.medical_clearance, current_injuries: nn(data.current_injuries),
    chronic_conditions: nn(data.chronic_conditions), medications: nn(data.medications),
    pain_location: data.has_pain ? nn(data.pain_location) : null,
    pain_onset: data.has_pain ? nn(data.pain_onset) : null,
    hip_issues: data.hip_issues, prior_surgeries: nn(data.prior_surgeries),
    feet_turn_out: data.feet_turn_out, excessive_forward_lean: data.excessive_forward_lean,
    knees_cave_in: data.knees_cave_in, low_back_arch: data.low_back_arch,
    arms_fall_forward: data.arms_fall_forward, forward_head: data.forward_head,
    lateral_asymmetry: data.lateral_asymmetry, balance_deficits: data.balance_deficits, ohsa_notes: nn(data.ohsa_notes),
    experience_level: nn(data.experience_level),
    years_training: data.years_training ? parseInt(data.years_training) : null,
    activity_level: nn(data.activity_level), days_per_week: nn(data.days_per_week), preferred_time: nn(data.preferred_time),
    primary_goal: nn(data.primary_goal), secondary_goal: nn(data.secondary_goal), goal_timeline: nn(data.goal_timeline),
    target_weight: data.target_weight ? parseFloat(data.target_weight) : null, goal_notes: nn(data.goal_notes),
    occupation_type: nn(data.occupation_type), stress_level: nn(data.stress_level),
    sleep_hours: data.sleep_hours ? parseFloat(data.sleep_hours) : null, nutrition_notes: nn(data.nutrition_notes),
    ai_program_recommendation: aiResult ? JSON.stringify(aiResult) : null,
    ai_assessment_summary: aiResult?.assessment_summary || null,
    status: "active",
  };
  const { data: assessment, error: aErr } = await admin
    .from("client_assessments").insert(assessmentPayload).select("id").single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  // 2) Create the login (temp password; client resets on first login)
  const tempPassword = generateTempPassword();
  const { data: newUser, error: uErr } = await admin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
    user_metadata: { full_name: name, email_verified: true },
  });
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  const authUserId = newUser.user?.id;

  // 3) Create the client profile with all assessment info
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const { data: clientRow, error: cErr } = await admin.from("clients").insert({
    name, email, phone: nn(data.phone), date_of_birth: nn(data.date_of_birth),
    start_date: new Date().toISOString().split("T")[0],
    experience_level: nn(data.experience_level), primary_goal: nn(data.primary_goal),
    days_per_week: nn(data.days_per_week), injuries: nn(data.current_injuries),
    medical_notes: nn(data.chronic_conditions),
    emergency_contact_name: nn(data.emergency_contact_name), emergency_contact_phone: nn(data.emergency_contact_phone),
    assessment_id: assessment.id, auth_user_id: authUserId,
    onboarding_complete: false, payment_reminders_enabled: true, slug,
  }).select("id, name").single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 4) Two-way link so the assessment shows on the client profile
  await admin.from("client_assessments").update({ client_id: clientRow.id }).eq("id", assessment.id);

  // 5) Flag temp password -> first-login reset routing
  await admin.from("client_app_settings").upsert({
    client_id: clientRow.id, password_is_temporary: true, first_login_completed: false,
  }, { onConflict: "client_id" });

  // 6) Send the APK invite email (non-fatal if it fails)
  const resendKey = process.env.RESEND_API_KEY;
  let emailSent = false;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
        to: email,
        subject: "You're invited to the Symmetry Training App",
        html: buildInviteEmailHtml({ firstName: data.first_name, email, tempPassword, apkUrl: APK_URL }),
      });
      emailSent = true;
    } catch { /* onboarding already succeeded; email can be re-sent from the profile */ }
  }

  return NextResponse.json({
    success: true,
    clientId: clientRow.id,
    name: clientRow.name,
    emailSent,
    tempPassword: resendKey ? undefined : tempPassword,
  });
}
