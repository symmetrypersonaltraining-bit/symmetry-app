"use client";

// Notification center — a header bell that opens a scrollable list of all
// current unread message sources (newest first). Tapping a row routes to that
// source AND marks it read. Reads from the SAME unread source as the nav badge
// and MessageNotifier, so counts never disagree. Mounted in HeaderAssist so it
// shows for BOTH trainer and client on every page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useNotificationFeed } from "@/lib/useNotificationFeed";
import { aggregateNotifications, totalUnread, NotifRow, RawUnread } from "@/lib/notifications";
import { fetchGroupUnread, groupUnreadAsRows, markGroupRead } from "@/lib/groupUnread";
import { centralFormat, centralDateOf, centralToday } from "@/lib/central-time";

function fmtWhen(ts: string) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  // Central, not the device. An evening notification used to show tomorrow's
  // date instead of a clock time the moment the handset's day rolled over.
  if (centralDateOf(ts) === centralToday()) return centralFormat(ts, { hour: "numeric", minute: "2-digit" });
  return centralFormat(ts, { month: "short", day: "numeric" });
}

export default function NotificationCenter({ solid = false }: { solid?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // QUIET, NOT READ. Two different things, and only one of them existed.
  //
  // Dustin, 22 Aug: "i need to be able to dismiss those quickly if im trying to
  // get to something and come back to the notifications later. they can come
  // back up each time i open the app to remind me to check them but i need to
  // be able to get them off my screen quickly."
  //
  // Everything here already marked things READ — the row ×, "Mark all read".
  // That clears the bell by throwing away the reminder, which is the opposite
  // of what he asked for: he wants the nagging to stop for the next ten
  // minutes and to be nagged again tomorrow.
  //
  // sessionStorage, deliberately, not localStorage. It is emptied when the app
  // is closed and reopened, which is exactly "they can come back up each time i
  // open the app" — no expiry to pick, no timer to get wrong. Unread state is
  // never touched, so nothing is lost and the count is right the moment it
  // comes back.
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    try { setQuiet(sessionStorage.getItem("symmetry_notif_quiet") === "1"); } catch { /* private mode */ }
  }, []);
  // HOLD THE BELL TO QUIET IT. One gesture, no panel.
  //
  // "Later" inside the panel still costs a tap to open and a tap to leave, and
  // the whole complaint is about being mid-task and wanting the top bar back.
  // Press and hold is the fast path: nothing to aim at, and it cannot be hit by
  // accident on the way to somewhere else.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const startHold = useCallback(() => {
    heldRef.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      // The tap that ends the hold must not then open the panel — the whole
      // point was to get it OFF the screen.
      setQuiet(true);
      setOpen(false);
      try { sessionStorage.setItem("symmetry_notif_quiet", "1"); } catch { /* private mode */ }
      try { navigator.vibrate?.(18); } catch { /* not everywhere */ }
    }, 450);
  }, []);
  const endHold = useCallback(() => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  }, []);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  const goQuiet = useCallback(() => {
    setQuiet(true);
    setOpen(false);
    try { sessionStorage.setItem("symmetry_notif_quiet", "1"); } catch { /* private mode */ }
  }, []);
  const ctx = useRef<{ isTrainer: boolean; myUserId: string; myClientId: string | null }>({ isTrainer: false, myUserId: "", myClientId: null });
  const panelRef = useRef<HTMLDivElement>(null);

  // The bell renders the shared feed now. It used to run its own 20s poll with
  // its own filters — one of three components asking three different questions
  // about the same data, which is why it could read zero while the nav badge
  // still showed three.
  const { items: rows, markRead, refresh: load } = useNotificationFeed();

  // Navigate FIRST, mark read after.
  //
  // This used to be `setOpen(false); await markRead(row); router.push(...)`,
  // so getting to the thread was gated on a network write completing. Any
  // failure in markRead — a slow round trip, a rejected update, a transient
  // socket — swallowed the navigation while the optimistic clear had ALREADY
  // removed the notification. The tap then did exactly what Dustin reported:
  // cleared the badge and went nowhere, with the message now marked read and no
  // longer in the list to try again from.
  //
  // Reading a thread is the point of the tap. Marking it read is bookkeeping,
  // and bookkeeping must never stand in front of the thing the user asked for.
  function openRow(row: NotifRow) {
    setOpen(false);
    const href = row.href;
    router.push(href);

    // Belt and braces for the WebView. If the client router has not moved us
    // shortly after the push — hydration not finished, a wedged transition, an
    // aborted prefetch — fall back to a hard navigation. Going to the right
    // place slightly late beats not going.
    window.setTimeout(() => {
      try {
        const want = href.split("?")[0];
        const params = new URLSearchParams(href.split("?")[1] || "");
        const here = new URLSearchParams(window.location.search);
        const samePath = window.location.pathname === want;
        const sameClient = here.get("client") === params.get("client");
        // m too. Two announcements in the same thread differ only by m, and
        // arriving at the thread without scrolling to the one you were told
        // about is the failure this anchor exists to prevent.
        const sameMsg = (here.get("m") || "") === (params.get("m") || "");
        if (!samePath || !sameClient || !sameMsg) window.location.assign(href);
      } catch {
        /* noop */
      }
    }, 700);

    // Fire-and-forget. If it fails the notification comes back on the next
    // poll, which is the correct outcome: an unread message that was never
    // opened should still look unread.
    void markRead(row);
  }

  async function markAll() {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        await Promise.all([
          supabase.from("messages").update({ read_at: new Date().toISOString() })
            .eq("to_id", uid).is("read_at", null).is("deleted_at", null),
          markGroupRead(supabase),
        ]);
      }
    } catch { /* noop */ }
    // The feed owns the state — refetch rather than clearing a local copy, so
    // the bell, the nav badge and the banner all drop together instead of the
    // bell going quiet on its own.
    await load();
  }

  const total = totalUnread(rows);
  // Quieted, the bell stops shouting but stays exactly where it was — same
  // position, same size, nothing reflows — so it is still one tap away and the
  // top bar is clear. Hiding the button outright would move the two controls
  // beside it, which is its own kind of in-the-way.
  const alerting = total > 0 && !quiet;
  const hBtn: React.CSSProperties = {
    position: "relative", width: 34, height: 34, borderRadius: "50%",
    border: alerting ? "1px solid rgba(239,68,68,0.9)" : "1px solid rgba(255,255,255,0.3)",
    background: solid ? "var(--brand-primary)" : "rgba(255,255,255,0.12)",
    boxShadow: solid ? "0 4px 14px rgba(20,30,55,.3)" : "none",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    // The single app-wide bell ALERTS whenever there are unread notifications.
    // cw-alert rather than cw-pulse: a 5% scale change on a 34px button is easy
    // to look straight past, and being missed is the entire problem here.
    animation: alerting ? "cw-alert 1.35s ease-in-out infinite" : "none",
  };

  return (
    <>
      <button
        aria-label={`Notifications${total ? ` (${total} unread)` : ""}${total > 0 ? " — hold to quiet until you next open the app" : ""}`}
        title={total > 0 && !quiet ? "Hold to quiet these until you next open the app" : undefined}
        style={hBtn}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (heldRef.current) { heldRef.current = false; return; } setOpen((o) => !o); }}
      >
        <i className={total > 0 && quiet ? "ti ti-bell-z" : "ti ti-bell"} style={{ fontSize: 16, animation: alerting ? "cw-bell-swing 0.9s ease-in-out infinite" : "none" }} />
        {alerting && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px var(--brand-bg)", animation: "cw-alert-badge 1.35s ease-in-out infinite" }}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} style={{ position: "fixed", right: 12, top: 58, zIndex: 1002, width: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "min(70vh, 520px)", display: "flex", flexDirection: "column", background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,.4)", overflow: "hidden", animation: "cw-slide-down 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--brand-border)" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Notifications</span>
            {rows.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Ordered the way they are reached for: "Later" is the one he
                    wants mid-task and the safe one, so it comes first and is
                    plain; "Mark all read" throws the list away and stays the
                    deliberate second choice. */}
                <button onClick={goQuiet} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand-text-secondary)", fontSize: 12, fontWeight: 700 }}>Later</button>
                <button onClick={markAll} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand-primary)", fontSize: 12, fontWeight: 700 }}>Mark all read</button>
              </span>
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
                // A row is a button inside a row, so the two cannot be nested —
                // the dismiss × sits alongside the tap target, not inside it.
                <div key={r.key} style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--brand-border)" }}>
                <button onClick={() => openRow(r)} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, textAlign: "left", padding: "12px 4px 12px 14px", background: "none", border: "none", cursor: "pointer" }}>
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
                {/* CLEAR IT WITHOUT GOING THERE.
                    Dustin, 2026-08-20: "trainer needs to be able to dismiss
                    notifications quickly so they're not in the way on the
                    screen."

                    Tapping a notification navigates. So the only way to empty
                    the list was to visit every single one, or to use "Mark all
                    read" and lose the ones still worth opening. There was no
                    way to clear ONE. */}
                <button
                  aria-label={"Dismiss " + r.title}
                  title="Dismiss"
                  onClick={(ev) => { ev.stopPropagation(); void markRead(r); }}
                  style={{ flexShrink: 0, width: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--brand-text-secondary)", fontSize: 17, lineHeight: 1 }}>
                  ×
                </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
