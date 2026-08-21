import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import SettingsClient from "./SettingsClient";
import { isTrainerEmail } from "@/lib/trainer";
import { readFlag } from "@/lib/flags";
import { coachForViewer } from "@/lib/coachIdentity";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ gcal?: string; as?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("clients").select("name").eq("auth_user_id", user.id).maybeSingle();
  const isTrainer = isTrainerEmail(user.email);
  // The walkthrough is dark until somebody turns it on. Reading the flag here
  // rather than inside the card keeps the card a pure render.
  const tutorialLive = isTrainer ? await readFlag(supabase, "trainer_tutorial_live") : false;
  const cookieStore = await cookies();
  const sp = await searchParams;
  // Explicit ?as=client marker OR the cookie (marker wins on first render even
  // before the client-mode cookie propagates) — fixes intermittent trainer-UI
  // leak in Client View (settings hides trainer-only sections in client mode).
  const isInClientMode = isTrainer && (sp?.as === "client" || cookieStore.get("symmetry_client_mode")?.value === "1");
  // The SIGNED-IN trainer's own name. `COACH_NAME` is one build-time env var,
  // so Stephanie's own profile said "Dustin Gautreaux".
  const me = isTrainer ? await coachForViewer(supabase as never, user.id) : null;
  const userName = isTrainer ? me!.name : (profile?.name ?? user.email ?? "");

  const { data: trainerSettings } = isTrainer
    ? await supabase.from("trainer_settings").select("gcal_sync_enabled, google_refresh_token").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const gcalStatus = sp?.gcal ?? null;

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--brand-text)" }}>Settings</h1>
      <SettingsClient
        userEmail={user.email ?? ""}
        userName={userName}
        isTrainer={isTrainer}
        userId={user.id}
        gcalSyncEnabled={trainerSettings?.gcal_sync_enabled ?? false}
        gcalConnected={!!(trainerSettings?.google_refresh_token)}
        gcalStatus={gcalStatus}
        isInClientMode={isInClientMode}
        tutorialLive={tutorialLive}
      />
    </div>
  );
}
