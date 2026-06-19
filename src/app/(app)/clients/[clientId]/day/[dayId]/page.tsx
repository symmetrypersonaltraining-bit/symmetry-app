import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import WorkoutDayEditor from "./WorkoutDayEditor";

export default async function WorkoutDayEditPage({
  params,
}: {
  params: Promise<{ clientId: string; dayId: string }>;
}) {
  const { clientId, dayId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== "symmetrypersonaltraining@gmail.com") redirect("/home");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  const { data: day } = await supabase
    .from("days")
    .select(`
      id, label, notes,
      phases(id, label, programs(id, name)),
      sections(
        id, label, position, notes,
        prescribed_exercises(
          id, position, sets, volume_type, volume_value,
          unilateral, tempo, load_descriptor, cue, rest,
          superset_group, exercises(id, name, modality, muscle_group, equipment_required)
        )
      )
    `)
    .eq("id", dayId)
    .maybeSingle();
  if (!day) notFound();

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
      {/* Header */}
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
        <p className="text-white/60 text-xs mt-0.5">{d.phases?.programs?.name} · {d.phases?.label}</p>
      </div>

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
