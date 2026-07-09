import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewWorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/workout");

  // Find the most recent scheduled workout for the client (Dustin)
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    .ilike("name", "%Dustin%")
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
        No client record found.
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // Try today's workout first, then most recent scheduled
  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  if (todayWorkout) {
    redirect(`/workout/${todayWorkout.day_id || todayWorkout.id}`);
  }

  // Fall back to most recent workout
  const { data: recentWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentWorkout) {
    redirect(`/workout/${recentWorkout.day_id || recentWorkout.id}`);
  }

  return (
    <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
      <i className="ti ti-barbell text-3xl mb-3 block" style={{ color: "var(--brand-text-secondary)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>No workouts scheduled yet.</p>
      <p className="text-xs mt-1">Check back after your trainer builds your program.</p>
    </div>
  );
}
