import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export async function POST(req: NextRequest) {
  // Auth check — trainer only
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

  let authUserId: string | null = null;

  if (send_invite) {
    // Send Supabase auth invite — client gets an email to set their password
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app.vercel.app"}/set-password`,
    });
    if (inviteErr) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }
    authUserId = inviteData.user?.id || null;
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

  if (send_invite && authUserId && clientRow?.id) {
    await supabase.from("client_app_settings").upsert({
      client_id: clientRow.id,
      password_is_temporary: true,
    });
  }

  return NextResponse.json({
    success: true,
    clientId: clientRow.id,
    name: clientRow.name,
    invited: !!send_invite && !!authUserId,
  });
}
