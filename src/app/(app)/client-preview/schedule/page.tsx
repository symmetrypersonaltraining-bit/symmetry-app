import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "../../schedule/ScheduleClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewSchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/schedule");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    .eq("email", TRAINER_EMAIL)
    .maybeSingle();

  if (!clientRecord) redirect("/client-preview");

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
  futureEnd.setDate(futureEnd.getDate() + 60);
  const futureEndStr = futureEnd.toISOString().split("T")[0];

  const { data: monthWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", monthStart)
    .lte("scheduled_date", monthEnd);

  const workoutDates = (monthWorkouts || [])
    .filter((w: any) => w.status === "completed")
    .map((w: any) => w.scheduled_date);

  const monthScheduledWorkouts = (monthWorkouts || []).map((w: any) => ({
    id: w.id as string,
    date: w.scheduled_date as string,
    status: w.status as string,
    label: "Workout",
  }));

  const { data: upcoming } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status, days(id, label)")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", futureEndStr)
    .neq("status", "completed")
    .order("scheduled_date")
    .limit(60);

  const upcomingDays = (upcoming || []).map((w: any) => ({
    id: (w.day_id || (w.days as any)?.id || w.id) as string,
    label: ((w.days as any)?.label || "Workout") as string,
    date: w.scheduled_date as string,
    dow: new Date(w.scheduled_date + "T00:00:00").getDay(),
  }));

  const dowSet = new Set<number>();
  for (const w of upcoming || []) {
    dowSet.add(new Date((w as any).scheduled_date + "T00:00:00").getDay());
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
      scheduledDows={Array.from(dowSet)}
      upcomingDays={upcomingDays}
      isTrainer={false}
      paymentReminders={[]}
      monthScheduledWorkouts={monthScheduledWorkouts}
      defaultView="week"
    />
  );
}
