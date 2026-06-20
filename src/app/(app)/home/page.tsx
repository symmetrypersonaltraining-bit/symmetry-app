import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerCalendar from "./TrainerCalendar";
import ClientDashboard from "./ClientDashboard";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import PendingRemindersPanel from "@/components/PendingRemindersPanel";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = (user?.email ?? "") === TRAINER_EMAIL;

  if (isTrainer) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");

    const today = new Date();
    const rangeStart = new Date(today);
    rangeStart.setMonth(rangeStart.getMonth() - 1);
    const rangeEnd = new Date(today);
    rangeEnd.setMonth(rangeEnd.getMonth() + 18);
    const startStr = rangeStart.toISOString().split("T")[0];
    const endStr = rangeEnd.toISOString().split("T")[0];

    const { data: apptRows } = await supabase
      .from("appointments")
      .select("id, client_id, scheduled_at, ends_at, status, title, assessment_name, clients(id, name)")
      .gte("scheduled_at", startStr + "T00:00:00")
      .lte("scheduled_at", endStr + "T23:59:59")
      .order("scheduled_at");

    type AE = { id: string; clientId: string; clientName: string; title: string; assessmentName?: string; startTime: string; endTime: string; status: string; scheduledAt: string; endsAt: string | null };
    // Build flat list — TrainerCalendar will key by LOCAL date client-side to avoid UTC offset mismatch
    const allAppointments: AE[] = (apptRows || []).map((a: any) => {
      const row = a as any;
      const startTime = row.scheduled_at.length > 10 ? row.scheduled_at.substring(11, 16) : "00:00";
      const endTime = row.ends_at ? row.ends_at.substring(11, 16) : "01:00";
      return {
        id: row.id,
        clientId: row.clients?.id || row.client_id || null,
        clientName: row.clients?.name || null,
        title: row.title || row.clients?.name || row.assessment_name || "Training Session",
        assessmentName: row.assessment_name || null,
        startTime,
        endTime,
        status: row.status || "scheduled",
        scheduledAt: row.scheduled_at,
        endsAt: row.ends_at || null,
      };
    });
    // Keep appointmentMap as empty record — TrainerCalendar builds it client-side from allAppointments
    const appointmentMap: Record<string, AE[]> = {};

    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, email_sent_at, clients(id, name)")
      .gte("due_date", today.toISOString().split("T")[0])
      .lte("due_date", thirtyDays.toISOString().split("T")[0])
      .in("notification_status", ["pending", "paused", "sent"])
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

    return (
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold gradient-text">Schedule</h1>
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <PendingRemindersPanel reminders={reminders} />
        <TrainerCalendar clients={clients || []} appointmentMap={appointmentMap} allAppointments={allAppointments} workoutMap={{}} startDate="" />
      </div>
    );
  }

  // ââ CLIENT DASHBOARD ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>Your account is being set up. Check back soon.</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, status, days(id, label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  // 60 days of history for week nav + streak
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status")
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyDaysAgo.toISOString().split("T")[0])
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toISOString().split("T")[0];
  const recent30 = (recentScheduled || []).filter((w: any) => w.scheduled_date >= thirtyStr);
  const totalScheduled = recent30.length;
  const completedCount = recent30.filter((w: any) => w.status === "completed").length;

  // Streak calc
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
    const daysDiff = Math.floor((new Date(today).getTime() - new Date(firstCompleted).getTime()) / 86400000);
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

  // Current week for initial render
  const todayDow = new Date().getDay();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - todayDow);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0];
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  // Full history for week ring navigation (includes workout id for linking)
  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: (w.day_id || w.id) as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
  }));

  // Up to 30 metric data points for expanded chart modal
  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(30);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status, days(id, label)")
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

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
      />
    </>
  );
}
