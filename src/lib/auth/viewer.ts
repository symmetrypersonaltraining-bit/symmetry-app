// IS THE PERSON LOOKING AT THIS SCREEN A TRAINER? Ask the database.
//
// `isTrainerEmail()` answers from a list fixed at build time. That was correct
// while the only way to become a trainer was to edit the list and deploy. From
// 22 Aug an owner adds one from inside the app, and that trainer is real
// immediately — the `trainers` row exists, auth_user_id is stamped, is_trainer()
// in Postgres returns true for them, every RLS policy lets them through.
//
// The app layer was the only thing that said no, and it said it everywhere:
// the client shell instead of the trainer shell, the client onboarding wizard
// on every navigation, 403 on the roster and on every AI route. All of it over
// data the database would have handed them.
//
// This is the one answer, resolved once per request from the `trainers` table:
//
//   viewerIsTrainer(db, user) -> boolean
//
// It also calls noteTrainerEmail(), so the synchronous isTrainerEmail() checks
// further down the same render agree with what was just read. That matters: a
// page can resolve this once at the top and the client components it renders,
// which cannot await anything, still get the right answer.
//
// FAILS OPEN TO THE BUILD-TIME LIST, never closed. If the trainers table cannot
// be reached, Dustin and Stephanie must still be trainers — a database blip
// must not demote the owner in his own app.

import { isTrainerEmail, noteTrainerEmail } from "@/lib/trainer";

interface MinimalDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => { limit: (n: number) => PromiseLike<{ data: unknown }> };
      ilike: (col: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown }> };
    };
  };
}

export interface ViewerUser {
  id?: string | null;
  email?: string | null;
}

const first = (d: unknown): Record<string, unknown> | null =>
  Array.isArray(d) ? ((d[0] as Record<string, unknown>) ?? null) : null;

/**
 * True when this user has an ACTIVE row in `trainers`, or is on the build-time
 * list. Safe to call repeatedly; the second call in a request is a cache hit on
 * the learned set rather than a query.
 */
export async function viewerIsTrainer(
  db: unknown,
  user: ViewerUser | null | undefined,
): Promise<boolean> {
  if (!user) return false;
  // The build-time list first — no query for the two trainers who are baked in,
  // which is still every request on Dustin's instance today.
  if (isTrainerEmail(user.email)) return true;
  if (!user.id && !user.email) return false;

  try {
    const q = db as MinimalDb;
    // By auth id first. invite-trainer stamps auth_user_id at insert, so this
    // is the normal path.
    if (user.id) {
      const { data } = await q.from("trainers").select("email, active").eq("auth_user_id", user.id).limit(1);
      const row = first(data);
      if (row && row.active !== false) {
        noteTrainerEmail((row.email as string) || user.email);
        return true;
      }
    }
    // By address, for a row whose auth link was never stamped — a trainer added
    // straight into the table, or one whose login was created separately.
    // my_trainer_id() and is_trainer() both resolve this way too, so a row
    // matching here is a trainer as far as every RLS policy is concerned.
    if (user.email) {
      const { data } = await q.from("trainers").select("email, active").ilike("email", user.email).limit(1);
      const row = first(data);
      if (row && row.active !== false) {
        noteTrainerEmail((row.email as string) || user.email);
        return true;
      }
    }
  } catch {
    // Fall through to the build-time answer below.
  }
  return isTrainerEmail(user.email);
}
