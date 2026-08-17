import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import MetricCards from "@/components/MetricCards";
import GoalsSection from "@/components/GoalsSection";
import ConsistencyCalendar from "@/components/ConsistencyCalendar";
import AchievementCard from "@/components/AchievementCard";
import PersonalBests from "@/components/PersonalBests";
import ThenVsNow from "@/components/ThenVsNow";
import ProgressPhotos from "@/components/ProgressPhotos";
import { TRAINER_EMAIL, isTrainerEmail, COACH_FIRST_NAME } from "@/lib/trainer";

export default async function ClientPreviewProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!isTrainerEmail(user.email)) redirect("/progress");

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
  const clientName = clientRecord.name || `${COACH_FIRST_NAME}`;

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
        {/* Goals. Added to /progress in 938e1a8 and missed here — exactly the
            failure the comment above warns about, a second time. Dustin, 16
            Aug: "what happened to the goal setting feature we added for
            clients? i don't see it in my client app". It was on the real client
            Progress screen the whole time; this copy of that screen never
            mounted it, and Client View is where he looks.

            viewerIsThisClient={false}, matching /progress, which passes false
            for the trainer even when the record being viewed is his own. He can
            propose a goal from here; accepting one is the client's to do. */}
        <GoalsSection clientId={clientId} viewerIsThisClient={false} />
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
