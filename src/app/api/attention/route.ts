// ⚠ UNREACHABLE AS OF 2026-08-21. Nothing in the app calls this.
//
// Its only caller was <AttentionFeed/>, the "Who needs you today" panel, which
// TrainerHome records as "removed entirely". The component was left in src/
// unmounted for weeks, which reads as a bug rather than a retirement, so it has
// now been deleted — and that leaves this route with no way in.
//
// Kept rather than deleted because the feature was wanted and may come back:
// Dustin built it, and the one-tap drafts underneath it are genuinely good. If
// it does come back, note that the draft prompt was made per-trainer on
// 2026-08-21 and no longer writes as the owner regardless of who is signed in.
//
// If it is still unreachable in a month, delete it.

// GET /api/attention
//
// "Who needs you today" — a ranked list for the trainer home screen.
//
// Reuses the SAME segmentation the nudge engine applies, so the two can never
// disagree about who is slipping. The difference is the audience: this tells
// Dustin, it never messages a client.
//
// Accuracy rules this file exists to hold (verified against the live roster
// 2026-07-25 — a wrong label here costs trust in the whole feed):
//   * "Never trained" is judged on LIFETIME history, not a rolling window.
//     Someone who trained 60 days ago and stopped is quiet, not new.
//   * A nutrition gap is only a gap for someone who has logged food before.
//     Telling Dustin every day that a client who has never once logged a meal
//     still hasn't is nagging, not information.
//   * Brand-new clients get a grace period before they show up as a task.
//   * The "down on volume" bucket compares a client to THEIR OWN month, not to
//     a fixed threshold — otherwise two thirds of a healthy roster gets flagged
//     and the feed stops meaning anything.
//
// Trainer-only. Returns first names + the reason, nothing sensitive.

import { NextResponse } from "next/server";
import { TRAINER_EMAIL, Db } from "@/lib/ai/scope";
import { isExcludedFromRoster } from "@/lib/demoClient";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { rosterScopeFor, scopeRoster } from "@/lib/auth/roster";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

