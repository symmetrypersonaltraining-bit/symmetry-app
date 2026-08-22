import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import Link from "next/link";
import WorkoutDayEditor from "./WorkoutDayEditor";
import ClientProfileNav from "@/components/ClientProfileNav";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export default async function WorkoutDayEditPage({
  params,
}: {
  params: Promise<{ clientId: string; dayId: string }>;
}) {
  const { clientId, dayId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) redirect(`/clients`);

  const { data: day } = await supabase
    .from("days")
    // `notes` is not a column on `days` and never has been — and asking for it
    // failed the WHOLE select, so `day` came back null and every workout day a
    // trainer opened from a client's Training tab rendered the "Program Not in
    // App Yet / hasn't been migrated from Everfit" screen below. A one-word
    // typo that read as a data-migration problem. Nothing ever displayed it.
    .select(`
      id, label,
      phases(id, label, programs(id, name)),
      sections(
        id, internal_name, client_facing_name, position,
        prescribed_exercises(
          id, position, sets, volume_type, volume_value,
          unilateral, tempo, load_descriptor, cue, rest,
          superset_group, exercises(id, name, modality, muscle_group, equipment_required)
        )
      )
    `)
    .eq("id", dayId)
    .maybeSingle();

  // Day not found \u2014 program not yet migrated
  if (!day) {
    return (
      <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
        <div className="px-4 pt-4 pb-4" style={{ background: "var(--brand-primary)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Link href={`/clients/${clientId}?tab=training`}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <i className="ti ti-arrow-left text-white text-base" />
            </Link>
            <span className="text-white/70 text-sm">{(client as any).name}</span>
          </div>
          <h1 className="text-white text-xl font-bold">Workout Day</h1>
          <p className="text-white/60 text-xs mt-0.5">Program not yet migrated</p>
        </div>
        <div className="p-6 text-center space-y-4 mt-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-database-off text-3xl" style={{ color: "var(--brand-text-secondary)" }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>
            Program Not in App Yet
          </h2>
          <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--brand-text-secondary)" }}>
            This workout day hasn&apos;t been migrated from Everfit yet. Programs are being imported \u2014 check back soon.
          </p>
          <Link href={`/clients/${clientId}?tab=training`}
            className="inline-block mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "var(--brand-primary)", color: "white" }}>
            Back to Training Tab
          </Link>
        </div>
      </div>
    );
  }

  const { data: exercisesRaw } = await supabase
    .from("exercises")
    .select("id, name, modality, muscle_group")
    .order("name");

  const d = day as any;
  const sections = (d.sections || []).map((s: any) => ({
    ...s,
    prescribed_exercises: [...(s.prescribed_exercises || [])].sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
    ),
  })).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      <div className="px-4 pt-4 pb-4" style={{ background: "var(--brand-primary)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Link href={`/clients/${clientId}?tab=training`}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <i className="ti ti-arrow-left text-white text-base" />
          </Link>
          <span className="text-white/70 text-sm">{(client as any).name}</span>
        </div>
        <h1 className="text-white text-xl font-bold">{d.label || "Workout Day"}</h1>
        <p className="text-white/60 text-xs mt-0.5">{d.phases?.programs?.name} \u00b7 {d.phases?.label}</p>
            <Link
              href={`/workout/${dayId}?forClient=${clientId}`}
              className="mt-3 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.35)" }}>
              <i className="ti ti-player-play-filled text-base" />
              Launch Session
            </Link>
      </div>
      <ClientProfileNav clientId={clientId} active="program" />
      <div className="p-4">
        <WorkoutDayEditor
          dayId={dayId}
          clientId={clientId}
          sections={sections}
          exercises={(exercisesRaw || []) as any[]}
        />
      </div>
    </div>
  );
}
