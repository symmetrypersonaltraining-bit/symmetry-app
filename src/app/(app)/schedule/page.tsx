import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import ScheduleClient from "./ScheduleClient";
import { TRAINER_EMAIL } from "@/lib/trainer";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { centralFormatDate } from "@/lib/central-time";

function getCentralNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
  };
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const isTrainer = await viewerIsTrainer(supabase, user);

  // Trainer in trainer-mode: the Schedule tab must show the trainer schedule
  // (the appointments calendar on /home), NOT the personal client program.
  // Client-preview mode and real clients fall through to ScheduleClient.
  const cookieStore = await cookies();
  const isClientMode = cookieStore.get("symmetry_client_mode")?.value === "1";
  if (isTrainer && !isClientMode) redirect("/home");

  let clientId: string | null = null;
  if (isTrainer) {
    // By account id, not TRAINER_EMAIL — that constant is the OWNER and would
    // hand Stephanie Dustin's schedule. See the note in home/page.tsx.
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
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

  const { year, month: month1, day } = getCentralNow();
  const year_val = year;
  const month = month1 - 1;
  const today = day;
  const firstDay = new Date(year_val, month, 1).getDay();
  const daysInMonth = new Date(year_val, month + 1, 0).getDate();
  const monthName = centralFormatDate(`${year_val}-${String(month + 1).padStart(2, "0")}-01`, { month: "long", year: "numeric" });
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year_val}-${pad(month + 1)}-01`;
  const monthEnd = `${year_val}-${pad(month + 1)}-${pad(daysInMonth)}`;
  const todayStr = `${year_val}-${pad(month + 1)}-${pad(today)}`;
  const futureEnd = new Date(year_val, month, today + 60);
  const futureEndStr = `${futureEnd.getFullYear()}-${pad(futureEnd.getMonth() + 1)}-${pad(futureEnd.getDate())}`;

  let workoutDates: string[] = [];
  let upcomingDays: { id: string; label: string; date: string; dow: number }[] = [];
  let scheduledDows: number[] = [];
  let monthScheduledWorkouts: { id: string; date: string; status: string; label: string }[] = [];

  if (clientId) {
    const { data: monthWorkouts } = await supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, days(id, label)")
      .is("deleted_at", null)
      .eq("client_id", clientId)
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd);

    monthScheduledWorkouts = (monthWorkouts || []).map((w: any) => ({
      id: w.id as string,
      date: w.scheduled_date as string,
      status: w.status as string,
      label: ((w.days as any)?.label || "Workout") as string,
    }));

    workoutDates = (monthWorkouts || [])
      .filter((w: any) => w.status === "completed")
      .map((w: any) => w.scheduled_date);

    const { data: upcoming } = await supabase
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, days(id, label)")
      .is("deleted_at", null)
      .eq("client_id", clientId)
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", futureEndStr)
      .neq("status", "completed")
      .order("scheduled_date")
      .limit(60);

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
      year={year_val}
      month={month}
      daysInMonth={daysInMonth}
      firstDay={firstDay}
      today={today}
      workoutDates={workoutDates}
      scheduledDows={scheduledDows}
      upcomingDays={upcomingDays}
      isTrainer={isTrainer}
      paymentReminders={[]}
      clientId={clientId}
      monthScheduledWorkouts={monthScheduledWorkouts}
    />
  );
}
