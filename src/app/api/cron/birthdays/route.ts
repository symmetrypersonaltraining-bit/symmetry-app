// GET/POST /api/cron/birthdays — the group chat remembers birthdays.
//
// Dustin, 2026-08-04: "lets activate an automatic fun bday msg for everyone in
// the group chat on the app."
//
// TWO THINGS HAPPEN HERE, AND THEY ARE ON DIFFERENT DAYS
//
//   The evening before — a private note to Dustin, invisible to the client
//     (from_id = to_id = his own account, so RLS shows it to nobody else). He
//     asked for this specifically, and it is the important half: the app
//     posting "happy birthday" is pleasant, the coach saying it in person at
//     their session is the thing they remember. This exists so the automation
//     prompts the human rather than replacing him.
//
//   On the day — one Coach Bot message in the group chat. Coach Bot's voice,
//     not Dustin's, and with the cartoon badge. Dustin picked that himself and
//     it is the right call: if a client ever worked out that a warm message
//     signed "Dustin" was generated, every warm message he has actually written
//     gets doubted too.
//
// WHY IT CANNOT POST TWICE
//
// Every post is written to birthday_posts, keyed (client, year, kind), and read
// back before anything is said. A doubled birthday message in a thirty-five
// person group chat is a small, permanent embarrassment, and "the cron only
// runs once a day" is not a guarantee — retries, redeploys and a manual poke
// all exist. This is safe to run every hour if we ever want to.
//
// TWO PEOPLE, ONE DAY
//
// Two of Dustin's clients share 19 May and two more share 27 December. They get
// ONE message naming both, never two messages ten seconds apart.
//
// Off switch: app_flags.birthday_bot_live → false. One row, no deploy.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { isCronRequest } from "@/lib/cron-auth";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { enforceMeter, resolveAiScope, type Db } from "@/lib/ai/scope";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { ownerAuthUid, inboxAuthUidForClient, ownerTrainer } from "@/lib/trainerResolve";
import {
  BIRTHDAY_SYSTEM, centralToday, effectiveMonthDay, fallbackLine, isPrintable,
  joinNames, monthDay, nextDay, type BirthdayPerson,
} from "@/lib/birthdays";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ClientRow { id: string; name: string | null; date_of_birth: string | null }

function firstName(name: string | null): string {
  return (name || "").trim().split(/\s+/)[0] || "Someone";
}

async function whoseBirthday(db: Db, targetIso: string): Promise<BirthdayPerson[]> {
  const { data } = await db
    .from("clients")
    .select("id, name, date_of_birth")
    .is("archived_at", null)
    .not("date_of_birth", "is", null);
  const rows = (data as ClientRow[] | null) ?? [];
  const target = monthDay(targetIso);
  return rows
    .filter((r) => r.date_of_birth && effectiveMonthDay(monthDay(r.date_of_birth), targetIso) === target)
    .map((r) => ({ id: r.id, firstName: firstName(r.name) }));
}

async function alreadyDone(db: Db, ids: string[], year: number, kind: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await db
    .from("birthday_posts")
    .select("client_id")
    .in("client_id", ids)
    .eq("year", year)
    .eq("kind", kind);
  return new Set(((data as { client_id: string }[] | null) ?? []).map((r) => r.client_id));
}

export interface BirthdayRun {
  posted: boolean;
  reason: string;
  message?: string;
  headsUp?: string[];
}

/**
 * @param force ignore the birthday_bot_live flag
 * @param dry   work out exactly what it would say and post nothing
 * @param today override the date, so a run can be rehearsed against a real
 *              birthday months away instead of waiting for one
 */
