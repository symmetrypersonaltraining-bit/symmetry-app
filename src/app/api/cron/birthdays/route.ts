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
import { trainerFeatureOn } from "@/lib/trainerFeatures";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { enforceMeter, resolveAiScope, type Db } from "@/lib/ai/scope";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { inboxAuthUidForClient, trainerForClient } from "@/lib/trainerResolve";
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

/**
 * Whose birthday falls on this date.
 *
 * `onlyTrainer` narrows it to one coach's clients. The GROUP post needs that —
 * since 21 Aug the rooms are per trainer and this bot posts in the owner's, so
 * naming another trainer's client there announces them, by first name, to a
 * room full of strangers. The private heads-up does NOT narrow: it is routed to
 * each client's own coach further down and is correct roster-wide.
 */
async function whoseBirthday(db: Db, targetIso: string, onlyTrainer?: string | null): Promise<BirthdayPerson[]> {
  let q = db
    .from("clients")
    .select("id, name, date_of_birth")
    .is("archived_at", null)
    .not("date_of_birth", "is", null);
  if (onlyTrainer) q = q.eq("trainer_id", onlyTrainer);
  const { data } = await q;
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
/** A coach and the room they run. */
export interface Room { trainerId: string; authUserId: string; firstName: string }

/**
 * The birthday bot, in ONE room.
 *
 * Every trainer has a group room, so every trainer's clients get wished a happy
 * birthday in it. This used to run once, for the owner, because that was the
 * only room there was; the caller now loops.
 */
export async function runBirthdaysForRoom(
  db: Db,
  room: Room,
  opts: { force?: boolean; dry?: boolean; today?: string; headsUpDone?: boolean } = {},
): Promise<BirthdayRun> {
  if (!opts.force) {
    const { data: flag } = await db.from("app_flags").select("enabled").eq("key", "birthday_bot_live").maybeSingle();
    if ((flag as { enabled: boolean } | null)?.enabled !== true) {
      return { posted: false, reason: "birthday_bot_live is off" };
    }
  }

  const today = opts.today || centralToday();
  const year = Number(today.slice(0, 4));

  // THIS room's coach, for the GROUP POST. The bot speaks as whoever runs the
  // room it is posting in.
  //
  // The private heads-up below is a DIFFERENT question and gets a different
  // answer — see there.
  const ownerName = room.firstName || COACH_FIRST_NAME;

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
  // NOT narrowed: routed to each client's own coach below, so it is correct
  // roster-wide, and running it once per room would send it N times.
  const tomorrowPeople = opts.headsUpDone ? [] : await whoseBirthday(db, tomorrowIso);
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
      // That coach's own switch. The heads-up lands in THEIR inbox about THEIR
      // client, so it is their call whether they want it — the app-wide flag
      // above only says the feature exists at all.
      const coachTrainer = await trainerForClient(db, p.id);
      if (!(await trainerFeatureOn(db, coachTrainer?.id, "birthdays"))) continue;
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
        // birthday_posts IS the dedupe ledger — alreadyDone() reads it to
        // decide whether this has been said. An unchecked failure here does
        // not lose a log line, it makes tomorrow's run say the same thing
        // again, and the day after that.
        const { error: ledgerErr } = await db.from("birthday_posts").insert({ client_id: p.id, year: Number(tomorrowIso.slice(0, 4)), kind: "heads_up" });
        if (ledgerErr) {
          console.error(`birthdays: heads-up sent for ${p.id} but not recorded — it will repeat:`, ledgerErr.message);
        }
      }
    }
  }

  // ── Today: the group chat ────────────────────────────────────────────────
  // Narrowed to the room. See whoseBirthday().
  const people = await whoseBirthday(db, today, room.trainerId);
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

  // group_trainer_id EXPLICITLY, and the OWNER's room by name.
  //
  // The stamp_group_message trigger fills this from my_group_trainer_id(),
  // which reads auth.uid() — and this runs on the SERVICE ROLE, where
  // auth.uid() is null. The trigger therefore stamps NULL, and RLS
  // (read_own_group_messages) requires it to be NOT NULL. So since the rooms
  // were split on 21 Aug this post has been landing in the table and being
  // invisible to every client: no error, no bounce, nothing on screen.
  // Verified against the live database rather than reasoned about.
  const { error } = await db.from("messages").insert({
    from_id: room.authUserId,
    to_id: room.authUserId,
    client_id: null,
    body,
    is_group: true,
    is_broadcast: false,
    sender_kind: "coachbot",
    group_trainer_id: room.trainerId,
  });
  if (error) return { posted: false, reason: `insert failed: ${error.message}`, headsUp };

  // Same ledger, and this one is in the group chat where everybody sees it.
  // The message has already posted, so this cannot be undone — but it must be
  // reported, because the failure mode is wishing somebody a happy birthday in
  // front of the whole gym on three consecutive mornings.
  const unrecorded: string[] = [];
  for (const p of fresh) {
    const { error: ledgerErr } = await db.from("birthday_posts").insert({ client_id: p.id, year, kind: "group" });
    if (ledgerErr) unrecorded.push(p.firstName);
  }
  if (unrecorded.length) {
    console.error("birthdays: posted but not recorded, will repeat tomorrow for", unrecorded.join(", "));
  }

  return {
    posted: true,
    reason: `wished ${joinNames(fresh.map((p) => p.firstName))}`,
    message: body,
    headsUp,
    ...(unrecorded.length ? { warning: `not recorded, will repeat: ${unrecorded.join(", ")}` } : {}),
  };
}

