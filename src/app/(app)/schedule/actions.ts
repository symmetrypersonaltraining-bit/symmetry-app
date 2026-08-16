"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function logCardioSession(data: {
  clientId: string;
  logDate: string;
  cardioType: string;
  durationMinutes: number;
  distance?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Checked, and it throws, because this action ALREADY throws on a missing
  // user — so callers are built for it, and a silent write failure is the only
  // outcome the client could not tell apart from success.
  const { error } = await supabase.from("cardio_logs").insert({
    client_id: data.clientId,
    log_date: data.logDate,
    type: data.cardioType,
    duration_minutes: data.durationMinutes,
    distance: data.distance || null,
    source: "client",
  });
  if (error) throw new Error(`Could not save that cardio session: ${error.message}`);

  revalidatePath("/schedule");
}

export async function logStrengthSession(data: {
  clientId: string;
  logDate: string;
  scheduledWorkoutId?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (data.scheduledWorkoutId) {
    const { error } = await supabase
      .from("scheduled_workouts")
      .update({ status: "completed" })
      .eq("id", data.scheduledWorkoutId);
    if (error) throw new Error(`Could not mark that session complete: ${error.message}`);
  } else {
    // workout_logs.status is prose, not a state machine: the check allows
    // 'Done as planned' | 'Modified' | 'Partial' | 'Skipped' | 'Rest day'.
    // "completed" was rejected with 23514 on every call, and the result is not
    // checked, so marking an unscheduled session done silently logged nothing.
    // All 964 rows in the table say 'Done as planned'.
    //
    // The VALUE was fixed when that was found. The unchecked result was not,
    // which is the half that let it run wrong for so long: a constraint
    // violation on every single call, and the button still said Saving… then
    // closed as though it had worked. Checking it is what would have surfaced
    // the 23514 the first time somebody pressed it.
    const { error } = await supabase.from("workout_logs").insert({
      client_id: data.clientId,
      log_date: data.logDate,
      completed: true,
      status: "Done as planned",
      source: "client",
    });
    if (error) throw new Error(`Could not log that workout: ${error.message}`);
  }

  revalidatePath("/schedule");
}
