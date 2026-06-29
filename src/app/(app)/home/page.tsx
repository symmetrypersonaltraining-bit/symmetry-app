import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import TrainerCalendar from "./TrainerCalendar";
import ClientDashboard from "./ClientDashboard";
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
  const isOwnTrainerView = isTrainer && isInClientMode;

  if (isTrainer && !isInClientMode) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");

    const today = new Date();
    const rangeStart = new Date(today);
    rangeStart.setMonth(rangeStart.getMonth() - 3);
    const rangeEnd = new Date(today);
    rangeEnd.setMonth(rangeEnd.getMonth() + 3);
    const startStr = rangeStart.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const endStr = rangeEnd.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

    const { data: apptRows } = await supabase
      .from("appointments")
      .select("id, client_id, scheduled_at, ends_at, status, title, clients(id, name)")
      .gte("scheduled_at", startStr + "T00:00:00")
      .lte("scheduled_at", endStr + "T23:59:59")
      .order("scheduled_at");

    type AE = { id: string; clientId: string; clientName: string; title: string; startTime: string; endTime: string; status: string; scheduledAt: string; endsAt: string | null };
    const appointmentMap: Record<string, AE[]> = {};
    for (const a of apptRows || []) {
      const row = a as any;
      const dateKey = row.scheduled_at.substring(0, 10);
      const startTime = row.scheduled_at.length > 10 ? row.scheduled_at.substring(11, 16) : "00:00";
      const endTime = row.ends_at ? row.ends_at.substring(11, 16) : "01:00";
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

    type WE = { id: string; clientId: string; clientName: string; date: string; dayLabel: string; status: string };
    const workoutMapRange = new Date(today);
    workoutMapRange.setMonth(workoutMapRange.getMonth() + 3);
    const { data: workoutRows } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, scheduled_date, status, days(label), clients(id, name)")
      .gte("scheduled_date", new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split("T")[0])
      .lte("scheduled_date", workoutMapRange.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
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

    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, sms_sent_at, clients(id, name)")
      .gte("due_date", today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
      .lte("due_date", thirtyDays.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
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
          <h1 className="text-2xl font-bold gradient-text">Schedule</h1>
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {/* Today's Sessions */}
        {(() => {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
          const todaySessions = workoutMap[todayStr] || [];
          const todayAppts = appointmentMap[todayStr] || [];
          if (todaySessions.length === 0 && todayAppts.length === 0) return null;
          return (
            <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--brand-border)", background: "var(--brand-primary)10" }}>
                <i className="ti ti-calendar-event text-base" style={{ color: "var(--brand-primary)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Today's Sessions</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{ background: "var(--brand-primary)20", color: "var(--brand-primary)" }}>
                  {todaySessions.length + todayAppts.length} scheduled
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--brand-border)" }}>
                {todaySessions.map((s: any) => (
                  <a key={s.id} href={`/workout/${s.id}?forClient=${s.clientId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:opacity-80 transition-opacity">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: s.status === "completed" ? "#22c55e20" : "var(--brand-primary)20" }}>
                      <i className={`ti ${s.status === "completed" ? "ti-check" : "ti-barbell"} text-sm`}
                        style={{ color: s.status === "completed" ? "#22c55e" : "var(--brand-primary)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{s.clientName}</p>
                      <p className="text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>{s.dayLabel}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0"
                      style={{
                        background: s.status === "completed" ? "#22c55e20" : "var(--brand-primary)20",
                        color: s.status === "completed" ? "#22c55e" : "var(--brand-primary)"
                      }}>
                      {s.status === "completed" ? "Done" : "Start"}
                    </span>
                  </a>
                ))}
                {todayAppts.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#f59e0b20" }}>
                      <i className="ti ti-clock text-sm" style={{ color: "#f59e0b" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{a.clientName}</p>
                      <p className="text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>{a.startTime} – {a.endTime} · {a.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
                <PendingRemindersPanel reminders={reminders} />
        <TrainerCalendar clients={clients || []} appointmentMap={appointmentMap} workoutMap={workoutMap} startDate="" />
      </div>
    );
  }

  // ── CLIENT DASHBOARD (client users + trainer in client-mode) ─────────────
  let clientRecord: { id: string; name: string } | null = null;

  if (isOwnTrainerView) {
    // Trainer viewing their own client app — look up by email
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("email", user.email!)
      .maybeSingle();
    clientRecord = data;
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientRecord = data;
  }

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>Your account is being set up. Check back soon.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  // 60 days of history for week nav + streak
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
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
  const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0];
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  // Full history for week ring navigation (includes workout id + label for dot coloring)
  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: w.id as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
    label: (w.days as any)?.label as string | undefined,
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
    .select("id, scheduled_date, status, days(label)")
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
        isOwnTrainerView={isOwnTrainerView}
      />
    </>
  );
}
