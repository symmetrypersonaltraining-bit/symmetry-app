"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendMessage, sendClientMessage, sendGroupMessage, sendBroadcastMessage, deleteMessage, deleteThread } from "../home/messageActions";

interface Message {
  id: string;
  from_id: string;
  to_id: string;
  client_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string | null;
}

interface Client {
  id: string;
  name: string;
  auth_user_id: string | null;
}

interface Props {
  isTrainer: boolean;
  clients: Client[];
  selectedClientId: string | null;
  thread: Message[];
  currentUserId: string;
  unreadByClient: Record<string, number>;
  senderNames?: Record<string, string>;
  lastByClient?: Record<string, { body: string; from_id: string; created_at: string }>;
}

function fmtTime(ts: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDay(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function MessagesClient({ isTrainer, clients, selectedClientId, thread, currentUserId, unreadByClient, senderNames = {}, lastByClient = {} }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState<number | null>(null);
  const [readClients, setReadClients] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmDelThread, setConfirmDelThread] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [thread]);

  const handleDeleteMessage = useCallback(async (id: string) => {
    setDeletingId(id);
    try { await deleteMessage(id); router.refresh(); } catch { setDeletingId(null); }
  }, [router]);

  const handleDeleteThread = useCallback(async () => {
    if (!selectedClientId || selectedClientId === "group" || selectedClientId === "broadcast") return;
    if (!confirmDelThread) { setConfirmDelThread(true); setTimeout(() => setConfirmDelThread(false), 3500); return; }
    setConfirmDelThread(false);
    try { await deleteThread(selectedClientId); router.push("/messages"); router.refresh(); } catch {}
  }, [confirmDelThread, selectedClientId, router]);

  const handleDeleteThreadFor = useCallback(async (clientId: string, name: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the entire conversation with ${name}?`)) return;
    try { await deleteThread(clientId); router.refresh(); } catch {}
  }, [router]);

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (selectedClientId === "group") {
        await sendGroupMessage(trimmed);
      } else if (isTrainer && selectedClientId === "broadcast") {
        const n = await sendBroadcastMessage(trimmed);
        setBroadcastSent(n);
      } else if (isTrainer && selectedClientId) {
        await sendMessage(selectedClientId, trimmed);
      } else {
        await sendClientMessage(trimmed);
      }
      setBody("");
      router.refresh();
    } catch (err) {
      console.error("send failed:", err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [body, sending, isTrainer, selectedClientId, router]);

  // Group messages by day
  const grouped: { day: string; msgs: Message[] }[] = [];
  thread.forEach(m => {
    const day = fmtDay(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.msgs.push(m);
    else grouped.push({ day, msgs: [m] });
  });

  const isGroup = selectedClientId === "group";
  const nameForFrom = (m: Message) => {
    if (m.from_id === currentUserId) return "You";
    if (isGroup) return senderNames[m.from_id] || "Member";
    if (isTrainer) { const c = clients.find(x => x.id === selectedClientId); return c ? c.name : "Client"; }
    return "Coach";
  };
  const ThreadPanel = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {thread.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-40 text-center pt-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "color-mix(in srgb, var(--brand-primary) 12%, transparent)" }}>
              <i className="ti ti-message-circle text-3xl" style={{ color: "var(--brand-primary)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>No messages yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
              {isTrainer ? "Send a message to get started" : "Message your trainer below"}
            </p>
          </div>
        )}
        {grouped.map(({ day, msgs }) => (
          <div key={day}>
            <div className="flex justify-center mb-4">
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>{day}</span>
            </div>
            <div className="space-y-2">
              {msgs.map(m => {
                const isMe = m.from_id === currentUserId;
                return (
                  <div key={m.id} className={"flex " + (isMe ? "justify-end" : "justify-start")}>
                    <div className="max-w-[78%] rounded-2xl px-4 py-2.5"
                      style={{ background: isMe ? "var(--brand-primary)" : "var(--brand-surface)", border: isMe ? "none" : "1px solid var(--brand-border)", borderBottomRightRadius: isMe ? 4 : 16, borderBottomLeftRadius: isMe ? 16 : 4 }}>
                      <p className="text-[11px] font-bold mb-0.5" style={{ color: isMe ? "rgba(255,255,255,0.85)" : "var(--brand-primary)" }}>{nameForFrom(m)}</p>
                      <p className="text-sm leading-relaxed" style={{ color: isMe ? "white" : "var(--brand-text)" }}>{m.body.split("\n").map((ln, li) => (<span key={li}>{li > 0 ? <br /> : null}{ln}</span>))}</p>
                      <div className={"flex items-center gap-2 mt-1 " + (isMe ? "justify-end" : "justify-start")}>
                        <span className="text-[10px]" style={{ color: isMe ? "rgba(255,255,255,0.55)" : "var(--brand-text-secondary)" }}>{fmtTime(m.created_at)}</span>
                        {isMe && <span className="text-[10px]" style={{ color: m.read_at ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }}>{m.read_at ? "✓✓" : "✓"}</span>}
                        <button onClick={() => handleDeleteMessage(m.id)} disabled={deletingId === m.id} title="Delete message" aria-label="Delete message" className="text-xs leading-none" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", opacity: deletingId === m.id ? 0.4 : 0.75, color: isMe ? "rgba(255,255,255,0.9)" : "var(--brand-text-secondary)" }}><i className="ti ti-trash" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3 flex items-center gap-2" style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)" }}>
        <textarea ref={inputRef as any} rows={2} onInput={(e) => { const t = e.currentTarget as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }} type="text" value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Message..." className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} ></textarea>
        <button onClick={handleSend} disabled={!body.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
          style={{ background: body.trim() && !sending ? "var(--brand-primary)" : "var(--brand-surface)", border: "1px solid var(--brand-border)", opacity: !body.trim() || sending ? 0.6 : 1 }}>
          {sending
            ? <i className="ti ti-loader-2 animate-spin text-sm" style={{ color: "var(--brand-text-secondary)" }} />
            : <i className="ti ti-send text-sm" style={{ color: body.trim() ? "white" : "var(--brand-text-secondary)" }} />}
        </button>
      </div>
    </div>
  );

  // Trainer two-panel layout
  if (isTrainer) {
    const isBroadcast = selectedClientId === "broadcast";
  const isGroup = selectedClientId === "group";
    const selectedClient = clients.find(c => c.id === selectedClientId) || null;
    const sortedClients = [...clients].sort((a, b) => {
      const ta = lastByClient[a.id]?.created_at || "";
      const tb = lastByClient[b.id]?.created_at || "";
      if (ta && tb) return tb.localeCompare(ta);
      if (ta) return -1;
      if (tb) return 1;
      return a.name.localeCompare(b.name);
    });
    return (
      <div className="flex overflow-hidden" style={{ background: "var(--brand-bg)", height: "100dvh" }}>
        <div className={"flex flex-col border-r flex-shrink-0 w-full lg:w-72 xl:w-80 " + (selectedClientId ? "hidden lg:flex" : "flex")} style={{ borderColor: "var(--brand-border)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--brand-border)" }}>
            <h1 className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>Messages</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Link href="/messages?client=broadcast"
              className="flex items-center gap-3 px-4 py-3.5 border-b transition-colors"
              style={{ borderColor: "var(--brand-border)", background: isBroadcast ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "transparent", borderLeft: isBroadcast ? "3px solid var(--brand-primary)" : "3px solid transparent" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-primary)" }}>
                <i className="ti ti-speakerphone text-base" style={{ color: "white" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: isBroadcast ? "var(--brand-primary)" : "var(--brand-text)" }}>All Clients</p>
                <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Send one message to everyone</p>
              </div>
            </Link>
<Link href="/messages?client=group"
              className="flex items-center gap-3 px-4 py-3.5 border-b transition-colors"
              style={{ borderColor: "var(--brand-border)", background: isGroup ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "transparent", borderLeft: isGroup ? "3px solid var(--brand-primary)" : "3px solid transparent" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-primary)" }}>
                <i className="ti ti-speakerphone text-base" style={{ color: "white" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: isGroup ? "var(--brand-primary)" : "var(--brand-text)" }}>Group Chat</p>
                <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Everyone can see and reply</p>
              </div>
            </Link>
            {sortedClients.map(c => {
              const unread = readClients.has(c.id) ? 0 : (unreadByClient[c.id] || 0);
              const isSel = c.id === selectedClientId;
              const last = lastByClient[c.id];
              return (
                <div key={c.id} className="relative border-b" style={{ borderColor: "var(--brand-border)" }}>
                <Link onClick={() => setReadClients((prev) => new Set(prev).add(c.id))} href={"/messages?client=" + c.id}
                  className="flex items-center gap-3 px-4 py-3.5 pr-11 transition-colors"
                  style={{ background: isSel ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "transparent", borderLeft: isSel ? "3px solid var(--brand-primary)" : "3px solid transparent" }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: isSel ? "var(--brand-primary)" : "color-mix(in srgb, var(--brand-primary) 20%, transparent)", color: isSel ? "white" : "var(--brand-primary)" }}>
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate flex items-center min-w-0" style={{ color: isSel ? "var(--brand-primary)" : "var(--brand-text)" }}>
                        <span className="truncate">{c.name}</span>
                        {unread > 0 ? <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#ef4444", marginLeft: 6, flexShrink: 0, animation: "cw-pulse 1.2s ease-in-out infinite" }} /> : null}
                      </p>
                      {last && <span className="text-[10px] flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>{fmtDay(last.created_at)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs truncate" style={{ color: unread > 0 ? "var(--brand-text)" : "var(--brand-text-secondary)", fontWeight: unread > 0 ? 600 : 400 }}>
                        {last ? (last.from_id === currentUserId ? "You: " : "") + last.body.replace(/\n/g, " ") : "No messages yet"}
                      </p>
                      {unread > 0 && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: "var(--brand-primary)", color: "white" }}>
                          {unread > 9 ? "9+" : unread}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
                <button onClick={() => handleDeleteThreadFor(c.id, c.name)} title="Delete conversation" aria-label="Delete conversation" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "var(--brand-text-secondary)", background: "transparent" }}>
                  <i className="ti ti-trash text-sm" />
                </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className={"flex-1 flex flex-col min-w-0 overflow-hidden " + (!selectedClientId ? "hidden lg:flex" : "flex")}>
          {isBroadcast ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--brand-border)" }}>
                <Link href="/messages" className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                  <i className="ti ti-arrow-left text-sm" style={{ color: "var(--brand-text)" }} />
                </Link>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-primary)" }}>
                  <i className="ti ti-speakerphone text-sm" style={{ color: "white" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>All Clients</p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{clients.length} recipient{clients.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="px-4 py-2 text-xs flex-shrink-0" style={{ background: "color-mix(in srgb, var(--brand-primary) 8%, transparent)", color: broadcastSent != null ? "#22c55e" : "var(--brand-text-secondary)" }}>
                {broadcastSent != null ? `Sent to ${broadcastSent} client${broadcastSent === 1 ? "" : "s"} \u2713` : "Messages sent here go to every client as an individual message."}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">{ThreadPanel()}</div>
            </>
          ) : isGroup ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--brand-border)" }}>
                <Link href="/messages" className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                  <i className="ti ti-arrow-left text-sm" style={{ color: "var(--brand-text)" }} />
                </Link>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-primary)" }}>
                  <i className="ti ti-users-group text-sm" style={{ color: "white" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Group Chat</p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Everyone can see and reply</p>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">{ThreadPanel()}</div>
            </>
          ) : selectedClient ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--brand-border)" }}>
                <Link href="/messages" className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                  <i className="ti ti-arrow-left text-sm" style={{ color: "var(--brand-text)" }} />
                </Link>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "var(--brand-primary)", color: "white" }}>
                  {getInitials(selectedClient.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{selectedClient.name}</p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Client</p>
                </div>
                <Link href={"/clients/" + selectedClient.id} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                  <i className="ti ti-user text-xs" /> Profile
                </Link>
                <button onClick={handleDeleteThread} title="Delete this conversation" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: confirmDelThread ? "#ef4444" : "var(--brand-surface)", border: "1px solid " + (confirmDelThread ? "#ef4444" : "var(--brand-border)"), color: confirmDelThread ? "#fff" : "var(--brand-text-secondary)" }}>
                  <i className="ti ti-trash text-xs" /> {confirmDelThread ? "Tap to confirm" : "Delete"}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">{ThreadPanel()}</div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "color-mix(in srgb, var(--brand-primary) 12%, transparent)" }}>
                  <i className="ti ti-message-circle text-4xl" style={{ color: "var(--brand-primary)" }} />
                </div>
                <p className="text-base font-semibold" style={{ color: "var(--brand-text)" }}>Select a client to message</p>
                <p className="text-sm mt-1" style={{ color: "var(--brand-text-secondary)" }}>Choose from the list on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Client single-thread layout (with Coach / Group Chat toggle + composer)
  const clientTitle = isGroup ? "Group Chat" : "Symmetry Corrective";
  const pill = (active) => ({ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: active ? 800 : 600, background: active ? "var(--brand-primary)" : "var(--brand-surface)", color: active ? "#fff" : "var(--brand-text)", border: "1px solid var(--brand-border)" });
  return (
    <div style={{ background: "var(--brand-bg)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--brand-border)" }}>
        <Link href="/messages" style={pill(!isGroup) as any}>Coach</Link>
        <Link href="/messages?client=group" style={pill(isGroup) as any}>Group Chat</Link>
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--brand-border)", fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>{clientTitle}</div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{ThreadPanel()}</div>
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--brand-border)" }}>
        <textarea ref={inputRef as any} rows={1} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} onInput={(e) => { const t = e.currentTarget as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; }} placeholder={isGroup ? "Message the group..." : "Message your coach..."} style={{ flex: 1, resize: "none", borderRadius: 16, border: "1px solid var(--brand-border)", padding: "10px 12px", fontSize: 14, background: "var(--brand-surface)", color: "var(--brand-text)", fontFamily: "inherit" }} />
        <button onClick={handleSend} disabled={sending || !body.trim()} style={{ border: "none", borderRadius: 999, padding: "0 18px", fontWeight: 800, fontSize: 14, background: "var(--brand-primary)", color: "#fff", cursor: "pointer", opacity: sending || !body.trim() ? 0.5 : 1 }}>Send</button>
      </div>
    </div>
  );
}
