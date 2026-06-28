import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ScheduleClient from "./ScheduleClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;

  const { year, month, day } = getCentralNow();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  let clientId: string | null = null;
  if (!isTrainer) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    clientId = clientRow?.id ?? null;
    if (!clientId) redirect("/home");
  }

  let apptQ = supabase
    .from("appointments")
    .select("id, client_id, scheduled_at, title, clients(name)")
    .gte("scheduled_at", `${monthStart}T00:00:00`)
    .lte("scheduled_at", `${monthEnd}T23:59:59`)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true });

  if (!isTrainer && clientId) {
    apptQ = apptQ.eq("client_id", clientId);
  }

  const { data: appts } = await apptQ;

  const workoutDates: string[] = [];
  const seenDates = new Set<string>();
  const dowCounts: Record<number, number> = {};
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  for (const appt of appts ?? []) {
    const d = new Date(appt.scheduled_at as string);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
    if (!seenDates.has(dateStr)) { seenDates.add(dateStr); workoutDates.push(dateStr); }
    const dowStr = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(d);
    const dow = dowMap[dowStr] ?? 0;
    dowCounts[dow] = (dowCounts[dow] ?? 0) + 1;
  }

  const scheduledDows = Object.entries(dowCounts)
    .filter(([, count]) => (count as number) >= 2)
    .map(([dow]) => parseInt(dow));

  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 42 * 86400000).toISOString();

  let upcomingQ = supabase
    .from("appointments")
    .select("id, client_id, scheduled_at, ends_at, title, gcal_event_id, gcal_recurring_id, clients(name)")
    .gte("scheduled_at", nowIso)
    .lte("scheduled_at", futureIso)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (!isTrainer && clientId) { upcomingQ = upcomingQ.eq("client_id", clientId); }

  const { data: upcomingAppts } = await upcomingQ;

  const upcomingDays = (upcomingAppts ?? []).map((appt) => {
    const d = new Date(appt.scheduled_at as string);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
    const timeStr = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);
    const dowStr = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(d);
    const dow = dowMap[dowStr] ?? 0;
    const clientName = (appt.clients as { name?: string } | null)?.name ?? "Client";
    const label = isTrainer ? `${clientName} — ${timeStr}` : ((appt.title as string | null) ?? timeStr);

    // Extract HH:mm in 24h for time grid positioning
    const startTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d).replace(/^24:/, "00:");

    let endTime: string | undefined;
    if (appt.ends_at) {
      const endD = new Date(appt.ends_at as string);
      endTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(endD).replace(/^24:/, "00:");
    }

    return {
      id: appt.id as string,
      label,
      date: dateStr,
      dow,
      startTime,
      endTime,
      gcalEventId: (appt.gcal_event_id as string | null) ?? undefined,
      gcalRecurringId: (appt.gcal_recurring_id as string | null) ?? undefined,
    };
  });

  let paymentReminders: { date: string; clientName: string; amount: number; status: string }[] = [];
  if (isTrainer) {
    const { data: reminders } = await supabase
      .from("payment_reminders")
      .select("id, due_date, amount_due, notification_status, clients(name)")
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .order("due_date", { ascending: true });

    paymentReminders = (reminders ?? []).map((r) => ({
      date: r.due_date as string,
      clientName: (r.clients as { name?: string } | null)?.name ?? "Client",
      amount: parseFloat(String(r.amount_due)),
      status: (r.notification_status as string | null) ?? "pending",
    }));
  }

  return (
    <ScheduleClient
      monthName={monthName}
      year={year}
      month={month}
      daysInMonth={daysInMonth}
      firstDay={firstDay}
      today={day}
      workoutDates={workoutDates}
      scheduledDows={scheduledDows}
      upcomingDays={upcomingDays}
      isTrainer={isTrainer}
      paymentReminders={paymentReminders}
    />
  );
}
