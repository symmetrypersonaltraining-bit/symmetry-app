// Per-user GROUP-chat unread tracking (group_reads table). Group messages have
// to_id = the sender, so they have no per-recipient read state on the messages
// row itself — instead each user has a group_reads.last_read_at watermark and
// their group unread = group messages newer than it (not their own, not deleted).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawUnread } from "./notifications";

export interface GroupUnread {
  count: number;
  latest: { body: string; created_at: string; image_url: string | null } | null;
}

// Pure predicate (unit-tested): a group message counts as unread for `userId`
// when it's newer than their last_read_at, not sent by them, and not deleted.
export function isGroupUnread(
  m: { is_group?: boolean | null; created_at: string | null; from_id: string; deleted_at?: string | null },
  lastReadAt: string | null,
  userId: string,
): boolean {
  if (m.is_group !== true) return false;
  if (m.deleted_at != null) return false;
  if (m.from_id === userId) return false;
  const created = m.created_at || "";
  const watermark = lastReadAt || "1970-01-01T00:00:00Z";
  return created > watermark;
}

export function countGroupUnread(
  messages: { is_group?: boolean | null; created_at: string | null; from_id: string; deleted_at?: string | null }[],
  lastReadAt: string | null,
  userId: string,
): number {
  return (messages || []).filter((m) => isGroupUnread(m, lastReadAt, userId)).length;
}

// Fetch the caller's group unread (count + newest group message for a snippet).
export async function fetchGroupUnread(supabase: SupabaseClient, userId: string): Promise<GroupUnread> {
  try {
    const { data: gr } = await supabase.from("group_reads").select("last_read_at").eq("user_id", userId).maybeSingle();
    const lastReadAt = (gr as { last_read_at?: string } | null)?.last_read_at || "1970-01-01T00:00:00Z";
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, body, created_at, image_url, from_id")
      .eq("is_group", true)
      .is("deleted_at", null)
      .neq("from_id", userId)
      .gt("created_at", lastReadAt)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (msgs as { id: string; body: string; created_at: string; image_url: string | null; from_id: string }[]) || [];
    const latest = rows[0] ? { body: rows[0].body, created_at: rows[0].created_at, image_url: rows[0].image_url } : null;
    return { count: rows.length, latest };
  } catch {
    return { count: 0, latest: null };
  }
}

// Mark the group chat read for this user (called when they open the Group tab).
export async function markGroupRead(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase.from("group_reads").upsert({ user_id: userId, last_read_at: now, updated_at: now }, { onConflict: "user_id" });
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
