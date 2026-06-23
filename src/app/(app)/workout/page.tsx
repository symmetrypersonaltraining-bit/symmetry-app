import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";

  // Get client record
  let clientId: string | null = null;
  let clientName = "You";
  if (isTrainer) {
    // Trainer views their own workout by default
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .ilike("name", "%Dustin%")
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "Dustin";
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "You";
  }

  // Get today's day of week (0=Sun, 1=Mon, ..., 6=Sat)
  const today = new Date();

  // Get active program assignment and find today's day
  let todayDay: { id: string; label: string; phase_label: string; program_name: string } | null = null;
  let allPhases: { id: string; label: string; days: { id: string; label: string }[] }[] = [];

  if (clientId) {
    const { data: assignment } = await supabase
      .from("program_assignments")
      .select("program_id, programs(name, phases(id, label, position, days(id, label, position)))")
      .eq("client_id", clientId)
      .eq("active", true)
      .maybeSingle();

    if (assignment) {
      const prog = (assignment as any).programs;
      const phases = prog?.phases || [];
      allPhases = phases
        .sort((a: any, b: any) => a.position - b.position)
        .map((ph: any) => ({
          id: ph.id,
          label: ph.label,
          days: (ph.days || []).sort((a: any, b: any) => a.position - b.position),
        }));

      // Fallback: just show first day of first phase
      if (!todayDay && allPhases.length > 0 && allPhases[0].days.length > 0) {
        const ph = allPhases[0];
        const d = ph.days[0];
        todayDay = {
          id: d.id,
          label: d.label,
          phase_label: ph.label,
          program_name: prog.name,
        };
      }
    }
  }

  return (
    <>
      {/* Header */}
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Workout</h1>
        <p className="text-white/60 text-sm">
          {today.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="px-4 py-4">
        {todayDay ? (
          <>
            {/* Today's workout card */}
            <div className="card card-glow">
              <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)" }}>
                Today · {todayDay.phase_label}
              </p>
              <h2
                className="text-lg font-medium mb-3"
                style={{ color: "var(--brand-text)" }}
              >
                {todayDay.label}
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--brand-text-secondary)" }}>
                {todayDay.program_name}
              </p>
              <Link
                href={`/workout/${todayDay.id}`}
                className="btn btn-primary block text-center"
              >
                Start workout →
              </Link>
            </div>

            {/* All phases / days */}
            {allPhases.map((phase) => (
              <div key={phase.id} style={{ marginTop: "1.25rem" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>{phase.label}</p>
                <div className="space-y-2">
                  {phase.days.map((day) => (
                    <Link key={day.id} href={"/workout/" + day.id}
                      className="flex items-center gap-3 rounded-2xl p-3.5"
                      style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-primary)" }}>
                        <i className="ti ti-barbell text-base" style={{ color: "white" }} />
                      </div>
                      <span className="text-sm font-medium flex-1" style={{ color: "var(--brand-text)" }}>{day.label}</span>
                      <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="card text-center py-10">
            <i
              className="ti ti-barbell text-4xl block mb-3"
              style={{ color: "var(--brand-border)" }}
            />
            <p className="font-medium mb-1">No program assigned</p>
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              Contact your trainer to get started.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
