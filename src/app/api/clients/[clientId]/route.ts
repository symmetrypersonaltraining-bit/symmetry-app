import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrainerEmail } from "@/lib/trainer";
import { validateBillingFields } from "@/lib/billingFields";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isTrainerEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // archived_at is a soft roster state: an ISO timestamp takes the client off
  // the roster, null puts them back. Nothing is ever deleted either way.
  //
  // `billing_type` was NOT on this list, despite being the field that decides
  // how a client is billed at all. It could only be changed by editing the
  // database by hand, which is why every client sat on whatever they were
  // created with and why the Billing & Schedule screen could not exist.
  const allowed = ["payment_reminders_enabled", "current_fees", "notes",
    "session_rate", "billing_cadence", "training_frequency", "days_per_week", "training_days",
    "billing_type", "expected_sessions_per_cycle",
    "billing_anchor_day", "billing_anchor_day_2", "billing_anchor_weekday",
    "paid_by_client_id",
    "archived_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Validate before writing. A bad billing_type would be refused by the CHECK
  // constraint anyway, but as a 500 with raw Postgres text on a screen about
  // somebody's money — and the numeric fields have no constraint at all, so a
  // negative rate or a fifteen-session-per-week frequency would simply be
  // stored and then quietly used in an invoice.
  const invalid = validateBillingFields(updates);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // `.select("id")` because an UPDATE matching zero rows is not an error in
  // PostgREST. Without it a refused write — RLS, a wrong id — returns ok:true
  // and the profile screen shows the value the trainer just typed while the
  // database keeps the old one. On billing fields that difference is an invoice.
  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", clientId)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Nothing was saved — that client was not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
