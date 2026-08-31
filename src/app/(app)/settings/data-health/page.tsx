// /settings/data-health — what the twice-daily integrity checker actually found.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Today's Admin has had a red "Data check failing" row since 24 Aug. Its button
// said "Look →" and it went to /clients — the roster. Dustin, 26 Aug: "data
// check failing goes to client list."
//
// So the app was reporting a fault it could not show anyone. The row could name
// two checks and four clients in a subtitle and then had nowhere to send you,
// because run_integrity_checks() had been writing to a table since 16 Aug that
// nothing in the app had ever read. The dashboard row was the first reader; it
// just had no second page to hand over to.
//
// This is that page. Latest run only — the table keeps history, and showing
// every run would report the same fault a dozen times over.
//
// ── WHY THE DETAIL IS THE POINT ──────────────────────────────────────────────
//
// "supervised_workout_no_appointment — 241" is not something anybody can act
// on. The names inside it are: those are eleven clients whose sessions are not
// attached to a calendar entry, and each one is a link away from being fixed.
// Every check that collected a detail array gets it rendered, and every client
// named in one becomes a link to that client.
//
// Read-only. Nothing on this page changes anything.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

type Check = {
  check_name: string;
  severity: string;
  count: number;
  detail: unknown;
  ran_at: string;
};

const TONE: Record<string, { color: string; label: string }> = {
  critical: { color: "#ef4444", label: "Critical" },
  warn: { color: "#f59e0b", label: "Warning" },
  info: { color: "#64748b", label: "Info" },
};

const ORDER: Record<string, number> = { critical: 0, warn: 1, info: 2 };

/** snake_case check names are how the database talks. This is for people. */
const humanise = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default async function DataHealthPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  // RLS decides what comes back. integrity_checks is owner-scoped because the
  // detail column names clients across the whole database — a coach reading it
  // would be reading another trainer's roster. A non-owner gets an empty set
  // and is told so, rather than an empty page that looks broken.
  const { data: rows } = await supabase
    .from("integrity_checks")
    .select("check_name, severity, count, detail, ran_at")
    .order("ran_at", { ascending: false })
    .limit(120);

  const all = (rows || []) as Check[];
  const newest = all.length ? all[0].ran_at : null;
  const live = all
    .filter((c) => c.ran_at === newest)
    .sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3) || b.count - a.count);

  // Names → ids, so a client mentioned in a detail blob is one tap from their
  // page. Matched on the name the check wrote, which is the name in the clients
  // table, so this is an exact lookup rather than a fuzzy one.
  const { data: clientRows } = await supabase.from("clients").select("id, name").is("archived_at", null);
  const idByName = new Map<string, string>();
  for (const c of (clientRows || []) as { id: string; name: string }[]) {
    if (c.name) idByName.set(c.name, c.id);
  }

  const failing = live.filter((c) => c.count > 0);
  const passing = live.filter((c) => c.count === 0);
  const criticals = failing.filter((c) => c.severity === "critical");

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px 12px 48px" }}>
      <div style={{ marginBottom: 6 }}>
        <Link href="/settings" style={{ fontSize: 13, color: "var(--brand-text-secondary)", textDecoration: "none" }}>
          ← Settings
        </Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>Data health</h1>
      <p style={{ fontSize: 13, color: "var(--brand-text-secondary)", margin: "0 0 20px" }}>
        {newest
          ? `Last checked ${new Date(newest).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · runs twice a day`
          : "No check has run yet, or these results are not yours to see."}
      </p>

      {newest && !failing.length && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)" }}>
          <div style={{ fontWeight: 700, color: "#22c55e" }}>Everything passed</div>
          <div style={{ fontSize: 13, color: "var(--brand-text-secondary)", marginTop: 4 }}>
            All {live.length} checks came back clean on the last run.
          </div>
        </div>
      )}

      {criticals.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--brand-text-secondary)", margin: "0 0 14px" }}>
          {/* Named plainly. A critical here is a fault in the data the app runs
              on, not an alarm about a client's training. */}
          {criticals.length === 1 ? "One check is" : `${criticals.length} checks are`} failing at critical.
        </p>
      )}

      {failing.map((c) => {
        const tone = TONE[c.severity] || TONE.info;
        const detail = Array.isArray(c.detail) ? (c.detail as Record<string, unknown>[]) : [];
        return (
          <div
            key={c.check_name}
            style={{
              border: "1px solid var(--brand-border)",
              borderLeft: `4px solid ${tone.color}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              background: "var(--brand-surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{humanise(c.check_name)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: tone.color }}>{tone.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 800, color: tone.color }}>{c.count}</span>
            </div>

            {detail.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {detail.slice(0, 40).map((d, i) => {
                  const who = typeof d.client === "string" ? d.client : null;
                  // Everything the check recorded ALONGSIDE the name, so a row
                  // reading "Dustin Gautreaux" also says 207.2 vs 196.2 and is
                  // actionable without opening anything.
                  const extra = Object.entries(d)
                    .filter(([k]) => k !== "client")
                    .map(([k, v]) => `${k.replace(/_/g, " ")} ${String(v)}`)
                    .join(" · ");
                  const label = [who, extra].filter(Boolean).join(" — ") || JSON.stringify(d);
                  const id = who ? idByName.get(who) : undefined;
                  const chip = {
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--brand-border)",
                    color: "var(--brand-text)",
                    textDecoration: "none",
                    display: "inline-block",
                  } as const;
                  return id ? (
                    <Link key={i} href={`/clients/${id}`} style={chip}>{label} ›</Link>
                  ) : (
                    <span key={i} style={{ ...chip, color: "var(--brand-text-secondary)" }}>{label}</span>
                  );
                })}
                {detail.length > 40 && (
                  <span style={{ fontSize: 12, color: "var(--brand-text-secondary)", alignSelf: "center" }}>
                    +{detail.length - 40} more
                  </span>
                )}
              </div>
            ) : (
              // A count with no names is honest about being a count. Saying
              // nothing at all would read as a rendering fault.
              <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginTop: 8 }}>
                This check counts rows and does not record which ones.
              </div>
            )}
          </div>
        );
      })}

      {passing.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--brand-text-secondary)" }}>
            {passing.length} checks passing
          </summary>
          <div style={{ fontSize: 13, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.9 }}>
            {passing.map((c) => humanise(c.check_name)).join(" · ")}
          </div>
        </details>
      )}
    </div>
  );
}
