import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import ScheduleClient from "../../schedule/ScheduleClient";
import { TRAINER_EMAIL, isTrainerEmail } from "@/lib/trainer";

export default async function ClientPreviewSchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!isTrainerEmail(user.email)) redirect("/schedule");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    // The PREVIEWING trainer's own client row, by account id. TRAINER_EMAIL is
    // the owner, so this handed Stephanie Dustin's data in her own client
    // preview. See home/page.tsx.
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) redirect("/client-preview");

  const now = new Date();
  // Central, not UTC: server runs UTC, so after 7pm Central the UTC date is already tomorrow.
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const [year, month1, today] = todayStr.split("-").map(Number);
  const month = month1 - 1;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" });
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const futureEnd = new Date(Date.UTC(year, month, today));
  futureEnd.setUTCDate(futureEnd.getUTCDate() + 60);
  const futureEndStr = futureEnd.toISOString().slice(0, 10);

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
    />
  );
}
