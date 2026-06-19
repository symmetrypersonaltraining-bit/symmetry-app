import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExerciseLibraryClient from "./ExerciseLibraryClient";

export default async function ExerciseLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, modality, equipment_required, video_url, availability_status")
    .order("name");

  const list = (exercises || []).map((e: any) => ({
    id: e.id,
    name: e.name || "",
    muscle_group: e.muscle_group || null,
    modality: e.modality || null,
    equipment: Array.isArray(e.equipment_required) ? e.equipment_required.join(", ") : null,
    video_url: e.video_url || null,
    availability_status: e.availability_status || "active",
  }));

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>Exercise Library</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
          {list.length} exercises
        </p>
      </div>
      <ExerciseLibraryClient exercises={list} />
    </div>
  );
}
