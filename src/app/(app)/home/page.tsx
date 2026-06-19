import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerCalendar from "./TrainerCalendar";
import ClientDashboard from "./ClientDashboard";
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
    const dow = today.getDay();
    const daysToMon = dow === 0 ? -6 : 1 - dow;
    const mondayDate = new Date(today);
    mondayDate.setDate(today.getDate() + daysToMon);
    const endDate = new Date(mondayDate);
    endDate.setDate(mondayDate.getDate() + 27);
    const startStr = mondayDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const { data: swRows } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, scheduled_date, status, day_id, days(label), clients(name)")
      .gte("scheduled_date", startStr)
      .lte("scheduled_date", endStr)
      .order("scheduled_date");

    type WE = { clientId: string; clientName: string; label: string; completed: boolean; id: string };
    const workoutMap: Record<string, WE[]> = {};
    for (const w of swRows || []) {
      const row = w as any;
      const dk: string = row.scheduled_date;
      if (!workoutMap[dk]) workoutMap[dk] = [];
      workoutMap[dk].push({
        clientId: row.client_id,
        clientName: row.clients?.name || "Unknown",
        label: row.days?.label || "Workout",
        completed: row.status === "completed",
        id: row.id,
      });
    }

    // Upcoming payment reminders (next 30 days, pending status)
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, sms_sent_at, clients(id, name)")
      .gte("due_date", today.toISOString().split("T")[0])
      .lte("due_date", thirtyDays.toISOString().split("T")[0])
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

    return (
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>Schedule</h1>
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <PendingRemindersPanel reminders={reminders} />
        <TrainerCalendar clients={clients || []} workoutMap={workoutMap} startDate={startStr} />
      </div>
    );
  }

  // --- CLIENT DASHBOARD ---
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
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status")
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

  // Streak
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
      let checkDate = new Date(firstCompleted);
      for (const d of completedDates) {
        const expected = new Date(checkDate);
        expected.setDate(checkDate.getDate() - streakDays);
        if (streakDays === 0) {
          streakDays++;
        } else if (d === expected.toISOString().split("T")[0]) {
          streakDays++;
        } else {
          break;
        }
      }
    }
  }

  // Week workouts
  const todayDow = new Date().getDay();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - todayDow);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0];
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(10);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const firstName = (clientRecord.name || "").split(" ")[0];

  return (
    <ClientDashboard
      firstName={firstName}
      todayWorkout={todayWorkout as any}
      metrics={metrics as any[]}
      completedCount={completedCount}
      totalScheduled={totalScheduled}
      recentWorkouts={(recentWorkouts || []) as any[]}
      streakDays={streakDays}
      weekWorkouts={weekWorkouts}
    />
  );
}
