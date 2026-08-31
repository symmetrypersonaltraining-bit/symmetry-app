import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/serverUser";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import AddWorkoutButton from "@/components/AddWorkoutButton";
import Link from "next/link";
import { type CalWorkout } from "@/components/RescheduleCalendar";
import ScheduleWeekBar from "@/components/ScheduleWeekBar";
import ScheduleBoard from "@/components/ScheduleBoard";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { coachForViewer } from "@/lib/coachIdentity";
import { fetchOwnClientRow } from "@/lib/ownClient";

async function isClientMode(asMarker?: string): Promise<boolean> {
  // Explicit ?as=client marker OR the cookie (marker wins on first render even
  // before the client-mode cookie propagates) — fixes intermittent trainer-UI
  // leak in Client View.
  if (asMarker === "client") return true;
  // ?as=trainer is the mirror of ?as=client, and it BEATS the cookie.
  //
  // Entering client view was deterministic — the marker forced the client
  // branch on the first server render whatever the cookie said. LEAVING it had
  // no marker at all: the toggle pushed a bare /home and relied entirely on
  // `document.cookie = "symmetry_client_mode=; max-age=0"` having propagated
  // before the RSC request went out. When it had not, the server read the
  // cookie as still set and rendered the CLIENT dashboard for a trainer who had
  // just asked for the trainer one.
  //
  // Dustin, 22 Aug: "my app is currently opening to client view when i hit
  // trainer toggle" — and again, the other way, as a hang: the wrong branch
  // renders the trainer's all-clients schedule query, which takes ~1.8s, so the
  // mistake shows up as a freeze rather than as a wrong screen.
  if (asMarker === "trainer") return false;
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function WorkoutPage(props: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const isTrainer = await viewerIsTrainer(supabase, user);
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
      clientName = d2?.name || (await coachForViewer(supabase as never, user.id)).firstName;
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
    // `assigned_at`, NOT `created_at`. There is no created_at column on
    // program_assignments — the columns are id, client_id, program_id,
    // current_phase_id, current_day_in_rotation, combination_group, active,
    // assigned_at. PostgREST rejects the whole request for naming a column
    // that does not exist, supabase-js hands back data: null, the `|| []`
    // below swallows it, and allPhases stays empty.
    //
    // Which sent EVERY client to the "no program assigned" card on any day
    // with nothing scheduled — the exact branch the comment above was written
    // to stop them reaching. The fix for maybeSingle introduced it and nothing
    // caught it, because a silently-null query and a client with no programme
    // render identically. Dustin found it on a rest day: "on a rest day I
    // should still be able to view full schedule but it goes here instead."
    const { data: assignments, error: assignErr } = await supabase
      .from("program_assignments")
      .select("program_id, assigned_at, programs(name, phases(id, label, position, days(id, label, position)))")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("assigned_at", { ascending: false })
      .limit(1);
    // Not swallowed. A failed lookup here is indistinguishable on screen from
    // having no programme, so it must at least be findable in the logs.
    if (assignErr) console.error("workout page: active assignment lookup failed", assignErr.message);
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
    // SKIPPED IS NOT OUTSTANDING.
    //
    // Every "replace this with something else" path in the app marks the
    // original `skipped` and inserts the replacement beside it — that is the
    // deliberate contract ("nothing is deleted, and your programme is
    // unchanged"). But no read anywhere filtered on it, so the replaced
    // session kept rendering as a live card with a working Start button next
    // to the thing that replaced it. Dustin, 22 Aug: "I replaced it with a
    // walk and it did not replace it just created another."
    //
    // The swap was right. The screen never learned what skipped means.
    todayScheduledList = (swList || []).filter((sw: any) => sw.status !== "skipped").map((sw: any) => {
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

  // Calendar data: 30 days back, and NO forward limit.
  //
  // Dustin, 12 Aug: "there is no limit to me looking ahead at programming
  // scheduled thats ridiculous it was ever set up that way." The window was 90
  // days, and 26 sessions for one client already sat beyond it — scheduled,
  // working, simply invisible until they drifted inside three months.
  //
  // There is no upper bound now. If it is on the calendar it can be looked at.
  // The row count is bounded by what has actually been programmed, not by a
  // number someone picked.
  let calWorkouts: CalWorkout[] = [];
  if (clientId) {
    const back = new Date(); back.setDate(back.getDate() - 30);
    const backStr = back.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    // Skipped left out here too, so the board and the week bar agree with the
    // card above them. Showing a replaced session in one of the three and not
    // the others is worse than either answer on its own — and ScheduleWeekBar
    // marks a whole day unfinished if any workout on it is not completed, so
    // one replaced session made every day it touched look outstanding.
    //
    // The row is not gone: it keeps its status, and the trainer schedule still
    // lists it. This is the CLIENT's view of what is left to do.
    const { data: calRows } = await (supabase as any)
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, days(label)")
      .is("deleted_at", null)
      .neq("status", "skipped")
      .eq("client_id", clientId)
      .gte("scheduled_date", backStr)
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
          // The schedule stays, whatever else is true.
          //
          // This branch used to be a bare card, so the one state where
          // something had gone wrong was also the only state with no way to
          // reach your own schedule — no week strip, no board, nothing to tap.
          // A client who landed here could not move a workout or even see that
          // next week existed. If there are scheduled workouts to show, this is
          // not "no programme", whatever the assignment lookup said.
          <>
            <div className="card mb-4 text-center py-8">
              <i className="ti ti-barbell text-3xl block mb-2" style={{ color: "var(--brand-border)" }} />
              <p className="font-medium mb-1" style={{ color: "var(--brand-text)" }}>
                {calWorkouts.length > 0 ? "Nothing scheduled today" : "No program assigned"}
              </p>
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
                {calWorkouts.length > 0
                  ? "Your schedule is below."
                  : "Contact your trainer to get started."}
              </p>
            </div>
            {calWorkouts.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>My Schedule</p>
                <ScheduleWeekBar workouts={calWorkouts} />
                <ScheduleBoard workouts={calWorkouts} ownerClientId={clientId || ""} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
