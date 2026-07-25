// GET /api/leaderboard?window=7|30
//
// Opt-in community leaderboard. Ranks CONSISTENCY — sessions logged in the
// window — never weight, never body composition, never volume. Someone new or
// smaller is never penalised for it; showing up is the only thing measured.
//
// Privacy:
//  - A client appears ONLY if client_app_settings.leaderboard_opt_in is true.
//    The column defaults to false, so this is opt-in, not opt-out.
//  - Only first names are ever returned. No ids, no emails, no last names.
//  - The caller is told their own rank even if they're outside the top list,
//    so opting in is never punishing.
//
// Auth-checked. Uses the admin client to read across clients, but returns only
// the minimal projection above.

import { NextRequest, NextResponse } from "next/server";
import { resolveAiScope, Db } from "@/lib/ai/scope";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  const meId = scoped.scope.clientId;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [], me: null, optedIn: false });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const win = req.nextUrl.searchParams.get("window") === "30" ? 30 : 7;
  const today = CT_TODAY();
  const since = shiftDays(today, -(win - 1));

  try {
    const { data: optRows } = await admin
      .from("client_app_settings")
      .select("client_id")
      .eq("leaderboard_opt_in", true);
    const ids = ((optRows as { client_id: string }[]) || []).map((r) => r.client_id);
    const optedIn = !!meId && ids.includes(meId);

    if (!ids.length) return NextResponse.json({ rows: [], me: null, optedIn, window: win });

    const [namesRes, logRes] = await Promise.all([
      admin.from("clients").select("id, name").in("id", ids),
      admin
        .from("workout_logs")
        .select("client_id, log_date")
        .in("client_id", ids)
        .eq("completed", true)
        .gte("log_date", since),
    ]);

    const names = new Map(
      ((namesRes.data as { id: string; name: string | null }[]) || []).map((c) => [c.id, (c.name || "").split(" ")[0] || "Member"]),
    );

    // Distinct DAYS trained, not raw log rows — two sessions in one day is one
    // day of consistency, and it stops duplicate logs from inflating a rank.
    const days = new Map<string, Set<string>>();
    for (const r of ((logRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!days.has(r.client_id)) days.set(r.client_id, new Set());
      days.get(r.client_id)!.add(r.log_date);
    }

    const ranked = ids
      .map((id) => ({ id, first: names.get(id) || "Member", sessions: days.get(id)?.size ?? 0 }))
      .sort((a, b) => b.sessions - a.sessions || a.first.localeCompare(b.first))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const me = meId ? ranked.find((r) => r.id === meId) ?? null : null;

    return NextResponse.json({
      window: win,
      optedIn,
      total: ranked.length,
      // Strip ids from the public list — first name + count + rank only.
      rows: ranked.slice(0, 20).map((r) => ({ first: r.first, sessions: r.sessions, rank: r.rank, isMe: r.id === meId })),
      me: me ? { rank: me.rank, sessions: me.sessions } : null,
    });
  } catch {
    return NextResponse.json({ rows: [], me: null, optedIn: false, window: win });
  }
}
