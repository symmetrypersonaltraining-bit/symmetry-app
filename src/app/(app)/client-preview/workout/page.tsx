import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { isTrainerEmail } from "@/lib/trainer";
import { fetchOwnClientRow } from "@/lib/ownClient";

export default async function ClientPreviewWorkoutPage() {
  const supabase = await createClient();
  // Carries the same `email` claim, so the trainer gate on the next line but
  // one behaves identically. Twenty pages — including the three sibling
  // client-preview screens — have gated on it this way since 15 Aug.
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!isTrainerEmail(user.email)) redirect("/workout");

  // Preview means "show me my own client view", so this is the trainer's own
  // client row — found by their login, not by their name. src/lib/ownClient.ts.
  const clientRecord = await fetchOwnClientRow<{ id: string }>(supabase, user, "id");

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
