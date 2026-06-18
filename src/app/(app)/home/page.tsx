import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Is this the trainer?
  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";

  // Fetch client record
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Trainer: fetch all clients
  let allClients: { id: string; name: string }[] = [];
  if (isTrainer) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    allClients = data || [];
  }

  // Trainer: fetch active program assignments with client info
  let clientActivity: {
    client_id: string;
    client_name: string;
    program_name: string;
    phase_label: string;
  }[] = [];

  if (isTrainer) {
    const { data } = await supabase
      .from("program_assignments")
      .select(`
        client_id,
        clients!inner(name),
        programs!inner(name),
        phases:programs!inner(phases(label))
      `)
      .eq("active", true)
      .order("client_id");

    // Simplified: just get assignments with program names
    const { data: assignments } = await supabase
      .from("program_assignments")
      .select("client_id, program_id, clients(name), programs(name)")
      .eq("active", true);

    clientActivity = (assignments || []).map((a: any) => ({
      client_id: a.client_id,
      client_name: a.clients?.name || "Unknown",
      program_name: a.programs?.name || "Unknown Program",
      phase_label: "",
    }));
  }

  const displayName = isTrainer
    ? "Dustin"
    : clientRecord?.name?.split(" ")[0] || "there";
  const initials = isTrainer
    ? "DG"
    : (clientRecord?.name || "?")
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
    { bg: "#D1FAE5", text: "#065F46" },
  ];

  return (
    <>
      <AppHeader
        clientName={isTrainer ? "Dustin Gautreaux" : clientRecord?.name}
        clientInitials={initials}
        isTrainer={isTrainer}
        clients={allClients}
      />

      <div className="px-4 py-4">
        {/* Today card */}
        <div className="card-blue mt-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs" style={{ color: "#4E6080" }}>
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1
                className="text-xl font-medium"
                style={{ color: "#0D1B2E" }}
              >
                {greeting()}, {displayName}
              </h1>
            </div>
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ background: "#0F4C81", color: "white" }}
            >
              {initials}
            </div>
          </div>

          {isTrainer ? (
            <>
              <p className="text-sm mb-3" style={{ color: "#4E6080" }}>
                You have{" "}
                <span className="font-medium" style={{ color: "#0F4C81" }}>
                  {allClients.length} active clients
                </span>{" "}
                in your roster.
              </p>
              <Link href="/schedule" className="btn-primary block text-center">
                View schedule
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: "#4E6080" }}>
                Your workout is ready.
              </p>
              <Link href="/workout" className="btn-primary block text-center">
                Start today&apos;s workout
              </Link>
            </>
          )}
        </div>

        {/* Trainer: client activity list */}
        {isTrainer && clientActivity.length > 0 && (
          <>
            <p className="label mt-4">client roster</p>
            <div className="card" style={{ padding: "0.625rem 1rem" }}>
              {allClients.map((client, i) => {
                const color = avatarColors[i % avatarColors.length];
                const initials = client.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                const assignment = clientActivity.find(
                  (a) => a.client_id === client.id
                );
                return (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="flex items-center gap-3 py-3 border-b last:border-b-0 hover:bg-gray-50 -mx-4 px-4"
                    style={{ borderColor: "#EDF2F7" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                      style={{ background: color.bg, color: color.text }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {client.name}
                      </div>
                      <div
                        className="text-xs truncate"
                        style={{ color: "#4E6080" }}
                      >
                        {assignment?.program_name || "No active program"}
                      </div>
                    </div>
                    <i
                      className="ti ti-chevron-right text-lg flex-shrink-0"
                      style={{ color: "#C8D8EC" }}
                    />
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Stats */}
        <p className="label mt-4">this week</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Workouts", value: "—" },
            { label: "Streak", value: "—" },
            { label: "Vol (lbs)", value: "—" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-3 text-center"
              style={{ background: "#EDF2F7", border: "0.5px solid #C8D8EC" }}
            >
              <div
                className="text-xl font-medium"
                style={{ color: "#0F4C81" }}
              >
                {s.value}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
