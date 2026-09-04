import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/serverUser";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import AddWorkoutButton from "@/components/AddWorkoutButton";
import Link from "next/link";
import { type CalWorkout } from "@/components/RescheduleCalendar";
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
    todayScheduledList = (swList || []).filter((sw: any) => sw.status !== "replaced").map((sw: any) => {
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
  // THE WEEK BAR IS GONE FROM THIS TAB (3 Sep).
  //
  // Dustin: "the this week / 1 week bar above those workout tabs, is that
  // needed? im thinking maybe that's a bit too cluttered and confusing."
  //
  // It is not needed. ScheduleBoard below already renders past AND upcoming as
  // one continuous chronological list with its own Show past toggle, so the bar
  // was a second, different way of moving through time stacked on a list that
  // does not need one. Home's This Week ring already answers "am I keeping up";
  // this tab answers "what am I doing next", and that is a list.
  //
  // This was ScheduleWeekBar's only remaining caller, so the component is now
  // unused. Left on disk deliberately rather than deleted in the same commit --
  // one logical change at a time, and removing it is its own decision.
  let calWorkouts: CalWorkout[] = [];
  if (clientId) {
    const back = new Date(); back.setDate(back.getDate() - 30);
    const backStr = back.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    // Replaced sessions left out here too, so the board and the card above it
    // agree. Showing a replaced session in one and not the other is worse than
    // either answer on its own.
    //
    // (This used to read "skipped". Renamed 3 Sep: every path that wrote that
    // status was a REPLACE, and calling it skipped is what made a deliberate
    // miss impossible to count. See the scheduled_workouts.status comment.)
    //
    // The row is not gone: it keeps its status, and the trainer schedule still
    // lists it. This is the CLIENT's view of what is left to do.
    const { data: calRows } = await (supabase as any)
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, days(label)")
      .is("deleted_at", null)
      .neq("status", "replaced")
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
    <div className="sym-page">
      <div className="px-4">
        {/* THE TITLE ROW, AND WHY THE HEADER BAND IS GONE.
            The page used to open with a solid --brand-primary band carrying the
            title, then a full-width Add workout button on its own line beneath
            it. Between them that was most of a phone screen before the first
            workout appeared. The band's job — say which screen this is — is done
            by a title on the page itself, and Add workout keeps its prominence
            on the same row rather than a row of its own.

            Dustin, 4 Sep: "dont forget add workout button needs to stay as well
            when we push it through." It stays; it just stops costing a row. */}
        <div className="sym-title">
          <div>
            <h1>Workout</h1>
            <p>{displayDate}</p>
          </div>
          <span className="sym-sp" />
          <AddWorkoutButton />
        </div>

        {/* ONE LIST, NOT A CARD PLUS A LIST.
            Today used to be rendered twice: a card up here, and again inside the
            board below. The board now renders today FIRST and as the only bright
            tile on the screen, so the separate card is redundant — and two
            copies of the same session with their own buttons was a real source
            of "I tapped Start and nothing happened, I was on the other one". */}
        {calWorkouts.length > 0 || allPhases.length > 0 ? (
          <ScheduleBoard workouts={calWorkouts} ownerClientId={clientId || ""} />
        ) : (
          <div className="sym-tile">
            <div className="sym-tile-head">
              <span className="sym-tile-lbl"><i className="ti ti-barbell" />Nothing scheduled yet</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)" }}>
              Add a workout above, or contact your trainer to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
