import NewProgramButton from "@/components/NewProgramButton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/serverUser";
import Link from "next/link";

// Program names are deliberately generic — no client's name is ever baked into
// a program or session title. That means duplicates ("Personal Workouts" x25)
// are normal and expected, so this list carries the client as *metadata*:
// who it's assigned to, or who it was built for. Attribution without naming.

export default async function ProgramsLibraryPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const [{ data: programs }, { data: assignments }, { data: clients }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, category, status, personal_for_client_id, phases(count)")
      .order("name"),
    supabase
      .from("program_assignments")
      .select("program_id, client_id, active"),
    supabase
      .from("clients")
      .select("id, name"),
  ]);

  const clientName = new Map<string, string>(
    (clients || []).map((c: any) => [c.id as string, c.name as string])
  );

  // program_id -> { active: names, past: names }
  const byProgram = new Map<string, { active: string[]; past: string[] }>();
  for (const a of (assignments || []) as any[]) {
    const nm = clientName.get(a.client_id);
    if (!nm) continue;
    const entry = byProgram.get(a.program_id) || { active: [], past: [] };
    const bucket = a.active ? entry.active : entry.past;
    if (!bucket.includes(nm)) bucket.push(nm);
    byProgram.set(a.program_id, entry);
  }

  function attribution(p: any): { label: string; tone: "active" | "muted" } | null {
    const entry = byProgram.get(p.id);
    if (entry && entry.active.length) {
      return { label: entry.active.join(", "), tone: "active" };
    }
    if (p.personal_for_client_id) {
      const nm = clientName.get(p.personal_for_client_id);
      if (nm) return { label: `${nm} · personal`, tone: "muted" };
    }
    if (entry && entry.past.length) {
      return { label: `${entry.past.join(", ")} · past`, tone: "muted" };
    }
    return null;
  }

  const list = (programs || []) as any[];

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>Programs</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
            {list.length} programs
          </p>
        </div>
        <NewProgramButton />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {list.length === 0 ? (
          <div className="py-12 text-center">
            <i className="ti ti-trophy text-3xl block mb-3" style={{ color: "var(--brand-border)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>No programs yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
              Programs will appear here after migration
            </p>
          </div>
        ) : (
          list.map((p: any) => {
            const attr = attribution(p);
            const phaseCount = p.phases?.[0]?.count ?? 0;
            return (
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{p.name}</span>
                    {attr && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={
                          attr.tone === "active"
                            ? { background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)", color: "var(--brand-primary)" }
                            : { background: "var(--brand-card)", color: "var(--brand-text-secondary)" }
                        }
                      >
                        <i className="ti ti-user text-[10px] mr-0.5" />
                        {attr.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs truncate mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {[
                      p.category || null,
                      phaseCount ? `${phaseCount} phase${phaseCount === 1 ? "" : "s"}` : null,
                      p.status && p.status !== "live" ? p.status : null,
                      p.description || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <i className="ti ti-chevron-right text-base flex-shrink-0" style={{ color: "var(--brand-border)" }} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
