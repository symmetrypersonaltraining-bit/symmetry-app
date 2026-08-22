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
import { getServerUser } from "@/lib/auth/serverUser";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  const db = createAdminClient();

  // 60 days is enough to tell "nobody has used this in a while" from "this has
  // never worked", without pulling the whole table onto a phone.
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await db
    .from("ai_usage_log")
    .select("feature, status, cost_usd, created_at, model, latency_ms, error")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data as LogRow[] | null) ?? [];

  // Month to date, in the same terms the kill switch uses.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  let monthUsd = 0;

  const byFeature = new Map<string, LogRow[]>();
  for (const r of rows) {
    const list = byFeature.get(r.feature);
    if (list) list.push(r);
    else byFeature.set(r.feature, [r]);
    if (Date.parse(r.created_at) >= monthStart.getTime()) monthUsd += Number(r.cost_usd) || 0;
  }

  const health: FeatureHealth[] = AI_FEATURE_KEYS.map((key: AiFeature) => {
    const spec = AI_FEATURES[key];
    const mine = byFeature.get(key) ?? [];
    const ok = mine.filter((r) => r.status !== "error");
    const failed = mine.filter((r) => r.status === "error");
    // "Recently" = the last ten calls. A surface that failed twice in March and
    // has worked every day since is not failing; one that has failed its last
    // three is, even if its lifetime count looks healthy.
    const recent = mine.slice(0, 10);
    const recentFailed = recent.filter((r) => r.status === "error").length;
    const lastOk = ok[0]?.created_at ?? null;
    const lastError = failed[0] ?? null;
    const usd = mine.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0);
    const latencies = ok.map((r) => r.latency_ms).filter((n): n is number => typeof n === "number");
    return {
      key,
      label: spec.label,
      surface: spec.surface,
      dailyLimit: spec.defaultLimit,
      dormant: "dormant" in spec && spec.dormant === true,
      calls: mine.length,
      failures: failed.length,
      recentFailed,
      lastOk,
      lastErrorAt: lastError?.created_at ?? null,
      lastErrorText: lastError?.error ?? null,
      model: ok[0]?.model ?? mine[0]?.model ?? null,
      usd: Math.round(usd * 100) / 100,
      medianMs: latencies.length
        ? latencies.slice().sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
        : null,
    };
  });

  return (
    <div className="p-4 lg:p-6">
      <AiHealthTable
        features={health}
        monthUsd={Math.round(monthUsd * 100) / 100}
        capUsd={MONTHLY_COST_CAP_USD}
        windowDays={60}
      />
    </div>
  );
}
