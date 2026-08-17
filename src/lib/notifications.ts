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
  /**
   * 'coachbot' when the app wrote it; null when a person did.
   *
   * Dustin, 16 Aug: "Just the ones personally from me in group or to them need
   * to get their attention." This column is how that question is answered, and
   * it has been on the table since the CoachBot work — it simply was not read
   * here, so a nightly AI nudge and a message he typed himself were treated as
   * the same event.
   */
  sender_kind?: string | null;
}

export interface NotifRow {
  /**
   * A HUMAN sent this, not the app. Drives how loudly it is announced.
   *
   * Only ever true when every unread message in the row was written by a
   * person: one coachbot nudge landing in the same group thread must not
   * downgrade an announcement Dustin typed, and equally a nudge on its own must
   * not borrow the emphasis meant for him.
   */
  fromPerson?: boolean;
  /**
   * WHO sent it, from the reader's point of view. Undefined when we cannot say.
   *
   * Dustin, 17 Aug, looking at his own TRAINER app: a banner reading
   * "Dustin messaged you — Claudine Ocon". Claudine had messaged him, and the
   * app told him he had messaged himself.
   *
   * The banner hard-coded the coach's name, which is right for the only reader
   * it was written for — a client, for whom every message does come from
   * Dustin. For the trainer the sender is the CLIENT, and the copy had no way
   * to say so.
   *
   * Left undefined for the group thread on purpose: anyone in it can post and
   * the unread query does not resolve names, so naming a sender there would be
   * a guess. Neutral copy is used instead. A wrong name is worse than no name.
   */
  fromName?: string;
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
  opts: {
    isTrainer: boolean;
    myUserId: string;
    clientNames?: Record<string, string>;
    clientMode?: boolean;
    /** Passed in rather than imported: this module is pure and unit-tested. */
    coachFirstName?: string;
  },
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
    // Which message the tap should land ON.
    //
    // Opening the thread and stopping at the bottom is wrong for the group: by
    // the time someone taps "Dustin posted an announcement", four clients have
    // shared PRs underneath it, so the message they were told to read is off
    // screen and they arrive at chatter. `?m=` scrolls to it and flashes it.
    //
    // The ANNOUNCEMENT is the target where there is one, not merely the newest
    // unread — an announcement being buried is the exact failure this fixes, so
    // it outranks whatever arrived after it. Otherwise the oldest unread, which
    // is where reading should start.
    const announcement = g.rows
      .filter((m) => m.is_broadcast === true)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
      .slice(-1)[0];
    const oldestUnread = g.rows.reduce(
      (a, b) => ((b.created_at || "") < (a.created_at || "") ? b : a),
      g.rows[0],
    );
    const anchor = announcement || oldestUnread;
    const m = anchor?.id ? "&m=" + anchor.id : "";

    // Written by a person, not by the app. `some`, not `every`: a row is worth
    // shouting about the moment it contains one message a human typed. Using
    // `every` would let a single overnight nudge landing in the same thread
    // quietly demote an announcement Dustin wrote — and the nudge is exactly
    // the thing he does not want stealing that emphasis.
    const fromPerson = g.rows.some((r) => (r.sender_kind ?? null) === null);

    if (key === "group") {
      out.push({ key, kind: "group", title: "Group Chat", snippet, count: g.rows.length, time: g.latest, fromPerson, href: "/messages?client=group" + asMarker + m });
    } else if (opts.isTrainer) {
      const clientId = key.slice("client:".length);
      const title = (opts.clientNames && opts.clientNames[clientId]) || "Client";
      // The trainer is reading, so the sender is the CLIENT. Only named when we
      // actually resolved the name — "Client messaged you" is worse than
      // neutral copy.
      const fromName = (opts.clientNames && opts.clientNames[clientId]) || undefined;
      out.push({ key, kind: "client", clientId, title, snippet, count: g.rows.length, time: g.latest, fromPerson, fromName, href: "/messages?client=" + clientId + m });
    } else {
      const base = opts.clientMode ? "/messages?as=client" : "/messages";
      // A client is reading their own thread with the coach, so it is from him.
      out.push({ key, kind: "trainer", title: "Trainer", snippet, count: g.rows.length, time: g.latest, fromPerson, fromName: opts.coachFirstName, href: base + (m ? (base.includes("?") ? m : "?" + m.slice(1)) : "") });
    }
  }

  out.sort((a, b) => b.time.localeCompare(a.time));
  return out;
}

export function totalUnread(rows: NotifRow[]): number {
  return rows.reduce((n, r) => n + r.count, 0);
}