const NEW_CLIENT_GRACE_DAYS = 4; // don't chase someone who signed up yesterday
const SILENT_DAYS = 10; // nudges are paused past here — needs a person
const QUIET_DAYS = 5;
const OVERTRAIN_7D = 10;
const NUTRITION_GAP_DAYS = 5;
const NUTRITION_MIN_30D_SESSIONS = 8; // actively training, so food matters now
// Two or three meal logs ever is someone who tried it once, not a food logger.
// Below this it isn't a habit that lapsed, so there's nothing to point at.
const NUTRITION_MIN_LIFETIME_LOGS = 5;

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
  if (!user || !(await viewerIsTrainer(supabase, user))) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [] });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  // Resolved through the SAME client the roster read uses, so the scope cannot
  // come back narrower than the query it is meant to narrow.
  const scope = await rosterScopeFor(admin as unknown as Parameters<typeof rosterScopeFor>[0], user);

  const today = CT_TODAY();
  const since30 = shiftDays(today, -29);
  const since7 = shiftDays(today, -6);

  try {
    // Full history, not a window. Both tables are small (hundreds of rows), and
    // a window is exactly what makes "never trained" lie about a lapsed client.
    const [clientsRes, wlRes, mealRes] = await Promise.all([
      admin.from("clients").select("id, name, email, primary_goal, created_at, trainer_id, auth_user_id").not("auth_user_id", "is", null).is("archived_at", null),
      admin.from("workout_logs").select("client_id, log_date").eq("completed", true),
      admin.from("meal_adherence_logs").select("client_id, log_date").not("adherence", "is", null),
    ]);

    type RosterRow = {
      id: string; name: string | null; email: string | null;
      primary_goal: string | null; created_at: string | null;
      trainer_id: string | null; auth_user_id: string | null;
    };
    // WHOSE ROSTER. This read is on the service role, so RLS is not applied and
    // the query above returns every client on the instance. Before this, a
    // second trainer's "needs attention" feed was the owner's whole book:
    // names, goals, join dates, and the adherence history underneath them.
    // scopeRoster() also drops the viewer's OWN client row, which is what the
    // /dustin/i test below used to do — by name, so it only ever worked for one
    // human and would have hidden a real client called Dustin.
    const clients = scopeRoster((clientsRes.data as RosterRow[]) || [], scope);

    const wo = new Map<string, string[]>();
    for (const r of ((wlRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!r.log_date) continue;
      if (!wo.has(r.client_id)) wo.set(r.client_id, []);
      wo.get(r.client_id)!.push(r.log_date);
    }
    const ml = new Map<string, string[]>();
    for (const r of ((mealRes.data as { client_id: string; log_date: string }[]) || [])) {
      if (!r.log_date) continue;
      if (!ml.has(r.client_id)) ml.set(r.client_id, []);
      ml.get(r.client_id)!.push(r.log_date);
    }

    const rows: AttentionRow[] = [];

    for (const c of clients) {
      // Demo and test accounts never appear in the trainer's real workload.
      if (isExcludedFromRoster(c)) continue;

      const w = wo.get(c.id) || [];
      const m = ml.get(c.id) || [];
      const first = (c.name || "").split(" ")[0] || "Client";
      const rehab = isRehab(c.primary_goal);

      const joined = c.created_at ? String(c.created_at).slice(0, 10) : null;
      const daysSinceJoin = joined ? daysBetween(joined, today) : 999;

      const w7 = new Set(w.filter((d) => d >= since7 && d <= today)).size;
      const w30 = new Set(w.filter((d) => d >= since30 && d <= today)).size;
      const lastW = w.length ? w.slice().sort().at(-1)! : null;
      const dsw = lastW ? daysBetween(lastW, today) : null;

      const everLoggedFood = m.length >= NUTRITION_MIN_LIFETIME_LOGS;
      const lastM = m.length ? m.slice().sort().at(-1)! : null;
      const dsm = lastM ? daysBetween(lastM, today) : null;

      // 1. Signed up, never once trained. Lifetime check, with a grace period
      //    so a client who joined yesterday isn't already a task.
      if (!w.length) {
        if (daysSinceJoin < NEW_CLIENT_GRACE_DAYS) continue;
        rows.push({
          id: c.id,
          name: first,
          reason: "Never trained",
          detail: `Signed up ${daysSinceJoin} days ago, no completed session yet${everLoggedFood ? " — but they are logging food, so they're in the app" : ""}`,
          severity: daysSinceJoin >= 14 ? 3 : 2,
          tag: "onboard",
        });
        continue;
      }

      // 2. Gone quiet long enough that the automated nudges have given up.
      if (dsw != null && dsw >= SILENT_DAYS) {
        rows.push({
          id: c.id,
          name: first,
          reason: `Silent ${dsw} days`,
          detail: `${w30} sessions in the last 30d — automated nudges are paused this far out, needs a personal message`,
          severity: 3,
          tag: "escalate",
        });
        continue;
      }

      // 3. Training every single day. Telling them to rest is coaching.
      if (w7 >= OVERTRAIN_7D) {
        rows.push({
          id: c.id,
          name: first,
          reason: "Overtraining risk",
          detail: `${w7} sessions in 7 days — worth telling them to take a day`,
          severity: 2,
          tag: "rest",
        });
        continue;
      }

      // 4. Quiet, but not yet silent.
      if (dsw != null && dsw >= QUIET_DAYS) {
        rows.push({
          id: c.id,
          name: first,
          reason: `${dsw} days since training`,
          detail: rehab
            ? `Rehab client — a gentle check-in, not a push`
            : `${w30} sessions in the last 30d`,
          severity: 2,
          tag: "quiet",
        });
        continue;
      }

      // 5. Volume down against THEIR OWN month — not a fixed threshold. A
      //    regular who did 10 sessions in 30 days and 1 this week is a real
      //    signal; someone who trains twice a week and did twice is fine.
      if (w7 <= 1 && w30 >= 4) {
        rows.push({
          id: c.id,
          name: first,
          reason: "Down on volume",
          detail: `${w7} session${w7 === 1 ? "" : "s"} this week vs ${w30} in the last 30d — off their own pace`,
          severity: 2,
          tag: "slipping",
        });
        continue;
      }

      // 6. Nutrition gap — ONLY for people who actually log food. A client who
      //    has never logged a meal is a conversation to have once, not a daily
      //    line item.
      if (everLoggedFood && w30 >= NUTRITION_MIN_30D_SESSIONS && dsm != null && dsm >= NUTRITION_GAP_DAYS) {
        rows.push({
          id: c.id,
          name: first,
          reason: "Training hard, food logging stopped",
          detail: `${w30} sessions in 30d · ${dsm} days since their last food log (they have logged ${m.length} before)`,
          severity: 1,
          tag: "nutrition",
        });
      }
    }

    // 7. Recipes waiting on approval. Not a client-behaviour signal like the
    //    rest, but it belongs in the same place for the same reason: it is a
    //    thing only Dustin can clear, and it is invisible until someone opens
    //    a tab they have no reason to open. A client who sends a recipe and
    //    hears nothing for a week does not send a second one.
    try {
      const { data: pend } = await admin
        .from("recipes")
        .select("id, title, submitted_at, clients(name)")
        .eq("visibility", "submitted")
        .order("submitted_at");
      const subs = (pend as unknown as { id: string; title: string; submitted_at: string | null; clients: { name: string | null } | null }[]) || [];
      for (const s of subs) {
        const who = (s.clients?.name || "").split(" ")[0] || "Someone";
        const waited = s.submitted_at ? daysBetween(String(s.submitted_at).slice(0, 10), today) : 0;
        rows.push({
          id: "recipe:" + s.id,
          name: who,
          reason: "Recipe waiting for you",
          detail: `“${s.title}” — sent ${waited <= 0 ? "today" : waited === 1 ? "yesterday" : waited + " days ago"}. Approve it and everyone gets it.`,
          severity: waited >= 3 ? 3 : waited >= 1 ? 2 : 1,
          tag: "recipe",
        });
      }
    } catch { /* the roster feed stands on its own */ }

    rows.sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name));
    return NextResponse.json({ rows, checked: clients.length, generatedAt: today });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
