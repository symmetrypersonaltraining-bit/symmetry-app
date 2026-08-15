import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import LogClient from "./LogClient";
import { isClientMode } from "@/lib/client-mode";
import { isTrainerEmail } from "@/lib/trainer";
import { fetchOwnClientRow } from "@/lib/ownClient";

export default async function LogPage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const isTrainer = isTrainerEmail(user.email);
  let clientRecord: { id: string; name: string } | null = null;

  const clientMode = await isClientMode();
  if (isTrainer && !clientMode) {
    // The trainer's OWN client row — by their login, not by their name.
    // See src/lib/ownClient.ts.
    clientRecord = await fetchOwnClientRow<{ id: string; name: string }>(supabase, user, "id, name");
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

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

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