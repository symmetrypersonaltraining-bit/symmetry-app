"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface UpcomingDay {
  id: string;
  label: string;
  date: string;
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
  const [showPayments, setShowPayments] = useState(true);
  // pickerDate: date string of day tapped with multiple workouts
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [pickerWorkouts, setPickerWorkouts] = useState<{ id: string; label: string }[]>([]);

  const dowNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

  function handleDayClick(dateStr: string) {
    if (isTrainer) return;
    const workouts = workoutsByDate[dateStr] || [];
    if (workouts.length === 0) return;
    if (workouts.length === 1) {
      router.push(`/workout/${workouts[0].id}`);
      return;
    }
    // Multiple workouts — show picker
    setPickerDate(dateStr);
    setPickerWorkouts(workouts);
  }

  return (
    <>
      {/* Multi-workout picker modal */}
      {pickerDate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setPickerDate(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl pb-8"
            style={{ background: "var(--brand-bg, #fff)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "#C8D8EC" }} />
            </div>
            <div className="px-5 py-3" style={{ borderBottom: "0.5px solid #EDF2F7" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4E6080" }}>
                Choose a workout
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#0D1B2E" }}>
                {new Date(pickerDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric"
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
                    <p className="text-sm font-semibold" style={{ color: "#0D1B2E" }}>{w.label}</p>
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

      <div className="px-4 py-4">
        <div className="card">
          {isTrainer && (
            <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: "0.5px solid #EDF2F7" }}>
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
              <div key={d} className="text-center text-xs font-medium py-1" style={{ color: "#4E6080" }}>
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
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = day === today;
              const hasLog = workoutDates.includes(dateStr);
              const dow = new Date(year, month, day).getDay();
              const isScheduled = scheduledDows.includes(dow);
              const hasPayment = showPayments && !!paymentDateMap[dateStr]?.length;
              const dayWorkouts = workoutsByDate[dateStr] || [];
              const hasWorkout = !isTrainer && dayWorkouts.length > 0;
              const isClickable = hasWorkout;

              return (
                <div
                  key={day}
                  className="relative flex flex-col items-center py-1"
                  onClick={isClickable ? () => handleDayClick(dateStr) : undefined}
                  style={isClickable ? { cursor: "pointer" } : undefined}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm rounded-full"
                    style={
                      isToday
                        ? { background: "#0F4C81", color: "white", fontWeight: 500 }
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

          <div className="flex flex-wrap gap-4 mt-3 pt-3" style={{ borderTop: "0.5px solid #EDF2F7" }}>
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

        {isTrainer && showPayments && upcomingPayments.length > 0 && (
          <>
            <p className="label mt-4">upcoming payments</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {upcomingPayments.map((pr, i) => {
                const d = new Date(pr.date + "T00:00:00");
                const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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
                      <div className="text-xs" style={{ color: "#4E6080" }}>{label}</div>
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
    </>
  );
}
