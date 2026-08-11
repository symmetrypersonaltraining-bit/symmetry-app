import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import AddWorkoutButton from "@/components/AddWorkoutButton";
import Link from "next/link";
import { type CalWorkout } from "@/components/RescheduleCalendar";
import ScheduleWeekBar from "@/components/ScheduleWeekBar";
import ScheduleBoard from "@/components/ScheduleBoard";
import { isTrainerEmail } from "@/lib/trainer";
import { fetchOwnClientRow } from "@/lib/ownClient";

async function isClientMode(asMarker?: string): Promise<boolean> {
  // Explicit ?as=client marker OR the cookie (marker wins on first render even
  // before the client-mode cookie propagates) — fixes intermittent trainer-UI
  // leak in Client View.
  if (asMarker === "client") return true;
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function WorkoutPage(props: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = isTrainerEmail(user.email);
  const inClientMode = isTrainer ? await isClientMode(searchParams.as) : false;

  // Central time today
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  // Get client record
  let clientId: string | null = null;
  let clientName = "You";
  if (isTrainer && !inClientMode) {
    // By login, not by name — src/lib/ownClient.ts. The fallback label comes
    // from the row now, so a different trainer is not greeted as Dustin.
    const data = await fetchOwnClientRow<{ id: string; name: string }>(supabase, user, "id, name");
    clientId = data?.id || null;
    clientName = data?.name || "You";
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
    // maybeSingle() ERRORS when more than one row matches, and 25 of 35 clients
    // have more than one active assignment (Sharon and Sara have four). For all
    // of them this select returned nothing, allPhases stayed empty, and the page
    // fell through to the "no program" card — which is also the branch that does
    // not render the schedule board, so those clients had no way to move a
    // workout at all on any day they had none scheduled. Newest assignment wins.
    const { data: assignments } = await supabase
      .from("program_assignments")
      .select("program_id, created_at, programs(name, phases(id, label, position, days(id, label, position)))")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    const assignment = (assignments || [])[0] ?? null;
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
      .is("deleted_at", null)
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
      .is("deleted_at", null)
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
      <div className="px-4 pt-3"><AddWorkoutButton /></div>

      <div className="px-4 py-4">
        {todayScheduledList.length > 0 ? (
          <>
            {todayScheduledList.map((ts) => (
            // Start moved onto the same row as the title instead of sitting on
            // its own line under it. Two of these cards plus a full-width button
            // each pushed My Schedule entirely below the fold, so clients never
            // saw that the week strip and the board existed. The name still
            // wraps to as many lines as it needs — nothing is truncated — the
            // height saved is the button row and the padding around it.
            <div key={ts.id} className="card card-glow mb-2.5" style={{ padding: 12 }}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>
                    Today &middot; {ts.phaseLabel}
                  </p>
                  <h2 className="text-[15px] font-semibold leading-snug" style={{ color: "var(--brand-text)" }}>
                    <i className={`ti ${/cardio/i.test(ts.dayLabel) ? "ti-run" : "ti-barbell"} mr-1.5`} style={{ color: "var(--brand-primary)" }} />
                    {ts.dayLabel}
                  </h2>
                  <p className="text-[11px] truncate" style={{ color: "var(--brand-text-secondary)" }}>
                    {ts.programName}
                  </p>
                </div>
                {ts.status === "completed" ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold flex-shrink-0" style={{ color: "#22c55e" }}>
                    <i className="ti ti-check" /> Done
                  </div>
                ) : (
                  <Link
                    href={"/workout/" + ts.dayId}
                    className="btn btn-primary flex-shrink-0 flex items-center gap-1.5"
                    style={{ padding: "9px 14px", fontSize: 13, whiteSpace: "nowrap" }}
                  >
                    <i className="ti ti-player-play" /> Start
                  </Link>
                )}
              </div>
            </div>
            ))}

            <div style={{ marginTop: "0.85rem" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>My Schedule</p>
              <ScheduleWeekBar workouts={calWorkouts} />
              <ScheduleBoard workouts={calWorkouts} ownerClientId={clientId || ""} />
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
              <ScheduleWeekBar workouts={calWorkouts} />
              <ScheduleBoard workouts={calWorkouts} ownerClientId={clientId || ""} />
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
