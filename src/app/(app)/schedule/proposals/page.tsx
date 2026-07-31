import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProposalsClient from "./ProposalsClient";

// Trainer approval surface for schedule_change_proposals.
//
// detect_schedule_changes() runs headless every 12h and files proposals. Until
// now the only way to read them was a SQL query, so 80 sat unseen. Nothing moves
// without approval — the detector proposes, Dustin decides.
//
// Deliberately its own route rather than a panel on client_notifications:
// that table is client-facing and payment-shaped, and reusing it would put
// trainer-only rows in front of clients.

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ScheduleProposalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  const { data: rows } = await supabase
    .from("schedule_change_proposals")
    .select("id, client_id, reason, confidence, from_date, to_date, detail, status, created_at")
    .eq("status", "pending")
    .order("from_date");

  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name")
    .is("archived_at", null);

  const nameOf: Record<string, string> = {};
  (clientRows || []).forEach((c: any) => { nameOf[c.id] = c.name; });

  const proposals = (rows || []).map((r: any) => ({
    id: r.id,
    clientId: r.client_id,
    client: nameOf[r.client_id] || "(unknown client)",
    reason: r.reason as string,
    confidence: r.confidence as string,
    fromDate: r.from_date as string,
    toDate: (r.to_date ?? null) as string | null,
    note: (r.detail?.note ?? null) as string | null,
    createdAt: r.created_at as string,
  }));

  return <ProposalsClient proposals={proposals} />;
}
