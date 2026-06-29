import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import TrainerCalendar from "./TrainerCalendar";
import ClientDashboard from "./ClientDashboard";
import TrainerHome from "./TrainerHome";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import PendingRemindersPanel from "@/components/PendingRemindersPanel";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

async function isClientMode(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = (user?.email ?? "") === TRAINER_EMAIL;
  const isInClientMode = isTrainer ? await isClientMode() : false;

  // ── TRAINER VIEW ──────────────────────────────────────────────────────────
  if (isTrainer && !isInClientMode) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
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
      .select("id, client_id, status, day_id, days(id, label)")
      .eq("scheduled_date", todayStrCT);

    type ClientDay = { dayId: string; dayLabel: string; status: string };
    const clientDayMap: Record<string, ClientDay> = {};
    for (const w of todayWorkoutRows || []) {
      const row = w as any;
      if (row.client_id) {
        clientDayMap[row.client_id] = {
          dayId: row.days?.id || row.day_id,
          dayLabel: row.days?.label || "Training",
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
    type WE = { id: string; clientId: string; clientName: string; date: string; dayLabel: string; status: string };
    const workoutRangeEnd = new Date();
    workoutRangeEnd.setMonth(workoutRangeEnd.getMonth() + 3);
    const { data: workoutRows } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, scheduled_date, status, days(label), clients(id, name)")
      .gte("scheduled_date", new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
        .toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .lte("scheduled_date", workoutRangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .order("scheduled_date");

    const workoutMap: Record<string, WE[]> = {};
    for (const w of workoutRows || []) {
      const row = w as any;
      const dateKey = row.scheduled_date;
      if (!workoutMap[dateKey]) workoutMap[dateKey] = [];
      workoutMap[dateKey].push({
        id: row.id,
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
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, sms_sent_at, clients(id, name)")
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
      smsSentAt: r.sms_sent_at,
    }));

    const trainerDateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
    });

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
        <PendingRemindersPanel reminders={reminders} />
        <TrainerCalendar
          clients={clients || []}
          appointmentMap={appointmentMap}
          workoutMap={workoutMap}
          startDate=""
        />
      </div>
    );
  }

  // ── CLIENT VIEW ───────────────────────────────────────────────────────────
  // Trainer in client-preview mode (cookie set) or an actual client
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq(isTrainer ? "email" : "auth_user_id", isTrainer ? TRAINER_EMAIL : user.id)
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

  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyStr = sixtyDaysAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
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
      <PwaInstallBanner />
      <ClientDashboard
        firstName={firstName}
        todayWorkout={todayWorkout as any}
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
