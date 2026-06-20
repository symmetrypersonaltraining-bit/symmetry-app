import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogClient from "./LogClient";

export default async function LogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";
  let clientRecord: { id: string; name: string } | null = null;

  if (isTrainer) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .ilike("name", "%Dustin%")
      .maybeSingle();
    clientRecord = data;
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientRecord = data;
  }

  if (!clientRecord) return (
    <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>No client record found.</div>
  );

  const today = new Date().toISOString().split("T")[0];

  const { data: recentMetrics } = await supabase
    .from("metrics")
    .select("*")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(5);

  const { data: recentCardio } = await supabase
    .from("cardio_logs")
    .select("*")
    .eq("client_id", clientRecord.id)
    .order("log_date", { ascending: false })
    .limit(5);

  return (
    <LogClient
      clientId={clientRecord.id}
      today={today}
      recentMetrics={(recentMetrics || []) as any[]}
      recentCardio={(recentCardio || []) as any[]}
    />
  );
}