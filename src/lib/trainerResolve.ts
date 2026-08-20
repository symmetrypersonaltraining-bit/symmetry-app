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
  email: string;
  name: string;
  firstName: string;
  role: "owner" | "trainer";
  isOwner: boolean;
  venmoUsername: string | null;
  zelleEmail: string | null;
  cashappHandle: string | null;
  payPhone: string | null;
  payDisplayName: string | null;
}

interface Queryable {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
      };
      ilike: (col: string, v: string) => {
        limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
      };
      order: (col: string, o?: unknown) => {
        limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

const COLS =
  "id, email, name, first_name, role, venmo_username, zelle_email, cashapp_handle, pay_phone, pay_display_name";

function shape(row: Record<string, unknown> | null): TrainerRecord | null {
  if (!row) return null;
  const name = String(row.name || "");
  const role = row.role === "owner" ? "owner" : "trainer";
  return {
    id: String(row.id),
    email: String(row.email || ""),
    name,
    // Falls back to splitting the full name so a row created without one still
    // addresses a client by something human.
    firstName: String(row.first_name || name.split(/\s+/)[0] || ""),
    role,
    isOwner: role === "owner",
    venmoUsername: (row.venmo_username as string) ?? null,
    zelleEmail: (row.zelle_email as string) ?? null,
    cashappHandle: (row.cashapp_handle as string) ?? null,
    payPhone: (row.pay_phone as string) ?? null,
    payDisplayName: ((row.pay_display_name as string) ?? null) || name || null,
  };
}

const first = (data: unknown): Record<string, unknown> | null =>
  Array.isArray(data) ? ((data[0] as Record<string, unknown>) ?? null) : ((data as Record<string, unknown>) ?? null);

/** The trainer row for a signed-in auth user. Null when they are not a trainer. */
export async function trainerForAuthUser(
  db: Queryable,
  authUserId: string | null | undefined,
  email?: string | null,
): Promise<TrainerRecord | null> {
  if (authUserId) {
    const { data } = await db.from("trainers").select(COLS).eq("auth_user_id", authUserId).limit(1);
    const row = first(data);
    if (row) return shape(row);
  }
  // A trainer who has a row but has not signed in yet — or whose auth link has
  // not been stamped. Case-insensitive, because an address typed into a config
  // and an address in auth.users differ by case more often than anyone expects.
  if (email) {
    const { data } = await db.from("trainers").select(COLS).ilike("email", email).limit(1);
    const row = first(data);
    if (row) return shape(row);
  }
  return null;
}

/** The trainer a CLIENT belongs to — whose name they see, whose Venmo they pay. */
export async function trainerForClient(
  db: Queryable,
  clientId: string | null | undefined,
): Promise<TrainerRecord | null> {
  if (!clientId) return null;
  const { data: cRows } = await db.from("clients").select("trainer_id").eq("id", clientId).limit(1);
  const c = first(cRows);
  const tid = c?.trainer_id;
  if (!tid) return null;
  const { data } = await db.from("trainers").select(COLS).eq("id", tid).limit(1);
  return shape(first(data));
}

/**
 * The owner. For facts about the BUSINESS rather than about a person: where an
 * infrastructure alert goes, who a spend warning emails, which calendar the
 * shared library was built from.
 */
export async function ownerTrainer(db: Queryable): Promise<TrainerRecord | null> {
  const { data } = await db.from("trainers").select(COLS).eq("role", "owner").limit(1);
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
  db: Queryable,
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
  db: Queryable,
  clientId: string | null | undefined,
): Promise<string> {
  try {
    const t = await trainerForClient(db, clientId);
    return t?.email || TRAINER_EMAIL;
  } catch {
    return TRAINER_EMAIL;
  }
}
