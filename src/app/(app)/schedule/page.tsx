import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./ScheduleClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = (user?.email ?? "") === TRAINER_EMAIL;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = now.toISOString().split("T")[0];
  const monthStartStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEndStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const aheadDate = new Date();
  aheadDate.setDate(aheadDate.getDate() + 60);
  const aheadStr = aheadDate.toISOString().split("T")[0];

  let workoutDates: string[] = [];
  let upcomingDays: { id: string; label: string; date: string; dow: number }[] = [];
  let scheduledDows: number[] = [];
  let paymentReminders: { date: string; clientName: string; amount: number; status: string }[] = [];
  let workoutsByDate: Record<string, { id: string; label: string }[]> = {};

  if (isTrainer) {
    const { data: wRows } = await supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, days(label), clients(name)")
      .gte("scheduled_date", monthStartStr)
      .lte("scheduled_date", monthEndStr)
      .order("scheduled_date");
    workoutDates = [...new Set((wRows || []).filter((w: any) => w.status === "completed").map((w: any) => w.scheduled_date))];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, due_date, amount_due, notification_status, clients(name)")
      .gte("due_date", todayStr)
      .lte("due_date", thirtyDays.toISOString().split("T")[0])
      .order("due_date");
    paymentReminders = (remindersRaw || []).map((r: any) => ({
      date: r.due_date,
      clientName: r.clients?.name || "Client",
      amount: Number(r.amount_due),
      status: r.notification_status,
    }));
  } else {
    const { data: clientRecord } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!clientRecord) redirect("/home");

    const { data: monthRows } = await supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, days(label)")
      .eq("client_id", clientRecord.id)
      .gte("scheduled_date", monthStartStr)
      .lte("scheduled_date", monthEndStr)
      .order("scheduled_date");

    workoutDates = (monthRows || [])
      .filter((w: any) => w.status === "completed")
      .map((w: any) => w.scheduled_date);

    for (const w of monthRows || []) {
      const row = w as any;
      if (!workoutsByDate[row.scheduled_date]) workoutsByDate[row.scheduled_date] = [];
      workoutsByDate[row.scheduled_date].push({ id: row.id, label: row.days?.label || "Workout" });
    }

    const { data: upRows } = await supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, days(label)")
      .eq("client_id", clientRecord.id)
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", aheadStr)
      .order("scheduled_date")
      .limit(20);

    upcomingDays = (upRows || []).map((w: any) => ({
      id: w.id,
      label: w.days?.label || "Workout",
      date: w.scheduled_date,
      dow: new Date(w.scheduled_date + "T00:00:00").getDay(),
    }));
    scheduledDows = [...new Set(upcomingDays.map(d => d.dow))];
  }

  return (
    <ScheduleClient
      monthName={monthName}
      year={year}
      month={month}
      daysInMonth={daysInMonth}
      firstDay={firstDay}
      today={today}
      workoutDates={workoutDates}
      scheduledDows={scheduledDows}
      upcomingDays={upcomingDays}
      isTrainer={isTrainer}
      paymentReminders={paymentReminders}
      workoutsByDate={workoutsByDate}
    />
  );
}
