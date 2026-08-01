// Per-user GROUP-chat unread tracking (group_reads table). Group messages have
// to_id = the sender, so they have no per-recipient read state on the messages
// row itself — instead each user has a group_reads.last_read_at watermark and
// their group unread = group messages newer than it (not their own, not deleted).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawUnread } from "./notifications";

export interface GroupUnread {
  count: number;
  latest: { body: string; created_at: string; image_url: string | null } | null;
  /** Every unread group message id — the feed diffs by identity, not by count. */
  ids: string[];
  /** The message a notification tap should land ON. Prefers an announcement:
   *  being buried under client chatter is the exact failure this addresses, so
   *  it outranks whatever arrived after it. */
  anchorId: string | null;
  snippet: string | null;
}

// Pure predicate (unit-tested): a group message counts as unread for `userId`
// when it's newer than their last_read_at, not sent by them, and not deleted.
// When `includeOwn` is true the "not sent by them" rule is dropped — used for
// Dustin's Client View (same auth account as the trainer) so his own
// trainer-sent group/announcement messages DO notify his client app, exactly
// like a real client would be notified.
export function isGroupUnread(
  m: { is_group?: boolean | null; created_at: string | null; from_id: string; deleted_at?: string | null },
  lastReadAt: string | null,
  userId: string,
  includeOwn = false,
): boolean {
  if (m.is_group !== true) return false;
  if (m.deleted_at != null) return false;
  if (!includeOwn && m.from_id === userId) return false;
  const created = m.created_at || "";
  const watermark = lastReadAt || "1970-01-01T00:00:00Z";
  return created > watermark;
}

export function countGroupUnread(
  messages: { is_group?: boolean | null; created_at: string | null; from_id: string; deleted_at?: string | null }[],
  lastReadAt: string | null,
  userId: string,
  includeOwn = false,
): number {
  return (messages || []).filter((m) => isGroupUnread(m, lastReadAt, userId, includeOwn)).length;
}

// Fetch the caller's group unread (count + newest group message for a snippet).
// `includeOwn` (client mode) counts the caller's own group messages too.
export async function fetchGroupUnread(supabase: SupabaseClient, userId: string, includeOwn = false): Promise<GroupUnread> {
  try {
    const { data: gr } = await supabase.from("group_reads").select("last_read_at").eq("user_id", userId).maybeSingle();
    const lastReadAt = (gr as { last_read_at?: string } | null)?.last_read_at || "1970-01-01T00:00:00Z";
    let q = supabase
      .from("messages")
      .select("id, body, created_at, image_url, from_id, is_broadcast")
      .eq("is_group", true)
      .is("deleted_at", null)
      .gt("created_at", lastReadAt);
    if (!includeOwn) q = q.neq("from_id", userId);
    const { data: msgs } = await q.order("created_at", { ascending: false }).limit(200);
    const rows = (msgs as { id: string; body: string; created_at: string; image_url: string | null; from_id: string; is_broadcast?: boolean | null }[]) || [];
    const latest = rows[0] ? { body: rows[0].body, created_at: rows[0].created_at, image_url: rows[0].image_url } : null;
    // rows are newest-first. The announcement wins if there is one, otherwise
    // start reading at the oldest thing they have not seen.
    const announcement = rows.filter((r) => r.is_broadcast === true).slice(-1)[0];
    const oldest = rows[rows.length - 1];
    const anchor = announcement || oldest || null;
    const snippet = latest
      ? (latest.body?.trim() ? latest.body.trim().slice(0, 90) : latest.image_url ? "Sent a photo" : "New message")
      : null;
    return {
      count: rows.length,
      latest,
      ids: rows.map((r) => r.id),
      anchorId: anchor ? anchor.id : null,
      snippet,
    };
  } catch {
    return { count: 0, latest: null, ids: [], anchorId: null, snippet: null };
  }
}

// Mark the group chat read for this user.
//
// Writes the watermark from the SERVER clock via mark_group_read(). It used to
// write `new Date().toISOString()` from the browser while messages.created_at
// comes from Postgres — a device a minute slow left a minute of messages
// permanently unread, so the badge re-lit the instant it was cleared. A device
// running fast silently marked unseen messages as read, which is worse.
//
// userId is no longer needed (the function reads auth.uid()) but stays in the
// signature so existing call sites keep compiling.
export async function markGroupRead(supabase: SupabaseClient, _userId?: string): Promise<void> {
  try {
    await supabase.rpc("mark_group_read");
  } catch { /* noop */ }
}

// Turn a GroupUnread into the synthetic message-shaped row the notification
// aggregation understands (a single "group" source). Empty array when none.
export function groupUnreadAsRows(gu: GroupUnread, myUserId: string): RawUnread[] {
  if (!gu || gu.count <= 0) return [];
  const c = gu.latest;
  const body = c ? c.body : "";
  const created = c ? c.created_at : new Date().toISOString();
  const image = c ? c.image_url : null;
  // One row per unread group message so the aggregation's count matches; all
  // carry the newest snippet/time (they collapse into one "Group" row anyway).
  const rows: RawUnread[] = [];
  for (let i = 0; i < gu.count; i++) {
    rows.push({
      id: "group-unread-" + i, from_id: "group-sender", to_id: myUserId, client_id: null,
      body, created_at: created, read_at: null, deleted_at: null, is_group: true, image_url: image,
    });
  }
  return rows;
}
