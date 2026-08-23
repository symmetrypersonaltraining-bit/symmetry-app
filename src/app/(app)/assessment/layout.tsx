// THE ASSESSMENT IS A TRAINER SURFACE.
//
// /assessment is a "use client" page with no server gate at all — the only
// check anywhere in the flow is inside the server action it eventually calls,
// which throws 'Trainer only'. So a client could open the whole intake form,
// fill in a stranger's name, date of birth, phone number, emergency contact and
// injury history, and only find out at Save.
//
// That is the wrong order. The refusal belongs before the typing.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export default async function AssessmentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");
  return <>{children}</>;
}
