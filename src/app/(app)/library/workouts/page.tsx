import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface DayWithProgram {
  id: string;
  label: string;
  position: number;
  phase_label: string;
  program_name: string;
  program_id: string;
  exercise_count: number;
}

export default async function WorkoutsLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all days with their phase + program info
  const { data: days } = await supabase
    .from("days")
    .select("id, label, position, phases(label, programs(id, name))")
    .order("position");

  const SECTION_COUNTS: Record<string, number> = {};
  // Fetch exercise counts per day
  const { data: sections } = await supabase
    .from("sections")
    .select("id, day_id");

  if (sections) {
    const { data: prescriptions } = await supabase
      .from("prescribed_exercises")
      .select("id, sections(day_id)");
    if (prescriptions) {
      for (const pe of prescriptions as any[]) {
        const dayId = pe.sections?.day_id;
        if (dayId) SECTION_COUNTS[dayId] = (SECTION_COUNTS[dayId] || 0) + 1;
      }
    }
  }

  const mapped: DayWithProgram[] = (days || []).map((d: any) => ({
    id: d.id,
    label: d.label || "Unnamed Day",
    position: d.position || 0,
    phase_label: d.phases?.label || "Phase",
    program_name: d.phases?.programs?.name || "Unknown Program",
    program_id: d.phases?.programs?.id || "",
    exercise_count: SECTION_COUNTS[d.id] || 0,
  }));

  // Group by program
  const byProgram: Record<string, { name: string; days: DayWithProgram[] }> = {};
  for (const d of mapped) {
    if (!byProgram[d.program_id]) {
      byProgram[d.program_id] = { name: d.program_name, days: [] };
    }
    byProgram[d.program_id].days.push(d);
  }

  const programGroups = Object.entries(byProgram).sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  );

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>
            Workout Library
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
            {mapped.length} workouts across {programGroups.length} programs
          </p>
        </div>
        <Link
          href="/library/programs"
          className="btn btn-primary btn-sm"
        >
          <i className="ti ti-trophy" />
          Programs
        </Link>
      </div>

      {programGroups.length === 0 ? (
        <div className="card text-center py-16">
          <i
            className="ti ti-list-check"
            style={{ fontSize: 48, color: "var(--brand-border)", display: "block", marginBottom: 12 }}
          />
          <p className="font-semibold" style={{ color: "var(--brand-text)" }}>
            No workouts yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--brand-text-secondary)" }}>
            Create programs in the Programs tab to build your workout library
          </p>
          <Link href="/library/programs" className="btn btn-primary btn-sm mt-4 inline-flex">
            Go to Programs
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {programGroups.map(([programId, group]) => (
            <div key={programId}>
              {/* Program header */}
              <div className="flex items-center gap-2 mb-3">
                <i
                  className="ti ti-trophy"
                  style={{ color: "var(--brand-accent)", fontSize: 16 }}
                />
                <h2
                  className="font-bold text-sm uppercase tracking-wider"
                  style={{ color: "var(--brand-text-secondary)" }}
                >
                  {group.name}
                </h2>
                <div className="flex-1 h-px" style={{ background: "var(--brand-border)" }} />
                <span
                  className="badge badge-gray"
                  style={{ fontSize: 11 }}
                >
                  {group.days.length} days
                </span>
              </div>

              {/* Day cards */}
              <div className="space-y-2">
                {group.days.map((day, idx) => (
                  <Link
                    key={day.id}
                    href={`/workout/${day.id}`}
                    className="card card-hover flex items-center gap-4 p-4 cursor-pointer animate-slide-up block"
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    {/* Day number badge */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "color-mix(in srgb, var(--brand-primary) 12%, transparent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "var(--brand-primary)",
                        }}
                      >
                        {idx + 1}
                      </span>
                    </div>

                    {/* Label + meta */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold truncate"
                        style={{ color: "var(--brand-text)" }}
                      >
                        {day.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                        {day.phase_label}
                        {day.exercise_count > 0 && (
                          <span> \u00b7 {day.exercise_count} exercises</span>
                        )}
                      </p>
                    </div>

                    {/* Action */}
                    <i
                      className="ti ti-chevron-right"
                      style={{ color: "var(--brand-text-secondary)", fontSize: 18 }}
                    />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
