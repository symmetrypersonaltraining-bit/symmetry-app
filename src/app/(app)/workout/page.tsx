import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import RescheduleCalendar, { type CalWorkout } from "@/components/RescheduleCalendar";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

async function isClientMode(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function WorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  const inClientMode = isTrainer ? await isClientMode() : false;

  // Central time today
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  // Get client record
  let clientId: string | null = null;
  let clientName = "You";
  if (isTrainer && !inClientMode) {
    const { data } = await supabase.from("clients").select("id, name").ilike("name", "%Dustin%").maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "Dustin";
  } else {
    const { data } = await supabase.from("clients").select("id, name").eq("auth_user_id", user.id).maybeSingle();
    if (!data && isTrainer) {
      const { data: d2 } = await supabase.from("clients").select("id, name").eq("email", user.email!).maybeSingle();
      clientId = d2?.id || null;
      clientName = d2?.name || "Dustin";
    } else {
      clientId = data?.id || null;
      clientName = data?.name || "You";
    }
  }

  // Get active program phases/days
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
      allPhases = (prog?.phases || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((ph: any) => ({
          id: ph.id,
          label: ph.label,
          days: (ph.days || []).sort((a: any, b: any) => a.position - b.position),
        }));
    }
  }

  // Look up ALL of today's scheduled workouts (Central time) — array, never maybeSingle
  // (maybeSingle errors when a day has 2 workouts, which made this page show "Rest Day")
  let todayScheduledList: { id: string; status: string; dayId: string; dayLabel: string; phaseLabel: string; programName: string }[] = [];
  if (clientId) {
    const { data: swList } = await (supabase as any)
      .from("scheduled_workouts")
      .select("id, status, days(id, label, phases(id, label, programs(name)))")
      .eq("client_id", clientId)
      .eq("scheduled_date", todayDate)
      .order("id");
    todayScheduledList = (swList || []).map((sw: any) => {
      const d = sw.days;
      const ph = d?.phases;
      const prog = ph?.programs;
      return {
        id: sw.id as string,
        status: sw.status as string,
        dayId: (d?.id || "") as string,
        dayLabel: (d?.label || "Workout") as string,
        phaseLabel: (ph?.label || "") as string,
        programName: (prog?.name || "") as string,
      };
    });
  }

  // Calendar data: 30 days back to 90 days ahead
  let calWorkouts: CalWorkout[] = [];
  if (clientId) {
    const back = new Date(); back.setDate(back.getDate() - 30);
    const ahead = new Date(); ahead.setDate(ahead.getDate() + 90);
    const backStr = back.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const aheadStr = ahead.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const { data: calRows } = await (supabase as any)
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, days(label)")
      .eq("client_id", clientId)
      .gte("scheduled_date", backStr)
      .lte("scheduled_date", aheadStr)
      .order("scheduled_date");
    calWorkouts = (calRows || []).map((w: any) => ({
      id: w.id as string,
      dayId: (w.day_id || w.id) as string,
      date: w.scheduled_date as string,
      label: ((w.days as any)?.label || "Workout") as string,
      status: w.status as string,
    }));
  }

  const displayDate = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <>
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Workout</h1>
        <p className="text-white/60 text-sm">{displayDate}</p>
      </div>

      <div className="px-4 py-4">
        {todayScheduledList.length > 0 ? (
          <>
            {todayScheduledList.map((ts) => (
            <div key={ts.id} className="card card-glow mb-4">
              <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)" }}>
                Today &middot; {ts.phaseLabel}
              </p>
              <h2 className="text-lg font-medium mb-1" style={{ color: "var(--brand-text)" }}>
                <i className={`ti ${/cardio/i.test(ts.dayLabel) ? "ti-run" : "ti-barbell"} mr-1.5`} style={{ color: "var(--brand-primary)" }} />
                {ts.dayLabel}
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--brand-text-secondary)" }}>
                {ts.programName}
              </p>
              {ts.status === "completed" ? (
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#22c55e" }}>
                  <i className="ti ti-check" /> Completed
                </div>
              ) : (
                <Link href={"/workout/" + ts.dayId} className="btn btn-primary block text-center">
                  Start workout
                </Link>
              )}
            </div>
            ))}

            <div style={{ marginTop: "1.25rem" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>My Schedule</p>
              <RescheduleCalendar workouts={calWorkouts} />
            </div>
          </>
        ) : allPhases.length > 0 ? (
          <>
            <div className="card mb-4 text-center py-6">
              <i className="ti ti-moon text-3xl block mb-2" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="font-medium mb-1" style={{ color: "var(--brand-text)" }}>Rest Day</p>
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No workout scheduled for today.</p>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>My Schedule</p>
              <RescheduleCalendar workouts={calWorkouts} />
            </div>
          </>
        ) : (
          <div className="card text-center py-10">
            <i className="ti ti-barbell text-4xl block mb-3" style={{ color: "var(--brand-border)" }} />
            <p className="font-medium mb-1">No program assigned</p>
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Contact your trainer to get started.</p>
          </div>
        )}
      </div>
    </>
  );
}
