import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ClientProfileTabs from "./ClientProfileTabs";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== "symmetrypersonaltraining@gmail.com") redirect("/home");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, auth_user_id, created_at, payment_reminders_enabled, injuries_limitations, primary_goal, current_weight, current_body_fat_pct, experience_level, training_frequency")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  const todayStr = new Date().toISOString().split("T")[0];
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const in14Str = in14.toISOString().split("T")[0];

  const { data: upcomingRaw } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, day_id, days(id, label, position)")
    .eq("client_id", clientId)
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", in14Str)
    .order("scheduled_date", { ascending: true })
    .limit(10);

  const { data: recentRaw } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .eq("client_id", clientId)
    .lt("scheduled_date", todayStr)
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const { data: latestMetrics } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientId)
    .order("metric_date", { ascending: false })
    .limit(6);

  const metrics = (latestMetrics || []).reverse();

  const { data: assignment } = await supabase
    .from("program_assignments")
    .select("id, start_date, active, programs(id, name)")
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  const { count: completedTotal } = await supabase
    .from("scheduled_workouts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "completed");

  const prog = (assignment as any)?.programs;
  const initials = client.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarBgs = ["#DDEEFF","#FEF3C7","#F3E8FF","#FEE2E2","#D1FAE5","#FCE7F3"];
  const avatarTexts = ["#0F4C81","#92400E","#6B21A8","#991B1B","#065F46","#9D174D"];
  const ci = client.name.charCodeAt(0) % avatarBgs.length;
  const upcoming = (upcomingRaw || []) as any[];
  const recent = (recentRaw || []) as any[];
  const lm = latestMetrics?.[0] as any;

  const todayW = upcoming.find((w: any) => w.scheduled_date === todayStr);

  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* HERO */}
      <div style={{ background: "var(--brand-primary)" }} className="px-4 pt-4 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/clients"
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <i className="ti ti-arrow-left text-white text-base" />
          </Link>
          <span className="text-white/80 text-sm">Clients</span>
        </div>
        <div className="flex items-center gap-4">
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
                style={{ background: client.auth_user_id ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.15)", color: "white" }}>
                {client.auth_user_id ? "Active" : "Pending"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-white text-lg font-bold">{completedTotal || 0}</div>
            <div className="text-white/60 text-xs">sessions</div>
          </div>
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="flex gap-px" style={{ background: "var(--brand-border)" }}>
        {[
          { label: "Weight", value: lm?.weight ? `${lm.weight} lb` : (client.current_weight ? `${client.current_weight} lb` : "—") },
          { label: "Body Fat", value: lm?.body_fat_pct ? `${lm.body_fat_pct}%` : (client.current_body_fat_pct ? `${client.current_body_fat_pct}%` : "—") },
          { label: "Lean Mass", value: lm?.lean_mass ? `${lm.lean_mass} lb` : "—" },
        ].map((s) => (
          <div key={s.label} className="flex-1 py-3 text-center"
            style={{ background: "var(--brand-surface)" }}>
            <div className="text-base font-bold" style={{ color: "var(--brand-text)" }}>{s.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="p-4 space-y-5">

        {/* TODAY'S SESSION */}
        {todayW && (() => {
          const done = todayW.status === "completed";
          const dayId = todayW.days?.id || todayW.day_id;
          return (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--brand-text-secondary)" }}>Today&apos;s Session</p>
              <Link href={`/workout/${dayId}?forClient=${clientId}`}>
                <div className="rounded-2xl p-5 relative overflow-hidden"
                  style={{ background: done ? "var(--brand-surface)" : "var(--brand-primary)", border: done ? "1px solid var(--brand-border)" : "none" }}>
                  {!done && (
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
                      style={{ background: "white", transform: "translate(30%,-30%)" }} />
                  )}
                  <div className="relative flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold mb-1"
                        style={{ color: done ? "var(--brand-text-secondary)" : "rgba(255,255,255,0.7)" }}>
                        {new Date(todayW.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      </p>
                      <h3 className="text-lg font-bold" style={{ color: done ? "var(--brand-text)" : "white" }}>
                        {todayW.days?.label || "Workout"}
                      </h3>
                    </div>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: done ? "#22c55e20" : "rgba(255,255,255,0.2)" }}>
                      <i className={`ti ${done ? "ti-check" : "ti-player-play"} text-xl`}
                        style={{ color: done ? "#22c55e" : "white" }} />
                    </div>
                  </div>
                  {!done && (
                    <div className="mt-4 inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 text-sm font-bold"
                      style={{ color: "var(--brand-primary)" }}>
                      <i className="ti ti-player-play" />
                      Run Session
                    </div>
                  )}
                </div>
              </Link>
            </div>
          );
        })()}

        {/* UPCOMING */}
        {upcoming.filter(w => w.scheduled_date !== todayStr).length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>Upcoming</p>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              {upcoming
                .filter(w => w.scheduled_date !== todayStr)
                .map((w: any, i: number, arr: any[]) => {
                  const dt = new Date(w.scheduled_date + "T00:00:00");
                  const dow = dt.toLocaleDateString("en-US", { weekday: "short" });
                  const done = w.status === "completed";
                  const dayId = w.days?.id || w.day_id;
                  return (
                    <Link key={w.id} href={`/workout/${dayId}?forClient=${clientId}`}
                      className={`flex items-center gap-4 px-4 py-3.5 ${i < arr.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "var(--brand-border)", display: "flex" }}>
                      <div className="text-center w-10 flex-shrink-0">
                        <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--brand-text-secondary)" }}>{dow}</div>
                        <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{dt.getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>
                          {w.days?.label || "Workout"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                          {dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {done && <i className="ti ti-check text-sm" style={{ color: "#22c55e" }} />}
                        <i className="ti ti-player-play text-sm" style={{ color: "var(--brand-primary)" }} />
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>
        )}

        {upcoming.length === 0 && (
          <div className="rounded-2xl py-8 text-center"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-calendar-x text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No workouts scheduled in the next 14 days</p>
          </div>
        )}

        <ClientProfileTabs
          client={client as any}
          metrics={metrics as any[]}
          recent={recent as any[]}
        />
      </div>
    </div>
  );
}
