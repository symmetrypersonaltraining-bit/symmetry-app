// /welcome — the first three minutes.
//
// Dustin, 2026-08-04: "id like an easier start up for clients on both apps ios
// n android. the flow is currently very sloppy for new clients."
//
// It was four disconnected steps a client had to assemble themselves: find the
// email, copy a ten-character password, sideload an APK past a Play Protect
// warning (or guess at Add to Home Screen on an iPhone), then land on a
// dashboard with no idea what any of it was.
//
// This is the same steps in one screen, in order, with the session already
// established by the one-tap link — so the first thing they do is choose a
// password rather than type one somebody else chose.
//
// Deliberately skippable at every step. A client who wants to get to their
// programme can, and nothing here blocks them.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/serverUser";
import WelcomeClient from "./WelcomeClient";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: c } = await supabase
    .from("clients")
    .select("id, name, onboarding_complete")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const client = c as { id: string; name: string | null; onboarding_complete: boolean | null } | null;

  // A TRAINER arrives here too, and for the same reason a client does: they
  // were invited with a temporary password that was emailed to them in plain
  // text, and nothing else in the app would ever make them change it. Before
  // this they were sent straight to the walkthrough and kept that password
  // indefinitely.
  //
  // No client row does not prove they are a trainer — it might be a broken
  // invite — so ask the trainers table rather than inferring from an absence.
  let trainerFirst: string | null = null;
  if (!client) {
    const { data: t } = await supabase
      .from("trainers")
      .select("first_name, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const row = t as { first_name?: string | null; name?: string | null } | null;
    if (row) trainerFirst = row.first_name || (row.name || "").split(" ")[0] || "there";
  }

  return (
    <WelcomeClient
      isTrainer={!!trainerFirst}
      firstName={trainerFirst || (client?.name || "").split(" ")[0] || "there"}
      clientId={client?.id ?? null}
      // A brand-new client still owes Dustin the goals/history questionnaire.
      // This screen sets the APP up; that one collects the answers. Order
      // matters — nobody should be asked about injuries before they have a
      // password.
      needsIntake={client?.onboarding_complete === false}
    />
  );
}
