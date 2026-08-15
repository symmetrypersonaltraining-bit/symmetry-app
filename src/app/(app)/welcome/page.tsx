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
import { getServerUser } from "@/lib/auth/serverUser";
import WelcomeClient from "./WelcomeClient";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const { data: c } = await supabase
    .from("clients")
    .select("id, name, onboarding_complete")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const client = c as { id: string; name: string | null; onboarding_complete: boolean | null } | null;

  return (
    <WelcomeClient
      firstName={(client?.name || "").split(" ")[0] || "there"}
      clientId={client?.id ?? null}
      // A brand-new client still owes Dustin the goals/history questionnaire.
      // This screen sets the APP up; that one collects the answers. Order
      // matters — nobody should be asked about injuries before they have a
      // password.
      needsIntake={client?.onboarding_complete === false}
    />
  );
}
