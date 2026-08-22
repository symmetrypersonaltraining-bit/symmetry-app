// WHICH trainer, not THE trainer.
//
// `TRAINER_EMAIL` is a single constant and 34 call sites used it to answer
// questions about the person currently using the app: their own client row, the
// inbox their clients' messages go to, the name on a push notification, the
// coach a weekly summary is addressed from. With one trainer every one of those
// was right by accident. With two, every one of them lands on Dustin.
//
// The `trainers` table (phase 1) is the authority. This module is how server
// code asks it.
//
// Deliberately server-only: it reads the database. The five client components
// that draw trainer chrome keep using isTrainerEmail(), which is presentation
// and says so.

import { TRAINER_EMAIL } from "@/lib/trainer";

export interface TrainerRecord {
  id: string;
  /** The auth.users id. Null for a trainer who has a row but has never signed in. */
  authUserId: string | null;
  email: string;
  name: string;
  firstName: string;
  role: "owner" | "trainer";
  isOwner: boolean;
}

// NO PAYMENT FIELDS HERE, deliberately.
//
// This record used to carry venmoUsername/zelleEmail/cashappHandle/payPhone/
// payDisplayName, and COLS selected them. From 21 Aug SELECT on those five
// columns is revoked from the `authenticated` role — Dustin: "I do not want
// anyone but their own clients seeing their pmt info" — so a session-scoped
// caller asking for them gets an error for the WHOLE row, not a null column.
// Two of this module's callers are session-scoped (the tutorial page and
// invite-trainer), which would have taken the trainer's name and email down
// with the Venmo tag.
//
// Pay details now come from payDestinationFor() in src/lib/payDest.ts, which
// goes through the trainer_pay_details() gate.

// PromiseLike, not Promise. supabase-js query builders are thenables that only
// become real promises when awaited — they have no .catch/.finally — so a
// `Promise<...>` here made every real client fail to satisfy this interface.
// It went unnoticed while nothing imported this module; the first four call
// sites all failed to typecheck at once.
type Result = PromiseLike<{ data: unknown; error?: unknown }>;

// What callers hand in.
//
// Deliberately one shallow member. A precise structural interface here is not
// free: supabase-js clients are deeply generic, and checking one against a
// hand-written shape made tsc give up with "type instantiation is excessively
// deep" at some call sites and not others — a compile error that moved around
// as unrelated files changed. The narrow shape below is what this module
// actually uses; the cast happens once, at the boundary.
export type AnyDb = { from: (table: string) => unknown };

const q = (db: AnyDb) => db as unknown as Queryable;

// Only the three methods this module actually calls. `order` was declared here
// too, unused, and its `options?: unknown` parameter alone was enough to make
// every real supabase client fail the check — an unused member of a structural
// type is not free.
interface Queryable {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => {
        maybeSingle: () => Result;
        limit: (n: number) => Result;
      };
      ilike: (col: string, v: string) => {
        limit: (n: number) => Result;
      };
    };
  };
}

const COLS = "id, auth_user_id, email, name, first_name, role";

function shape(row: Record<string, unknown> | null): TrainerRecord | null {
  if (!row) return null;
  const name = String(row.name || "");
  const role = row.role === "owner" ? "owner" : "trainer";
  return {
    id: String(row.id),
    authUserId: (row.auth_user_id as string) ?? null,
    email: String(row.email || ""),
    name,
    // Falls back to splitting the full name so a row created without one still
    // addresses a client by something human.
    firstName: String(row.first_name || name.split(/\s+/)[0] || ""),
    role,
    isOwner: role === "owner",
  };
}

const first = (data: unknown): Record<string, unknown> | null =>
  Array.isArray(data) ? ((data[0] as Record<string, unknown>) ?? null) : ((data as Record<string, unknown>) ?? null);

