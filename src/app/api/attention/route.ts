// GET /api/attention
//
// "Who needs you today" — a ranked list for the trainer home screen.
//
// Reuses the SAME segmentation the nudge engine applies, so the two can never
// disagree about who is slipping. The difference is the audience: this tells
// Dustin, it never messages a client.
//
// Trainer-only. Returns first names + the reason, nothing sensitive.

import { NextResponse } from "next/server";
import { TRAINER_EMAIL, Db } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
function isRehab(goal: string | null): boolean {
  const g = (goal || "").toLowerCase();
  return g.includes("rehab") || g.includes("pain") || g.includes("injur");
}

export interface AttentionRow {
  id: string;
  name: string;
  reason: string;
  detail: string;
  severity: 1 | 2 | 3; // 3 = act today
  tag: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [] });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const today = CT_TODAY();
  const since30 = shiftDays(today, -29);
  const since7 = shiftDays(today, -6);

  try {
    const [clientsRes, wlRes, mealRes] = await Promise.all([
      admin.from("clients").select("id, name, primary_goal").not("auth_user_id", "is", null),
      admin.from("workout_logs").select("client_id, log_date").eq("completed", true).gte("log_date", since30),
      admin.from("meal_adherence_logs").select("client_id, log_date").gte("log_date", since30),
    ]);

    const clients = (clientsRes.data as { id: string; name: string | null; primary_goal: string | null }[]) || [];
    const wo = new Map<string, string[]>();
    for (const r of ((wlRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!wo.has(r.client_id)) wo.set(r.client_id, []);
      wo.get(r.client_id)!.push(r.log_date);
    }
    const ml = new Map<string, string[]>();
    for (const r of ((mealRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!ml.has(r.client_id)) ml.set(r.client_id, []);
      ml.get(r.client_id)!.push(r.log_date);
    }

    const rows: AttentionRow[] = [];

    for (const c of clients) {
      // Skip the trainer's own client row and seed/test accounts.
      if ((c.name || "").toLowerCase().includes("test client")) continue;
      if (/dustin/i.test(c.name || "")) continue;
      const w = wo.get(c.id) || [];
      const m = ml.get(c.id) || [];
      const first = (c.name || "").split(" ")[0] || "Client";
      const w7 = new Set(w.filter((d) => d >= since7)).size;
      const w30 = new Set(w).size;
      const lastW = w.length ? w.slice().sort().at(-1)! : null;
      const dsw = lastW ? daysBetween(lastW, today) : null;
      const lastM = m.length ? m.slice().sort().at(-1)! : null;
      const dsm = lastM ? daysBetween(lastM, today) : null;
      const rehab = isRehab(c.primary_goal);

      if (!w.length) {
        rows.push({ id: c.id, name: first, reason: "Never trained", detail: "No completed session on record", severity: 2, tag: "onboard" });
        continue;
      }
      if (dsw != null && dsw >= 10) {
        rows.push({
          id: c.id,
          name: first,
          reason: `Silent ${dsw} days`,
          detail: `${w30} sessions in 30d${dsm == null ? " · never logged food" : ""} — automated nudges are paused, needs a personal message`,
          severity: 3,
          tag: "escalate",
        });
        continue;
      }
      if (w7 >= 10) {
        rows.push({ id: c.id, name: first, reason: "Overtraining risk", detail: `${w7} sessions in 7 days — tell them to rest`, severity: 2, tag: "rest" });
        continue;
      }
      if (dsw != null && dsw >= 5) {
        rows.push({
          id: c.id,
          name: first,
          reason: `${dsw} days since training`,
          detail: rehab ? `Rehab client — gentle check-in` : `${w30} sessions in 30d`,
          severity: 2,
          tag: "quiet",
        });
        continue;
      }
      if (w7 <= 3 && w30 <= 10) {
        rows.push({ id: c.id, name: first, reason: "Slipping", detail: `${w7} this week, ${w30} this month`, severity: 2, tag: "slipping" });
        continue;
      }
      if (w7 >= 4 && (dsm == null || dsm >= 5)) {
        rows.push({
          id: c.id,
          name: first,
          reason: "Training hard, not logging food",
          detail: dsm == null ? `${w7} sessions this week · has never logged a meal` : `${w7} sessions this week · ${dsm} days since a food log`,
          severity: 1,
          tag: "nutrition",
        });
      }
    }

    rows.sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name));
    return NextResponse.json({ rows, checked: clients.length, generatedAt: today });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
