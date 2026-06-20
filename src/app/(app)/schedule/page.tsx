import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./ScheduleClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;

  let clientId: string | null = null;
  if (isTrainer) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("email", TRAINER_EMAIL)
      .maybeSingle();
    clientId = data?.id || null;
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const todayStr = now.toISOString().split("T")[0];
  const futureEnd = new Date(now);
  futureEnd.setDate(futureEnd.getDate() + 30);
  const futureEndStr = futureEnd.toISOString().split("T")[0];

  let workoutDates: string[] = [];
  let upcomingDays: { id: string; label: string; date: string; dow: number }[] = [];
  let scheduledDows: number[] = [];

  if (clientId) {
    const { data: monthWorkouts } = await supabase
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status")
      .eq("client_id", clientId)
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd);

    workoutDates = (monthWorkouts || [])
      .filter((w: any) => w.status === "completed")
      .map((w: any) => w.scheduled_date);

    const { data: upcoming } = await supabase
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, days(id, label)")
      .eq("client_id", clientId)
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", futureEndStr)
      .neq("status", "completed")
      .order("scheduled_date")
      .limit(10);

    upcomingDays = (upcoming || []).map((w: any) => ({
      id: (w.day_id || (w.days as any)?.id || w.id) as string,
      label: ((w.days as any)?.label || "Workout") as string,
      date: w.scheduled_date as string,
      dow: new Date(w.scheduled_date + "T00:00:00").getDay(),
    }));

    const dowSet = new Set<number>();
    for (const w of upcoming || []) {
      dowSet.add(new Date((w as any).scheduled_date + "T00:00:00").getDay());
    }
    scheduledDows = Array.from(dowSet);
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
      paymentReminders={[]}
    />
  );
}
