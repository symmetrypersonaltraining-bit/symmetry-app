import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== "symmetrypersonaltraining@gmail.com") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Test appointments query with the fixed RLS (should now work for trainer)
  const today = new Date();
  const rangeStart = new Date(today); rangeStart.setMonth(rangeStart.getMonth() - 1);
  const rangeEnd = new Date(today); rangeEnd.setMonth(rangeEnd.getMonth() + 18);
  
  const { data: appts, count, error } = await supabase
    .from("appointments")
    .select("id, scheduled_at, ends_at, status, client_id, title", { count: "exact" })
    .gte("scheduled_at", rangeStart.toISOString().split("T")[0] + "T00:00:00")
    .lte("scheduled_at", rangeEnd.toISOString().split("T")[0] + "T23:59:59")
    .order("scheduled_at")
    .limit(5);

  return NextResponse.json({
    error: error?.message,
    total_in_range: count,
    range: { start: rangeStart.toISOString().split("T")[0], end: rangeEnd.toISOString().split("T")[0] },
    sample: appts?.slice(0, 3),
  });
}
