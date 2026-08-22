"use client";

// THE GOALS BLOCK ON PROGRESS — everything with a button on it.
//
// GoalsSection does the reading and stays a server component; this owns the
// three interactions, which is all the state there is:
//
//   · a PROPOSED goal, waiting on the client's yes or no;
//   · an ACTIVE goal, adjustable;
//   · no goal at all, and an invitation to set one.
//
// The proposal card is the one worth reading twice. Dustin's goals are visible
// AS his and are REFUSABLE — "Not for me" is a real button that writes a real
// row, not a dismiss. A goal somebody did not agree to is not a goal, and an
// app that only offers "OK" has not asked a question.

import { useState } from "react";
import { useRouter } from "next/navigation";
import GoalCard from "@/components/GoalCard";
import GoalSetSheet from "@/components/GoalSetSheet";
import AiBadge from "@/components/AiBadge";
import { UNITS, METRIC_LABEL, type Goal, type GoalMetric, type Reading } from "@/lib/goals";

export default function GoalsPanel({
  clientId, goals, readingsByMetric, today, canSet, canAnswer,
}: {
  clientId: string;
  goals: Goal[];
  readingsByMetric: Record<string, Reading[]>;
  today: string;
  /** Set and adjust. True for the client, and for the trainer proposing one. */
  canSet: boolean;
  /**
   * Accept or decline. ONLY the person the goal is for.
   *
   * The API enforces this too — a trainer accepting on a client's behalf is a
   * 403 there, not just a hidden button. If "they agreed to this" can be
   * produced by somebody else clicking, it means nothing, and the whole
   * proposed state is decoration.
   */
  canAnswer: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ metric: GoalMetric; existing: { id: string; targetValue: number; targetDate: string } | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const active = goals.filter((g) => g.status === "active");
  const proposed = goals.filter((g) => g.status === "proposed");

  async function answer(goalId: string, action: "accept" | "decline") {
    setBusyId(goalId);
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, goalId }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {proposed.map((g) => (
        <div
          key={g.id}
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 10%, var(--brand-surface)), var(--brand-surface))",
            border: "1px solid color-mix(in srgb, var(--brand-primary) 35%, var(--brand-border))",
            borderRadius: 16, padding: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AiBadge size={26} mood="plan" title="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--brand-primary)" }}>
                A goal from your coach
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-text)", marginTop: 3 }}>
                {METRIC_LABEL[g.metric]} {g.targetValue} {UNITS[g.metric]} by{" "}
                {new Date(`${g.targetDate}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--brand-text-secondary)" }}>
                Nothing starts tracking until you say yes — and no is a real answer. If it&rsquo;s not the right
                number or not the right time, say so and he&rsquo;ll pick a different one.
              </p>
            </div>
          </div>
          {canAnswer && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => answer(g.id, "accept")} disabled={busyId === g.id}
                style={{ ...abtn, background: "var(--brand-primary)", color: "#fff" }}>
                {busyId === g.id ? "…" : "I'm in"}
              </button>
              <button onClick={() => answer(g.id, "decline")} disabled={busyId === g.id}
                style={{ ...abtn, background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                Not for me
              </button>
            </div>
          )}
        </div>
      ))}

      {active.map((g) => {
        const readings = readingsByMetric[g.metric] || [];
        if (!readings.length) return null;
        return (
          <GoalCard
            key={g.id}
            goal={g}
            readings={readings}
            today={today}
            onAdjust={canSet ? () => setSheet({ metric: g.metric, existing: { id: g.id, targetValue: g.targetValue, targetDate: g.targetDate } }) : undefined}
          />
        );
      })}

      {/* ADDING A SECOND GOAL.

          Dustin, 17 Aug: "i dont see an option to add goals anywhere in my
          client app."

          He was right, and it was not the Client View mount from 2254450 — it
          was this. The invitation below is gated on `!active.length &&
          !proposed.length`, so the moment you have ONE goal of any kind the
          only way to make another disappears, permanently. The feature carries
          three metrics and the UI could only ever set the first one.

          He has 23 weight readings, 20 body fat and 19 lean mass, and one
          active weight goal — so two of the three metrics were unreachable for
          him personally, with no control on screen to say so.

          Same rule as the big invitation: only metrics with readings are
          offered. Asking somebody to pick a lean mass target when they have
          never had lean mass measured is asking them to guess. */}
      {/* AND WITH NO GOALS AT ALL, TOO.
          Dustin, 22 Aug: "we need to be able to set bf goals."
          He could not, and the reason was this gate. These chips were shown
          only once at least one goal existed, and the big invitation below —
          the ONLY control on the screen before that — hard-codes
          metric: "weight". So the first goal anybody sets can only ever be a
          weight goal, and body fat is reachable only as a second one. Somebody
          who wants to track body fat and not weight had no way in at all.
          Weight is left out of the chips while the invitation is showing, so
          there is one way to do each thing rather than two. */}
      {canSet && (() => {
        const taken = new Set(goals.map((g) => g.metric));
        const invitationShowing =
          !active.length && !proposed.length && (readingsByMetric.weight || []).length > 0;
        const free = (["weight", "body_fat_pct", "lean_mass"] as GoalMetric[])
          .filter((m) => !taken.has(m) && (readingsByMetric[m] || []).length > 0)
          .filter((m) => !(invitationShowing && m === "weight"));
        if (!free.length) return null;
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {free.map((m) => (
              <button
                key={m}
                onClick={() => setSheet({ metric: m, existing: null })}
                style={{
                  flex: "1 1 auto", minHeight: 44, padding: "11px 13px", borderRadius: 12,
                  background: "var(--brand-surface)", border: "1px dashed var(--brand-border)",
                  color: "var(--brand-text)", fontSize: 12.5, fontWeight: 800, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 7, justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                {METRIC_LABEL[m]} goal
              </button>
            ))}
          </div>
        );
      })()}

      {/* The invitation, shown only when there is history to hang a goal on.
          Asking somebody with no weigh-ins to pick a target is asking them to
          guess, and the weigh-in nudge above is already the better ask. */}
      {canSet && !active.length && !proposed.length && (readingsByMetric.weight || []).length > 0 && (
        <button
          onClick={() => setSheet({ metric: "weight", existing: null })}
          style={{
            width: "100%", textAlign: "left", background: "var(--brand-surface)",
            border: "1px dashed var(--brand-border)", borderRadius: 16, padding: 14, cursor: "pointer",
            display: "flex", gap: 11, alignItems: "center",
          }}
        >
          <AiBadge size={26} mood="plan" title="" />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--brand-text)" }}>
              Set a goal
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
              A number and a date, and this screen starts answering whether you&rsquo;re going to get there.
            </span>
          </span>
          <span style={{ fontSize: 18, color: "var(--brand-text-secondary)" }}>›</span>
        </button>
      )}

      {sheet && (
        <GoalSetSheet
          clientId={clientId}
          metric={sheet.metric}
          readings={readingsByMetric[sheet.metric] || []}
          today={today}
          existing={sheet.existing}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); router.refresh(); }}
        />
      )}
    </>
  );
}

const abtn: React.CSSProperties = {
  flex: 1, fontSize: 12.5, fontWeight: 800, padding: "11px 8px", borderRadius: 11,
  border: "none", minHeight: 44, cursor: "pointer",
};
