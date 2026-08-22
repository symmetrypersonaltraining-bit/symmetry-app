import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { payDestinationFor, payDestinationIsSet } from "@/lib/payDest";
import { readFlag } from "@/lib/flags";
import type { SetupCheckKey } from "@/lib/tutorial/script";
import TutorialClient from "./TutorialClient";

/**
 * The new-trainer walkthrough.
 *
 * SHIPS DARK. `trainer_tutorial_live` defaults to false, so this route sends
 * everyone to /home until somebody flips it in Settings. It is built and
 * complete; it is simply not reachable yet, on purpose.
 *
 * The setup checklist is READ, never asked. A trainer who has already
 * connected their calendar should not be handed a box to tick about it — the
 * app knows. Every check below is a real query against this trainer's own
 * rows, which also means the checklist cannot be gamed into looking finished.
 */

export const dynamic = "force-dynamic";

/**
 * The generated Supabase types make a chained builder deep enough that tsc
 * gives up with "type instantiation is excessively deep" on a file with this
 * many queries in it. Same boundary trick trainerResolve.ts uses: describe the
 * three shapes actually needed and cross over once, deliberately, here.
 */
type Row = Record<string, unknown>;
interface Res { data: Row[] | Row | null; error: unknown }
interface Q {
  select: (c: string) => Q;
  eq: (c: string, v: string) => Q;
  in: (c: string, v: string[]) => Q;
  is: (c: string, v: null) => Q;
  limit: (n: number) => PromiseLike<Res>;
  maybeSingle: () => PromiseLike<Res>;
}
type QDb = { from: (t: string) => Q };
const q = (db: unknown) => db as QDb;

async function readSetup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string,
): Promise<Record<SetupCheckKey, boolean>> {
  const done: Record<SetupCheckKey, boolean> = {
    profile: false, pay: false, calendar: false,
    client: false, program: false, message: false, push: false,
  };

  // avatar_url straight off the trainer row — the same column coachForViewer
  // hands to every screen that draws this trainer's face. Read here rather
  // than through that resolver only because trainerResolve does not select it.
  const { data: me } = await q(supabase)
    .from("trainers")
    .select("id, avatar_url")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const meRow = me as { id?: string; avatar_url?: string | null } | null;
  done.profile = !!meRow?.avatar_url;

  // Through the gate, not off the row: SELECT on the payment columns is
  // revoked, and trainer_pay_details() lets a trainer read their own.
  done.pay = payDestinationIsSet(await payDestinationFor(supabase, meRow?.id));

  const { data: settings } = await q(supabase)
    .from("trainer_settings")
    .select("google_refresh_token")
    .eq("user_id", authUserId)
    .maybeSingle();
  done.calendar = !!(settings as { google_refresh_token?: string | null } | null)?.google_refresh_token;

  // RLS already scopes clients to this trainer, so an unqualified count is
  // this trainer's roster and not the whole gym.
  const { data: clients } = await q(supabase)
    .from("clients")
    .select("id")
    .is("archived_at", null)
    .limit(50);
  const ids = ((clients || []) as { id: string }[]).map((c) => c.id);
  done.client = ids.length > 0;

  if (ids.length) {
    const { data: assigned } = await q(supabase)
      .from("program_assignments")
      .select("id")
      .in("client_id", ids)
      .limit(1);
    done.program = ((assigned || []) as unknown[]).length > 0;
  }

  const { data: sent } = await q(supabase)
    .from("messages")
    .select("id")
    .eq("from_id", authUserId)
    .limit(1);
  done.message = ((sent || []) as unknown[]).length > 0;

  const { data: tokens } = await q(supabase)
    .from("device_tokens")
    .select("id")
    .eq("user_id", authUserId)
    .limit(1);
  done.push = ((tokens || []) as unknown[]).length > 0;

  return done;
}

export default async function TutorialPage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  const live = await readFlag(supabase, "trainer_tutorial_live");
  if (!live) redirect("/home");

  const setup = await readSetup(supabase, user.id);

  return <TutorialClient setup={setup} />;
}
