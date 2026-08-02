import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MetricCards from "@/components/MetricCards";
import ConsistencyCalendar from "@/components/ConsistencyCalendar";
import AchievementCard from "@/components/AchievementCard";
import PersonalBests from "@/components/PersonalBests";
import ThenVsNow from "@/components/ThenVsNow";
import ProgressPhotos from "@/components/ProgressPhotos";

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
      {/* space-y-5 — the SAME fix as /progress. This is the Client View copy of
          the same screen and it was missed the first time, which is why the
          Streak tile was still sitting against the Consistency card here after
          the other page was fixed. Any change to one of these two belongs in
          both. */}
      <div className="px-4 py-4 space-y-5">
        <MetricCards clientId={clientId} />
        <ConsistencyCalendar clientId={clientId} />
        <AchievementCard clientId={clientId} name={clientName} />
        <ProgressPhotos clientId={clientId} clientName={clientName} />
        <ThenVsNow clientId={clientId} />
        <PersonalBests clientId={clientId} />
      </div>
    </>
  );
}
