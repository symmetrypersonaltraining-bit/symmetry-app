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
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { rosterScopeFor, onRoster, trainerMaySeeClient, NO_ROSTER, type RosterScope } from "@/lib/auth/roster";

export const dynamic = "force-dynamic";
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

/**
 * The signed-in trainer AND their roster, in one call.
 *
 * Every handler below reads and writes with the SERVICE ROLE, so RLS is not the
 * boundary here. Without this, `requireTrainer()` alone let a second trainer
 * read, rewrite and approve the weekly coaching copy for every client on the
 * instance — and "approve all" published it.
 */
async function trainerScope(): Promise<{ ok: boolean; scope: RosterScope }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) return { ok: false, scope: NO_ROSTER };
  const db = createAdminClient();
  return { ok: true, scope: await rosterScopeFor(db as never, user) };
}

/** Is this draft about a client on the caller's roster? */
async function draftIsMine(db: ReturnType<typeof createAdminClient>, draftId: string, scope: RosterScope): Promise<boolean> {
  if (scope.isOwner) return true;
  const { data } = await db.from("weekly_focus_drafts").select("client_id").eq("id", draftId).maybeSingle();
  const clientId = (data as { client_id?: string } | null)?.client_id;
  if (!clientId) return false;
  const { data: c } = await db.from("clients").select("trainer_id").eq("id", clientId).maybeSingle();
  return onRoster(c as { trainer_id?: string | null } | null, scope);
}

export async function GET() {
  const { ok, scope } = await trainerScope();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    .select("id, name, trainer_id")
    .in("id", rows.map((r) => r.client_id));
  const clientRows = ((cs as { id: string; name: string | null; trainer_id: string | null }[]) || []);
  const names = new Map(clientRows.map((c) => [c.id, c.name || "Client"]));
  // WHOSE drafts. Service-role read, so this filter is the only one there is.
  const mine = new Set(clientRows.filter((c) => onRoster(c, scope)).map((c) => c.id));

  return NextResponse.json({
    week,
    drafts: rows
      .filter((r) => mine.has(r.client_id))
      .map((r) => ({ ...r, name: names.get(r.client_id) || "Client" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

export async function PATCH(req: NextRequest) {
  const { ok, scope } = await trainerScope();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; focus?: string };
  const focus = (body.focus || "").trim().slice(0, 200);
  if (!body.id || !focus) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = createAdminClient();
  if (!(await draftIsMine(db, body.id, scope))) {
    return NextResponse.json({ error: "Not your client" }, { status: 403 });
  }
  // focus_ai is left alone on purpose — it is the record of what the model
  // wrote, and it is the only way to answer "is the AI getting these right"
  // from data rather than memory.
  //
  // Checked, because `{ ok: true }` on an unchecked write is a lie the caller
  // cannot see through. SaturdayReview closes the editor and repaints the row
  // with the new text on the very next line, so a refused update looked exactly
  // like a saved one until the next load put the model's original back — on
  // coaching copy about to be published to 35 people.
  const { error } = await db
    .from("weekly_focus_drafts")
    .update({ focus, edited_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: `Edit not saved — ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const { ok, scope } = await trainerScope();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  const db = createAdminClient();
  const week = targetWeek(CT_TODAY());
  const now = new Date().toISOString();

  // A failed approval must NOT fall through to publishing. publish_focus_drafts
  // takes only approved rows, so an unchecked failure here publishes nothing and
  // returns 200 — the screen clears the queue, and on Sunday at 6am the fallback
  // publishes every one of those drafts unreviewed. That is the exact outcome
  // this whole review screen exists to prevent.
  let approveErr: string | null = null;
  if (body.all) {
    // "Approve all" means all of MINE. Unscoped, a second trainer approving her
    // three drafts published coaching copy to every client in the business.
    let q = db
      .from("weekly_focus_drafts")
      .update({ approved_at: now })
      .eq("week_start", week)
      .is("published_at", null);
    if (!scope.isOwner) {
      const { data: mine } = await db
        .from("clients")
        .select("id")
        .eq("trainer_id", scope.trainerId ?? "00000000-0000-0000-0000-000000000000");
      const ids = ((mine as { id: string }[]) || []).map((c) => c.id);
      if (!ids.length) return NextResponse.json({ ok: true, approved: 0, published: 0 });
      q = q.in("client_id", ids);
    }
    const { error } = await q;
    approveErr = error?.message ?? null;
  } else if (body.id) {
    if (!(await draftIsMine(db, body.id, scope))) {
      return NextResponse.json({ error: "Not your client" }, { status: 403 });
    }
    const { error } = await db.from("weekly_focus_drafts").update({ approved_at: now }).eq("id", body.id);
    approveErr = error?.message ?? null;
  } else {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (approveErr) {
    return NextResponse.json({ error: `Not approved — ${approveErr}` }, { status: 500 });
  }

  // Publishing writes weekly_focus with week_start = the COMING Sunday, and
  // the client's week card only shows a focus belonging to the current week.
  // So approving on Saturday is safe: nothing appears until the week it is for.
  const { data: n, error: pubErr } = await db.rpc("publish_focus_drafts", { p_week: week, p_only_approved: true });
  if (pubErr) {
    // Approved but not published. Say which, because the two have different
    // fixes and "published: 0" with a 200 reads as "there was nothing to do".
    return NextResponse.json(
      { error: `Approved, but publishing failed — ${pubErr.message}`, approved: true },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, published: n ?? 0 });
}
