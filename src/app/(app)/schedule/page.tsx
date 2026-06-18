import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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

  // Get recent workout logs to show on calendar
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
      .select("log_date, completed")
      .eq("client_id", clientId)
      .gte("log_date", monthStart)
      .lte("log_date", monthEnd);
    workoutDates = (logs || []).map((l) => l.log_date);
  }

  // Get scheduled days from program
  let scheduledDows: number[] = []; // days of week with workouts
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
      scheduledDows = [...new Set(allDays.map((d: any) => d.day_of_week).filter((d: any) => d !== null))] as number[];

      // Build upcoming week
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

  const dowNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <>
      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Schedule</h1>
        <p className="text-white/60 text-sm">{monthName}</p>
      </div>

      <div className="px-4 py-4">
        {/* Calendar */}
        <div className="card">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {dowNames.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium py-1"
                style={{ color: "#4E6080" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = day === today.getDate();
              const hasLog = workoutDates.includes(dateStr);
              const dow = new Date(year, month, day).getDay();
              const isScheduled = scheduledDows.includes(dow);

              return (
                <div key={day} className="relative flex flex-col items-center py-1">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm rounded-full"
                    style={
                      isToday
                        ? { background: "#0F4C81", color: "white", fontWeight: 500 }
                        : isScheduled
                        ? { color: "#0F4C81", fontWeight: 500 }
                        : { color: "#0D1B2E" }
                    }
                  >
                    {day}
                  </div>
                  {(hasLog || isScheduled) && (
                    <div
                      className="w-1 h-1 rounded-full mt-0.5"
                      style={{ background: hasLog ? "#059669" : isToday ? "white" : "#0EA5E9" }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: "0.5px solid #EDF2F7" }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: "#059669" }} />
              <span className="text-xs" style={{ color: "#4E6080" }}>Logged</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: "#0EA5E9" }} />
              <span className="text-xs" style={{ color: "#4E6080" }}>Scheduled</span>
            </div>
          </div>
        </div>

        {/* Upcoming workouts */}
        {upcomingDays.length > 0 && (
          <>
            <p className="label mt-4">upcoming</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {upcomingDays.map((wd, i) => (
                <Link
                  key={wd.id + i}
                  href={`/workout/${wd.id}`}
                  className="flex items-center gap-3 py-3 border-b last:border-b-0 -mx-4 px-4"
                  style={{ borderColor: "#EDF2F7" }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "#DDEEFF" }}
                  >
                    <i className="ti ti-calendar text-lg" style={{ color: "#0F4C81" }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{wd.label}</div>
                    <div className="text-xs" style={{ color: "#4E6080" }}>{wd.date}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: "#C8D8EC" }} />
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Trainer: client sessions view */}
        {isTrainer && (
          <>
            <p className="label mt-4">all clients</p>
            <div className="card text-sm" style={{ color: "#4E6080", padding: "1rem" }}>
              <i className="ti ti-brand-google text-lg mr-2" style={{ color: "#0F4C81" }} />
              Google Calendar sync coming soon — you&apos;ll be able to schedule
              sessions here and have them push directly to your Google Calendar.
            </div>
          </>
        )}
      </div>
    </>
  );
}
