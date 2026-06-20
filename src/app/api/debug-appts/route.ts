import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== "symmetrypersonaltraining@gmail.com") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check what columns exist on appointments
  const { data: sampleRaw, error: e1 } = await supabase
    .from("appointments")
    .select("*")
    .limit(3);

  // Count total
  const { count, error: e2 } = await supabase
    .from("appointments")
    .select("*", { count: "exact", head: true });

  // Check date range
  const { data: recent } = await supabase
    .from("appointments")
    .select("id, scheduled_at, status, client_id")
    .order("scheduled_at", { ascending: false })
    .limit(5);

  const { data: oldest } = await supabase
    .from("appointments")
    .select("id, scheduled_at")
    .order("scheduled_at", { ascending: true })
    .limit(3);

  return NextResponse.json({
    total: count,
    sampleColumns: sampleRaw?.[0] ? Object.keys(sampleRaw[0]) : [],
    recentRows: recent,
    oldestRows: oldest,
    errors: { e1: e1?.message, e2: e2?.message },
  });
}
