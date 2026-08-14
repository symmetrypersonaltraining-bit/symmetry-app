// POST /api/goals — set, accept, decline, adjust or close a goal.
//
// Four decisions Dustin made in the mock-up round, and this route is where
// three of them become rules rather than intentions:
//
//   WHO SETS   both — and his are visible AS his, and are REFUSABLE. A goal the
//              client did not agree to is not a goal; it is a number somebody
//              else picked, and the app should not pretend otherwise. So a
//              trainer-set goal lands as 'proposed' and does nothing until the
//              client says yes. A client setting their own is active at once —
//              there is nobody for them to be waiting on.
//
//   REFUSABLE  'declined' is kept, not deleted. "He suggested 138 and I said
//              that was too aggressive" is exactly the conversation worth still
//              being able to have in three months.
//
//   START      start_value and start_date are STORED, not derived. Computing
//              the start as "the earliest weigh-in before the goal" breaks the
//              moment somebody backfills or corrects an old weight: the goal
//              silently re-anchors and the progress meter jumps with nothing to
//              explain why. Where a person started is a fact about the day the
//              goal was set.
//
// Writes go through the service-role client because a trainer proposing a goal
// is writing a row scoped to somebody else's client id. Every write below is
// still checked against the caller's own identity first.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrainerEmail } from "@/lib/trainer";
import type { GoalMetric } from "@/lib/goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const METRICS: GoalMetric[] = ["weight", "body_fat_pct", "lean_mass"];
const COLUMN: Record<GoalMetric, string> = {
  weight: "weight",
  body_fat_pct: "body_fat_pct",
  lean_mass: "lean_mass",
};

/**
 * Bounds, so a typo cannot store a goal the rest of the app then has to render.
 * Deliberately generous — these exist to catch 1850 lb and 2027-01-01 typed as
 * 2207, not to have an opinion about anybody's target.
 */
const LIMITS: Record<GoalMetric, [number, number]> = {
  weight: [60, 600],
  body_fat_pct: [3, 60],
  lean_mass: [40, 400],
};
const MAX_HORIZON_DAYS = 730;
const MIN_HORIZON_DAYS = 7;

