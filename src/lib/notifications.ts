// Notification-center aggregation. Turns the raw unread-message rows (the SAME
// unread source the nav badge + MessageNotifier read) into one row per source,
// newest first. Pure + unit-tested.

export interface RawUnread {
  id: string;
  from_id: string;
  to_id: string;
  client_id: string | null;
  body: string;
  created_at: string | null;
  read_at?: string | null;
  deleted_at?: string | null;
  is_group?: boolean | null;
  is_broadcast?: boolean | null;
  image_url?: string | null;
}

export interface NotifRow {
  key: string;
  kind: "client" | "trainer" | "group";
  clientId?: string;
  title: string;
  snippet: string;
  count: number;
  time: string;    // latest created_at
  href: string;    // deep-link destination
}

function snippetOf(body: string | null, hasImage: boolean): string {
  const raw = (body || "").replace(/\s+/g, " ").trim();
  if (!raw) return hasImage ? "📷 Photo" : "New message";
  return raw.length > 64 ? raw.slice(0, 64) + "…" : raw;
}

// rows = unread messages addressed to me (to_id = me). opts controls trainer vs
// client shaping + trainer client-name lookup.
export function aggregateNotifications(
  rows: RawUnread[],
  opts: { isTrainer: boolean; myUserId: string; clientNames?: Record<string, string>; clientMode?: boolean },
): NotifRow[] {
  // In client mode (Dustin's own client app) carry the ?as=client marker on
  // deep-links so tapping a notification lands on the CLIENT view, never the
  // trainer inbox.
  const asMarker = opts.clientMode ? "&as=client" : "";
  // Only genuine unread, not deleted, not my own (skips trainer self-broadcast copies).
  const live = (rows || []).filter(
    (m) => m.read_at == null && m.deleted_at == null && m.to_id === opts.myUserId && m.from_id !== opts.myUserId,
  );

  const groups = new Map<string, { rows: RawUnread[]; latest: string }>();
  for (const m of live) {
    const isGroup = m.is_group === true;
    const key = isGroup ? "group" : opts.isTrainer ? "client:" + (m.client_id || "?") : "trainer";
    const g = groups.get(key) || { rows: [], latest: "" };
    g.rows.push(m);
    const t = m.created_at || "";
    if (t > g.latest) g.latest = t;
    groups.set(key, g);
  }

  const out: NotifRow[] = [];
  for (const [key, g] of groups) {
    // newest message in this source drives the snippet
    const newest = g.rows.reduce((a, b) => ((b.created_at || "") > (a.created_at || "") ? b : a), g.rows[0]);
    const snippet = snippetOf(newest.body, !!newest.image_url);
    if (key === "group") {
      out.push({ key, kind: "group", title: "Group Chat", snippet, count: g.rows.length, time: g.latest, href: "/messages?client=group" + asMarker });
    } else if (opts.isTrainer) {
      const clientId = key.slice("client:".length);
      const title = (opts.clientNames && opts.clientNames[clientId]) || "Client";
      out.push({ key, kind: "client", clientId, title, snippet, count: g.rows.length, time: g.latest, href: "/messages?client=" + clientId });
    } else {
      out.push({ key, kind: "trainer", title: "Trainer", snippet, count: g.rows.length, time: g.latest, href: opts.clientMode ? "/messages?as=client" : "/messages" });
    }
  }

  out.sort((a, b) => b.time.localeCompare(a.time));
  return out;
}

export function totalUnread(rows: NotifRow[]): number {
  return rows.reduce((n, r) => n + r.count, 0);
}