export async function runBirthdays(
  db: Db,
  opts: { force?: boolean; dry?: boolean; today?: string } = {},
): Promise<BirthdayRun> {
  if (!opts.force) {
    const { data: flag } = await db.from("app_flags").select("enabled").eq("key", "birthday_bot_live").maybeSingle();
    if ((flag as { enabled: boolean } | null)?.enabled !== true) {
      return { posted: false, reason: "birthday_bot_live is off" };
    }
  }

  const today = opts.today || centralToday();
  const year = Number(today.slice(0, 4));

  // The OWNER's account, for the GROUP POST only. This was
  // `trainer_settings.select("user_id").limit(1)` — unambiguous while that
  // table held one row, arbitrary the moment Stephanie connects her Google
  // Calendar and it holds two. The group chat is shared by decision (Dustin,
  // 20 Aug: "All clients can go in there since they're all going to train with
  // Symmetry Personal Training"), so the business owner is who posts in it.
  //
  // The private heads-up below is a DIFFERENT question and gets a different
  // answer — see there.
  const trainerUid = await ownerAuthUid(db);
  // The OWNER's name, because the group chat is shared and this bot is the
  // one voice in it. Resolved rather than read off a constant so the choice
  // stays visible.
  const ownerName = (await ownerTrainer(db))?.firstName || COACH_FIRST_NAME;
  if (!trainerUid) return { posted: false, reason: "no trainer account" };

  // ── Tomorrow: the quiet nudge to THAT CLIENT'S COACH ─────────────────────
  //
  // The whole point of this half, in Dustin's words, is that the app posting
  // "happy birthday" is pleasant and the coach saying it at their session is
  // what the client remembers. That only works if it reaches the coach who
  // will actually be standing in front of them. Sent to the owner instead, a
  // heads-up about one of Stephanie's clients tells Dustin about a session he
  // is not running and tells her nothing.
  const headsUp: string[] = [];
  const tomorrowIso = nextDay(today);
  const tomorrowPeople = await whoseBirthday(db, tomorrowIso);
  if (tomorrowPeople.length) {
    const done = await alreadyDone(db, tomorrowPeople.map((p) => p.id), Number(tomorrowIso.slice(0, 4)), "heads_up");
    for (const p of tomorrowPeople) {
      if (done.has(p.id)) continue;
      headsUp.push(p.firstName);
      if (opts.dry) continue;
      // client_id scopes it to their thread in their coach's inbox so one tap
      // answers it — but from_id = to_id = that coach, and the RLS on messages
      // is (auth.uid() = from_id OR auth.uid() = to_id), so the client cannot
      // see it. Checked against the live policy before writing this.
      const coachUid = await inboxAuthUidForClient(db, p.id);
      if (!coachUid) continue;
      const { error } = await db.from("messages").insert({
        from_id: coachUid,
        to_id: coachUid,
        client_id: p.id,
        body: `🎂 ${p.firstName}'s birthday is tomorrow. The group chat will say something in the morning — worth a word from you in person.`,
        is_group: false,
        is_broadcast: false,
        sender_kind: "coachbot",
      });
      if (!error) {
        await db.from("birthday_posts").insert({ client_id: p.id, year: Number(tomorrowIso.slice(0, 4)), kind: "heads_up" });
      }
    }
  }

  // ── Today: the group chat ────────────────────────────────────────────────
  const people = await whoseBirthday(db, today);
  if (!people.length) {
    return { posted: false, reason: "no birthdays today", headsUp };
  }

  const done = await alreadyDone(db, people.map((p) => p.id), year, "group");
  const fresh = people.filter((p) => !done.has(p.id));
  if (!fresh.length) {
    return { posted: false, reason: "already wished everyone today", headsUp };
  }

  // The line. The model writes it; the filter decides whether it ships, and
  // there is always something to fall back to — a birthday message that fails
  // to arrive is a worse outcome than one that is merely nice.
  let body = fallbackLine(fresh);
  let usedAi = false;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const { value, tokensIn, tokensOut } = await callClaudeJson<{ message: string }>({
        meter: { clientId: null, feature: "birthday_post" },
        apiKey,
        model: HAIKU_MODEL,
        system: BIRTHDAY_SYSTEM(ownerName),
        maxTokens: 200,
        messages: [{
          role: "user",
          // Names only. The date of birth never leaves the database, so the
          // model cannot leak an age even if it wanted to.
          content: `Birthday today: ${joinNames(fresh.map((p) => p.firstName))}\n\nWrite the group chat message.`,
        }],
        validate: (raw) => {
          const o = raw as Record<string, unknown> | null;
          const m = o && typeof o.message === "string" ? o.message.trim() : "";
          return m ? { message: m } : null;
        },
      });
      await logUsage(null, "birthday_post", tokensIn, tokensOut, HAIKU_MODEL);
      if (value && isPrintable(value.message, fresh)) {
        body = value.message;
        usedAi = true;
      }
    } catch {
      /* the fallback line is already loaded; a model outage is not a missed birthday */
    }
  }

  if (opts.dry) {
    return { posted: false, reason: `dry run — nothing posted (${usedAi ? "ai" : "fallback"})`, message: body, headsUp };
  }

  const { error } = await db.from("messages").insert({
    from_id: trainerUid,
    to_id: trainerUid,
    client_id: null,
    body,
    is_group: true,
    is_broadcast: false,
    sender_kind: "coachbot",
  });
  if (error) return { posted: false, reason: `insert failed: ${error.message}`, headsUp };

  for (const p of fresh) {
    await db.from("birthday_posts").insert({ client_id: p.id, year, kind: "group" });
  }

  return { posted: true, reason: `wished ${joinNames(fresh.map((p) => p.firstName))}`, message: body, headsUp };
}

async function handle(req: NextRequest) {
  // The scheduler, or {COACH_FIRST_NAME} looking at what it would say.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }
  const db = createAdminClient() as unknown as Db;
  const sp = new URL(req.url).searchParams;
  // Kill switch. Unattended jobs were the ONE place it did not apply, which is
  // the worst possible exemption: they run on a schedule with nobody watching,
  // so an overspend is discovered on the invoice. No per-client cap — there is
  // no single client to charge for a sweep across the whole roster.
  const paused = await enforceMeter(null, "birthday_post");
  if (paused) return paused;
  try {
    const out = await runBirthdays(db, {
      force: sp.get("force") === "1",
      dry: sp.get("dry") === "1",
      today: sp.get("today") || undefined,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