interface TrainerRow { id: string; auth_user_id: string | null; name: string | null; first_name: string | null }

async function handle(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  // Set when a signed-in trainer fires it: their auth id, so the sweep below
  // runs their room only.
  let onlyTrainer: string | null = null;
  // The scheduler, or a trainer looking at what it would say.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
    // A trainer firing this by hand runs it in THEIR OWN room. The owner-only
    // gate that used to be here was a symptom of the bot only knowing one room.
    onlyTrainer = scoped.scope.userId;
  }
  const db = createAdminClient() as unknown as Db;
  // Kill switch. Unattended jobs were the ONE place it did not apply, which is
  // the worst possible exemption: they run on a schedule with nobody watching,
  // so an overspend is discovered on the invoice. No per-client cap — there is
  // no single client to charge for a sweep across the whole roster.
  const paused = await enforceMeter(null, "birthday_post");
  if (paused) return paused;
  try {
    const { data: trainerRows } = await db
      .from("trainers")
      .select("id, auth_user_id, name, first_name")
      .eq("active", true)
      .not("auth_user_id", "is", null);
    let rooms = ((trainerRows as TrainerRow[]) || []).map((t) => ({
      trainerId: t.id,
      authUserId: t.auth_user_id as string,
      firstName: (t.first_name || String(t.name || "").split(/\s+/)[0] || COACH_FIRST_NAME),
    }));
    if (onlyTrainer) rooms = rooms.filter((r) => r.authUserId === onlyTrainer);
    if (!rooms.length) return NextResponse.json({ posted: false, reason: "no room to post in" });

    const force = sp.get("force") === "1";
    const today = sp.get("today") || undefined;
    const results: (BirthdayRun & { room: string })[] = [];
    // headsUpDone: the private tomorrow-nudge is routed to each client's OWN
    // coach and is already correct roster-wide, so it runs on the first pass
    // only. Repeating it per room would send N copies of the same nudge.
    let headsUpDone = false;
    for (const room of rooms) {
      const out = await runBirthdaysForRoom(db, room, { force, dry, today, headsUpDone });
      headsUpDone = true;
      results.push({ room: room.firstName, ...out });
    }
    const posted = results.filter((r) => r.posted);
    return NextResponse.json({
      posted: posted.length > 0,
      reason: posted.length
        ? `wished in ${posted.map((r) => r.room).join(", ")}`
        : results.map((r) => `${r.room}: ${r.reason}`).join(" | ") || "no birthdays",
      message: results.find((r) => r.message)?.message,
      headsUp: results.flatMap((r) => r.headsUp || []),
      rooms: results,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
