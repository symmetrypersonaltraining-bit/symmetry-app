import { createClient } from "@/lib/supabase/server";
import GoalCard from "@/components/GoalCard";
import WeighInNudge from "@/components/WeighInNudge";
import { WEIGH_IN_NUDGE_DAYS, type Goal, type GoalMetric, type Reading } from "@/lib/goals";

// GOALS ON PROGRESS — the mount point, and nothing else.
//
// Dustin, on the whole feature: "just make sure we run this carefully and do
// not mess up the functionality of any of the charts or features visually on
// the charts."
//
// So this is ADDITIVE, and deliberately shaped to make that true rather than
// merely intended. It is a new component that renders above the existing ones;
// the only edit to an existing file is three lines in progress/page.tsx
// mounting it. No existing chart component is touched, so no existing chart can
// regress — the blast radius of the entire feature is this file and the two it
// imports.
//
// It also fails quietly. A client with no goal, or a query that errors, renders
// NOTHING and the Progress screen looks exactly as it did yesterday. A progress
// screen that breaks because a new optional feature failed would be a bad trade
// for a card that not everybody has yet.

const METRICS: GoalMetric[] = ["weight", "body_fat_pct", "lean_mass"];

/** The metrics column each goal reads its history from. */
const COLUMN: Record<GoalMetric, string> = {
  weight: "weight",
  body_fat_pct: "body_fat_pct",
  lean_mass: "lean_mass",
};

export default async function GoalsSection({ clientId }: { clientId: string }) {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  let goals: Goal[] = [];
  let rows: Record<string, unknown>[] = [];
  try {
    const [{ data: g }, { data: m }] = await Promise.all([
      supabase
        .from("client_goals")
        .select("id, metric, target_value, target_date, start_value, start_date, set_by, status")
        .eq("client_id", clientId)
        .in("status", ["proposed", "active"])
        .order("created_at", { ascending: true }),
      supabase
        .from("metrics")
        .select("metric_date, weight, body_fat_pct, lean_mass")
        .eq("client_id", clientId)
        .order("metric_date", { ascending: true })
        .limit(400),
    ]);
    goals = ((g as Record<string, unknown>[] | null) || []).map((r) => ({
      id: String(r.id),
      metric: r.metric as GoalMetric,
      targetValue: Number(r.target_value),
      targetDate: String(r.target_date),
      startValue: r.start_value == null ? null : Number(r.start_value),
      startDate: r.start_date == null ? null : String(r.start_date),
      setBy: r.set_by as "trainer" | "client",
      status: r.status as Goal["status"],
    }));
    rows = (m as Record<string, unknown>[] | null) || [];
  } catch {
    return null; // never take the screen down for this
  }

  const readingsFor = (metric: GoalMetric): Reading[] =>
    rows
      .filter((r) => r[COLUMN[metric]] != null)
      .map((r) => ({ date: String(r.metric_date), value: Number(r[COLUMN[metric]]) }));

  // The nudge is measured off ANY weigh-in, not off the goal's own metric.
  // Somebody who logged body fat on Tuesday has stood on a scale; asking them
  // again on Thursday because their weight goal has no reading since Monday is
  // the app not paying attention.
  const lastAny = rows.length ? String(rows[rows.length - 1].metric_date) : null;
  const daysSince = lastAny
    ? Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${lastAny}T12:00:00`).getTime()) / 86_400_000)
    : null;

  const active = goals.filter((g) => g.status === "active" && readingsFor(g.metric).length > 0);
  const showNudge = daysSince == null || daysSince > WEIGH_IN_NUDGE_DAYS;

  if (!active.length && !showNudge) return null;

  return (
    <div className="space-y-5">
      {showNudge && <WeighInNudge daysSince={daysSince} hasGoal={active.length > 0} />}
      {METRICS.flatMap((metric) => {
        const g = active.find((x) => x.metric === metric);
        if (!g) return [];
        return [<GoalCard key={g.id} goal={g} readings={readingsFor(metric)} today={today} />];
      })}
    </div>
  );
}
