"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NewClientModal from "./NewClientModal";
import { createClient } from "@/lib/supabase/client";
import ClientStatusDot from "@/components/ClientStatusDot";
import ClientSparkline from "@/components/ClientSparkline";
import Avatar from "@/components/Avatar";
import { centralWeekStart, shiftDate } from "@/lib/central-time";

const AVATAR_COLORS = [
  { bg: "#DDEEFF", text: "var(--brand-primary)" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#F3E8FF", text: "#6B21A8" },
  { bg: "#FEE2E2", text: "#991B1B" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#E0F2FE", text: "#0369A1" },
  { bg: "#FDF4FF", text: "#701A75" },
  { bg: "#FFF7ED", text: "#9A3412" },
];

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  hasAppAccess: boolean;
  archived?: boolean;
  activeProgram: string | null;
}

interface Props {
  clients: Client[];
}

export default function ClientsListClient({ clients }: Props) {
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = createClient() as any;
        const { data } = await sb.from("clients").select("id, avatar_url").not("avatar_url", "is", null);
        if (!off && data) {
          const m: Record<string, string> = {};
          for (const r of data) if (r.avatar_url) m[r.id as string] = r.avatar_url as string;
          setAvatarMap(m);
        }
      } catch {
        /* no avatars — initials stay */
      }
    })();
    return () => { off = true; };
  }, []);

  const [search, setSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  // Archived clients are off the roster, not gone — this flips the list over to
  // show them so they can be found and restored.
  const [showArchived, setShowArchived] = useState(false);

  const [statusMap, setStatusMap] = useState<Record<string, "green" | "amber" | "red">>({});

  // Eight weeks of completed sessions, bucketed per client per week (#81).
  // ONE query for the whole roster, not one per row.
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const supabase = createClient();
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        // Bucket 7 is the current week; bucket 0 is seven weeks before it.
        // String arithmetic, so the round trip through a local Date -- which
        // was self-consistent but only by luck -- cannot drift.
        const startStr = shiftDate(centralWeekStart(todayStr), -7 * 7);
        const { data } = await supabase
          .from("workout_logs")
          .select("client_id, log_date")
          .eq("completed", true)
          .gte("log_date", startStr);
        // Both sides parsed as UTC midnight, so the week index is exact
        // arithmetic with no zone in it at all.
        const startMs = Date.parse(startStr + "T00:00:00Z");
        const map: Record<string, number[]> = {};
        const seen: Record<string, Set<string>> = {};
        for (const r of ((data || []) as { client_id: string; log_date: string }[])) {
          if (!r || !r.client_id || !r.log_date) continue;
          const idx = Math.floor((Date.parse(r.log_date + "T00:00:00Z") - startMs) / (7 * 86400000));
          if (idx < 0 || idx > 7) continue;
          // Distinct DAYS per week, so two sessions in one day count once —
          // same rule the consistency board and challenges use.
          const key = r.client_id + "|" + r.log_date;
          if (!seen[r.client_id]) seen[r.client_id] = new Set();
          if (seen[r.client_id].has(key)) continue;
          seen[r.client_id].add(key);
          if (!map[r.client_id]) map[r.client_id] = [0, 0, 0, 0, 0, 0, 0, 0];
          map[r.client_id][idx]++;
        }
        if (!off) setSparks(map);
      } catch {
        /* non-fatal: rows simply render without a trend */
      }
    })();
    return () => { off = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const sinceStr = shiftDate(todayStr, -21);
        const [w, m] = await Promise.all([
          supabase.from("workout_logs").select("client_id, log_date").gte("log_date", sinceStr),
          supabase.from("meal_adherence_logs").select("client_id, log_date").gte("log_date", sinceStr),
        ]);
        const rows = [...(w.data || []), ...(m.data || [])] as { client_id: string; log_date: string }[];
        const latest: Record<string, string> = {};
        for (const row of rows) {
          if (!row || !row.client_id || !row.log_date) continue;
          if (!latest[row.client_id] || row.log_date > latest[row.client_id]) latest[row.client_id] = row.log_date;
        }
        const today = new Date(todayStr + "T00:00:00").getTime();
        const map: Record<string, "green" | "amber" | "red"> = {};
        for (const cid of Object.keys(latest)) {
          const days = Math.round((today - new Date(latest[cid] + "T00:00:00").getTime()) / 86400000);
          map[cid] = days <= 2 ? "green" : days <= 4 ? "amber" : "red";
        }
        if (!cancelled) setStatusMap(map);
      } catch {
        /* non-fatal: activity dots simply not shown if fetch fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const archivedCount = clients.filter((c) => c.archived).length;
  const filtered = clients.filter(
    (c) =>
      !!c.archived === showArchived &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} />}

      {/* New client button */}
      <button
        onClick={() => setShowNewClient(true)}
        className="flex items-center gap-2 w-full mb-4 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--brand-primary)" }}
      >
        <i className="ti ti-user-plus text-base" />
        Add New Client
      </button>

      {/* Search bar */}
      <div className="relative mb-4">
        <i
          className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-base"
          style={{ color: "var(--brand-text-secondary)" }}
        />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 rounded-xl text-sm border"
          style={{
            background: "var(--brand-surface)",
            borderColor: "var(--brand-border)",
            color: "var(--brand-text)",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        )}
      </div>

      {/* Active / Archived toggle. Hidden entirely until something is archived,
          so the roster stays a plain list for as long as it is one. */}
      {archivedCount > 0 && (
        <div className="flex gap-2 mb-3">
          {[
            { label: `Active (${clients.length - archivedCount})`, on: !showArchived, v: false },
            { label: `Archived (${archivedCount})`, on: showArchived, v: true },
          ].map((t) => (
            <button
              key={t.label}
              onClick={() => setShowArchived(t.v)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={
                t.on
                  ? { background: "var(--brand-primary)", color: "#fff" }
                  : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Client list */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div className="py-12 text-center" style={{ color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-users text-3xl mb-2 block" />
            <p className="text-sm">{showArchived ? "No archived clients" : "No clients found"}</p>
          </div>
        ) : (
          filtered.map((client, i) => {
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const initials = client.name
              .split(" ")
              .map((n) => n[0] || "")
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0 transition-all"
                style={{
                  borderColor: "var(--brand-border)",
                  borderLeft: `3px solid ${color.text}`,
                  paddingLeft: "14px",
                }}
              >
                {/* Avatar */}
                {avatarMap[client.id] ? (
                <Avatar name={client.name} url={avatarMap[client.id]} size={44} />
              ) : (
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: color.bg, color: color.text }}>{initials}</div>
              )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>
                      {client.name}
                    </span>
                    {client.archived ? (
                      <span className="tag-gray text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                        Archived
                      </span>
                    ) : client.hasAppAccess ? (
                      <span className="tag-green text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="tag-gray text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: "var(--brand-text-secondary)" }}>
                    {client.activeProgram || "No active program"}
                  </div>
                </div>

                {client.hasAppAccess && sparks[client.id] && (
                  <ClientSparkline weeks={sparks[client.id]} />
                )}

                {client.hasAppAccess && statusMap[client.id] && (
                  <ClientStatusDot status={statusMap[client.id]} />
                )}

                {/* Chevron */}
                <i
                  className="ti ti-chevron-right text-lg flex-shrink-0"
                  style={{ color: "var(--brand-border)" }}
                />
              </Link>
            );
          })
        )}
      </div>

      {search && filtered.length > 0 && (
        <p className="text-xs text-center mt-2" style={{ color: "var(--brand-text-secondary)" }}>
          {filtered.length} of {showArchived ? archivedCount : clients.length - archivedCount} clients
        </p>
      )}
    </>
  );
}
