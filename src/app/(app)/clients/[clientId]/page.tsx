import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import Link from "next/link";
import ClientProfileTabs from "./ClientProfileTabs";
import PlateauSpotter from "@/components/PlateauSpotter";
import ClientWorkoutAI from "@/components/ClientWorkoutAI";
import InviteClientButton from "./InviteClientButton";
import ResetCredentialsButton from "./ResetCredentialsButton";
import ArchiveClientButton from "./ArchiveClientButton";
import { isTrainerEmail } from "@/lib/trainer";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!isTrainerEmail(user.email)) redirect("/home");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, auth_user_id, created_at, payment_reminders_enabled, injuries_limitations, primary_goal, secondary_goals, experience_level, training_frequency, current_weight, current_body_fat_pct, date_of_birth, start_date, notes, current_fees, is_self_coached, archived_at")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  // Wide range for the training calendar (3 months back, 3 months forward)
  const rangeStart = new Date();
  rangeStart.setMonth(rangeStart.getMonth() - 3);
  const rangeEnd = new Date();
  rangeEnd.setMonth(rangeEnd.getMonth() + 3);

  // Cast as any to bypass generated-type constraint on day_id column
  const { data: allWorkoutsRaw } = await (supabase as any)
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, day_id, days(id, label, position)")
    .is("deleted_at", null)
    .eq("client_id", clientId)
    // Central, not UTC: after 7pm Central the UTC date is already tomorrow.
    .gte("scheduled_date", rangeStart.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
    .lte("scheduled_date", rangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
    .order("scheduled_date", { ascending: true });

  const { data: latestMetrics } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientId)
    .order("metric_date", { ascending: false })
    .limit(6);

  const { data: assignment } = await supabase
    .from("program_assignments")
    .select("id, program_id, start_date:assigned_at, active")
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  const { data: programsRaw } = await supabase
    .from("programs")
    .select("id, name, description")
    .order("name");
  const programs = (programsRaw || []) as { id: string; name: string; description: string | null }[];

  const { count: completedTotal } = await supabase
    .from("scheduled_workouts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("client_id", clientId)
    .eq("status", "completed");

  const prog = programs.find(p => p.id === (assignment as any)?.program_id);
  const initials = client.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarBgs = ["#DDEEFF","#FEF3C7","#F3E8FF","#FEE2E2","#D1FAE5","#FCE7F3"];
  const avatarTexts = ["var(--brand-primary)","#92400E","#6B21A8","#991B1B","#065F46","#9D174D"];
  const ci = client.name.charCodeAt(0) % avatarBgs.length;
  const lm = latestMetrics?.[0] as any;
  const metrics = (latestMetrics || []).reverse() as any[];
  const allWorkouts = (allWorkoutsRaw || []) as any[];

  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* HERO */}
      <div style={{ background: "var(--brand-primary)" }} className="px-4 pt-4 pb-0">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/clients"
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <i className="ti ti-arrow-left text-white text-base" />
          </Link>
          <span className="text-white/80 text-sm">Clients</span>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
            style={{ background: avatarBgs[ci], color: avatarTexts[ci] }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-xl font-bold">{client.name}</h1>
            <p className="text-white/60 text-xs truncate">{client.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {prog && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                  {prog.name}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: (client as any).archived_at
                    ? "rgba(120,113,108,0.55)"
                    : client.auth_user_id ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.15)",
                  color: "white",
                }}>
                {(client as any).archived_at ? "Archived" : client.auth_user_id ? "Active" : "Pending"}
              </span>
              {!client.auth_user_id && client.email && (
                <InviteClientButton clientId={client.id} clientName={client.name} />
              )}
              {client.auth_user_id && client.email && (
                <ResetCredentialsButton clientId={client.id} />
              )}
              <ArchiveClientButton clientId={client.id} archived={!!(client as any).archived_at} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-white text-lg font-bold">{completedTotal || 0}</div>
            <div className="text-white/60 text-xs">sessions</div>
          </div>
        </div>

        {/* QUICK STATS inline */}
        <div className="flex gap-4 pb-1">
          {[
            { label: "Weight", value: lm?.weight ? `${lm.weight} lb` : (client.current_weight ? `${client.current_weight} lb` : "\u2014") },
            { label: "Body Fat", value: lm?.body_fat_pct ? `${lm.body_fat_pct}%` : (client.current_body_fat_pct ? `${client.current_body_fat_pct}%` : "\u2014") },
            { label: "Lean Mass", value: lm?.lean_mass ? `${lm.lean_mass} lb` : "\u2014" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-white text-sm font-bold">{s.value}</div>
              <div className="text-white/50 text-[10px]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trainer-only coaching hint. Renders nothing when nothing is flagged. */}
      <PlateauSpotter clientId={clientId} />

      {/* AI workout assist — review/adjust this client's scheduled sessions */}
      <div className="px-4 pt-4">
        <ClientWorkoutAI clientId={clientId} clientName={client.name} />
      </div>

      <ClientProfileTabs
        client={client as any}
        metrics={metrics}
        allWorkouts={allWorkouts}
        clientId={clientId}
        programs={programs}
        currentProgramId={(assignment as any)?.program_id}
      />
    </div>
  );
}