"use client";

import { useState } from "react";
import Link from "next/link";
import WeeklyFocusHealth from "@/components/WeeklyFocusHealth";
import TodaysAdmin from "@/components/TodaysAdmin";
import ConfirmSwaps from "@/components/ConfirmSwaps";
import LiveSessions from "@/components/LiveSessions";
import CountUp from "@/components/CountUp";
import GcalSyncButton from "@/components/GcalSyncButton";
import SyncHealth from "@/components/SyncHealth";
import TutorialCard from "@/components/TutorialCard";
import { useCoach } from "@/lib/useCoach";
import { centralHour } from "@/lib/central-time";

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
  const h = centralHour();
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
      className="fixed inset-0 z-[1000] flex items-end justify-center"
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
                  style={{ background: w.isCardio ? "#22c55e20" : "color-mix(in srgb, var(--brand-primary) 13%, transparent)" }}
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
  // The signed-in trainer greets themselves. This was COACH_FIRST_NAME, so
  // Stephanie's home screen said "Dustin 👋".
  const me = useCoach();
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
      {/* SaturdayReview (the full-screen focus-approval takeover) is gone from
          here as of 21 Aug. Dustin: "correct i dont need to approve if the ai is
          set up to be accurate based on real numbers." The sweep now publishes
          straight to the client, so there is nothing to approve and a
          full-screen interrupt for it would be pure noise.

          Kept in the repo, not deleted — same treatment as TrainerWeekDigest
          below, and pinned by tests/unit/weeklyFocusIsAutomatic.test.ts. */}

      {chooserSession && (
        <WorkoutChooserModal
          session={chooserSession}
          onClose={() => setChooserSession(null)}
        />
      )}

      <div className="space-y-4 cw-reveal">
      {/* In-page message bell removed — the single header NotificationCenter bell
          (in HeaderAssist) is the app-wide notification entry point. */}
      {/* Payment notifications moved OFF the trainer home into the Payments section (Dustin 7/9). */}
        {/* Greeting first. Dustin, 21 Aug: "move the good morning trainer name
            to the very top above cal sync." */}
        <div className="pt-2">
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            {"Good " + getGreeting() + ","}
          </p>
          <h1 className="text-2xl font-bold gradient-text">{me.firstName} 👋</h1>
          <p className="text-sm mt-1" style={{ color: "var(--brand-text-secondary)" }}>
            {dateLabel}
          </p>
        </div>

      {/* The manual sync button now lives ON the sync bar rather than as a
          separate control underneath it — the status and the way to act on it
          are one thing. GcalSyncButton is no longer mounted separately. */}
      {/* Above the sync bar, and only until it is finished. A new trainer's
          first screen should tell them where to start; Settings did not, and
          on a phone Settings was the only door the tutorial had. Renders
          nothing once every step has been seen. */}
      <TutorialCard />

      <SyncHealth />
      {/* Renders NOTHING while the weekly sweep is healthy. Dustin, 21 Aug:
          "now that daily focus is auto we can get rid of that block". Right —
          there is nothing to action. But it is also what reports a FAILED
          sweep, so instead of deleting it, it goes quiet when it worked and
          Today's Admin carries a red row when it did not. */}
      <WeeklyFocusHealth />

      {/* Everything in the app that needs doing, derived live so that dealing
          with anything at its source clears it here. */}
      <TodaysAdmin />

      {/* Swaps Claude has picked, one tap each. Takes the slot the Progress
          card had. Renders nothing when there are none. */}
      <ConfirmSwaps />

        {/* Today's Sessions, first. It is the shape of the whole morning and
            the only block with a Start button on it — everything else on this
            screen is context for it. "Who needs you today" used to sit here and
            has been removed entirely. */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{
              borderBottom: "1px solid var(--brand-border)",
              background: "color-mix(in srgb, var(--brand-primary) 6%, transparent)",
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
              style={{ background: "color-mix(in srgb, var(--brand-primary) 13%, transparent)", color: "var(--brand-primary)" }}
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
                          : "color-mix(in srgb, var(--brand-primary) 13%, transparent)",
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
                          background: isDone ? "#22c55e20" : "color-mix(in srgb, var(--brand-primary) 13%, transparent)",
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

        {/* Anyone training this minute. Sits under today's list rather than
            above it: the list is the shape of the whole morning, this is the
            one row happening right now. */}
        <LiveSessions />

        {/* CommunityPair (challenge board + group chat preview) came off on
            21 Aug. Dustin: "get rid of the group message block as well".
            102 group messages in seven days made it a scrolling feed rather
            than a dashboard tile, and the group lives on /messages. Kept in the
            repo, unmounted, like TrainerWeekDigest and SaturdayReview. */}

        {/* WEEK AHEAD IS NOT ON THIS SCREEN ANY MORE.
            Dustin, 21 Aug: "get rid of this table all together, this function
            we will talk about later and needs to be fully automated not on my
            home screen."

            The component is deliberately still in the repo — TrainerWeekDigest
            and /api/coach/focus-suggestions — because the FUNCTION is wanted,
            automated, and is a conversation still to be had. Deleting it would
            mean rebuilding the roster maths, the drift detection and the focus
            editor from nothing when that conversation happens. Do not re-mount
            it here, and do not delete it either.

            Nothing is orphaned by its absence. As of 21 Aug the weekly sweep
            publishes the focus itself, late on Saturday, with no approval step
            — so there is no draft queue to own. WeeklyFocusHealth above reports
            whether it worked, and ClientWeekSummary only shows a focus stamped
            with the CURRENT week, so a client sees no stale line, just no line.
            The only thing that stops being written is digest_snoozed_until,
            which nothing reads. */}

        {/* Stat Cards Row */}
        {/* Full width, not a two-column grid. This grid held Today AND the
            Progress card; with Progress removed on 21 Aug the single survivor
            rendered at half width against full-width blocks above and below it,
            which is the ragged edge Dustin flagged. One column, one card width,
            all the way down. */}
        <div>

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

          {/* PROGRESS CARD REMOVED 21 Aug. Dustin: "we can get rid of the
              progress card on my trainer dashboard, i have that in menu to get
              to it and from client profiles". It was a picker plus a link to a
              screen already reachable two other ways. */}
        </div>

      </div>
    </>
  );
}
