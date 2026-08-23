// THE LIBRARY IS A TRAINER SURFACE.
//
// /library/exercises, /library/workouts and /library/programs were gated on
// being SIGNED IN and nothing else, so any client who typed the URL got the
// movement library, every saved workout, and every programme in the gym —
// including the ones running on other trainers' clients. /library/videos had
// its own trainer check; the other three did not, and nothing links to them
// from the client app, so this was never a route anyone was meant to have.
//
// RLS still governs the ROWS (see 20260821e/h for programme visibility). This
// governs the PAGE, which is the part a person can reach by guessing.
//
// A layout rather than four copies of the same four lines: the next page added
// under /library inherits the gate instead of having to remember it.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");
  return <>{children}</>;
}
