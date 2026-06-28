"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface UpcomingDay {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
  dow: number;
}

interface PaymentReminder {
  date: string;
  clientName: string;
  amount: number;
  status: string;
}

interface Props {
  monthName: string;
  year: number;
  month: number;
  daysInMonth: number;
  firstDay: number;
  today: number;
  workoutDates: string[];
  scheduledDows: number[];
  upcomingDays: UpcomingDay[];
  isTrainer: boolean;
  paymentReminders: PaymentReminder[];
  workoutsByDate?: Record<string, { id: string; label: string }[]>;
}

const GRAPE = "#7C3AED";
const GRAPE_LIGHT = "#EDE9FE";
const SHORT_DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function buildWeekDays(todayStr: string) {
  const [y, m, day] = todayStr.split("-").map(Number);
  const base = new Date(y, m - 1, day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { dateStr, dayNum: d.getDate(), dow: d.getDay(), isToday: i === 0 };
  });
}

export default function ScheduleClient({
  monthName,
  year,
  month,
  daysInMonth,
  firstDay,
  today,
  workoutDates,
  scheduledDows,
  upcomingDays,
  isTrainer,
  paymentReminders,
  workoutsByDate = {},
}: Props) {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showPayments, setShowPayments] = useState(true);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [pickerWorkouts, setPickerWorkouts] = useState<{ id: string; label: string }[]>([]);

  const dowNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(today).padStart(2, "0")}`;

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, UpcomingDay[]> = {};
    for (const ud of upcomingDays) {
      if (!map[ud.date]) map[ud.date] = [];
      map[ud.date].push(ud);
    }
    return map;
  }, [upcomingDays]);

  const paymentDateMap: Record<string, PaymentReminder[]> = {};
  for (const pr of paymentReminders) {
    if (!paymentDateMap[pr.date]) paymentDateMap[pr.date] = [];
    paymentDateMap[pr.date].push(pr);
  }

  const upcomingPayments = paymentReminders
    .filter((pr) => {
      const d = new Date(pr.date + "T00:00:00");
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 30 && pr.status === "pending";
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekDays = useMemo(() => buildWeekDays(todayStr), [todayStr]);

  function toggleDay(dateStr: string) {
    setExpandedDay((prev) => (prev === dateStr ? null : dateStr));
  }

  function handleWeekDayClick(dateStr: string) {
    toggleDay(dateStr);
  }

  function handleAppointmentClick(appt: UpcomingDay) {
    if (!isTrainer) {
      router.push(`/workout/${appt.id}`);
    }
  }

  function handleMonthDayClick(dateStr: string) {
    if (!isTrainer) {
      const workouts = workoutsByDate[dateStr] || [];
      const appts = appointmentsByDate[dateStr] || [];
      if (workouts.length === 0 && appts.length === 0) {
        toggleDay(dateStr);
        return;
      }
      if (workouts.length === 1 && appts.length === 0) {
        router.push(`/workout/${workouts[0].id}`);
        return;
      }
      if (workouts.length > 1) {
        setPickerDate(dateStr);
        setPickerWorkouts(workouts);
        return;
      }
      toggleDay(dateStr);
    } else {
      toggleDay(dateStr);
    }
  }

  // ── Week View ────────────────────────────────────────────────────────────────
  function WeekView() {
    return (
      <div className="px-4 space-y-2 pb-4">
        {weekDays.map(({ dateStr, dayNum, dow, isToday }) => {
          const appts = appointmentsByDate[dateStr] || [];
          const isExpanded = expandedDay === dateStr;
          const hasAppts = appts.length > 0;

          return (
            <div
              key={dateStr}
              className="rounded-2xl overflow-hidden"
              style={{
                border: isToday ? "1.5px solid #0F4C81" : "1px solid #EDF2F7",
                background: isToday ? "#0F4C81" : "var(--brand-bg, #fff)",
                boxShadow: isToday
                  ? "0 2px 12px rgba(15,76,129,0.18)"
                  : "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => handleWeekDayClick(dateStr)}
                style={{ background: "transparent" }}
              >
                <div className="flex-shrink-0 w-14">
                  <div
                    className="text-xs font-bold tracking-widest"
                    style={{ color: isToday ? "rgba(255,255,255,0.7)" : "#4E6080" }}
                  >
                    {SHORT_DAY[dow]}
                  </div>
                  <div
                    className="text-2xl font-bold leading-tight"
                    style={{ color: isToday ? "#fff" : "#0D1B2E" }}
                  >
                    {dayNum}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {hasAppts ? (
                    <div className="space-y-0.5">
                      {appts.slice(0, isExpanded ? appts.length : 2).map((appt) => (
                        <div
                          key={appt.id}
                          className="text-sm truncate"
                          style={{ color: isToday ? "rgba(255,255,255,0.9)" : "#0D1B2E" }}
                        >
                          <span
                            className="font-medium"
                            style={{ color: isToday ? "rgba(255,255,255,0.55)" : "#0EA5E9" }}
                          >
                            ●
                          </span>{" "}
                          {appt.label}
                        </div>
                      ))}
                      {!isExpanded && appts.length > 2 && (
                        <div
                          className="text-xs"
                          style={{ color: isToday ? "rgba(255,255,255,0.5)" : "#4E6080" }}
                        >
                          +{appts.length - 2} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="text-sm"
                      style={{ color: isToday ? "rgba(255,255,255,0.45)" : "#C8D8EC" }}
                    >
                      {isToday ? "No sessions today" : "Rest day"}
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <i
                    className={`ti ti-chevron-${isExpanded ? "up" : "down"} text-sm`}
                    style={{ color: isToday ? "rgba(255,255,255,0.4)" : "#C8D8EC" }}
                  />
                </div>
              </button>

              {isExpanded && (
                <div
                  style={{
                    borderTop: isToday
                      ? "1px solid rgba(255,255,255,0.15)"
                      : "1px solid #EDF2F7",
                  }}
                >
                  {hasAppts ? (
                    appts.map((appt, idx) => (
                      <div
                        key={appt.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{
                          borderBottom:
                            idx < appts.length - 1
                              ? isToday
                                ? "1px solid rgba(255,255,255,0.1)"
                                : "1px solid #EDF2F7"
                              : "none",
                          cursor: !isTrainer ? "pointer" : "default",
                        }}
                        onClick={() => handleAppointmentClick(appt)}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isToday ? "rgba(255,255,255,0.15)" : "#DDEEFF",
                          }}
                        >
                          <i
                            className="ti ti-barbell text-base"
                            style={{ color: isToday ? "#fff" : "#0F4C81" }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: isToday ? "#fff" : "#0D1B2E" }}
                          >
                            {appt.label}
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: isToday ? "rgba(255,255,255,0.55)" : "#4E6080" }}
                          >
                            {new Date(appt.date + "T00:00:00").toLocaleDateString("en-US", {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </div>
                        {!isTrainer && (
                          <i
                            className="ti ti-chevron-right text-sm"
                            style={{ color: isToday ? "rgba(255,255,255,0.4)" : "#C8D8EC" }}
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <div
                      className="px-4 py-4 text-sm text-center"
                      style={{ color: isToday ? "rgba(255,255,255,0.5)" : "#C8D8EC" }}
                    >
                      No sessions scheduled
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Month View ───────────────────────────────────────────────────────────────
  function MonthView() {
    return (
      <div className="px-4 pb-4">
        <div className="card">
          {isTrainer && (
            <div
              className="flex items-center justify-between mb-3 pb-3"
              style={{ borderBottom: "0.5px solid #EDF2F7" }}
            >
              <span className="text-xs font-medium" style={{ color: "#4E6080" }}>
                Payment reminders
              </span>
              <button
                onClick={() => setShowPayments((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={
                  showPayments
                    ? { background: GRAPE_LIGHT, color: GRAPE, border: `1px solid ${GRAPE}` }
                    : { background: "#F0F4F8", color: "#4E6080", border: "1px solid #C8D8EC" }
                }
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: showPayments ? GRAPE : "#C8D8EC" }}
                />
                {showPayments ? "Showing" : "Hidden"}
              </button>
            </div>
          )}

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

          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = day === today;
              const hasLog = workoutDates.includes(dateStr);
              const dow = new Date(year, month - 1, day).getDay();
              const isScheduled = scheduledDows.includes(dow);
              const hasPayment = showPayments && !!paymentDateMap[dateStr]?.length;
              const dayWorkouts = workoutsByDate[dateStr] || [];
              const dayAppts = appointmentsByDate[dateStr] || [];
              const hasWorkout = !isTrainer && (dayWorkouts.length > 0 || dayAppts.length > 0);
              const isClickable = hasWorkout || isTrainer;
              const isExpanded = expandedDay === dateStr;

              return (
                <div
                  key={day}
                  className="relative flex flex-col items-center py-1"
                  onClick={isClickable ? () => handleMonthDayClick(dateStr) : undefined}
                  style={isClickable ? { cursor: "pointer" } : undefined}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm rounded-full transition-all"
                    style={
                      isToday
                        ? { background: "#0F4C81", color: "white", fontWeight: 500 }
                        : isExpanded
                        ? { background: "#DDEEFF", color: "#0F4C81", fontWeight: 600 }
                        : isScheduled || hasWorkout
                        ? { color: "#0F4C81", fontWeight: 500 }
                        : { color: "#0D1B2E" }
                    }
                  >
                    {day}
                  </div>
                  <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                    {hasLog && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />
                    )}
                    {(isScheduled || hasWorkout) && !hasLog && (
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isToday ? "white" : "#0EA5E9" }}
                      />
                    )}
                    {hasPayment && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: GRAPE }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="flex flex-wrap gap-4 mt-3 pt-3"
            style={{ borderTop: "0.5px solid #EDF2F7" }}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: "#059669" }} />
              <span className="text-xs" style={{ color: "#4E6080" }}>Logged</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: "#0EA5E9" }} />
              <span className="text-xs" style={{ color: "#4E6080" }}>Scheduled</span>
            </div>
            {isTrainer && showPayments && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: GRAPE }} />
                <span className="text-xs" style={{ color: "#4E6080" }}>Payment due</span>
              </div>
            )}
          </div>
        </div>

        {expandedDay && (() => {
          const appts = appointmentsByDate[expandedDay] || [];
          const wkts = workoutsByDate[expandedDay] || [];
          if (appts.length === 0 && wkts.length === 0) return null;
          const d = new Date(expandedDay + "T00:00:00");
          const label = d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
          const items = appts.length > 0 ? appts : null;
          return (
            <div className="mt-3 card" style={{ padding: "0.75rem 1rem" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4E6080" }}>
                  {label}
                </p>
                <button onClick={() => setExpandedDay(null)}>
                  <i className="ti ti-x text-sm" style={{ color: "#C8D8EC" }} />
                </button>
              </div>
              {items
                ? items.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center gap-3 py-2.5 border-b last:border-b-0 -mx-4 px-4"
                      style={{ borderColor: "#EDF2F7", cursor: !isTrainer ? "pointer" : "default" }}
                      onClick={() => !isTrainer && router.push(`/workout/${appt.id}`)}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "#DDEEFF" }}
                      >
                        <i className="ti ti-barbell text-base" style={{ color: "#0F4C81" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "#0D1B2E" }}>
                          {appt.label}
                        </div>
                      </div>
                      {!isTrainer && (
                        <i className="ti ti-chevron-right text-sm" style={{ color: "#C8D8EC" }} />
                      )}
                    </div>
                  ))
                : wkts.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 py-2.5 border-b last:border-b-0 -mx-4 px-4"
                      style={{ borderColor: "#EDF2F7", cursor: "pointer" }}
                      onClick={() => router.push(`/workout/${w.id}`)}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "#DDEEFF" }}
                      >
                        <i className="ti ti-barbell text-base" style={{ color: "#0F4C81" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "#0D1B2E" }}>
                          {w.label}
                        </div>
                      </div>
                      <i className="ti ti-chevron-right text-sm" style={{ color: "#C8D8EC" }} />
                    </div>
                  ))}
            </div>
          );
        })()}

        {isTrainer && showPayments && upcomingPayments.length > 0 && (
          <>
            <p className="label mt-4">upcoming payments</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {upcomingPayments.map((pr, i) => {
                const d = new Date(pr.date + "T00:00:00");
                const lbl = d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-3 border-b last:border-b-0 -mx-4 px-4"
                    style={{ borderColor: "#EDF2F7" }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: GRAPE_LIGHT }}
                    >
                      <i className="ti ti-credit-card text-lg" style={{ color: GRAPE }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: "#0D1B2E" }}>
                        {pr.clientName}
                      </div>
                      <div className="text-xs" style={{ color: "#4E6080" }}>{lbl}</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: GRAPE }}>
                      ${pr.amount.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {isTrainer && (
          <>
            <p className="label mt-4">all clients</p>
            <div className="card text-sm" style={{ color: "#4E6080", padding: "1rem" }}>
              <i className="ti ti-brand-google text-lg mr-2" style={{ color: "#0F4C81" }} />
              Google Calendar sync — connect in Settings to push sessions both ways.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {pickerDate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setPickerDate(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl pb-8"
            style={{ background: "var(--brand-bg, #fff)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "#C8D8EC" }} />
            </div>
            <div className="px-5 py-3" style={{ borderBottom: "0.5px solid #EDF2F7" }}>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#4E6080" }}
              >
                Choose a workout
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#0D1B2E" }}>
                {new Date(pickerDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="px-5 py-3 space-y-2">
              {pickerWorkouts.map((w) => (
                <Link
                  key={w.id}
                  href={`/workout/${w.id}`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: "#DDEEFF", border: "1px solid #0F4C8120" }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "#0F4C81" }}
                  >
                    <i className="ti ti-barbell text-base" style={{ color: "#fff" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#0D1B2E" }}>
                      {w.label}
                    </p>
                  </div>
                  <i className="ti ti-chevron-right text-sm" style={{ color: "#0F4C81" }} />
                </Link>
              ))}
            </div>
            <div className="px-5 pt-1">
              <button
                onClick={() => setPickerDate(null)}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#F0F4F8", color: "#4E6080" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Schedule</h1>
        <p className="text-white/60 text-sm">{monthName}</p>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: "#F0F4F8", border: "1px solid #EDF2F7" }}
        >
          {(["week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setViewMode(mode); setExpandedDay(null); }}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={
                viewMode === mode
                  ? { background: "#0F4C81", color: "#fff", boxShadow: "0 1px 4px rgba(15,76,129,0.25)" }
                  : { background: "transparent", color: "#4E6080" }
              }
            >
              {mode === "week" ? "1 Week" : "1 Month"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "week" ? <WeekView /> : <MonthView />}
    </>
  );
}
