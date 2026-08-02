import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MetricCards from "@/components/MetricCards";
import ClientSelector from "@/components/ClientSelector";
import ConsistencyCalendar from "@/components/ConsistencyCalendar";
import AchievementCard from "@/components/AchievementCard";
import PersonalBests from "@/components/PersonalBests";
import ThenVsNow from "@/components/ThenVsNow";
import ProgressPhotos from "@/components/ProgressPhotos";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  const params = await searchParams;

  let clientId: string | null = null;
  let clientName = "You";
  let allClients: { id: string; name: string }[] = [];

  if (isTrainer) {
    const { data: clientList } = await supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name");
    allClients = clientList || [];

    if (params.clientId) {
      const found = allClients.find((c) => c.id === params.clientId);
      clientId = params.clientId;
      clientName = found?.name || "Client";
    } else {
      const dustin = allClients.find((c) => c.name.toLowerCase().includes("dustin"));
      clientId = dustin?.id || null;
      clientName = dustin?.name || "Select a client";
    }
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "You";
  }

  return (
    <>
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Progress</h1>
        {isTrainer ? (
          <div className="mt-2">
            <ClientSelector
              clients={allClients}
              selectedId={clientId}
              label="Viewing"
            />
          </div>
        ) : (
          <p className="text-white/60 text-sm">{clientName}</p>
        )}
      </div>

      <div className="px-4 py-4">
        {clientId ? (
          // space-y-3: these six components were stacked with no gap and each
          // was left to bring its own margin. Several bring none, so the Streak
          // tile sat directly against the Consistency card.
          <div className="space-y-3">
            <MetricCards clientId={clientId} />
            <ConsistencyCalendar clientId={clientId} />
            <AchievementCard clientId={clientId} name={clientName} />
            <ProgressPhotos clientId={clientId} clientName={clientName} />
            <ThenVsNow clientId={clientId} />
            <PersonalBests clientId={clientId} />
          </div>
        ) : (
          <p className="text-center py-12" style={{ color: "var(--brand-text-secondary)" }}>
            Select a client above to view their progress.
          </p>
        )}
      </div>
    </>
  );
}
