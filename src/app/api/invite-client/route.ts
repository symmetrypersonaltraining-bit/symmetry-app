import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

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
  if (client.auth_user_id) return NextResponse.json({ error: "Client already has app access" }, { status: 409 });

  const admin = createAdminClient();
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(client.email, {
    data: { full_name: client.name },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app.vercel.app"}/onboarding`,
  });

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Link the new auth user to the client record
  if (inviteData?.user?.id) {
    await supabase
      .from("clients")
      .update({ auth_user_id: inviteData.user.id })
      .eq("id", clientId);
  }

  return NextResponse.json({ success: true, email: client.email, name: client.name });
}
