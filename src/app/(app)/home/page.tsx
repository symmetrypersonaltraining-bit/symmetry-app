import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerCalendar from "./TrainerCalendar";
import ClientDashboard from "./ClientDashboard";
import { isClientMode } from "@/lib/client-mode";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import PendingRemindersPanel from "@/components/PendingRemindersPanel";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function HomePage() {
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

const isTrainer = (user?.email ?? "") === TRAINER_EMAIL;

const clientMode = await isClientMode();
if (isTrainer && !clientMode) {
const { data: clients } = await supabase
.from("clients")
.select("id, name")
.order("name");

const today = new Date();
const rangeStart = new Date(today);
rangeStart.setMonth(rangeStart.getMonth() - 3);
const rangeEnd = new Date(today);
rangeEnd.setMonth(rangeEnd.getMonth() + 3);
const startStr = rangeStart.toISOString().split("T")[0];
const endStr = rangeEnd.toISOString().split("T")[0];

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
appointmentMap[dateKey].push({ id: row.id, clientId: row.clients?.id || row.client_id, clientName: row.clients?.name || "Unknown", title: row.title || "Training Session", startTime, endTime, status: row.status || "scheduled", scheduledAt: row.scheduled_at, endsAt: row.ends_at || null });
}

type WE = { id: string; clientId: string; clientName: string; date: string; dayLabel: string; status: string };
const workoutMapRange = new Date(today);
workoutMapRange.setMonth(workoutMapRange.getMonth() + 3);
const { data: workoutRows } = await (supabase as any)
.from("scheduled_workouts")
.select("id, client_id, scheduled_date, status, days(label), clients(id, name)")
.gte("scheduled_date", new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split("T")[0])
.lte("scheduled_date", workoutMapRange.toISOString().split("T")[0])
.order("scheduled_date");

const workoutMap: Record<string, WE[]> = {};
for (const w of workoutRows || []) {
const row = w as any;
const dateKey = row.scheduled_date;
if (!workoutMap[dateKey]) workoutMap[dateKey] = [];
workoutMap[dateKey].push({ id: row.id, clientId: row.clients?.id || row.client_id, clientName: row.clients?.name || "Unknown", date: dateKey, dayLabel: row.days?.label || "Workout", status: row.status || "scheduled" });
}

const thirtyDays = new Date();
thirtyDays.setDate(thirtyDays.getDate() + 30);
const { data: remindersRaw } = await supabase
.from("payment_reminders")
.select("id, client_id, due_date, amount_due, billing_credits, notification_status, email_sent_at, clients(id, name)")
.gte("due_date", today.toISOString().split("T")[0])
.lte("due_date", thirtyDays.toISOString().split("T")[0])
.in("notification_status", ["pending", "paused"])
.order("due_date");

const reminders = (remindersRaw || []).map((r: any) => ({ id: r.id, clientName: r.clients?.name || "Unknown", clientId: r.clients?.id || r.client_id, dueDate: r.due_date, amountDue: Number(r.amount_due), billingCredits: Number(r.billing_credits), notificationStatus: r.notification_status, emailSentAt: r.email_sent_at }));

return (
<div className="p-4 lg:p-6">
<div className="mb-6">
<h1 className="text-2xl font-bold gradient-text">Schedule</h1>
<p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
</div>
<PendingRemindersPanel reminders={reminders} />
<TrainerCalendar clients={clients || []} appointmentMap={appointmentMap} workoutMap={workoutMap} startDate="" />
</div>
);
}

// -- CLIENT DASHBOARD ------------------------------------------------------------------
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

// Cast as any to bypass generated-type constraint on day_id column
// Fetch ALL workouts scheduled for today (clients can have strength + cardio same day)
const { data: todayWorkoutsRaw } = await (supabase as any)
.from("scheduled_workouts")
.select("id, day_id, status, days(id, label, phase_id, phases(label, programs(name)))")
.eq("client_id", clientRecord.id)
.eq("scheduled_date", today)
.order("position");
// Sort: strength workouts first, cardio/conditioning second
const isCardioLabel = (label: string) => /cardio|treadmill|stair|walk|run/i.test(label);
const todayWorkouts = [...(todayWorkoutsRaw || [])].sort((a: any, b: any) => {
const aCardio = isCardioLabel(a.days?.label || "");
const bCardio = isCardioLabel(b.days?.label || "");
if (aCardio === bCardio) return 0;
return aCardio ? 1 : -1;
});

const sixtyDaysAgo = new Date();
sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
const { data: recentScheduled } = await (supabase as any)
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

const sorted = [...(recentScheduled || [])].sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));
const seenDates = new Set<string>();
for (const w of sorted as any[]) { if (w.status === "completed") seenDates.add(w.scheduled_date); }
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
if (Math.round((prev.getTime() - curr.getTime()) / 86400000) === 1) { streakDays++; } else { break; }
}
}
}

const todayDow = new Date().getDay();
const weekStart = new Date();
weekStart.setDate(weekStart.getDate() - todayDow);
const weekStartStr = weekStart.toISOString().split("T")[0];
const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0];
const weekWorkouts = (recentScheduled || []).filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr).map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

const allScheduled = (recentScheduled || []).map((w: any) => ({
id: (w.day_id || w.id) as string,
date: w.scheduled_date as string,
completed: w.status === "completed",
}));

const { data: metricsHistory } = await supabase
.from("metrics")
.select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
.eq("client_id", clientRecord.id)
.order("metric_date", { ascending: false })
.limit(30);
const metrics = (metricsHistory || []).reverse();

const { data: recentWorkouts } = await (supabase as any)
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
todayWorkouts={todayWorkouts as any[]}
metrics={metrics as any[]}
completedCount={completedCount}
totalScheduled={totalScheduled}
recentWorkouts={(recentWorkouts || []) as any[]}
streakDays={streakDays}
weekWorkouts={weekWorkouts}
allScheduled={allScheduled}
clientId={clientRecord.id}
/>
</>
);
  }
