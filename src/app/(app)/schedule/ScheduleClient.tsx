"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { updateGCalEvent, deleteGCalEvent } from "./scheduleActions";
import { logCardioSession, logStrengthSession } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  id: string;
  label: string;
  date: string;       // YYYY-MM-DD
  dow: number;        // 0=Sun … 6=Sat
  startTime?: string; // HH:mm (24h) in Chicago time
  endTime?: string;   // HH:mm (24h) in Chicago time
  gcalEventId?: string;
  gcalRecurringId?: string;
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
  upcomingDays: Appointment[];
  isTrainer?: boolean;
  paymentReminders?: { date: string; clientName: string; amount: number; status: string }[];
  clientId?: string | null;
  monthScheduledWorkouts?: { id: string; date: string; status: string; label: string }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_START = 6;   // 6 AM
const HOUR_END = 21;    // 9 PM
const PX_PER_HOUR = 64; // pixels per hour row

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getCentralDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(date);
}

function getWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  dt.setDate(d - dow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

interface DrawerProps {
  appt: Appointment;
  onClose: () => void;
  onSaved: () => void;
}

function EditDrawer({ appt, onClose, onSaved }: DrawerProps) {
  const [title, setTitle] = useState(appt.label.split(" — ")[0]);
  const [startTime, setStartTime] = useState(appt.startTime ?? "");
  const [endTime, setEndTime] = useState(appt.endTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (updateSeries: boolean) => {
    if (!appt.gcalEventId) {
      setError("No Google Calendar event linked.");
      return;
    }
    setError(null);

    let startIso: string | undefined;
    let endIso: string | undefined;
    if (startTime && endTime) {
      startIso = `${appt.date}T${startTime}:00-05:00`;
      endIso = `${appt.date}T${endTime}:00-05:00`;
    }

    startTransition(async () => {
      const res = await updateGCalEvent({
        appointmentId: appt.id,
        gcalEventId: appt.gcalEventId!,
        title: title !== appt.label.split(" — ")[0] ? title : undefined,
        startIso,
        endIso,
        updateSeries,
      });
      if (res.success) {
        onSaved();
      } else {
        setError(res.error ?? "Update failed");
      }
    });
  };

  const handleDelete = (deleteSeries: boolean) => {
    if (!appt.gcalEventId) {
      setError("No Google Calendar event linked.");
      return;
    }
    if (!confirm(deleteSeries ? "Delete ALL future occurrences?" : "Delete this session?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteGCalEvent({
        appointmentId: appt.id,
        gcalEventId: appt.gcalEventId!,
        deleteSeries,
      });
      if (res.success) {
        onSaved();
      } else {
        setError(res.error ?? "Delete failed");
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client / Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Date: {formatDateLabel(appt.date)}
            {appt.gcalRecurringId && <span className="ml-2 text-indigo-600">● Recurring</span>}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        </div>

        <div className="p-4 border-t space-y-2">
          <button onClick={() => handleUpdate(false)} disabled={isPending} className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? "Saving…" : "Update This Session"}
          </button>
          {appt.gcalRecurringId && (
            <button onClick={() => handleUpdate(true)} disabled={isPending} className="w-full bg-indigo-100 text-indigo-700 rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-200 disabled:opacity-50 transition-colors">
              Update All Future Sessions
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => handleDelete(false)} disabled={isPending} className="flex-1 bg-red-50 text-red-600 rounded-lg py-2.5 text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors">
              Delete This
            </button>
            {appt.gcalRecurringId && (
              <button onClick={() => handleDelete(true)} disabled={isPending} className="flex-1 bg-red-100 text-red-700 rounded-lg py-2.5 text-sm font-medium hover:bg-red-200 disabled:opacity-50 transition-colors">
                Delete All Future
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

interface MonthViewProps {
  year: number;
  month: number;
  daysInMonth: number;
  firstDay: number;
  today: number;
  workoutDates: string[];
  upcomingDays: Appointment[];
  paymentReminders: { date: string; clientName: string; amount: number; status: string }[];
  isTrainer: boolean;
  clientId?: string | null;
  monthScheduledWorkouts?: { id: string; date: string; status: string; label: string }[];
}

function MonthView({ year, month, daysInMonth, firstDay, today, workoutDates, upcomingDays, paymentReminders, isTrainer, clientId = null, monthScheduledWorkouts = [] }: MonthViewProps) {
  const [showPayments, setShowPayments] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [logStep, setLogStep] = useState<"choose" | "cardio" | "strength">("choose");
  const [cardioType, setCardioType] = useState("Run");
  const [durationMin, setDurationMin] = useState("");
  const [distanceMi, setDistanceMi] = useState("");
  const [saving, setSaving] = useState(false);
  const pad = (n: number) => String(n).padStart(2, "0");

  const workoutSet = useMemo(() => new Set(workoutDates), [workoutDates]);
  const scheduledSet = useMemo(() => {
    const s = new Set<string>();
    // Prefer the full-month, all-status list so a manually added or moved (incl. past) workout still shows a dot.
    if (monthScheduledWorkouts && monthScheduledWorkouts.length) {
      monthScheduledWorkouts.forEach((w) => { if (w.status !== "completed") s.add(w.date); });
    }
    upcomingDays.forEach((a) => s.add(a.date));
    return s;
  }, [upcomingDays, monthScheduledWorkouts]);
  const paymentSet = useMemo(() => {
    const s = new Set<string>();
    paymentReminders.forEach((p) => s.add(p.date));
    return s;
  }, [paymentReminders]);

  const todayStr = `${year}-${pad(month + 1)}-${pad(today)}`;

  const cells: { dateStr: string; dayNum: number }[] = [];
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ dateStr: "", dayNum });
    } else {
      cells.push({ dateStr: `${year}-${pad(month + 1)}-${pad(dayNum)}`, dayNum });
    }
  }

  return (
    <div>
      {isTrainer && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Logged</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Scheduled</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Payment</span>
          </div>
          <button onClick={() => setShowPayments((v) => !v)} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
            {showPayments ? "Hide Payments" : "Show Payments"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 border-l border-t border-gray-200 rounded-lg overflow-hidden">
        {DOW_LABELS.map((d) => (
          <div key={d} className="border-r border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
        ))}
        {cells.map((cell, i) => {
          const isToday = cell.dateStr === todayStr;
          const hasWorkout = cell.dateStr ? workoutSet.has(cell.dateStr) : false;
          const hasScheduled = cell.dateStr ? scheduledSet.has(cell.dateStr) : false;
          const hasPayment = cell.dateStr ? paymentSet.has(cell.dateStr) : false;
          return (
            <div key={i} className={`border-r border-b border-gray-200 min-h-[64px] p-1.5 ${cell.dateStr ? "bg-white cursor-pointer active:opacity-75" : "bg-gray-50"}`} onClick={() => { if (cell.dateStr) { setSelectedDate(cell.dateStr); setLogStep("choose"); } }}>
              {cell.dateStr && (
                <>
                  <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-indigo-600 text-white" : "text-gray-700"}`}>
                    {cell.dayNum}
                  </span>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {hasWorkout && <span className="w-2 h-2 rounded-full bg-green-500" />}
                    {hasScheduled && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                    {hasPayment && showPayments && <span className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {isTrainer && showPayments && paymentReminders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Reminders</h3>
          <div className="space-y-2">
            {paymentReminders.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-purple-50 rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-purple-900">{p.clientName}</span>
                <span className="text-purple-700">${p.amount.toFixed(2)}</span>
                <span className="text-xs text-gray-500">{p.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "sent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:"rgba(0,0,0,0.5)"}} onClick={() => setSelectedDate(null)}>
          <div className="w-full rounded-t-2xl p-6" style={{background:"#fff",maxWidth:480}} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-sm font-medium" style={{color:"#4E6080"}}>Log Session</div>
                <div className="text-base font-semibold" style={{color:"#0D1B2E"}}>{new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
              </div>
              <button onClick={() => setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{background:"#F0F4F8"}}><i className="ti ti-x" style={{color:"#4E6080"}} /></button>
            </div>
            {logStep === "choose" && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setLogStep("cardio")} className="flex flex-col items-center gap-2 py-5 rounded-xl border-2" style={{background:"#FFF5F5",borderColor:"#FC8181"}}>
                  <i className="ti ti-run text-3xl" style={{color:"#E53E3E"}} />
                  <span className="text-sm font-semibold" style={{color:"#0D1B2E"}}>Cardio</span>
                </button>
                <button onClick={() => setLogStep("strength")} className="flex flex-col items-center gap-2 py-5 rounded-xl border-2" style={{background:"#EBF8FF",borderColor:"#63B3ED"}}>
                  <i className="ti ti-barbell text-3xl" style={{color:"#0F4C81"}} />
                  <span className="text-sm font-semibold" style={{color:"#0D1B2E"}}>Strength</span>
                </button>
              </div>
            )}
            {logStep === "cardio" && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium mb-2" style={{color:"#4E6080"}}>TYPE</div>
                  <div className="grid grid-cols-3 gap-2">
                    {["Run","Walk","Bike","Row","Swim","Other"].map(t => (
                      <button key={t} onClick={() => setCardioType(t)} className="py-2 rounded-lg text-sm font-medium" style={cardioType===t?{background:"#0F4C81",color:"white"}:{background:"#F0F4F8",color:"#4E6080"}}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{color:"#4E6080"}}>DURATION (minutes)</div>
                  <input type="number" value={durationMin} onChange={e=>setDurationMin(e.target.value)} placeholder="30" className="w-full px-3 py-2 rounded-lg border text-sm" style={{borderColor:"#C8D8EC",background:"#F7FAFC"}} />
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{color:"#4E6080"}}>DISTANCE miles (optional)</div>
                  <input type="number" step="0.1" value={distanceMi} onChange={e=>setDistanceMi(e.target.value)} placeholder="3.1" className="w-full px-3 py-2 rounded-lg border text-sm" style={{borderColor:"#C8D8EC",background:"#F7FAFC"}} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setLogStep("choose")} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{background:"#F0F4F8",color:"#4E6080"}}>Back</button>
                  <button disabled={!durationMin || saving} onClick={async () => { if (!clientId || !durationMin) return; setSaving(true); try { await logCardioSession({clientId,logDate:selectedDate,cardioType,durationMinutes:Number(durationMin),distance:distanceMi?Number(distanceMi):undefined}); setSelectedDate(null); setDurationMin(""); setDistanceMi(""); } finally { setSaving(false); } }} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{background:durationMin&&!saving?"#0F4C81":"#C8D8EC",color:"white"}}>{saving?"Saving...":"Save"}</button>
                </div>
              </div>
            )}
            {logStep === "strength" && (() => {
              const sw = monthScheduledWorkouts.find(w => w.date === selectedDate);
              return (
                <div className="space-y-4">
                  {sw ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:"#DDEEFF"}}>
                      <i className="ti ti-calendar-check text-lg" style={{color:"#0F4C81"}} />
                      <div><div className="text-sm font-medium" style={{color:"#0D1B2E"}}>{sw.label}</div><div className="text-xs" style={{color:"#4E6080"}}>Scheduled · mark complete</div></div>
                    </div>
                  ) : (
                    <div className="text-sm text-center py-2" style={{color:"#4E6080"}}>No scheduled workout · log ad-hoc session</div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setLogStep("choose")} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{background:"#F0F4F8",color:"#4E6080"}}>Back</button>
                    <button disabled={saving} onClick={async () => { if (!clientId) return; setSaving(true); try { await logStrengthSession({clientId,logDate:selectedDate,scheduledWorkoutId:sw?.id}); setSelectedDate(null); } finally { setSaving(false); } }} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{background:saving?"#C8D8EC":"#0F4C81",color:"white"}}>{saving?"Saving...":"Mark Complete"}</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}</div>
  );
}

// ─── Week Time Grid ────────────────────────────────────────────────────────────

interface WeekGridProps {
  weekStart: string;
  todayStr: string;
  appointments: Appointment[];
  isTrainer: boolean;
  onClickAppt: (appt: Appointment) => void;
}

function WeekGrid({ weekStart, todayStr, appointments, isTrainer, onClickAppt }: WeekGridProps) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const totalHeight = hours.length * PX_PER_HOUR;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const byDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach((a) => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [appointments]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="w-14 flex-shrink-0" />
          {days.map((dateStr, i) => {
            const isToday = dateStr === todayStr;
            const [, , d] = dateStr.split("-");
            return (
              <div key={dateStr} className={`flex-1 text-center py-2 border-l border-gray-200 ${isToday ? "bg-indigo-50" : ""}`}>
                <div className="text-xs text-gray-500 font-medium">{DOW_LABELS[i]}</div>
                <div className={`text-lg font-semibold mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full ${isToday ? "bg-indigo-600 text-white" : "text-gray-800"}`}>
                  {parseInt(d)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex">
          <div className="w-14 flex-shrink-0 relative" style={{ height: totalHeight }}>
            {hours.map((h) => (
              <div key={h} className="absolute w-full pr-2 text-right" style={{ top: (h - HOUR_START) * PX_PER_HOUR - 8 }}>
                <span className="text-xs text-gray-400">{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {days.map((dateStr) => {
            const isToday = dateStr === todayStr;
            const dayAppts = byDate[dateStr] ?? [];
            const allDayAppts = dayAppts.filter((a) => !a.startTime);
            const timedAppts = dayAppts.filter((a) => !!a.startTime);

            return (
              <div key={dateStr} className={`flex-1 border-l border-gray-200 relative ${isToday ? "bg-indigo-50/30" : "bg-white"}`} style={{ height: totalHeight }}>
                {hours.map((h) => (
                  <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - HOUR_START) * PX_PER_HOUR }} />
                ))}

                {allDayAppts.map((appt) => (
                  <div
                    key={appt.id}
                    onClick={() => isTrainer && onClickAppt(appt)}
                    className={`mx-0.5 mb-0.5 rounded text-white text-xs px-1 py-0.5 truncate ${isTrainer ? "cursor-pointer hover:opacity-80" : "cursor-default"} bg-indigo-500`}
                    style={{ position: "relative", zIndex: 1 }}
                    title={appt.label}
                  >
                    {appt.label}
                  </div>
                ))}

                {timedAppts.map((appt) => {
                  const startMins = timeToMinutes(appt.startTime!);
                  const endMins = appt.endTime ? timeToMinutes(appt.endTime) : startMins + 60;
                  const topPx = (startMins - HOUR_START * 60) * (PX_PER_HOUR / 60);
                  const heightPx = Math.max((endMins - startMins) * (PX_PER_HOUR / 60), 24);
                  if (startMins < HOUR_START * 60 || startMins >= HOUR_END * 60) return null;
                  const shortLabel = appt.label.split(" — ")[0];
                  const timeLabel = appt.endTime
                    ? `${formatTime12(appt.startTime!)}–${formatTime12(appt.endTime)}`
                    : formatTime12(appt.startTime!);
                  return (
                    <div
                      key={appt.id}
                      onClick={() => isTrainer && onClickAppt(appt)}
                      className={`absolute left-0.5 right-0.5 rounded bg-indigo-600 text-white text-xs overflow-hidden shadow-sm ${isTrainer ? "cursor-pointer hover:bg-indigo-700 hover:shadow-md" : "cursor-default"} transition-all`}
                      style={{ top: topPx, height: heightPx, zIndex: 2 }}
                      title={`${appt.label}\n${timeLabel}`}
                    >
                      <div className="px-1.5 pt-0.5 font-medium leading-tight truncate">{shortLabel}</div>
                      {heightPx > 28 && <div className="px-1.5 text-indigo-200 leading-tight truncate">{timeLabel}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ScheduleClient({
  monthName, year, month, daysInMonth, firstDay, today, workoutDates, scheduledDows, upcomingDays, isTrainer = false, paymentReminders = [], clientId, monthScheduledWorkouts = [],
}: Props) {
  const router = useRouter();

  const todayStr = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${year}-${pad(month + 1)}-${pad(today)}`;
  }, [year, month, today]);

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayStr));
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);

  const weekAppts = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    return upcomingDays.filter((a) => a.date >= weekStart && a.date < weekEnd);
  }, [upcomingDays, weekStart]);

  const weekEndStr = addDays(weekStart, 6);
  const weekLabel = `${formatDateLabel(weekStart)} – ${formatDateLabel(weekEndStr)}`;

  const goToPrevWeek = useCallback(() => setWeekStart((s) => addDays(s, -7)), []);
  const goToNextWeek = useCallback(() => setWeekStart((s) => addDays(s, 7)), []);
  const goToToday = useCallback(() => setWeekStart(getWeekStart(todayStr)), [todayStr]);

  const handleSaved = useCallback(() => {
    setEditingAppt(null);
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
            <button onClick={() => setViewMode("week")} className={`px-4 py-2 font-medium transition-colors ${viewMode === "week" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Week</button>
            <button onClick={() => setViewMode("month")} className={`px-4 py-2 font-medium transition-colors ${viewMode === "month" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Month</button>
          </div>
        </div>

        {viewMode === "week" && (
          <div className="flex items-center gap-3 mb-4">
            <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Today</button>
            <div className="flex items-center gap-1">
              <button onClick={goToPrevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600" aria-label="Previous week">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={goToNextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600" aria-label="Next week">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <span className="text-base font-semibold text-gray-800">{weekLabel}</span>
          </div>
        )}

        {viewMode === "month" && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800">{monthName} {year}</h2>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {viewMode === "week" ? (
            <WeekGrid weekStart={weekStart} todayStr={todayStr} appointments={weekAppts} isTrainer={isTrainer} onClickAppt={setEditingAppt} />
          ) : (
            <div className="p-4">
              <MonthView year={year} month={month} daysInMonth={daysInMonth} firstDay={firstDay} today={today} workoutDates={workoutDates} upcomingDays={upcomingDays} paymentReminders={paymentReminders} isTrainer={isTrainer} clientId={clientId} monthScheduledWorkouts={monthScheduledWorkouts} />
            </div>
          )}
        </div>

        {isTrainer && viewMode === "week" && (
          <p className="text-xs text-gray-400 mt-3 text-center">Click any session block to edit or reschedule</p>
        )}
      </div>

      {editingAppt && (
        <EditDrawer appt={editingAppt} onClose={() => setEditingAppt(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
