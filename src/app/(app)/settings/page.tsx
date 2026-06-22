import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;

  // Fetch client record for non-trainer
  let clientName: string | null = null;
  if (!isTrainer) {
    const { data } = await supabase
      .from("clients")
      .select("name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientName = data?.name || null;
  } else {
    clientName = "Dustin Gautreaux";
  }

  // Fetch trainer's GCal sync setting (server-side — bypasses client auth issues)
  let gcalSyncEnabled = false;
  if (isTrainer) {
    const { data: ts } = await supabase
      .from("trainer_settings")
      .select("gcal_sync_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    gcalSyncEnabled = ts?.gcal_sync_enabled ?? false;
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--brand-text)" }}>
        Settings
      </h1>
      <SettingsClient
        userEmail={user.email || ""}
        userName={clientName || ""}
        isTrainer={isTrainer}
        userId={user.id}
        gcalSyncEnabled={gcalSyncEnabled}
      />
    </div>
  );
}
