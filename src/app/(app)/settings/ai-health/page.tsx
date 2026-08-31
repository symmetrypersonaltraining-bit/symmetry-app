// /settings/ai-health — is the AI actually working?
//
// The audit that started this build could not be done from inside the app. Five
// labels covered twenty-three routes, failures were not recorded at all, and the
// only way to learn that the trainer agent had run exactly once in its entire
// life was to open a SQL console. Meanwhile a route could be dead for a week and
// look completely fine from the outside, because every AI surface in this app
// degrades quietly on purpose — a celebration that cannot reach the model shows
// its written headline, a coach card that fails just does not appear.
//
// That graceful degradation is right, and it is exactly why this page has to
// exist. Silence is the failure mode. So the page leads with the two things
// that silence hides:
//
//   NEVER USED   — a surface with no successful call ever. Either nobody has
//                  found it, or it is broken in a way nothing reports.
//   FAILING      — a surface whose recent calls are erroring.
//
// Everything else is context: spend against the $95 kill switch, and when each
// surface last actually worked.
//
// Trainer only, and read-only. Nothing here changes anything.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/serverUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { trainerForAuthUser } from "@/lib/trainerResolve";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { AI_FEATURES, AI_FEATURE_KEYS, MONTHLY_COST_CAP_USD, type AiFeature } from "@/lib/ai/meter-core";
import AiHealthTable, { type FeatureHealth } from "./AiHealthTable";

export const dynamic = "force-dynamic";

interface LogRow {
  feature: string;
  status: string | null;
  cost_usd: number | string | null;
  created_at: string;
  model: string | null;
  latency_ms: number | null;
  error: string | null;
}

export default async function AiHealthPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  // EVERY TRAINER GETS THIS PAGE. IT SHOWS THEM THEIR OWN.
  //
  // It was gated as "trainer" and then read with the SERVICE ROLE, so a coach
  // hired on Monday could read the whole business's AI costs on Tuesday. The
  // fix for that was owner-only, which was the wrong fix: silence IS the
  // failure mode for every AI surface in this app, so a trainer with no health
  // page cannot tell a feature nobody uses from a feature that is broken for
  // their clients — the exact blindness this page was built to end.
  //
  // So: the HEALTH of every surface, scoped to the viewer's own clients. The
  // month-to-date SPEND against the kill switch stays owner-only, because
  // there is one API key and one cap and it is the business's number, not a
  // per-coach one.
  const me = await trainerForAuthUser(supabase as never, user.id, user.email ?? null);
  const isOwner = !!me?.isOwner;

  const db = createAdminClient();

  // 60 days is enough to tell "nobody has used this in a while" from "this has
  // never worked", without pulling the whole table onto a phone.
  //
  // AGGREGATED IN THE DATABASE, not here. This used to select 5,000 log lines
  // and group them in JS — but PostgREST caps a read at 1,000 rows whatever
  // .limit() asks for, and the 60-day window held 1,365 on 24 Aug. So the page
  // whose entire job is to tell a working surface from a dead one was itself
  // computing "never used" and "last worked" from a truncated log. Same fault
  // that made the dashboard claim nine clients had lost their programming.
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await db.rpc("ai_feature_health", {
    p_since: since,
    p_trainer: isOwner ? null : (me?.id ?? "00000000-0000-0000-0000-000000000000"),
  });

  interface HealthRow {
    feature: string; calls: number; failures: number; recent_failed: number;
    last_ok: string | null; last_error_at: string | null; last_error_text: string | null;
    model: string | null; usd: number | string | null; median_ms: number | null;
    month_usd: number | string | null;
  }
  const byFeature = new Map<string, HealthRow>();
  let monthUsd = 0;
  for (const r of ((data as HealthRow[] | null) ?? [])) {
    byFeature.set(r.feature, r);
    monthUsd += Number(r.month_usd) || 0;
  }

  const health: FeatureHealth[] = AI_FEATURE_KEYS.map((key: AiFeature) => {
    const spec = AI_FEATURES[key];
    const r = byFeature.get(key);
    return {
      key,
      label: spec.label,
      surface: spec.surface,
      dailyLimit: spec.defaultLimit,
      dormant: "dormant" in spec && spec.dormant === true,
      calls: Number(r?.calls ?? 0),
      failures: Number(r?.failures ?? 0),
      recentFailed: Number(r?.recent_failed ?? 0),
      lastOk: r?.last_ok ?? null,
      lastErrorAt: r?.last_error_at ?? null,
      lastErrorText: r?.last_error_text ?? null,
      model: r?.model ?? null,
      usd: Math.round((Number(r?.usd) || 0) * 100) / 100,
      medianMs: r?.median_ms ?? null,
    };
  });

  return (
    <div className="p-4 lg:p-6">
      <AiHealthTable
        features={health}
        monthUsd={isOwner ? Math.round(monthUsd * 100) / 100 : null}
        capUsd={MONTHLY_COST_CAP_USD}
        windowDays={60}
        scope={isOwner ? "instance" : "mine"}
      />
    </div>
  );
}
