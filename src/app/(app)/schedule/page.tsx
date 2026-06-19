import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./ScheduleClient";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  let workoutDates: string[] = [];
  let clientId: string | null = null;

  if (!isTrainer) {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = client?.id || null;
  } else {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", "%Dustin%")
      .maybeSingle();
    clientId = client?.id || null;
  }

  if (clientId) {
    const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`;
    const { data: logs } = await supabase
      .from("workout_logs")
      .select("log_date")
      .eq("client_id", clientId)
      .gte("log_date", monthStart)
      .lte("log_date", monthEnd);
    workoutDates = (logs || []).map((l) => l.log_date);
  }

  let scheduledDows: number[] = [];
  let upcomingDays: { id: string; label: string; date: string; dow: number }[] = [];

  if (clientId) {
    const { data: assignment } = await supabase
      .from("program_assignments")
      .select("program_id, programs(phases(days(id, label, day_of_week)))")
      .eq("client_id", clientId)
      .eq("active", true)
      .maybeSingle();

    if (assignment) {
      const prog = (assignment as any).programs;
      const allDays = (prog?.phases || []).flatMap((ph: any) => ph.days || []);
      scheduledDows = [...new Set(allDays.map((d: any) => d.day_of_week).filter((d: any) => d !== null))];

      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dow = d.getDay();
        const dayMatch = allDays.find((day: any) => day.day_of_week === dow);
        if (dayMatch) {
          upcomingDays.push({
            id: dayMatch.id,
            label: dayMatch.label,
            date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
            dow,
          });
        }
      }
    }
  }

  let paymentReminders: { date: string; clientName: string; amount: number; status: string }[] = [];

  if (isTrainer) {
    const from = today.toISOString().split("T")[0];
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 60);
    const to = toDate.toISOString().split("T")[0];

    const { data: reminders } = await supabase
      .from("payment_reminders")
      .select("due_date, amount_due, notification_status, clients(name)")
      .gte("due_date", from)
      .lte("due_date", to)
      .in("notification_status", ["pending", "awaiting_approval", "approved"])
      .order("due_date");

    paymentReminders = (reminders || []).map((r: any) => ({
      date: r.due_date,
      clientName: r.clients?.name || "Unknown",
      amount: Number(r.amount_due),
      status: r.notification_status,
    }));
  }

  return (
    <ScheduleClient
      monthName={monthName}
      year={year}
      month={month}
      daysInMonth={daysInMonth}
      firstDay={firstDay}
      today={today.getDate()}
      workoutDates={workoutDates}
      scheduledDows={scheduledDows}
      upcomingDays={upcomingDays}
      isTrainer={isTrainer}
      paymentReminders={paymentReminders}
    />
  );
}
