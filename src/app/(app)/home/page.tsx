import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import TrainerCalendarPanel from "@/components/TrainerCalendarPanel";
import ClientDashboard from "./ClientDashboard";
import TrainerHome from "./TrainerHome";
import PendingRemindersPanel from "@/components/PendingRemindersPanel";
import ClientNotesPanel, { type ClientNote } from "@/components/ClientNotesPanel";
import { isSymptomNote } from "@/lib/trainingNoteRouting";
import { TRAINER_EMAIL, isTrainerEmail } from "@/lib/trainer";
import { getServerUser } from "@/lib/auth/serverUser";

async function isClientMode(asMarker?: string): Promise<boolean> {
  // Explicit ?as=client marker OR the cookie. The marker guarantees the client
  // branch renders on the FIRST server render even if the cookie (set in a
  // client effect) hasn't propagated yet — fixes the intermittent trainer-UI
  // leak in Client View.
  if (asMarker === "client") return true;
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function HomePage(props: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createClient();
  // Local token verification first; see src/lib/auth/verifyJwt.ts.
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const isTrainer = isTrainerEmail((user?.email ?? ""));
  const isInClientMode = isTrainer ? await isClientMode(searchParams.as) : false;

  // ── TRAINER VIEW ──────────────────────────────────────────────────────────
  if (isTrainer && !isInClientMode) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name");

    const todayStrCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    // Calendar range: 3 months back, 12 months forward (Central time)
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 3);
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 12);
    const startStr = rangeStart.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const endStr = rangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    // All appointments for the calendar (3mo back to 12mo forward)
    const { data: apptRows } = await supabase
      .from("appointments")
      .select("id, client_id, scheduled_at, ends_at, status, title, clients(id, name)")
      .gte("scheduled_at", startStr + "T00:00:00")
      .lte("scheduled_at", endStr + "T23:59:59")
      .order("scheduled_at");

    type AE = {
      id: string; clientId: string; clientName: string; title: string;
      startTime: string; endTime: string; status: string; scheduledAt: string; endsAt: string | null;
    };
    const appointmentMap: Record<string, AE[]> = {};
    for (const a of apptRows || []) {
      const row = a as any;
      const dateKey = new Date(row.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const startTime = new Date(row.scheduled_at).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago",
      });
      const endTime = row.ends_at
        ? new Date(row.ends_at).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago",
          })
        : "";
      if (!appointmentMap[dateKey]) appointmentMap[dateKey] = [];
      appointmentMap[dateKey].push({
        id: row.id,
        clientId: row.clients?.id || row.client_id,
        clientName: row.clients?.name || "Unknown",
        title: row.title || "Training Session",
        startTime,
        endTime,
        status: row.status || "scheduled",
        scheduledAt: row.scheduled_at,
        endsAt: row.ends_at || null,
      });
    }

    // Today's scheduled workouts — provides day_id for Start button + completion status
    const { data: todayWorkoutRows } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, status, day_id, supervised, position, days(id, label)")
      .is("deleted_at", null)
      .eq("scheduled_date", todayStrCT);

    // The trainer's "Today's Sessions" must launch the SUPERVISED day (what the client trains
    // WITH the trainer), never their solo mobility/cardio/walk homework. Rank each candidate:
    // supervised first, then a real training day over a solo/cardio/mobility day, then lower
    // position; lowest score wins. (Previously it only avoided /cardio/ and didn't order the
    // query, so a solo mobility day could shadow the supervised strength session.)
    type ClientDay = { dayId: string; dayLabel: string; status: string };
    const SOLO_RE = /cardio|treadmill|\bwalk\b|stair.?master|mobility|daily reset|elliptical|\bbike\b/i;
    const dayRank = (label: string, supervised: boolean, position: number) =>
      (supervised ? 0 : 100) + (SOLO_RE.test(label) ? 10 : 0) + Math.max(0, Math.min(9, position || 0));
    const bestRank: Record<string, number> = {};
    const clientDayMap: Record<string, ClientDay> = {};
    for (const w of todayWorkoutRows || []) {
      const row = w as any;
      if (!row.client_id) continue;
      const label = (row.days?.label || "Training") as string;
      const score = dayRank(label, row.supervised === true, row.position);
      if (bestRank[row.client_id] === undefined || score < bestRank[row.client_id]) {
        bestRank[row.client_id] = score;
        clientDayMap[row.client_id] = {
          dayId: row.days?.id || row.day_id,
          dayLabel: label,
          status: row.status || "scheduled",
        };
      }
    }

    // Today's sessions for TrainerHome — merge appointments + scheduled_workouts
    const todayAppointments = appointmentMap[todayStrCT] || [];
    const trainerHomeSessions = todayAppointments.map((appt: AE) => {
      const workout = clientDayMap[appt.clientId];
      const sessionStatus = workout?.status === "completed" ? "completed"
        : workout?.status === "cancelled_client" ? "cancelled_client"
        : appt.status;
      return {
        id: appt.id,
        clientId: appt.clientId,
        clientName: appt.clientName,
        startTime: appt.scheduledAt
          ? new Date(appt.scheduledAt).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago",
            })
          : appt.startTime,
        endTime: appt.endsAt
          ? new Date(appt.endsAt).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago",
            })
          : appt.endTime,
        status: sessionStatus,
        title: appt.title,
        workouts: workout
          ? [{ id: workout.dayId, label: workout.dayLabel, isCardio: /cardio|run|bike|swim|tread|ellip/i.test(workout.dayLabel) }]
          : [],
      };
    });

    const loggedTodayCount = trainerHomeSessions.filter((s) => s.status === "completed").length;

    // Workout map (programmed workouts — separate calendar layer, do NOT modify)
    type WE = { id: string; dayId: string | null; clientId: string; clientName: string; date: string; dayLabel: string; status: string };
    const workoutRangeEnd = new Date();
    workoutRangeEnd.setMonth(workoutRangeEnd.getMonth() + 3);
    const { data: workoutRows } = await supabase
      .from("scheduled_workouts")
      .select("id, day_id, client_id, scheduled_date, status, days(id, label), clients(id, name)")
      .is("deleted_at", null)
      // Central, not UTC: derive the month floor from the Central date, not the UTC year/month.
      .gte("scheduled_date", (() => {
        const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 2, 1));
        return dt.toISOString().slice(0, 10);
      })())
      .lte("scheduled_date", workoutRangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .order("scheduled_date");

    const workoutMap: Record<string, WE[]> = {};
    for (const w of workoutRows || []) {
      const row = w as any;
      const dateKey = row.scheduled_date;
      if (!workoutMap[dateKey]) workoutMap[dateKey] = [];
      workoutMap[dateKey].push({
        id: row.id,
        dayId: row.days?.id || row.day_id || null,
        clientId: row.clients?.id || row.client_id,
        clientName: row.clients?.name || "Unknown",
        date: dateKey,
        dayLabel: row.days?.label || "Workout",
        status: row.status || "scheduled",
      });
    }

    // Payment reminders due in 30 days
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, email_sent_at, clients(id, name)")
      .gte("due_date", todayStrCT)
      .lte("due_date", thirtyDays.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .in("notification_status", ["pending", "paused"])
      .order("due_date");

    const reminders = (remindersRaw || []).map((r: any) => ({
      id: r.id,
      clientName: r.clients?.name || "Unknown",
      clientId: r.clients?.id || r.client_id,
      dueDate: r.due_date,
      amountDue: Number(r.amount_due),
      billingCredits: Number(r.billing_credits),
      notificationStatus: r.notification_status,
      emailSentAt: r.email_sent_at,
    }));

    const trainerDateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
    });

    // ── THE NOTES NOBODY HAS CLOSED OUT ──────────────────────────────────────
    //
    // `exercise_notes.resolved` shipped with the table and nothing had ever
    // written it: on 21 Aug, 63 rows and 63 unresolved, the oldest from 19 July.
    // Most of them DID reach him as messages at the time — routeTrainingNote
    // delivers symptoms and questions — but a message scrolls away and a note
    // had no state, so "which of these have I actually dealt with?" had no
    // answer for a month.
    //
    // Scoped by RLS (`trainer_can_see_client`), so Stephanie sees only her own
    // clients' notes without this query knowing anything about it.
    const { data: noteRows } = await supabase
      .from("exercise_notes")
      .select("id, client_id, note, author, log_date, day_id, exercises(name), clients(name)")
      .eq("resolved", false)
      .order("log_date", { ascending: false })
      .limit(60);

    const clientNotes: ClientNote[] = ((noteRows || []) as unknown as Array<{
      id: string; client_id: string; note: string; author: string;
      log_date: string | null; day_id: string | null;
      exercises: { name?: string } | { name?: string }[] | null;
      clients: { name?: string } | { name?: string }[] | null;
    }>).map((r) => {
      const ex = Array.isArray(r.exercises) ? r.exercises[0] : r.exercises;
      const cl = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      return {
        id: r.id,
        clientId: r.client_id,
        clientName: cl?.name || "A client",
        exerciseName: ex?.name || "a movement",
        note: r.note,
        author: r.author,
        logDate: r.log_date,
        dayId: r.day_id,
        isSymptom: isSymptomNote(r.note),
      };
    })
      // Symptoms first, then newest. Same vocabulary that decides whether a note
      // is worth interrupting him for, so the two rankings cannot drift.
      .sort((a, b) =>
        a.isSymptom === b.isSymptom
          ? (b.logDate || "").localeCompare(a.logDate || "")
          : a.isSymptom ? -1 : 1,
      );

    return (
      <div className="p-4 lg:p-6">
        <TrainerHome
          todaySessions={trainerHomeSessions}
          completedCount={loggedTodayCount}
          scheduledCount={trainerHomeSessions.length}
          clients={(clients || []) as Array<{ id: string; name: string }>}
          notificationCount={reminders.length}
          dateLabel={trainerDateLabel}
        />
        <ClientNotesPanel notes={clientNotes} />
        <PendingRemindersPanel reminders={reminders} />
        <TrainerCalendarPanel
          clients={clients || []}
          appointmentMap={appointmentMap}
          workoutMap={workoutMap}
        />
      </div>
    );
  }

  // ── CLIENT VIEW ───────────────────────────────────────────────────────────
  // Trainer in client-preview mode (cookie set) or an actual client
  // THE SIGNED-IN PERSON'S OWN CLIENT ROW — by account id, never by email.
  //
  // This looked the trainer's row up with `.eq("email", TRAINER_EMAIL)`, a
  // single constant. With two trainers from 20 Aug that lands on Dustin no
  // matter who is signed in: Stephanie's own client view would have shown HIS
  // weight, HIS meals, HIS workouts.
  //
  // auth_user_id is right for everybody and always was — both trainers' client
  // rows carry the same auth account as their trainer row. The workout page
  // reached this conclusion already: "Matching a person by a substring of their
  // name was always a guess; his account id is a fact."
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>
          Your account is being set up. Check back soon.
        </p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const thirtyAhead = new Date();
  thirtyAhead.setDate(thirtyAhead.getDate() + 30);
  const thirtyAheadStr = thirtyAhead.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // FIX: was .maybeSingle() — fails with error when client has 2 workouts today (cardio + lifting),
  // causing null return and "Rest Day" to show incorrectly. Now returns all workouts as array.
  const { data: todayWorkoutsRaw } = await supabase
    .from("scheduled_workouts")
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .order("id");
  const todayWorkouts = todayWorkoutsRaw || [];

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyStr = sixtyDaysAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyStr)
    .lte("scheduled_date", thirtyAheadStr)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const recent30 = (recentScheduled || []).filter((w: any) => w.scheduled_date >= thirtyStr);
  const totalScheduled = recent30.length;
  const completedCount = recent30.filter((w: any) => w.status === "completed").length;

  const sorted = [...(recentScheduled || [])].sort((a: any, b: any) =>
    b.scheduled_date.localeCompare(a.scheduled_date)
  );
  const seenDates = new Set<string>();
  for (const w of sorted as any[]) {
    if (w.status === "completed") seenDates.add(w.scheduled_date);
  }
  const completedDates = Array.from(seenDates).sort().reverse();
  let streakDays = 0;
  if (completedDates.length > 0) {
    const firstCompleted = completedDates[0];
    const daysDiff = Math.floor(
      (new Date(today).getTime() - new Date(firstCompleted).getTime()) / 86400000
    );
    if (daysDiff <= 1) {
      for (let i = 0; i < completedDates.length; i++) {
        if (i === 0) { streakDays++; continue; }
        const prev = new Date(completedDates[i - 1] + "T00:00:00");
        const curr = new Date(completedDates[i] + "T00:00:00");
        const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
        if (diff === 1) { streakDays++; } else { break; }
      }
    }
  }

  const todayDate = new Date();
  const todayDow = todayDate.getDay();
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() - todayDow);
  const weekStartStr = weekStart.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: w.id as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
    label: (w.days as any)?.label as string | undefined,
  }));

  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(30);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const { data: notifData } = await supabase
    .from("client_notifications")
    .select("id, type, title, body, amount_due, due_date")
    .eq("client_id", clientRecord.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  const notifications = (notifData || []) as any[];

  const firstName = (clientRecord.name || "").split(" ")[0];

  return (
    <>
      {/* PwaInstallBanner and SlackerGate both removed 21 Aug.
          - Two install prompts existed with two different dismiss keys and
            could show at once; InstallPrompt in (app)/layout.tsx is the one
            that stayed.
          - SlackerGate ("welcome back slacker") duplicated the lapse screen
            inside ClientTakeovers, at z-index 9999 — ABOVE it — so a lapsed
            client got both. Worse, it ignored checkin_nudges_off and
            checkin_snoozed_until, which the lapse screen honours: a client who
            had explicitly asked not to be nudged got a comedy wanted poster
            anyway. See ClientTakeovers for the one-takeover rule. */}
      <ClientDashboard
        firstName={firstName}
        todayWorkouts={todayWorkouts as any[]}
        metrics={metrics as any[]}
        completedCount={completedCount}
        totalScheduled={totalScheduled}
        recentWorkouts={(recentWorkouts || []) as any[]}
        streakDays={streakDays}
        weekWorkouts={weekWorkouts}
        allScheduled={allScheduled}
        notifications={notifications}
        isOwnTrainerView={isTrainer}
      />
    </>
  );
}
