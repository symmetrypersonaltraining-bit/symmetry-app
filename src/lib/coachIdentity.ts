// WHICH coach the person looking at this screen has.
//
// `COACH_NAME` and `COACH_FIRST_NAME` are build-time constants read from
// NEXT_PUBLIC_COACH_NAME, and 226 lines across 66 files use them to answer a
// question that is now per-viewer: whose name goes on this button, whose face
// goes on this badge, who does "message your coach" mean.
//
// One environment variable cannot serve two trainers on one deployment. It is
// not a configuration problem and no amount of setting it correctly fixes it —
// whichever name it holds is wrong for half the clients.
//
// This module resolves the answer once, server-side, from the database. The
// client half lives in useCoach.tsx and is seeded from here in the app layout.

import { COACH_NAME, COACH_FIRST_NAME } from "@/lib/trainer";

export interface CoachIdentity {
  /** "Stephanie" — what a client is shown in ordinary copy. */
  firstName: string;
  /** "Stephanie Gautreaux" — signatures, formal lines. */
  name: string;
  /** Their photo, or null. NEVER falls back to another trainer's face. */
  avatarUrl: string | null;
  /** The trainers row id, for anything that needs to scope further. */
  trainerId: string | null;
  /**
   * The business owner. Two of the celebration cards are cutout PHOTOGRAPHS of
   * him specifically (/coach-flex.webp, /coach-head.webp) rather than a generic
   * frame, so they are shown only when the viewer's coach is him.
   */
  isOwner: boolean;
  /** True when the viewer IS this coach — a trainer in their own client view. */
  isSelf: boolean;
}

/**
 * The fallback, used only when a viewer has no resolvable coach at all: a
 * signed-out shell, a client row that has not been created yet, a page rendered
 * outside the provider.
 *
 * It carries the OWNER's name because the business is his, and NO AVATAR —
 * a name that is merely generic is a small wrong; another trainer's face on
 * your coach's badge is the thing Dustin asked to be impossible.
 */
export const DEFAULT_COACH: CoachIdentity = {
  firstName: COACH_FIRST_NAME,
  name: COACH_NAME,
  avatarUrl: null,
  trainerId: null,
  isOwner: false,
  isSelf: false,
};

interface MinimalDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => {
        limit: (n: number) => PromiseLike<{ data: unknown; error?: unknown }>;
      };
    };
  };
}

const first = (d: unknown): Record<string, unknown> | null =>
  Array.isArray(d) ? ((d[0] as Record<string, unknown>) ?? null) : null;

function shape(row: Record<string, unknown> | null, isSelf: boolean): CoachIdentity | null {
  if (!row) return null;
  const name = String(row.name || "");
  return {
    firstName: String(row.first_name || name.split(/\s+/)[0] || COACH_FIRST_NAME),
    name: name || COACH_NAME,
    avatarUrl: (row.avatar_url as string) || null,
    trainerId: String(row.id),
    isOwner: row.role === "owner",
    isSelf,
  };
}

const COLS = "id, name, first_name, avatar_url, role";

/**
 * The coach for a specific client. Use this on any screen that is ABOUT a
 * client — a trainer previewing someone's app included, because the point of
 * the preview is to see what that client sees.
 */
export async function coachForClientId(
  db: MinimalDb,
  clientId: string | null | undefined,
  viewerTrainerId?: string | null,
): Promise<CoachIdentity> {
  if (!clientId) return DEFAULT_COACH;
  try {
    const { data: cRows } = await db.from("clients").select("trainer_id").eq("id", clientId).limit(1);
    const tid = first(cRows)?.trainer_id as string | undefined;
    if (!tid) return DEFAULT_COACH;
    const { data } = await db.from("trainers").select(COLS).eq("id", tid).limit(1);
    return shape(first(data), !!viewerTrainerId && viewerTrainerId === tid) ?? DEFAULT_COACH;
  } catch {
    return DEFAULT_COACH;
  }
}

/**
 * The coach for the signed-in person.
 *
 * A client gets their own trainer. A trainer gets themselves — which is right
 * for their own client view, and is why `isSelf` exists: the nutrition coach
 * prompt has a whole branch for "this client IS the trainer, do not tell him to
 * message himself", and until now that branch keyed off an email allowlist,
 * so from the day Stephanie was added to it the model was told SHE was Dustin.
 */
export async function coachForViewer(
  db: MinimalDb,
  authUserId: string | null | undefined,
): Promise<CoachIdentity> {
  if (!authUserId) return DEFAULT_COACH;
  try {
    // A trainer first: they are their own coach, and a trainer who also has a
    // client row must not resolve through it to whoever trains THEM.
    const { data: tRows } = await db.from("trainers").select(COLS).eq("auth_user_id", authUserId).limit(1);
    const self = shape(first(tRows), true);
    if (self) return self;

    const { data: cRows } = await db.from("clients").select("id, trainer_id").eq("auth_user_id", authUserId).limit(1);
    const tid = first(cRows)?.trainer_id as string | undefined;
    if (!tid) return DEFAULT_COACH;
    const { data } = await db.from("trainers").select(COLS).eq("id", tid).limit(1);
    return shape(first(data), false) ?? DEFAULT_COACH;
  } catch {
    return DEFAULT_COACH;
  }
}
