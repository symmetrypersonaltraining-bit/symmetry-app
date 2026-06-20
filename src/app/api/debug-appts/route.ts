import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== "symmetrypersonaltraining@gmail.com") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use admin client to bypass RLS
  let adminData: any = { error: "admin not available" };
  try {
    const admin = createAdminClient();
    const { data, count, error } = await admin
      .from("appointments")
      .select("id, scheduled_at, ends_at, status, client_id, gcal_event_id", { count: "exact" })
      .order("scheduled_at", { ascending: false })
      .limit(10);
    
    const { data: oldest } = await admin
      .from("appointments")
      .select("id, scheduled_at")
      .order("scheduled_at", { ascending: true })
      .limit(3);

    // Check columns
    const { data: cols } = await admin.rpc("exec_sql", { 
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='appointments' ORDER BY ordinal_position" 
    }).select();

    adminData = { 
      total: count, 
      recent: data?.slice(0,3),
      oldest: oldest?.slice(0,3),
      error: error?.message,
    };
  } catch (e: any) {
    adminData = { adminError: e.message };
  }

  // Also test regular client
  const { data: regularData, error: regularError } = await supabase
    .from("appointments")
    .select("id, scheduled_at")
    .limit(3);

  return NextResponse.json({
    admin: adminData,
    regular: { data: regularData, error: regularError?.message },
  });
}
