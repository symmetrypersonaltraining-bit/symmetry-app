"use client";
import MessagesBell from "@/components/MessagesBell";

import { useState } from "react";
import Link from "next/link";
import PaymentCheckBanner from "@/components/PaymentCheckBanner";
import TrainerWeekDigest from "@/components/TrainerWeekDigest";
import CountUp from "@/components/CountUp";
import GcalSyncButton from "@/components/GcalSyncButton";

interface TodaySession {
  id: string;
  clientId: string;
  clientName: string;
  startTime: string;
  endTime: string;
  status: string;
  title: string;
  workouts: Array<{ id: string; label: string; isCardio: boolean }>;
}

interface ClientItem {
  id: string;
  name: string;
}

interface Props {
  todaySessions: TodaySession[];
  completedCount: number;
  scheduledCount: number;
  clients: ClientItem[];
  notificationCount: number;
  dateLabel: string;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function WorkoutChooserModal({
  session,
  onClose,
}: {
  session: TodaySession;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl p-6 pb-10"
        style={{ background: "var(--brand-bg)" }}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: "var(--brand-border)" }}
        />
        <h3 className="text-base font-bold mb-1" style={{ color: "var(--brand-text)" }}>
          {session.clientName}
        </h3>
        <p className="text-sm mb-5" style={{ color: "var(--brand-text-secondary)" }}>
          {session.startTime + " – " + session.endTime + " · Choose workout to launch"}
        </p>
        <div className="space-y-3">
          {session.workouts.map((w) => (
            <Link
              key={w.id}
              href={"/workout/" + w.id + "?forClient=" + session.clientId}
              onClick={onClose}
            >
              <div
                className="flex items-center gap-4 p-4 rounded-2xl"
                style={{
                  background: "var(--brand-surface)",
                  border: "1px solid var(--brand-border)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: w.isCardio ? "#22c55e20" : "var(--brand-primary)20" }}
                >
                  <i
                    className={"ti " + (w.isCardio ? "ti-run" : "ti-barbell") + " text-lg"}
                    style={{ color: w.isCardio ? "#22c55e" : "var(--brand-primary)" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                    {w.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                    {w.isCardio ? "Cardio" : "Strength"} Training
                  </p>
                </div>
                <i
                  className="ti ti-chevron-right text-sm"
                  style={{ color: "var(--brand-text-secondary)" }}
                />
              </div>
            </Link>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-2xl text-sm font-medium"
          style={{
            background: "var(--brand-surface)",
            color: "var(--brand-text-secondary)",
            border: "1px solid var(--brand-border)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TrainerHome({
  todaySessions,
  completedCount,
  scheduledCount,
  clients,
  notificationCount,
  dateLabel,
}: Props) {
  const [chooserSession, setChooserSession] = useState<TodaySession | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("");

  function handleSessionClick(s: TodaySession) {
    if (s.workouts.length === 0) return;
    if (s.workouts.length === 1) {
      window.location.href = "/workout/" + s.workouts[0].id + "?forClient=" + s.clientId;
      return;
    }
    setChooserSession(s);
  }

  const progressClientObj = clients.find((c) => c.id === selectedClient);
  const progressClientFirst = progressClientObj ? progressClientObj.name.split(" ")[0] : "";

  const pct = scheduledCount > 0
    ? Math.round((completedCount / scheduledCount) * 100)
    : 0;

  return (
    <>
      {chooserSession && (
        <WorkoutChooserModal
          session={chooserSession}
          onClose={() => setChooserSession(null)}
        />
      )}

      <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto cw-reveal">
      <MessagesBell variant="banner" />
        <PaymentCheckBanner />
      <GcalSyncButton />

        {/* Header */}
        <div className="pt-2">
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            {"Good " + getGreeting() + ","}
          </p>
          <h1 className="text-2xl font-bold gradient-text">Dustin 👋</h1>
          <p className="text-sm mt-1" style={{ color: "var(--brand-text-secondary)" }}>
            {dateLabel}
          </p>
        </div>

        <TrainerWeekDigest />

        {/* Today's Client Sessions — scrollable list */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{
              borderBottom: "1px solid var(--brand-border)",
              background: "var(--brand-primary)10",
            }}
          >
            <i
              className="ti ti-calendar-event text-base"
              style={{ color: "var(--brand-primary)" }}
            />
            <span className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
              {"Today's Sessions"}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
              style={{ background: "var(--brand-primary)20", color: "var(--brand-primary)" }}
            >
              {scheduledCount + " scheduled"}
            </span>
          </div>

          {todaySessions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <i
                className="ti ti-calendar-off text-4xl mb-2 block cw-float"
                style={{ color: "var(--brand-text-secondary)" }}
              />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
                No sessions today
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                Sync your calendar to see sessions here
              </p>
            </div>
          ) : (
            <div
              className="divide-y overflow-y-auto"
              style={{ borderColor: "var(--brand-border)", maxHeight: "320px" }}
            >
              {todaySessions.map((s) => {
                const isDone = s.status === "completed";
                const isCancelled = s.status === "cancelled_client";
                const hasWorkout = s.workouts.length > 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSessionClick(s)}
                    disabled={!hasWorkout || isCancelled}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isDone
                          ? "#22c55e20"
                          : isCancelled
                          ? "#ef444420"
                          : "var(--brand-primary)20",
                      }}
                    >
                      <i
                        className={
                          "ti " +
                          (isDone ? "ti-check" : isCancelled ? "ti-x" : "ti-barbell") +
                          " text-sm"
                        }
                        style={{
                          color: isDone
                            ? "#22c55e"
                            : isCancelled
                            ? "#ef4444"
                            : "var(--brand-primary)",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{
                          color: isCancelled
                            ? "var(--brand-text-secondary)"
                            : "var(--brand-text)",
                        }}
                      >
                        {s.clientName}
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: "var(--brand-text-secondary)" }}
                      >
                        {s.startTime + " – " + s.endTime +
                          (s.title && s.title !== "Training Session"
                            ? " · " + s.title
                            : "")}
                      </p>
                    </div>
                    {hasWorkout && !isCancelled && (
                      <span
                        className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0"
                        style={{
                          background: isDone ? "#22c55e20" : "var(--brand-primary)20",
                          color: isDone ? "#22c55e" : "var(--brand-primary)",
                        }}
                      >
                        {isDone ? "Done" : s.workouts.length > 1 ? "Choose" : "Start"}
                      </span>
                    )}
                    {isCancelled && (
                      <span
                        className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0"
                        style={{ background: "#ef444420", color: "#ef4444" }}
                      >
                        Cancelled
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stat Cards Row */}
        <div className="grid grid-cols-2 gap-3">

          {/* Sessions Completed Card */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <i
                className="ti ti-clipboard-check text-base"
                style={{ color: "var(--brand-primary)" }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--brand-text-secondary)" }}
              >
                Today
              </span>
            </div>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-3xl font-bold" style={{ color: "var(--brand-text)" }}>
                <CountUp end={completedCount} />
              </span>
              <span
                className="text-lg font-medium pb-0.5"
                style={{ color: "var(--brand-text-secondary)" }}
              >
                {"/" + scheduledCount}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              sessions done
            </p>
            {scheduledCount > 0 && (
              <div
                className="mt-3 h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--brand-border)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: pct + "%", background: "var(--brand-primary)" }}
                />
              </div>
            )}
          </div>

          {/* Progress Card with Client Picker */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-chart-line text-base" style={{ color: "#a855f7" }} />
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--brand-text-secondary)" }}
              >
                Progress
              </span>
            </div>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full text-xs rounded-xl px-2 py-2 mb-2 font-medium"
              style={{
                background: "var(--brand-card)",
                border: "1px solid var(--brand-border)",
                color: "var(--brand-text)",
                outline: "none",
              }}
            >
              <option value="">Pick client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedClient ? (
              <Link
                href={"/clients/" + selectedClient}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "#a855f720", color: "#a855f7" }}
              >
                <i className="ti ti-external-link text-xs" />
                {"View " + progressClientFirst + "'s Profile"}
              </Link>
            ) : (
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                Select to view progress
              </p>
            )}
          </div>
        </div>

        {/* Notifications Card */}
        <Link href="/payments">
          <div
            className="rounded-2xl p-4 flex items-center gap-4"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 relative"
              style={{ background: notificationCount > 0 ? "#f59e0b20" : "var(--brand-card)" }}
            >
              <i
                className="ti ti-bell text-xl"
                style={{
                  color: notificationCount > 0 ? "#f59e0b" : "var(--brand-text-secondary)",
                }}
              />
              {notificationCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ background: "#f59e0b", fontSize: "10px" }}
                >
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                Notifications
              </p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {notificationCount > 0
                  ? notificationCount +
                    " pending reminder" +
                    (notificationCount !== 1 ? "s" : "")
                  : "No pending reminders"}
              </p>
            </div>
            <i
              className="ti ti-chevron-right text-sm"
              style={{ color: "var(--brand-text-secondary)" }}
            />
          </div>
        </Link>

        {/* Messages Card */}
        <Link href="/messages" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-message-circle" style={{ color: "#fff", fontSize: 20 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, color: "var(--brand-text)", fontSize: 14 }}>Messages</p>
            <p style={{ color: "var(--brand-text-secondary)", fontSize: 12 }}>Client & group chat</p>
          </div>
          <i className="ti ti-chevron-right" style={{ color: "var(--brand-text-secondary)", fontSize: 18 }} />
        </Link>

      </div>
    </>
  );
}
