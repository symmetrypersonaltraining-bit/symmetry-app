// /api/challenge
//
// GET  — the current group challenge plus live standings.
// POST — trainer only: start a challenge, or end the running one.
//
// PRIVACY, the part that matters:
// Standings honour the SAME opt-in as the consistency board
// (client_app_settings.leaderboard_opt_in, which defaults to false). A client
// who has not opted in is never named and never ranked, even though the
// challenge itself is visible to everyone. Only first names are returned.
//
// The metric is behaviour, never body: distinct days trained, or distinct days
// on which anything was logged. There is deliberately no weight or body-fat
// metric and there should never be one — a challenge that ranks people by body
// composition is the opposite of what this app is for.

import { NextRequest, NextResponse } from "next/server";
import { TRAINER_EMAIL, resolveAiScope, Db } from "@/lib/ai/scope";
import { excludedClientIds } from "@/lib/demoClient";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export interface ChallengeStanding {
  first: string;
  score: number;
  rank: number;
  isMe: boolean;
}

function admin(): Db | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;
}

export async function GET() {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  const meId = scoped.scope.clientId;

  const db = admin();
  if (!db) return NextResponse.json({ challenge: null, standings: [], optedIn: false });

  const today = CT_TODAY();

  try {
    // The live one: started, not past its end date, not manually ended.
    const { data: chRows } = await db
      .from("group_challenges")
      .select("id, title, metric, starts_on, ends_on, ended_at")
      .lte("starts_on", today)
      .gte("ends_on", today)
      .is("ended_at", null)
      .order("starts_on", { ascending: false })
      .limit(1);

    const ch = ((chRows as {
      id: string; title: string; metric: string; starts_on: string; ends_on: string;
    }[]) || [])[0];
    if (!ch) return NextResponse.json({ challenge: null, standings: [], optedIn: false });

    const { data: optRows } = await db
      .from("client_app_settings")
      .select("client_id")
      .eq("leaderboard_opt_in", true);
    const ids = ((optRows as { client_id: string }[]) || []).map((r) => r.client_id);
    const optedIn = !!meId && ids.includes(meId);

    // NOTE on the two different populations below, because it is the whole
    // privacy design of this endpoint:
    //
    //   NAMED standings  -> opt-in clients only (ids)
    //   GROUP TOTAL      -> everyone, aggregated, no names ever attached
    //   YOUR OWN score   -> always available to you; it's your own data
    //
    // Without the anonymous group total a challenge reads as dead until
    // everyone opts in, which nobody would. The total makes it feel alive on
    // day one while still naming only the people who chose to be named.
    // Demo/test accounts are dropped from BOTH the named standings and the
    // anonymous group total — an inflated total is just as misleading to the
    // people reading it as a fake name on the board would be.
    const { data: allClients } = await db.from("clients").select("id, name, email");
    const excluded = excludedClientIds(allClients as { id: string; name: string | null; email: string | null }[] | null);
    const rankIds = ids.filter((id) => !excluded.has(id));

    const [namesRes, woRes, mlRes] = await Promise.all([
      db.from("clients").select("id, name").in("id", rankIds.length ? rankIds : ["00000000-0000-0000-0000-000000000000"]),
      db
        .from("workout_logs")
        .select("client_id, log_date")
        .eq("completed", true)
        .gte("log_date", ch.starts_on)
        .lte("log_date", today),
      ch.metric === "logging"
        ? db
            .from("meal_adherence_logs")
            .select("client_id, log_date")
            .not("adherence", "is", null)
            .gte("log_date", ch.starts_on)
            .lte("log_date", today)
        : Promise.resolve({ data: [] as { client_id: string; log_date: string }[] }),
    ]);

    const names = new Map(
      ((namesRes.data as { id: string; name: string | null }[]) || []).map((c) => [
        c.id,
        (c.name || "").split(" ")[0] || "Member",
      ]),
    );

    // Distinct DAYS, not raw rows — two sessions in one day is one day of
    // showing up, and duplicate logs can't inflate a rank.
    const days = new Map<string, Set<string>>();
    const add = (cid: string, d: string) => {
      if (excluded.has(cid)) return; // never counts, named or anonymous
      if (!days.has(cid)) days.set(cid, new Set());
      days.get(cid)!.add(d);
    };
    for (const r of ((woRes.data as { client_id: string; log_date: string }[]) || [])) add(r.client_id, r.log_date);
    if (ch.metric === "logging") {
      for (const r of (((mlRes as { data?: { client_id: string; log_date: string }[] }).data) || [])) add(r.client_id, r.log_date);
    }

    // Anonymous aggregate across the whole roster — a number, never a name.
    let groupTotal = 0;
    let contributors = 0;
    for (const set of days.values()) {
      groupTotal += set.size;
      if (set.size > 0) contributors++;
    }
    const myScore = meId ? days.get(meId)?.size || 0 : 0;

    const scored = rankIds
      .map((id) => ({ id, first: names.get(id) || "Member", score: days.get(id)?.size || 0 }))
      .sort((a, b) => b.score - a.score || a.first.localeCompare(b.first));

    // Standard competition ranking — ties share a place.
    const standings: ChallengeStanding[] = [];
    let lastScore: number | null = null;
    let lastRank = 0;
    scored.forEach((s, i) => {
      const rank = lastScore !== null && s.score === lastScore ? lastRank : i + 1;
      lastScore = s.score;
      lastRank = rank;
      standings.push({ first: s.first, score: s.score, rank, isMe: !!meId && s.id === meId });
    });

    return NextResponse.json({
      challenge: ch,
      standings,
      optedIn,
      groupTotal,
      contributors,
      myScore,
      participants: standings.length,
      today,
    });
  } catch {
    return NextResponse.json({ challenge: null, standings: [], optedIn: false });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  const db = admin();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  let body: { action?: string; title?: string; metric?: string; days?: number; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const today = CT_TODAY();

  try {
    if (body.action === "end") {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      await db.from("group_challenges").update({ ended_at: new Date().toISOString() }).eq("id", body.id);
      return NextResponse.json({ ok: true });
    }

    const title = (body.title || "").trim().slice(0, 80);
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
    const metric = body.metric === "logging" ? "logging" : "sessions";
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 60);

    const [y, m, d] = today.split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1, d));
    end.setUTCDate(end.getUTCDate() + (days - 1));
    const ends_on = end.toISOString().slice(0, 10);

    // Only one challenge runs at a time — end whatever is live before starting.
    // Two overlapping boards would make "who's winning" ambiguous.
    await db
      .from("group_challenges")
      .update({ ended_at: new Date().toISOString() })
      .is("ended_at", null)
      .gte("ends_on", today);

    const { data, error } = await db
      .from("group_challenges")
      .insert({ title, metric, starts_on: today, ends_on, created_by: user.id })
      .select("id, title, metric, starts_on, ends_on")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, challenge: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed" }, { status: 500 });
  }
}
