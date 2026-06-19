import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ProgramsLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, description, phases(count)")
    .order("name");

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>Programs</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
            {(programs || []).length} programs
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          <i className="ti ti-plus text-base" />
          New Program
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {(programs || []).length === 0 ? (
          <div className="py-12 text-center">
            <i className="ti ti-trophy text-3xl block mb-3" style={{ color: "var(--brand-border)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>No programs yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
              Programs will appear here after migration
            </p>
          </div>
        ) : (
          (programs || []).map((p: any) => (
            <div
              key={p.id}
              className="flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-card)" }}
              >
                <i className="ti ti-trophy text-lg" style={{ color: "var(--brand-primary)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{p.name}</div>
                {p.description && (
                  <div className="text-xs truncate mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {p.description}
                  </div>
                )}
              </div>
              <i className="ti ti-chevron-right text-base flex-shrink-0" style={{ color: "var(--brand-border)" }} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
