import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientsListClient from "./ClientsListClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  // Fetch all clients with their active program
  const { data: clients } = await supabase
    .from("clients")
    .select(`
      id,
      name,
      email,
      phone,
      auth_user_id,
      program_assignments!left(
        active,
        programs(name)
      )
    `)
    .order("name");

  const clientList = (clients || []).map((c: any) => {
    const activeAssignment = (c.program_assignments || []).find(
      (pa: any) => pa.active
    );
    return {
      id: c.id,
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      hasAppAccess: !!c.auth_user_id,
      activeProgram: activeAssignment?.programs?.name || null,
    };
  });

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>
            Clients
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
            {clientList.length} clients
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          <i className="ti ti-user-plus text-base" />
          Invite Client
        </button>
      </div>
      <ClientsListClient clients={clientList} />
    </div>
  );
}
