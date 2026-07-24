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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  // NEVER .maybeSingle() here: it returns null (PGRST116) as soon as two rows exist for the
  // same client/day/date, which silently opened the logger with every set blank and lost the
  // client's in-progress work. Duplicates are real in production (one client had 5 rows for a
  // single session), so take the array and pick the row to resume: the still-open log first,
  // then the earliest.
  const { data: existingLogs } = await supabase
    .from("workout_logs")
    .select("id, completed, log_date, set_logs(*)")
    .eq("client_id", clientId || "")
    .eq("day_id", resolvedDayId)
    .gte("log_date", today)
    .order("completed", { ascending: true })
    .order("log_date", { ascending: true })
    .order("id", { ascending: true });
  const existingLog = (existingLogs && existingLogs.length > 0) ? existingLogs[0] : null;

  const { data: swInst } = await supabase
    .from("scheduled_workouts")
    .select("id")
    .eq("day_id", resolvedDayId)
    .eq("client_id", clientId || "")
    .eq("scheduled_date", new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
    .maybeSingle();
  const scheduledWorkoutId = swInst?.id || null;

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
      scheduledWorkoutId={scheduledWorkoutId}
    />
  );
}
