// GET/POST /api/cron/goals — roll forward any goal whose date has arrived.
//
// Dustin: "rolls forward at the pace actually achieved; the old attempt stays
// visible. Nothing framed as a failure, nothing hidden."
//
// WHY THIS IS A CRON AND NOT LAZY-ON-READ.
//
// The obvious cheap version is to roll the goal the next time somebody opens
// Progress. It is wrong for the reason most lazy migrations are wrong: the
// client who needs this most is the one who has stopped opening the app. Their
// goal would sit expired for a fortnight and then roll the moment they finally
// looked — so the first thing they see after a hard fortnight is the app
// noticing their date went by. Rolling it on the day means that by the time
// they come back it is simply a goal with a date in the future, which is what
// it should have been all along.
//
// It also keeps the write off the read path. A server component that writes is
// a server component that can fail a page render.
//
// Safe to run repeatedly: a goal is only rolled when its date has PASSED and it
// is still 'active', and the roll flips it to 'rolled' in the same pass. A
// second run the same hour finds nothing to do.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron-auth";
import { planRollForward } from "@/lib/goalRollForward";
import type { Goal, GoalMetric, Reading } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const COLUMN: Record<GoalMetric, string> = {
  weight: "weight",
  body_fat_pct: "body_fat_pct",
  lean_mass: "lean_mass",
};

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createAdminClient();
  const today = CT_TODAY();
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const { data: due } = await db
    .from("client_goals")
    .select("id, client_id, metric, target_value, target_date, start_value, start_date, set_by, status, note")
    .eq("status", "active")
    .lt("target_date", today)
    .limit(200);

  const rows = (due as Record<string, unknown>[] | null) || [];
  const rolled: { goalId: string; to: string; fromPace: boolean }[] = [];
  const reached: string[] = [];
  const skipped: { goalId: string; why: string }[] = [];

  for (const r of rows) {
    const goal: Goal = {
      id: String(r.id),
      metric: r.metric as GoalMetric,
      targetValue: Number(r.target_value),
      targetDate: String(r.target_date),
      startValue: r.start_value == null ? null : Number(r.start_value),
      startDate: r.start_date == null ? null : String(r.start_date),
      setBy: r.set_by as "trainer" | "client",
      status: "active",
    };
    const clientId = String(r.client_id);

    const { data: m } = await db
      .from("metrics")
      .select(`metric_date, ${COLUMN[goal.metric]}`)
      .eq("client_id", clientId)
      .not(COLUMN[goal.metric], "is", null)
      .order("metric_date", { ascending: true })
      .limit(400);
    const readings: Reading[] = ((m as Record<string, unknown>[] | null) || []).map((x) => ({
      date: String(x.metric_date),
      value: Number(x[COLUMN[goal.metric]]),
    }));

    const plan = planRollForward(goal, readings, today);
    if (!plan) {
      // Either they reached it — which is a celebration, and the goal is closed
      // as HIT rather than rolled — or there is nothing to go on at all.
      if (readings.length) {
        const last = readings[readings.length - 1].value;
        const goingDown = (goal.startValue ?? last) >= goal.targetValue;
        const there = goingDown ? last <= goal.targetValue : last >= goal.targetValue;
        if (there) {
          reached.push(goal.id);
          if (!dry) {
            await db.from("client_goals").update({
              status: "hit", achieved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq("id", goal.id);
          }
          continue;
        }
      }
      skipped.push({ goalId: goal.id, why: readings.length ? "no plan produced" : "no readings" });
      continue;
    }

    if (!dry) {
      // The new goal FIRST. The partial unique index allows only one running
      // goal per metric, so the old one has to stop being active before the new
      // one can exist — but doing it in that order would leave a client with no
      // goal at all if the insert then failed. So: retire, insert, link. If the
      // insert dies, they are left with a 'rolled' row and no active goal,
      // which the next pass cannot fix — hence the link-back write is last and
      // the failure is logged loudly rather than swallowed.
      const { error: retireErr } = await db.from("client_goals").update({
        status: "rolled", updated_at: new Date().toISOString(),
      }).eq("id", goal.id).eq("status", "active");
      if (retireErr) { skipped.push({ goalId: goal.id, why: retireErr.message }); continue; }

      const { data: created, error: insErr } = await db.from("client_goals").insert({
        client_id: clientId,
        metric: goal.metric,
        target_value: goal.targetValue,
        target_date: plan.targetDate,
        start_value: plan.startValue,
        start_date: plan.startDate,
        set_by: goal.setBy,
        // A rolled goal is NOT re-proposed. They already agreed to this number;
        // making them accept it again every time a date slips would turn the
        // feature into paperwork.
        status: "active",
        accepted_at: new Date().toISOString(),
        rolled_from_id: goal.id,
        note: plan.note,
      }).select("id").single();

      if (insErr || !created) {
        console.error("cron/goals: retired a goal but could not create its successor", goal.id, insErr);
        skipped.push({ goalId: goal.id, why: insErr?.message || "insert failed" });
        continue;
      }
      await db.from("client_goals").update({ rolled_to_id: (created as { id: string }).id }).eq("id", goal.id);
    }

    rolled.push({ goalId: goal.id, to: plan.targetDate, fromPace: plan.fromPace });
  }

  return NextResponse.json({ ok: true, today, dry, due: rows.length, rolled, reached, skipped });
}