const DAY = 86_400_000;
const ms = (d: string) => new Date(`${d}T12:00:00`).getTime();

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: {
      action?: string;
      goalId?: string;
      clientId?: string;
      metric?: string;
      targetValue?: number;
      targetDate?: string;
      note?: string;
    };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

    const isTrainer = isTrainerEmail(user.email);

    // Who the caller is as a client. Never taken from the body.
    let ownClientId: string | null = null;
    {
      const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
      ownClientId = (c as { id: string } | null)?.id ?? null;
      if (!ownClientId && user.email) {
        const { data: c2 } = await sb.from("clients").select("id").eq("email", user.email).maybeSingle();
        ownClientId = (c2 as { id: string } | null)?.id ?? null;
      }
    }

    const admin = createAdminClient();
    const today = CT_TODAY();
    const action = String(body.action || "set");

    // ── the three that operate on an existing goal ────────────────────────────
    if (action === "accept" || action === "decline" || action === "close" || action === "adjust") {
      if (!body.goalId) return NextResponse.json({ error: "Missing goalId" }, { status: 400 });
      const { data: g } = await admin
        .from("client_goals")
        .select("id, client_id, metric, status, set_by, target_value, target_date, note")
        .eq("id", body.goalId)
        .maybeSingle();
      const goal = g as {
        id: string; client_id: string; metric: GoalMetric; status: string;
        set_by: string; target_value: number; target_date: string; note: string | null;
      } | null;
      if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      if (!isTrainer && goal.client_id !== ownClientId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (action === "accept" || action === "decline") {
        // ONLY the client may answer a proposal. A trainer accepting on their
        // behalf would make "they agreed to this" mean nothing, which is the
        // one thing the proposed state exists to protect.
        if (goal.client_id !== ownClientId) {
          return NextResponse.json({ error: "Only the client can answer their own goal" }, { status: 403 });
        }
        if (goal.status !== "proposed") {
          return NextResponse.json({ error: "That goal is not waiting on an answer" }, { status: 409 });
        }
        const patch = action === "accept"
          ? { status: "active", accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          : { status: "declined", updated_at: new Date().toISOString() };
        const { error } = await admin.from("client_goals").update(patch).eq("id", goal.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, status: patch.status });
      }

      if (action === "close") {
        const { error } = await admin
          .from("client_goals")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("id", goal.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, status: "closed" });
      }

      // adjust — change the number or the date on a running goal.
      const metric = goal.metric;
      const tv = Number(body.targetValue ?? goal.target_value);
      const td = String(body.targetDate || goal.target_date);
      const bad = validate(metric, tv, td, today);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });

      // The previous numbers are appended rather than overwritten, so the card
      // can still answer "what did this used to say" without a second table.
      const trail = `${goal.note ? goal.note + "\n" : ""}${today}: was ${goal.target_value} by ${goal.target_date}.`;

      // A trainer changing a CLIENT's goal makes it a proposal again — same
      // reason it was a proposal the first time. A client changing their own
      // stays active.
      const becomesProposed = isTrainer && goal.client_id !== ownClientId;
      const { error } = await admin.from("client_goals").update({
        target_value: tv,
        target_date: td,
        note: trail.slice(0, 2000),
        status: becomesProposed ? "proposed" : goal.status,
        set_by: becomesProposed ? "trainer" : goal.set_by,
        accepted_at: becomesProposed ? null : undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", goal.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: becomesProposed ? "proposed" : goal.status });
    }

    // ── set: a brand-new goal ────────────────────────────────────────────────
    const clientId = body.clientId && isTrainer ? String(body.clientId) : ownClientId;
    if (!clientId) return NextResponse.json({ error: "No client profile" }, { status: 400 });
    if (!isTrainer && body.clientId && body.clientId !== ownClientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metric = String(body.metric || "weight") as GoalMetric;
    if (!METRICS.includes(metric)) return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
    const targetValue = Number(body.targetValue);
    const targetDate = String(body.targetDate || "");
    const bad = validate(metric, targetValue, targetDate, today);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    // One running goal per metric is enforced by the database (uq_client_goal_
    // one_active_per_metric). Checking here as well turns a 23505 into a
    // sentence somebody can act on.
    const { data: existing } = await admin
      .from("client_goals")
      .select("id, status")
      .eq("client_id", clientId)
      .eq("metric", metric)
      .in("status", ["proposed", "active"])
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "There's already a goal running for that. Adjust it instead of adding a second one.", goalId: (existing as { id: string }).id },
        { status: 409 },
      );
    }

    // Where they are today, stored rather than derived. See the header.
    const { data: m } = await admin
      .from("metrics")
      .select(`metric_date, ${COLUMN[metric]}`)
      .eq("client_id", clientId)
      .not(COLUMN[metric], "is", null)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latest = m as Record<string, unknown> | null;
    const startValue = latest ? Number(latest[COLUMN[metric]]) : null;

    const settingForSomeoneElse = isTrainer && clientId !== ownClientId;
    const { data: created, error } = await admin.from("client_goals").insert({
      client_id: clientId,
      metric,
      target_value: targetValue,
      target_date: targetDate,
      start_value: startValue,
      start_date: today,
      set_by: settingForSomeoneElse ? "trainer" : "client",
      // Refusable when it came from somebody else; live immediately when it is
      // their own. Nobody has to accept their own idea.
      status: settingForSomeoneElse ? "proposed" : "active",
      accepted_at: settingForSomeoneElse ? null : new Date().toISOString(),
      note: body.note ? String(body.note).slice(0, 500) : null,
    }).select("id, status").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, goal: created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed" }, { status: 500 });
  }
}

/** Null when fine, otherwise the sentence to show. */
function validate(metric: GoalMetric, value: number, date: string, today: string): string | null {
  if (!Number.isFinite(value)) return "That target doesn't look like a number.";
  const [lo, hi] = LIMITS[metric];
  if (value < lo || value > hi) return `A ${metric.replace(/_/g, " ")} target should be between ${lo} and ${hi}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "That date doesn't look right.";
  const days = (ms(date) - ms(today)) / DAY;
  if (days < MIN_HORIZON_DAYS) return "Give it at least a week — anything shorter is a weigh-in, not a goal.";
  if (days > MAX_HORIZON_DAYS) return "That's more than two years out. Pick something closer and roll it forward.";
  return null;
}
