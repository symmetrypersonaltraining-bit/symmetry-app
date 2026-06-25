"use client";

import { useState } from "react";
import Link from "next/link";

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
  defaultView?: "week" | "month";
}

const GRAPE = "#7C3AED";
const GRAPE_LIGHT = "#EDE9FE";
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
  defaultView = "month",
}: Props) {
  const [showPayments, setShowPayments] = useState(true);
  const [view, setView] = useState<"week" | "month">(defaultView);

  // \u2500\u2500 Week view helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const nowDate = new Date();
  const nowStr = nowDate.toISOString().split("T")[0];
  const nowDow = nowDate.getDay(); // 0=Sun (matches our Sunday-first layout)
  const weekStartDate = new Date(nowDate);
  weekStartDate.setDate(nowDate.getDate() - nowDow);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayNum = d.getDate();
    const hasLog = workoutDates.includes(dateStr);
    const isScheduled = scheduledDows.includes(i); // i = 0..6 Sun=0
    const isToday = dateStr === nowStr;
    const upcoming = upcomingDays.find(u => u.date === dateStr);
    return { dateStr, dayNum, dow: i, hasLog, isScheduled, isToday, upcoming };
  });

  // \u2500\u2500 Payment map (trainer only) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

  // \u2500\u2500 Shared: view toggle UI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const viewToggle = (
    <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#C8D8EC" }}>
      {(["week", "month"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className="flex-1 py-1.5 text-xs font-semibold transition-all"
          style={view === v
            ? { background: "#0F4C81", color: "white", border: "none", cursor: "pointer", padding: "6px 0" }
            : { background: "transparent", color: "#4E6080", border: "none", cursor: "pointer", padding: "6px 0" }
          }
        >
          {v === "week" ? "Week" : "Month"}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-medium text-lg">Schedule</h1>
            <p className="text-white/60 text-sm">{monthName}</p>
          </div>
          <div style={{ width: 120 }}>{viewToggle}</div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="card">
          {isTrainer && (
            <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: "0.5px solid #EDF2F7" }}>
              <span className="text-xs font-medium" style={{ color: "#4E6080" }}>Payment reminders</span>
              <button
                onClick={() => setShowPayments((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={showPayments
                  ? { background: GRAPE_LIGHT, color: GRAPE, border: `1px solid ${GRAPE}`, cursor: "pointer" }
                  : { background: "#F0F4F8", color: "#4E6080", border: "1px solid #C8D8EC", cursor: "pointer" }
                }
              >
                <div className="w-2 h-2 rounded-full" style={{ background: showPayments ? GRAPE : "#C8D8EC" }} />
                {showPayments ? "Showing" : "Hidden"}
              </button>
            </div>
          )}

          {/* \u2500\u2500 WEEK VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          {view === "week" && (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-3">
                {DOW.map((d) => (
                  <div key={d} className="text-center text-xs font-medium py-1" style={{ color: "#4E6080" }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-2">
                {weekDays.map(({ dateStr, dayNum, dow, hasLog, isScheduled, isToday, upcoming }) => {
                  const content = (
                    <div key={dow} className="flex flex-col items-center gap-1">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all"
                        style={
                          hasLog
                            ? { background: "#059669", color: "white" }
                            : isToday
                              ? { background: "#0F4C81", color: "white" }
                              : isScheduled
                                ? { background: "#DDEEFF", color: "#0F4C81", border: "1px solid #0F4C81" }
                                : { background: "#F0F4F8", color: "#4E6080" }
                        }
                      >
                        {hasLog ? <i className="ti ti-check text-xs" /> : dayNum}
                      </div>
                      <span className="text-xs" style={{ color: isToday ? "#0F4C81" : "#4E6080" }}>{DOW[dow]}</span>
                      {isScheduled && !hasLog && (
                        <div className="text-center">
                          <span className="text-xs font-medium" style={{ color: "#0F4C81" }}>
                            {upcoming?.label || "Workout"}
                          </span>
                        </div>
                      )}
                    </div>
                  );

                  if (upcoming?.id) {
                    return (
                      <Link key={dow} href={`/workout/${upcoming.id}`}>
                        {content}
                      </Link>
                    );
                  }
                  return content;
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 pt-3" style={{ borderTop: "0.5px solid #EDF2F7" }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#059669" }} />
                  <span className="text-xs" style={{ color: "#4E6080" }}>Logged</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#0F4C81" }} />
                  <span className="text-xs" style={{ color: "#4E6080" }}>Scheduled</span>
                </div>
              </div>
            </>
          )}

          {/* \u2500\u2500 MONTH VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          {view === "month" && (
            <>
              <div className="grid grid-cols-7 mb-2">
                {DOW.map((d) => (
                  <div key={d} className="text-center text-xs font-medium py-1" style={{ color: "#4E6080" }}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = day === today;
                  const hasLog = workoutDates.includes(dateStr);
                  const dow = new Date(year, month, day).getDay();
                  const isScheduled = scheduledDows.includes(dow);
                  const hasPayment = showPayments && isTrainer && !!paymentDateMap[dateStr]?.length;

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
                      <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                        {hasLog && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />}
                        {isScheduled && !hasLog && (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: isToday ? "white" : "#0EA5E9" }} />
                        )}
                        {hasPayment && <div className="w-1.5 h-1.5 rounded-full" style={{ background: GRAPE }} />}
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
            </>
          )}
        </div>

        {/* Payment list (trainer month view only) */}
        {isTrainer && showPayments && view === "month" && upcomingPayments.length > 0 && (
          <>
            <p className="label mt-4">upcoming payments</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {upcomingPayments.map((pr, i) => {
                const d = new Date(pr.date + "T00:00:00");
                const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div key={i} className="flex items-center gap-3 py-3 border-b last:border-b-0 -mx-4 px-4"
                    style={{ borderColor: "#EDF2F7" }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: GRAPE_LIGHT }}>
                      <i className="ti ti-credit-card text-lg" style={{ color: GRAPE }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: "#0D1B2E" }}>{pr.clientName}</div>
                      <div className="text-xs" style={{ color: "#4E6080" }}>{label}</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: GRAPE }}>${pr.amount.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Upcoming workouts list */}
        {upcomingDays.length > 0 && (
          <>
            <p className="label mt-4">upcoming</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {upcomingDays.map((wd, i) => (
                <Link key={wd.id + i} href={`/workout/${wd.id}`}
                  className="flex items-center gap-3 py-3 border-b last:border-b-0 -mx-4 px-4"
                  style={{ borderColor: "#EDF2F7" }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "#DDEEFF" }}>
                    <i className="ti ti-calendar text-lg" style={{ color: "#0F4C81" }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{wd.label ? (<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-label="Workout" style={{ display: "block", margin: "2px auto 0", color: "var(--brand-primary)" }}><path d="M20.57 14.86 22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/></svg>) : null}</div>
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
              Google Calendar sync \u2014 connect in Settings to push sessions both ways.
            </div>
          </>
        )}
      </div>
    </>
  );
}
