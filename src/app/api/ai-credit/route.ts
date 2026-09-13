// GET  /api/ai-credit  → what is left, and whether the account has already run out
// POST /api/ai-credit  → record a top-up { amount_usd, note? }
//
// Trainer only. See lib/ai/creditHealth.ts for why there are two signals and
// why only one of them is an estimate.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { creditHealth, type SpendRow, type TopUp } from "@/lib/ai/creditHealth";
import { fetchAllRows } from "@/lib/fetchAllRows";

/**
 * `ai_credit_topups` was created by migration 20260913c and
 * src/lib/database.types.ts has not been regenerated since, so the generated
 * Database type does not know the table exists and every query against it is
 * a type error about a table that is really there.
 *
 * CLAUDE.md's rule for exactly this: "If the generated types are wrong about
 * the database, relax the one field and write down why." Relaxed here and
 * nowhere else — one narrow view of the admin client, used only for this
 * table. Delete it the next time the types are regenerated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedTable = { from: (t: string) => any };

/** Enough history for a burn rate that is not dominated by one heavy day. */
const WINDOW_DAYS = 14;

async function gate() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await viewerIsTrainer(supabase, user))) {
    return { ok: false as const, res: NextResponse.json({ error: "Trainers only" }, { status: 403 }) };
  }
  return { ok: true as const, user };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return g.res;

  try {
    const db = createAdminClient();

    const { data: topUpRows } = await (db as unknown as UntypedTable)
      .from("ai_credit_topups")
      .select("amount_usd, added_on")
      .order("added_on", { ascending: true });
    const topUps = (topUpRows || []) as TopUp[];

    // Spend is counted from the EARLIEST top-up, so credit left over from one
    // carries into the next instead of being forgotten. With nothing recorded
    // there is no baseline, and the window is only there for the burn rate.
    const since = topUps.length
      ? topUps[0].added_on
      : new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

    // PAGED, not `.limit(20000)`. PostgREST caps a response at 1,000 rows and
    // silently drops the rest — a limit above that is a comment shaped like a
    // bound, and here it would quietly understate the spend, which is the one
    // number this card exists to get right. A guard test catches it.
    const spendRows = await fetchAllRows<SpendRow>(
      // ORDERED, because paging an unordered query can hand back the same row
      // twice and skip another — which would silently overstate or understate
      // the spend. A guard test catches an unordered call site.
      () => db.from("ai_usage_log").select("model, tokens_in, tokens_out")
        .gte("used_on", since).order("created_at", { ascending: true }),
      { label: "ai-credit spend" },
    );

    // The provider's own refusal, most recent first. Exact, and independent of
    // anything he has or has not written down.
    const { data: failRows } = await db
      .from("ai_usage_log")
      .select("created_at, feature, error")
      .not("error", "is", null)
      .neq("error", "")
      .order("created_at", { ascending: false })
      .limit(1);
    const last = failRows?.[0];

    // ── WHAT DISPROVES THAT REFUSAL ─────────────────────────────────────────
    //
    // Dustin, 5:33pm: "I added but the notification won't clear." Until now the
    // only thing that cleared an outage was the refusal ageing out over six
    // hours, so the "I added credit — record it" button wrote a row nothing
    // read and the red banner sat there telling him to fix what he had fixed.
    //
    // A call that SUCCEEDED since is proof the key works; a top-up recorded
    // since is his own statement that he has dealt with it. See creditHealth.ts
    // for why believing him is safe — if he is wrong the next call fails and
    // the banner is back immediately.
    const { data: okRows } = await db
      .from("ai_usage_log")
      .select("created_at")
      .or("error.is.null,error.eq.")
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: lastTopUpRows } = await (db as unknown as UntypedTable)
      .from("ai_credit_topups")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastTopUpAt = (lastTopUpRows?.[0]?.created_at as string | undefined) ?? null;

    const days = Math.max(
      1,
      Math.round((Date.now() - Date.parse(`${since}T00:00:00Z`)) / 86400000),
    );

    return NextResponse.json({
      ...creditHealth({
        topUps,
        spend: spendRows,
        windowDays: Math.min(days, WINDOW_DAYS * 4),
        lastFailure: last
          ? { at: String(last.created_at), feature: last.feature ?? null, error: last.error ?? null }
          : null,
        lastSuccessAt: okRows?.[0]?.created_at ? String(okRows[0].created_at) : null,
        lastTopUpAt,
      }),
      since,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-credit failed:", msg);
    return NextResponse.json({ error: "Could not read the AI balance" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount_usd);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: "Give the amount you added, in dollars." }, { status: 400 });
  }

  const { error } = await (createAdminClient() as unknown as UntypedTable)
    .from("ai_credit_topups")
    .insert({
    amount_usd: Math.round(amount * 100) / 100,
    note: typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null,
    added_by: g.user.id,
  });
  // Read the result. supabase-js RESOLVES with { error } rather than throwing,
  // so a bare try/catch around this would report a failed write as a success —
  // the exact shape that let the audit log sit empty for a day.
  if (error) {
    console.error("ai-credit topup insert failed:", error.message);
    return NextResponse.json({ error: "Could not save that — try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
