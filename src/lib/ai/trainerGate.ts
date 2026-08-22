/**
 * WHO MAY USE THE TRAINER AGENT. One answer, server-side, fail-closed.
 *
 * Dustin, 22 Aug: "When I click that AI button from the trainer app, it should
 * open up my trainer assistant, not the client coach. However, I need you to be
 * very careful at making sure this only happens from the trainer app, not from
 * any client's app... I will be adding three trainers to the system today. All
 * trainers will need this function in only the trainer app, but no clients can
 * have this function. So there needs to be a very strong guard up for that."
 *
 * The trainer agent is not a chat surface with a different tone. It can read
 * ANY client on the caller's roster, rewrite programmes, move calendar
 * sessions, change macro targets and message people. Its tools run on the
 * SERVICE ROLE, which bypasses RLS completely — so RLS is not the backstop
 * here the way it is everywhere else in this app. This function is the
 * backstop. If it is wrong, a client is holding the trainer's console.
 *
 * ── THREE RULES ──────────────────────────────────────────────────────────
 *
 * 1. AUTHENTICATED IDENTITY ONLY. Match on auth_user_id and nothing else.
 *    trainerForAuthUser() falls back to matching a trainers row by EMAIL, which
 *    is right for the job it does — naming a coach who has a row but has not
 *    signed in yet — and wrong for an authorization decision. An address is a
 *    field on a row; it is not proof of who is holding the phone.
 *
 * 2. ACTIVE ONLY. `trainers.active` existed and nothing checked it, so
 *    deactivating a trainer took away nothing at all: they kept the agent and
 *    kept their roster. With three more trainers arriving, "remove a trainer"
 *    has to actually remove them, and it has to work by flipping one column.
 *
 * 3. NOT FROM THE CLIENT APP. A trainer in Client View is looking at the client
 *    app — that is the entire point of Client View — and the trainer console
 *    does not belong there. It is also the cheapest way to check what a client
 *    can see: if the agent is unreachable in client mode, it is unreachable on
 *    every screen a client has.
 *
 * The UI decides which button to draw. It never decides who is allowed.
 */

export interface TrainerGateInput {
  /** An ACTIVE trainers row matched on auth_user_id. Null when there is none. */
  trainerRow: { id: string; active: boolean } | null;
  /** Is this request coming from the client app (Client View)? */
  inClientMode: boolean;
}

export type TrainerGateVerdict =
  | { allowed: true; trainerId: string }
  | { allowed: false; reason: "not-a-trainer" | "deactivated" | "client-mode" };

/**
 * Pure, so every way in can be enumerated in a test rather than reasoned about.
 * Order matters only for the message; any single failure denies.
 */
export function trainerGate(input: TrainerGateInput): TrainerGateVerdict {
  if (!input.trainerRow) return { allowed: false, reason: "not-a-trainer" };
  if (!input.trainerRow.active) return { allowed: false, reason: "deactivated" };
  if (input.inClientMode) return { allowed: false, reason: "client-mode" };
  return { allowed: true, trainerId: input.trainerRow.id };
}

/** What to tell the caller. Never leaks whether the row exists. */
export function gateMessage(reason: "not-a-trainer" | "deactivated" | "client-mode"): string {
  return reason === "client-mode"
    ? "The trainer assistant is not available in client view. Switch back to trainer view first."
    : "Trainer only.";
}

interface GateDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: string) => {
        limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * The ACTIVE trainer row for an authenticated user, or null.
 *
 * `db` is deliberately unknown at the boundary — the generated Supabase types
 * are deep enough to make tsc bail in a file that also runs its own queries.
 * One cast here beats ceremony at every call site.
 */
export async function activeTrainerRow(
  db: unknown,
  authUserId: string | null | undefined,
): Promise<{ id: string; active: boolean } | null> {
  if (!authUserId) return null;
  try {
    const { data, error } = await (db as GateDb)
      .from("trainers")
      .select("id, active")
      .eq("auth_user_id", authUserId)
      .limit(1);
    if (error) return null; // an unreadable table denies; it never grants
    const row = (data as { id: string; active: boolean }[] | null)?.[0];
    if (!row) return null;
    return { id: String(row.id), active: row.active === true };
  } catch {
    return null;
  }
}

/** The cookie the app sets while a trainer is looking at the client app. */
export const CLIENT_MODE_COOKIE = "symmetry_client_mode";

/**
 * Client mode from a request's own cookies, plus the explicit ?as=client marker
 * the app uses on first render before the cookie has propagated. Either one
 * counts — a guard that waits for the cookie has a window where it is wrong.
 */
export function inClientModeFrom(
  cookieValue: string | undefined | null,
  asMarker?: string | null,
): boolean {
  return asMarker === "client" || cookieValue === "1";
}
