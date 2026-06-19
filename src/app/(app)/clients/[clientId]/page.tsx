import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import PaymentReminderToggle from "./PaymentReminderToggle";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only trainer can access client profiles
  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";
  if (!isTrainer) redirect("/home");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, auth_user_id, created_at, payment_reminders_enabled")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

  // Get active program + all phases/days
  const { data: assignment } = await supabase
    .from("program_assignments")
    .select(`
      id, start_date, active,
      programs(id, name,
        phases(id, label, position,
          days(id, label, position, day_of_week)
        )
      )
    `)
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  // Workout history
  const { data: recentLogs } = await supabase
    .from("workout_logs")
    .select("id, log_date, completed, day_id, days(label)")
    .eq("client_id", clientId)
    .order("log_date", { ascending: false })
    .limit(10);

  // Workout count
  const { count: totalWorkouts } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("completed", true);

  // Upcoming payment reminders for this client
  const today = new Date().toISOString().split("T")[0];
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const { data: upcomingReminders } = await supabase
    .from("payment_reminders")
    .select("due_date, amount_due, notification_status")
    .eq("client_id", clientId)
    .gte("due_date", today)
    .lte("due_date", in60.toISOString().split("T")[0])
    .order("due_date")
    .limit(6);

  // Body weight
  const { data: latestWeight } = await supabase
    .from("body_weight_logs")
    .select("weight_lbs, logged_at")
    .eq("client_id", clientId)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prog = (assignment as any)?.programs;
  const phases = prog
    ? [...(prog.phases || [])].sort((a: any, b: any) => a.position - b.position)
    : [];

  const initials = client.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const avatarColors = [
    { bg: "#DDEEFF", text: "#0F4C81" },
    { bg: "#FEF3C7", text: "#92400E" },
    { bg: "#F3E8FF", text: "#6B21A8" },
    { bg: "#FEE2E2", text: "#991B1B" },
  ];
  const color = avatarColors[client.name.charCodeAt(0) % avatarColors.length];

  return (
    <>
      {/* Header */}
      <div style={{ background: "#0F4C81" }} className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <i className="ti ti-arrow-left text-white text-lg" />
          </Link>
          <h1 className="text-white font-medium text-lg">Client Profile</h1>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium flex-shrink-0"
            style={{ background: color.bg, color: color.text }}
          >
            {initials}
          </div>
          <div>
            <div className="text-white text-xl font-medium">{client.name}</div>
            <div className="text-white/60 text-sm">{client.email}</div>
            <div className="mt-1">
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
              >
                {client.auth_user_id ? "âœ“ App access" : "Invite pending"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: "white", border: "0.5px solid #C8D8EC" }}
          >
            <div className="text-xl font-medium" style={{ color: "#0F4C81" }}>
              {totalWorkouts || 0}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>Workouts</div>
          </div>
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: "white", border: "0.5px solid #C8D8EC" }}
          >
            <div className="text-xl font-medium" style={{ color: "#0F4C81" }}>
              {latestWeight?.weight_lbs ? `${latestWeight.weight_lbs} lb` : "â€”"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>Current wt.</div>
          </div>
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: "white", border: "0.5px solid #C8D8EC" }}
          >
            <div className="text-xl font-medium" style={{ color: "#0F4C81" }}>
              {phases.length}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>Phases</div>
          </div>
        </div>

        {/* Program */}
        {prog && (
          <>
            <p className="label">program Â· {prog.name}</p>
            {phases.map((phase: any) => (
              <div key={phase.id} className="mb-3">
                <div className="card" style={{ padding: "0.5rem 1rem" }}>
                  <div className="text-xs font-medium mb-2" style={{ color: "#0EA5E9" }}>
                    {phase.label}
                  </div>
                  {[...phase.days]
                    .sort((a: any, b: any) => a.position - b.position)
                    .map((day: any) => (
                      <Link
                        key={day.id}
                        href={`/workout/${day.id}`}
                        className="flex items-center gap-3 py-2.5 border-b last:border-b-0 -mx-4 px-4"
                        style={{ borderColor: "#EDF2F7" }}
                      >
                        <i className="ti ti-calendar text-sm" style={{ color: "#4E6080" }} />
                        <span className="text-sm flex-1">{day.label}</span>
                        <i className="ti ti-chevron-right text-sm" style={{ color: "#C8D8EC" }} />
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Payment reminder toggle */}
        <PaymentReminderToggle
          clientId={client.id}
          clientName={client.name}
          enabled={(client as any).payment_reminders_enabled ?? true}
          upcomingReminders={(upcomingReminders || []).map((r: any) => ({
            date: r.due_date,
            amount: Number(r.amount_due),
            status: r.notification_status,
          }))}
        />

        {/* Recent workout history */}
        {recentLogs && recentLogs.length > 0 && (
          <>
            <p className="label mt-2">recent workouts</p>
            <div className="card" style={{ padding: "0.5rem 1rem" }}>
              {recentLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                  style={{ borderColor: "#EDF2F7" }}
                >
                  <div
         