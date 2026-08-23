// GET /api/live-sessions
//
// Who is in the gym right now. (#77)
//
// TRAINER ONLY. An open workout_log — started, not completed — means someone is
// mid-session. That is already in the data; nothing new is written and the
// logger is not touched in any way to support this.
//
// Two honest limits, both handled rather than hidden:
//
//  1. A stale open log is NOT a live session. People abandon sessions without
//     hitting cancel, and those rows sit open forever. Anything older than
//     MAX_AGE_MIN is ignored, so the card can't claim someone has been squatting
//     since Tuesday.
//
//  2. "Started 40 minutes ago" is not the same as "actively lifting". The most
//     recent set on the log is a much better signal, so that is what drives the
//     live/idle split — a session with no set in the last 25 minutes is shown as
//     winding down rather than active.

import { NextResponse } from "next/server";
import { TRAINER_EMAIL, Db } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { rosterScopeFor, onRoster } from "@/lib/auth/roster";

export const dynamic = "force-dynamic";

const MAX_AGE_MIN = 180; // older than this is an abandoned row, not a session
const IDLE_MIN = 25; // no set logged in this long => winding down

export interface LiveRow {
  clientId: string;
  name: string;
  workout: string | null;
  startedMinutesAgo: number;
  lastSetMinutesAgo: number | null;
  sets: number;
  volume: number;
  active: boolean;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [] });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const now = Date.now();
  const cutoff = new Date(now - MAX_AGE_MIN * 60000).toISOString();

  try {
    const { data: open } = await admin
      .from("workout_logs")
      .select("id, client_id, started_at, day_id, days(label), clients(name, trainer_id)")
      .eq("completed", false)
      .not("started_at", "is", null)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false })
      .limit(30);

    // WHOSE clients are training. This board is read with the service role, so
    // without the roster filter every trainer watched every other trainer's
    // clients lift in real time.
    const scope = await rosterScopeFor(admin as never, user);
    const logs = ((open as Record<string, unknown>[]) || []).filter((l) => {
      const c = l.clients as { trainer_id?: string | null } | null;
      return onRoster(c, scope);
    });
    if (!logs.length) return NextResponse.json({ rows: [] });

    const ids = logs.map((l) => l.id as string);
    const { data: sets } = await admin
      .from("set_logs")
      .select("workout_log_id, weight_lbs, reps, completed, logged_at, created_at")
      .in("workout_log_id", ids)
      .eq("completed", true);

    const agg = new Map<string, { sets: number; volume: number; last: number | null }>();
    for (const s of ((sets as Record<string, unknown>[]) || [])) {
      const k = s.workout_log_id as string;
      if (!agg.has(k)) agg.set(k, { sets: 0, volume: 0, last: null });
      const a = agg.get(k)!;
      a.sets++;
      a.volume += (Number(s.weight_lbs) || 0) * (Number(s.reps) || 0);
      // set_logs has logged_at + created_at. There is NO updated_at on this
      // table — selecting one would error the whole query and this endpoint
      // would silently return an empty list forever. Verified against the live
      // schema before shipping.
      const stamp = (s.logged_at as string) || (s.created_at as string) || null;
      const t = stamp ? Date.parse(stamp) : NaN;
      if (!Number.isNaN(t) && (a.last === null || t > a.last)) a.last = t;
    }

    const rows: LiveRow[] = logs.map((l) => {
      const a = agg.get(l.id as string) || { sets: 0, volume: 0, last: null };
      const startedAt = Date.parse(String(l.started_at));
      const startedMinutesAgo = Math.max(0, Math.round((now - startedAt) / 60000));
      const lastSetMinutesAgo = a.last === null ? null : Math.max(0, Math.round((now - a.last) / 60000));
      return {
        clientId: l.client_id as string,
        name: (((l.clients as { name?: string } | null)?.name) || "").split(" ")[0] || "Client",
        workout: ((l.days as { label?: string } | null)?.label) || null,
        startedMinutesAgo,
        lastSetMinutesAgo,
        sets: a.sets,
        volume: Math.round(a.volume),
        // Active = a set landed recently. Falls back to "started recently" for
        // the first few minutes, before anyone has logged anything yet.
        active: lastSetMinutesAgo === null ? startedMinutesAgo <= IDLE_MIN : lastSetMinutesAgo <= IDLE_MIN,
      };
    });

    rows.sort((a, b) => Number(b.active) - Number(a.active) || a.startedMinutesAgo - b.startedMinutesAgo);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
