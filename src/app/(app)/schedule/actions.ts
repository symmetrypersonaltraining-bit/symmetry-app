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

  await supabase.from("cardio_logs").insert({
    client_id: data.clientId,
    log_date: data.logDate,
    type: data.cardioType,
    duration_minutes: data.durationMinutes,
    distance: data.distance || null,
    source: "client",
  });

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
    await supabase
      .from("scheduled_workouts")
      .update({ status: "completed" })
      .eq("id", data.scheduledWorkoutId);
  } else {
    await supabase.from("workout_logs").insert({
      client_id: data.clientId,
      log_date: data.logDate,
      completed: true,
      status: "completed",
      source: "client",
    });
  }

  revalidatePath("/schedule");
}
