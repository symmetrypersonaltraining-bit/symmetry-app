import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const displayName = isTrainer ? "Dustin Gautreaux" : client?.name || user.email || "Client";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Get active program
  let programInfo: { name: string; phase: string } | null = null;
  if (client?.id) {
    const { data: assignment } = await supabase
      .from("program_assignments")
      .select("programs(name, phases(label, position))")
      .eq("client_id", client.id)
      .eq("active", true)
      .maybeSingle();

    if (assignment) {
      const prog = (assignment as any).programs;
      const phases = prog?.phases || [];
      const latestPhase = [...phases].sort((a: any, b: any) => b.position - a.position)[0];
      programInfo = {
        name: prog?.name || "\u2014",
        phase: latestPhase?.label || "\u2014",
      };
    }
  }

  return (
    <>
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Profile</h1>
      </div>

      <div className="px-4 py-4">
        {/* Profile card */}
        <div className="card-blue flex items-center gap-4 mt-1">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium flex-shrink-0"
            style={{ background: "var(--brand-primary)", color: "white" }}
          >
            {initials}
          </div>
          <div>
            <div className="text-lg font-medium" style={{ color: "#0D1B2E" }}>{displayName}</div>
            <div className="text-sm" style={{ color: "#4E6080" }}>{user.email}</div>
            {isTrainer && (
              <span className="tag mt-1.5">Trainer</span>
            )}
          </div>
        </div>

        {/* Program */}
        {programInfo && (
          <>
            <p className="label mt-4">current program</p>
            <div className="card">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#4E6080" }}>Program</div>
                  <div className="text-sm font-medium">{programInfo.name}</div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#4E6080" }}>Phase</div>
                  <div className="text-sm font-medium">{programInfo.phase}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Account */}
        <p className="label mt-4">account</p>
        <div className="card" style={{ padding: 0 }}>
          <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "#EDF2F7" }}>
            <div className="flex items-center gap-3">
              <i className="ti ti-bell text-lg" style={{ color: "#4E6080" }} />
              <span className="text-sm">Notifications</span>
            </div>
            <span className="tag-green text-xs">On</span>
          </div>
          <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "#EDF2F7" }}>
            <div className="flex items-center gap-3">
              <i className="ti ti-shield text-lg" style={{ color: "#4E6080" }} />
              <span className="text-sm">Privacy</span>
            </div>
            <i className="ti ti-chevron-right text-lg" style={{ color: "#C8D8EC" }} />
          </div>
          <div className="px-4 py-4">
            <SignOutButton />
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-xs mt-6 mb-4" style={{ color: "#C8D8EC" }}>
          Symmetry Personal Training \u00b7 v0.1.0
        </p>
      </div>
    </>
  );
}
