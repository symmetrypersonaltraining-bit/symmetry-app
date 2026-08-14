// THE GOAL, AS THE COACH SEES IT.
//
// Dustin, approving the goals mock-up: "make sure the AI bot in the progress
// tab is able to understand and read all of this as well."
//
// The rule this file exists to keep is the same one lib/goals.ts exists for:
// THE CARD AND THE COACH MUST BE INCAPABLE OF DISAGREEING. So the coach is not
// handed the raw weigh-ins to do its own arithmetic on — it is handed the
// OUTPUT of analyseGoal(), the identical object the card renders from. If the
// chip says "behind" and the coach says "you're on track", the client has no
// way to tell which one to believe and stops trusting both.
//
// A model asked to work out a rate from a list of dates will get it right most
// of the time, and the times it does not are the times somebody is standing in
// a gym reading it. There is no version of that trade worth taking when the
// number is already computed two files away.

import { analyseGoal, kcalPerDayFor, UNITS, METRIC_LABEL, STALL_DAYS, type Goal, type GoalMetric, type Reading } from "@/lib/goals";
import type { Db } from "@/lib/ai/scope";

const COLUMN: Record<GoalMetric, string> = {
  weight: "weight",
  body_fat_pct: "body_fat_pct",
  lean_mass: "lean_mass",
};

/**
 * A plain-English block describing every running goal, or null when there are
 * none. Null rather than "no goals" so the caller can leave the line out
 * entirely — an absent goal is not a fact worth spending context on.
 *
 * Never throws. A goal block failing must not take the coach card down; the
 * coach without goals is the coach as it was last week, which is fine.
 */
export async function goalContextBlock(db: Db, clientId: string, today: string): Promise<string | null> {
  try {
    const [{ data: g }, { data: m }] = await Promise.all([
      db
        .from("client_goals")
        .select("id, metric, target_value, target_date, start_value, start_date, set_by, status, note")
        .eq("client_id", clientId)
        .in("status", ["proposed", "active"])
        .order("created_at", { ascending: true }),
      db
        .from("metrics")
        .select("metric_date, weight, body_fat_pct, lean_mass")
        .eq("client_id", clientId)
        .order("metric_date", { ascending: true })
        .limit(400),
    ]);

    const goals = ((g as Record<string, unknown>[] | null) || []).map((r) => ({
      goal: {
        id: String(r.id),
        metric: r.metric as GoalMetric,
        targetValue: Number(r.target_value),
        targetDate: String(r.target_date),
        startValue: r.start_value == null ? null : Number(r.start_value),
        startDate: r.start_date == null ? null : String(r.start_date),
        setBy: r.set_by as "trainer" | "client",
        status: r.status as Goal["status"],
      } as Goal,
      note: r.note == null ? null : String(r.note),
    }));
    if (!goals.length) return null;

    const rows = (m as Record<string, unknown>[] | null) || [];
    const readingsFor = (metric: GoalMetric): Reading[] =>
      rows
        .filter((r) => r[COLUMN[metric]] != null)
        .map((r) => ({ date: String(r.metric_date), value: Number(r[COLUMN[metric]]) }));

    const out: string[] = [];
    for (const { goal, note } of goals) {
      const unit = UNITS[goal.metric];
      const label = METRIC_LABEL[goal.metric];
      const who = goal.setBy === "trainer" ? "set by their coach" : "set by the client themselves";

      if (goal.status === "proposed") {
        out.push(
          `GOAL AWAITING THEIR ANSWER (${who}): ${label} ${goal.targetValue} ${unit} by ${goal.targetDate}.` +
            (note ? ` Coach's note: "${note}".` : "") +
            ` They have not accepted or declined it yet. If they bring it up, help them think about whether it is right for them — a goal they did not agree to is not a goal. They are allowed to say no or to counter with a different number.`,
        );
        continue;
      }

      const a = analyseGoal(goal, readingsFor(goal.metric), today);
      if (!a) {
        out.push(`ACTIVE GOAL (${who}): ${label} ${goal.targetValue} ${unit} by ${goal.targetDate}. No readings on file yet, so there is nothing to say about pace — ask them for a first weigh-in.`);
        continue;
      }

      // Everything below is READ OFF the analysis. Nothing is recomputed, and
      // the model is told in as many words not to recompute it either.
      const bits: string[] = [
        `ACTIVE GOAL (${who}): ${label} — target ${goal.targetValue} ${unit} by ${goal.targetDate}.`,
        `Started at ${a.start} ${unit}, currently ${a.now} ${unit} (${a.percent}% of the way there, ${Math.max(0, a.remaining)} ${unit} to go, ${a.weeksLeft} weeks left).`,
      ];

      if (a.status === "hit") {
        bits.push(`THEY HAVE REACHED IT. Say so first, before anything else. This is the moment, not a footnote.`);
      } else if (a.thin) {
        bits.push(
          `NOT ENOUGH DATA TO PROJECT: only ${readingsFor(goal.metric).length} reading(s), or less than a month of span. Do NOT state or imply a finish date, an arrival, or a rate — say plainly that a few more weigh-ins would let you tell them where this lands, and ask for one.`,
        );
      } else {
        bits.push(
          `Recent rate (last six weeks): ${a.rate} ${unit} per week. To arrive on time from today they need ${a.needRate} ${unit} per week.`,
        );
        if (a.flatDays >= STALL_DAYS) {
          bits.push(
            `STALLED: the number has not moved in ${a.flatDays} days. Both things are true and BOTH must be said — the six-week trend would land them at ${a.trendProjected} ${unit}, but a fortnight of no movement is evidence the trend has stopped, so today the honest read is flat. Do not pick one and hide the other, and do not lead with the flattering one.`,
          );
        } else if (a.projected != null) {
          bits.push(`At the current rate they land at ${a.projected} ${unit} on ${goal.targetDate}${a.arrivesOn ? `, reaching the target around ${a.arrivesOn}` : ""}.`);
        }
        if (a.status === "behind" && goal.metric === "weight" && Number.isFinite(a.needRate) && a.rate != null) {
          const gap = Math.abs(a.needRate) - Math.abs(a.rate);
          if (gap > 0.05) {
            bits.push(
              `IF THEY ASK WHAT TO CHANGE: closing that gap is worth roughly ${kcalPerDayFor(gap)} kcal a day, or the equivalent in activity. Offer it as "roughly" — 3,500 kcal per pound is a rule of thumb, not physiology — and offer ONE change, not a list.`,
            );
          }
        }
      }

      if (a.daysSinceLastReading >= 10) {
        bits.push(`Their last reading was ${a.daysSinceLastReading} days ago, so every number above is that stale. Mention it if you lean on the projection.`);
      }
      if (note) bits.push(`Coach's note on this goal: "${note}".`);
      out.push(bits.join(" "));
    }

    return [
      "GOALS — these numbers are already computed and are the SAME ones on the client's Progress screen. Use them verbatim. Do NOT recalculate a rate, a projection or a finish date from the weigh-in list: if you say something different from the card in front of them, they stop believing both.",
      ...out,
      "Talk about a goal the way a coach would — one honest sentence about where they are, and at most one specific thing to do about it. Never a lecture, never a list of five fixes, and never a cheerful projection you were told not to make.",
    ].join("\n");
  } catch {
    return null; // a goal block must never take the coach down
  }
}
