import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkoutLogger from "./WorkoutLogger";

export default async function WorkoutDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ dayId: string }>;
  searchParams: Promise<{ forClient?: string }>;
}) {
  const { dayId } = await params;
  const { forClient } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";

  let resolvedDayId = dayId;
  {
    const { data: schedRow } = await supabase
      .from("scheduled_workouts")
      .select("day_id")
      .eq("id", dayId)
      .maybeSingle();
    if (schedRow?.day_id) resolvedDayId = schedRow.day_id;
  }

  const { data: day } = await supabase
    .from("days")
    .select(`
      id, label,
      phases(id, label, program_id,
        programs(id, name)
      ),
      sections(
        id, internal_name, client_facing_name, position,
        prescribed_exercises(
          id, position, sets, tracked_fields, volume_type, volume_value,
          unilateral, tempo, load_descriptor, cue, rest,
          superset_group, intensity_type, use_drop_sets,
          use_rest_pause, use_partials,
          exercises(id, name, modality, muscle_group, equipment_required, video_url)
        )
      )
    `)
    .eq("id", resolvedDayId)
    .maybeSingle();

  if (!day) notFound();

  const sortedSections = [...((day as any).sections || [])].sort(
    (a: any, b: any) => a.position - b.position
  );
  for (const section of sortedSections) {
    section.prescribed_exercises = [...(section.prescribed_exercises || [])].sort(
      (a: any, b: any) => a.position - b.position
    );
    (section as any).label = (section as any).client_facing_name || (section as any).internal_name;
  }

  let clientId: string | null = null;
  let clientName: string | null = null;

  if (isTrainer && forClient) {
    // Trainer running a specific client's session
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", forClient)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || null;
  } else if (isTrainer) {
    // Trainer viewing their own workout (Dustin as client)
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .ilike("name", "%Dustin%")
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || null;
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || null;
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: existingLog } = await supabase
    .from("workout_logs")
    .select("id, completed, set_logs(*)")
    .eq("client_id", clientId || "")
    .eq("day_id", resolvedDayId)
    .gte("log_date", today)
    .maybeSingle();

  const phase = (day as any).phases;
  const program = phase?.programs;

  return (
    <WorkoutLogger
      day={{ id: day.id, label: (day as any).label }}
      phase={{ id: phase?.id, label: phase?.label }}
      program={{ id: program?.id, name: program?.name }}
      sections={sortedSections}
      clientId={clientId}
      clientName={clientName}
      isTrainerSession={isTrainer && !!forClient}
      existingLogId={existingLog?.id || null}
      existingSetLogs={existingLog?.set_logs || []}
    />
  );
}
