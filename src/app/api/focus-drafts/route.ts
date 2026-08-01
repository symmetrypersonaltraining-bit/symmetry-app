// /api/focus-drafts — Dustin's Saturday review queue.
//
// GET   — every unpublished draft for the coming week, with the client's name
//         and the number they were written from.
// PATCH — edit one draft's text.
// POST  — approve (one, or all) and publish.
//
// Trainer only, on every verb. This is unpublished coaching copy for 35 people.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** The Sunday that starts the week containing `iso`. */
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

/**
 * The week these drafts are for.
 *
 * On Saturday that is tomorrow's week. On Sunday through Friday it is the
 * current week — so if he opens the queue late on Sunday he still sees the
 * batch he was meant to review, rather than an empty screen.
 */
function targetWeek(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 6) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  }
  return weekStartOf(today);
}

async function requireTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email === TRAINER_EMAIL;
}

export async function GET() {
  if (!(await requireTrainer())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const week = targetWeek(CT_TODAY());

  const { data } = await db
    .from("weekly_focus_drafts")
    .select("id, client_id, focus, focus_ai, edited_at, approved_at")
    .eq("week_start", week)
    .is("published_at", null);

  const rows =
    (data as {
      id: string;
      client_id: string;
      focus: string;
      focus_ai: string | null;
      edited_at: string | null;
      approved_at: string | null;
    }[]) || [];

  if (!rows.length) return NextResponse.json({ week, drafts: [] });

  const { data: cs } = await db
    .from("clients")
    .select("id, name")
    .in("id", rows.map((r) => r.client_id));
  const names = new Map(((cs as { id: string; name: string | null }[]) || []).map((c) => [c.id, c.name || "Client"]));

  return NextResponse.json({
    week,
    drafts: rows
      .map((r) => ({ ...r, name: names.get(r.client_id) || "Client" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireTrainer())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; focus?: string };
  const focus = (body.focus || "").trim().slice(0, 200);
  if (!body.id || !focus) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = createAdminClient();
  // focus_ai is left alone on purpose — it is the record of what the model
  // wrote, and it is the only way to answer "is the AI getting these right"
  // from data rather than memory.
  await db.from("weekly_focus_drafts").update({ focus, edited_at: new Date().toISOString() }).eq("id", body.id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!(await requireTrainer())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  const db = createAdminClient();
  const week = targetWeek(CT_TODAY());
  const now = new Date().toISOString();

  if (body.all) {
    await db.from("weekly_focus_drafts").update({ approved_at: now }).eq("week_start", week).is("published_at", null);
  } else if (body.id) {
    await db.from("weekly_focus_drafts").update({ approved_at: now }).eq("id", body.id);
  } else {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Publishing writes weekly_focus with week_start = the COMING Sunday, and
  // the client's week card only shows a focus belonging to the current week.
  // So approving on Saturday is safe: nothing appears until the week it is for.
  const { data: n } = await db.rpc("publish_focus_drafts", { p_week: week, p_only_approved: true });
  return NextResponse.json({ ok: true, published: n ?? 0 });
}
