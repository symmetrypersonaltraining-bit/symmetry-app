// GET/POST /api/cron/revoke-access — an archived client loses the app 30 days
// after their last payment.
//
// Dustin, 2026-09-09: "an archived client loses app access 30 days after their
// last payment, automatically." No manual step, no remembering.
//
// THE RULE ITSELF IS NOT IN THIS FILE. It is `src/lib/access/archivedAccess.ts`,
// because the middleware gate has to reach exactly the same verdict as this job
// does, and two readings of one rule is how the unit map drifted over accents
// and how the serving parsers drifted over a leading zero. One implementation.
//
// ── THE OFF SWITCH IS THE FIRST THING THIS JOB TOUCHES ─────────────────────
//
// `app_flags.access_revoke_live`, read before a single client is looked up.
// This is not a stylistic choice. The nudge job checks its flag late — it gates
// DELIVERY rather than whether the job RUNS — so with nudges switched off it
// still woke up every night, still called the model, and still posted a preview
// into Dustin's own inbox. Eleven consecutive nights after he turned it off,
// and by his count he turned it off about ten times. From where he sits that is
// indistinguishable from a broken switch.
//
// So: flag off means nothing is read, nothing is written, nobody is banned and
// nothing is sent. The only thing that happens is this route returns "off".
//
// ── WHAT REVOKING IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// It sets `clients.access_revoked_at` and bans the auth user. It does NOT touch
// workout_logs, set_logs, meal_adherence_logs, metrics or the client row's
// history. His words: revoking access is not deleting the client. Everything
// they ever did stays, and restoring them is two reversible writes.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron-auth";
import { readFlag } from "@/lib/flags";
import { centralToday } from "@/lib/central-time";
import { accessDecision, type AccessBasis } from "@/lib/access/archivedAccess";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Supabase bans by duration, not by flag. A century is "until Dustin lifts it". */
const BAN_FOREVER = "876000h";

type Action =
  | "revoked"          // access_revoked_at set, auth user banned
  | "kept"             // still inside their 30 days
  | "kept-override"    // his manual extension is still running
  | "unreadable"       // archived_at could not be read — failed safe, kept
  | "revoked-no-login" // past the date, but they never had an auth user to ban
  | "ban-failed";      // the row was NOT written because the ban did not take

export interface Outcome {
  clientId: string;
  name: string | null;
  endsOn: string | null;
  basis: AccessBasis;
  action: Action;
  detail?: string;
}

interface ClientRow {
  id: string;
  name: string | null;
  archived_at: string | null;
  auth_user_id: string | null;
  access_override_until: string | null;
}

/**
 * The whole job, with its two dependencies handed in so a test can run it
 * without a database or a live auth service.
 */
export async function runRevokePass(
  db: ReturnType<typeof createAdminClient>,
  opts: { today?: string; dryRun?: boolean } = {},
): Promise<{ ran: true; today: string; dryRun: boolean; outcomes: Outcome[] }> {
  const today = opts.today ?? centralToday();
  const dryRun = opts.dryRun === true;

  // Archived, not already revoked. An active client is never selected here, and
  // the rule refuses to revoke one even if they were.
  const { data: clients } = await db
    .from("clients")
    .select("id, name, archived_at, auth_user_id, access_override_until")
    .not("archived_at", "is", null)
    .is("access_revoked_at", null);

  const rows = (clients ?? []) as ClientRow[];
  if (rows.length === 0) return { ran: true, today, dryRun, outcomes: [] };

  // One query for every client's last paid invoice, rather than one per client.
  const { data: paid } = await db
    .from("payment_reminders")
    .select("client_id, due_date")
    .eq("notification_status", "paid")
    .in("client_id", rows.map((r) => r.id));

  const lastPaid = new Map<string, string>();
  for (const p of (paid ?? []) as { client_id: string | null; due_date: string }[]) {
    if (!p.client_id) continue;
    const seen = lastPaid.get(p.client_id);
    if (!seen || p.due_date > seen) lastPaid.set(p.client_id, p.due_date);
  }

  const outcomes: Outcome[] = [];

  for (const row of rows) {
    const decision = accessDecision(
      {
        archivedAt: row.archived_at,
        lastPaidDueDate: lastPaid.get(row.id) ?? null,
        overrideUntil: row.access_override_until,
      },
      today,
    );

    const base = { clientId: row.id, name: row.name, endsOn: decision.endsOn, basis: decision.basis };

    if (!decision.shouldRevoke) {
      const action: Action =
        decision.basis === "unreadable" ? "unreadable"
        : decision.basis === "override" ? "kept-override"
        : "kept";
      outcomes.push({ ...base, action });
      continue;
    }

    if (dryRun) {
      outcomes.push({ ...base, action: row.auth_user_id ? "revoked" : "revoked-no-login", detail: "dry run — nothing written" });
      continue;
    }

    // THE BAN GOES FIRST, AND THE ROW ONLY FOLLOWS IF IT TOOK.
    //
    // The column is what the app reads; the ban is what actually stops a sign
    // in. Writing the column first and then failing to ban leaves a client the
    // app believes is revoked and who can still get a session — the worst of
    // the two orders, and the same shape as the archived_at gap that started
    // all this. Failing the other way is safe: a banned user with a null column
    // is simply revoked again on tomorrow's run.
    if (row.auth_user_id) {
      const { error: banError } = await db.auth.admin.updateUserById(row.auth_user_id, {
        ban_duration: BAN_FOREVER,
      });
      if (banError) {
        outcomes.push({ ...base, action: "ban-failed", detail: banError.message });
        continue;
      }
    }

    const { error: writeError } = await db
      .from("clients")
      .update({ access_revoked_at: new Date().toISOString() })
      .eq("id", row.id);

    outcomes.push({
      ...base,
      action: row.auth_user_id ? "revoked" : "revoked-no-login",
      ...(writeError ? { detail: `row not written: ${writeError.message}` } : {}),
    });
  }

  return { ran: true, today, dryRun, outcomes };
}

async function handle(req: NextRequest) {
  // The door. A header check — no query, no write, nothing sent.
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "not a scheduler request" }, { status: 401 });
  }

  const db = createAdminClient();

  // A human asking "what would this do" is not the job running. It writes
  // nothing, bans nobody and sends nothing, and the scheduler never passes it —
  // vercel.json calls this path bare. This is the separate preview trigger the
  // nudge post-mortem asked for, rather than a preview riding on the live flag.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  // ── FIRST. BEFORE ANY WORK. ────────────────────────────────────────────────
  const live = await readFlag(db, "access_revoke_live");
  if (!live && !dryRun) {
    return NextResponse.json({ ran: false, reason: "access_revoke_live is off" });
  }

  const result = await runRevokePass(db, { dryRun });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
