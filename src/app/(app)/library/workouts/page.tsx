import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WorkoutsLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-text)" }}>
        Workouts
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--brand-text-secondary)" }}>
        Saved workout templates
      </p>
      <div className="card text-center py-12">
        <i className="ti ti-list-check text-3xl block mb-3" style={{ color: "var(--brand-border)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Workouts library coming soon</p>
        <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
          Your saved workout templates will appear here
        </p>
      </div>
    </div>
  );
}
