"use client";

// Notification center — a header bell that opens a scrollable list of all
// current unread message sources (newest first). Tapping a row routes to that
// source AND marks it read. Reads from the SAME unread source as the nav badge
// and MessageNotifier, so counts never disagree. Mounted in HeaderAssist so it
// shows for BOTH trainer and client on every page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { aggregateNotifications, totalUnread, NotifRow, RawUnread } from "@/lib/notifications";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

function fmtWhen(ts: string) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationCenter({ solid = false }: { solid?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const ctx = useRef<{ isTrainer: boolean; myUserId: string; myClientId: string | null }>({ isTrainer: false, myUserId: "", myClientId: null });
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;
      const isClientMode = typeof document !== "undefined" && document.cookie.split("; ").some((x) => x === "symmetry_client_mode=1");
      const isTrainer = user.email === TRAINER_EMAIL && !isClientMode;
      let myClientId: string | null = null;
      if (!isTrainer) {
        const { data: myClient } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        myClientId = myClient ? (myClient as { id: string }).id : null;
      }
      ctx.current = { isTrainer, myUserId: user.id, myClientId };

      // Same unread source as the badge: to_id=me, unread, not deleted.
      const { data: raw } = await supabase
        .from("messages")
        .select("id, from_id, to_id, client_id, body, created_at, read_at, deleted_at, is_group, is_broadcast, image_url")
        .eq("to_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      const unread = (raw as RawUnread[]) || [];

      let clientNames: Record<string, string> = {};
      if (isTrainer) {
        const ids = Array.from(new Set(unread.map((m) => m.client_id).filter((x): x is string => !!x)));
        if (ids.length) {
          const { data: cs } = await supabase.from("clients").select("id, name").in("id", ids);
          for (const c of ((cs as { id: string; name: string }[]) || [])) clientNames[c.id] = c.name;
        }
      }
      setRows(aggregateNotifications(unread, { isTrainer, myUserId: user.id, clientNames }));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [load]);

  // Refresh when opening (fresh counts) + close on outside click / Esc.
  useEffect(() => {
    if (open) load();
    function onDoc(e: MouseEvent) { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) { document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey); }
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, load]);

  async function markSourceRead(row: NotifRow) {
    try {
      const supabase = createClient();
      const { myUserId } = ctx.current;
      let q = supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("to_id", myUserId).is("read_at", null);
      if (row.kind === "group") q = q.eq("is_group", true);
      else if (row.kind === "client" && row.clientId) q = q.eq("client_id", row.clientId);
      else q = q.eq("is_group", false); // client "Trainer" row → all their direct + broadcasts
      await q;
    } catch { /* noop */ }
  }

  async function openRow(row: NotifRow) {
    setOpen(false);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    await markSourceRead(row);
    router.push(row.href);
  }

  async function markAll() {
    try {
      const supabase = createClient();
      await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("to_id", ctx.current.myUserId).is("read_at", null).is("deleted_at", null);
    } catch { /* noop */ }
    setRows([]);
  }

  const total = totalUnread(rows);
  const hBtn: React.CSSProperties = {
    position: "relative", width: 34, height: 34, borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: solid ? "var(--brand-primary)" : "rgba(255,255,255,0.12)",
    boxShadow: solid ? "0 4px 14px rgba(20,30,55,.3)" : "none",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };

  return (
    <>
      <button aria-label={`Notifications${total ? ` (${total} unread)` : ""}` } style={hBtn} onClick={() => setOpen((o) => !o)}>
        <i className="ti ti-bell" style={{ fontSize: 16 }} />
        {total > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px var(--brand-bg)", animation: "cw-pulse 1.3s ease-in-out infinite" }}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} style={{ position: "fixed", right: 12, top: 58, zIndex: 1002, width: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "min(70vh, 520px)", display: "flex", flexDirection: "column", background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,.4)", overflow: "hidden", animation: "cw-slide-down 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--brand-border)" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Notifications</span>
            {rows.length > 0 && (
              <button onClick={markAll} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand-primary)", fontSize: 12, fontWeight: 700 }}>Mark all read</button>
            )}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {rows.length === 0 ? (
              <div style={{ padding: "34px 16px", textAlign: "center", color: "var(--brand-text-secondary)" }}>
                <i className="ti ti-bell-check" style={{ fontSize: 30, display: "block", marginBottom: 8, opacity: 0.6 }} />
                <p style={{ fontSize: 13.5, fontWeight: 600 }}>You&apos;re all caught up</p>
              </div>
            ) : (
              rows.map((r) => (
                <button key={r.key} onClick={() => openRow(r)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", borderBottom: "1px solid var(--brand-border)", cursor: "pointer" }}>
                  <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--brand-primary) 16%, transparent)", color: "var(--brand-primary)" }}>
                    <i className={`ti ${r.kind === "group" ? "ti-users-group" : "ti-message-circle"}`} style={{ fontSize: 18 }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--brand-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                      <span style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", flexShrink: 0 }}>{fmtWhen(r.time)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: "var(--brand-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.snippet}</span>
                      <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--brand-primary)", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{r.count > 9 ? "9+" : r.count}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
