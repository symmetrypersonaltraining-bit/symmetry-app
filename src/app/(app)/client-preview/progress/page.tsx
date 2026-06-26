import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MetricCards from "@/components/MetricCards";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/progress");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("email", TRAINER_EMAIL)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
        No client record found for your account.
      </div>
    );
  }

  const clientId = clientRecord.id;
  const clientName = clientRecord.name || "Dustin";

  return (
    <>
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Progress</h1>
        <p className="text-white/60 text-sm">{clientName}</p>
      </div>
      <div className="px-4 py-4">
        <MetricCards clientId={clientId} />
      </div>
    </>
  );
}