/** The trainer row for a signed-in auth user. Null when they are not a trainer. */
export async function trainerForAuthUser(
  db: AnyDb,
  authUserId: string | null | undefined,
  email?: string | null,
): Promise<TrainerRecord | null> {
  if (authUserId) {
    const { data } = await q(db).from("trainers").select(COLS).eq("auth_user_id", authUserId).limit(1);
    const row = first(data);
    if (row) return shape(row);
  }
  // A trainer who has a row but has not signed in yet — or whose auth link has
  // not been stamped. Case-insensitive, because an address typed into a config
  // and an address in auth.users differ by case more often than anyone expects.
  if (email) {
    const { data } = await q(db).from("trainers").select(COLS).ilike("email", email).limit(1);
    const row = first(data);
    if (row) return shape(row);
  }
  return null;
}

/** The trainer a CLIENT belongs to — whose name they see, whose Venmo they pay. */
export async function trainerForClient(
  db: AnyDb,
  clientId: string | null | undefined,
): Promise<TrainerRecord | null> {
  if (!clientId) return null;
  const { data: cRows } = await q(db).from("clients").select("trainer_id").eq("id", clientId).limit(1);
  const c = first(cRows);
  const tid = c?.trainer_id;
  if (!tid) return null;
  const { data } = await q(db).from("trainers").select(COLS).eq("id", tid).limit(1);
  return shape(first(data));
}

/**
 * The owner. For facts about the BUSINESS rather than about a person: where an
 * infrastructure alert goes, who a spend warning emails, which calendar the
 * shared library was built from.
 */
export async function ownerTrainer(db: AnyDb): Promise<TrainerRecord | null> {
  const { data } = await q(db).from("trainers").select(COLS).eq("role", "owner").limit(1);
  const row = first(data);
  if (row) return shape(row);
  return null;
}

/**
 * The coach's first name for a given client, for anything they will read.
 *
 * `COACH_FIRST_NAME` is one global used in 235 places — push labels, invite
 * emails, the nutrition persona, the weekly-AI prompt, coachbot. All of it
 * works perfectly and says the wrong name to another trainer's client.
 *
 * Falls back to the passed default rather than throwing: a missing trainer row
 * must degrade to the old behaviour, never to a blank where a name goes.
 */
export async function coachFirstNameForClient(
  db: AnyDb,
  clientId: string | null | undefined,
  fallback: string,
): Promise<string> {
  try {
    const t = await trainerForClient(db, clientId);
    return t?.firstName || fallback;
  } catch {
    return fallback;
  }
}

/** The address a client's messages and alerts should reach. */
export async function alertEmailForClient(
  db: AnyDb,
  clientId: string | null | undefined,
): Promise<string> {
  try {
    const t = await trainerForClient(db, clientId);
    return t?.email || TRAINER_EMAIL;
  } catch {
    return TRAINER_EMAIL;
  }
}

/**
 * The auth user id an inbox message should be addressed TO for a given client.
 *
 * Five routes used to answer this with
 * `trainer_settings.select("user_id").limit(1)` — "the trainer's auth user id
 * lives in trainer_settings, the same row the calendar sync reads". That was
 * true while trainer_settings held exactly one row. It gains a second the
 * moment Stephanie connects her Google Calendar, at which point `limit(1)` with
 * no ORDER BY decides, per request, which coach receives a client's escalation.
 * The client is told "sent"; it lands in the wrong inbox.
 *
 * A client's own trainer is the answer, with the owner as the fallback so a
 * client with no reachable trainer still reaches somebody.
 */
export async function inboxAuthUidForClient(
  db: AnyDb,
  clientId: string | null | undefined,
): Promise<string | null> {
  try {
    const t = await trainerForClient(db, clientId);
    if (t?.authUserId) return t.authUserId;
  } catch {
    // fall through to the owner
  }
  return ownerAuthUid(db);
}

/**
 * The owner's auth user id — for things that belong to the BUSINESS rather than
 * to one coach's client: the shared group chat, the birthday post, coachbot.
 * Dustin's decision, 20 Aug: "let's keep the group chat the same. All clients
 * can go in there since they're all going to train with Symmetry."
 */
export async function ownerAuthUid(db: AnyDb): Promise<string | null> {
  try {
    const o = await ownerTrainer(db);
    return o?.authUserId ?? null;
  } catch {
    return null;
  }
}
