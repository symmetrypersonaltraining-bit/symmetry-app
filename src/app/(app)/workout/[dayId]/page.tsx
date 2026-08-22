import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkoutLogger from "./WorkoutLogger";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { CLIENT_MODE_COOKIE, inClientModeFrom } from "@/lib/ai/trainerGate";
import { cookies } from "next/headers";


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

  const isTrainer = await viewerIsTrainer(supabase, user);
  // Which APP this is, not which person. A trainer in Client View is looking at
  // the client app, and the trainer console does not belong there — same rule
  // the server gate applies, so the button and the route cannot disagree about
  // what "the trainer app" means. This only decides which button to draw;
  // /api/agent authorizes independently and does not trust this.
  const inClientMode = inClientModeFrom(
    (await cookies()).get(CLIENT_MODE_COOKIE)?.value,
    null,
  );
  const trainerApp = isTrainer && !inClientMode;

  let resolvedDayId = dayId;
  // The DATE this session belongs to, which is not always today.
  //
  // Madeleine Coker, 2026-08-06 06:35: "Trying to log my cardio for yesterday
  // and it keeps completing my cardio for today instead." She tapped the 5 Aug
  // cardio card at 06:30 on the 6th; the app wrote log_date = 6 Aug, marked the
  // 6th's card complete, and left the 5th still outstanding. Her make-up
  // vanished and a day she had not trained got credited.
  //
  // The logger had no concept of which day it was logging — it asked the clock,
  // in three separate places. The scheduled_workouts row it was opened from
  // knows, and the answer was being read and thrown away right here.
  let scheduledDate: string | null = null;
  {
    const { data: schedRow } = await supabase
      .from("scheduled_workouts")
      .select("day_id, scheduled_date")
      .eq("id", dayId)
      .maybeSingle();
    if (schedRow?.day_id) resolvedDayId = schedRow.day_id;
    if (schedRow?.scheduled_date) scheduledDate = schedRow.scheduled_date as string;
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
          id, position, sets, tracked_fields, volume_type, volume_value, exercise_id,
          unilateral, tempo, load_descriptor, cue, rest,
          superset_group, intensity_type, use_drop_sets,
          use_rest_pause, use_partials,
          exercises(id, name, modality, muscle_group, equipment_required, video_url, video_status, default_tracked_fields)
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
    // Trainer logging their OWN workout.
    //
    // This used to be .ilike("name", "%Dustin%").maybeSingle(). Two problems:
    // maybeSingle ERRORS when more than one row matches, and the error was
    // discarded — so the day a client called Dustin signs up, the trainer's own
    // logger silently gets clientId = null, every write fails, and Finish does
    // nothing. Matching a person by a substring of their name was always a
    // guess; his account id is a fact.
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
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
  // A card from the past is a make-up and records against the day it was FOR —
  // that is what "log my cardio for yesterday" means, and it is what Dustin's
  // adherence per scheduled day counts. A card from the future records against
  // today, because that is the day the work actually happened; completing it
  // still closes the future card.
  const sessionDate = scheduledDate && scheduledDate < today ? scheduledDate : today;
  // TODAY'S log for this day — and it must survive there being more than one.
  //
  // This was .maybeSingle(), which in PostgREST is not "give me one of them" but
  // "ERROR if there is more than one". The error was discarded, so two logs for
  // the same day meant existingLog === null: the logger opened blank, showed
  // none of the sets already recorded, and created a THIRD log. Every reopen
  // added another. The screen said nothing was logged while the database held
  // two sessions' worth.
  //
  // A completed log wins over an open one, then the newest — reopening a
  // finished workout should show it finished, not offer an empty one.
  const { data: existingLogs, error: existingLogErr } = await supabase
    .from("workout_logs")
    .select("id, completed, log_date, created_at, set_logs(*)")
    .eq("client_id", clientId || "")
    .eq("day_id", resolvedDayId)
    .eq("log_date", sessionDate)
    .order("completed", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingLogErr) console.error("workout page: existing log lookup", existingLogErr);
  const existingLog = (existingLogs as { id: string; completed: boolean; set_logs: unknown[] }[] | null)?.[0] ?? null;

  const { data: swInst } = await supabase
    .from("scheduled_workouts")
    .select("id")
    // Soft-deleted rows are still in the table; every other call site filters
    // them out and this one didn't, so a removed session could still hand back
    // a scheduledWorkoutId and get logged against.
    .is("deleted_at", null)
    .eq("day_id", resolvedDayId)
    .eq("client_id", clientId || "")
    .eq("scheduled_date", sessionDate)
    // Same maybeSingle trap: two scheduled rows for one day is a real state in
    // this data (Dustin had two identical "Peak — Arms A" cards on 4 Aug) and it
    // must not blank the id out.
    .order("id")
    .limit(1);
  const scheduledWorkoutId = (swInst as { id: string }[] | null)?.[0]?.id ?? null;

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
      trainerApp={trainerApp}
      existingLogId={existingLog?.id || null}
      existingSetLogs={existingLog?.set_logs || []}
      scheduledWorkoutId={scheduledWorkoutId}
      sessionDate={sessionDate}
    />
  );
}
