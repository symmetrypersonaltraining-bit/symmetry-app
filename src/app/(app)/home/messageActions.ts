'use server'; // trigger deploy
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { sendPushToUser } from '@/lib/push';
import { NOTIFICATION_EVENTS } from '@/lib/notificationEvents';
import { buildTrainerMessageEmail } from '@/lib/messageEmail';
import { isTrainerEmail } from "@/lib/trainer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://symmetry-app-omega.vercel.app';

// Reliable email alert to the trainer on every client→trainer message. Push is
// unreliable (single Android token, often doesn't fire), so email is the
// backstop. Reuses the exact Resend REST setup + verified sender the reminders/
// invites use. Best-effort: any failure is swallowed so it NEVER blocks the
// message insert.
async function emailTrainerNewMessage(clientName: string, body: string, hasImage: boolean): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const payload = buildTrainerMessageEmail(clientName, body, hasImage, APP_URL);
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('trainer message email failed', e);
  }
}

export async function markMessageRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function sendMessage(clientId: string, body: string, imageUrl?: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: clientRow } = await supabase
    .from('clients')
    .select('auth_user_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientRow?.auth_user_id) return;
  await supabase.from('messages').insert({
    from_id: user.id,
    to_id: clientRow.auth_user_id,
    client_id: clientId,
    body,
    image_url: imageUrl || null,
  });
  revalidatePath('/messages');

  // Push the client (deep-links to their trainer thread). Guarded — never blocks.
  try {
    await sendPushToUser(clientRow.auth_user_id as string, NOTIFICATION_EVENTS.MESSAGE_FROM_COACH, 'New message from your coach', (body || '📷 Photo').slice(0, 140), { url: '/messages' });
  } catch (e) { console.error('client push failed', e); }
}

export async function sendClientMessage(body: string, imageUrl?: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: clientRecord } = await supabase
    .from('clients')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!clientRecord) return;

  const { data: trainerId } = await supabase.rpc("trainer_user_id");
  if (!trainerId) return;

  await supabase.from('messages').insert({
    from_id: user.id,
    to_id: (trainerId as string),
    client_id: clientRecord.id,
    body,
    image_url: imageUrl || null,
  });
  revalidatePath('/messages');

  // Notify the trainer. Push is unreliable (single Android token), so we ALSO
  // send an email — the reliable backstop. Both are best-effort and never block.
  // Push deep-links straight to this client's thread.
  const who = (clientRecord as { name?: string }).name || 'A client';
  try {
    await sendPushToUser(trainerId as string, NOTIFICATION_EVENTS.MESSAGE_FROM_CLIENT, `New message from ${who}`, (body || '📷 Photo').slice(0, 140), { url: `/messages?client=${clientRecord.id}` });
  } catch (e) { console.error('trainer push failed', e); }
  await emailTrainerNewMessage(who, body || '', !!imageUrl);
}

export async function sendBroadcastMessage(body: string, imageUrl?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isTrainerEmail(user.email)) return 0;
  // Archived clients are off the roster — a broadcast never reaches them.
  const { data: clients } = await supabase
    .from('clients')
    .select('id, auth_user_id')
    .not('auth_user_id', 'is', null)
    .is('archived_at', null);
  const rows = (clients || [])
    .filter((c: any) => c.auth_user_id && c.auth_user_id !== user.id)
    .map((c: any) => ({ from_id: user.id, to_id: c.auth_user_id, client_id: c.id, body, image_url: imageUrl || null, is_broadcast: true }));
  if (rows.length) {
    await supabase.from('messages').insert(rows);
  }
  revalidatePath('/messages');
  if (rows.length) {
    // Self-copy (client_id null) so the trainer can confirm the broadcast went out.
    await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: imageUrl || null, is_broadcast: true });
  }

  // Push every recipient (deep-links to their trainer thread). Guarded per user.
  try {
    const recipients = (clients || []).filter((c: any) => c.auth_user_id && c.auth_user_id !== user.id);
    await Promise.all(recipients.map((c: any) =>
      sendPushToUser(c.auth_user_id as string, NOTIFICATION_EVENTS.ANNOUNCEMENT, 'Announcement from Symmetry', (body || '📷 Photo').slice(0, 140), { url: '/messages' }).catch(() => {})
    ));
  } catch (e) { console.error('broadcast push failed', e); }

  return rows.length;
}

/**
 * Post to the group.
 *
 * `silent` skips the push fan-out. It exists for messages the app posts on a
 * client's behalf — an auto-shared PR, for instance. Those belong in the thread
 * so the group sees the win, but buzzing thirty-five phones every time somebody
 * finishes a set is how a group chat gets muted, and a muted group chat is the
 * end of the community feature. The message still appears, still shows as
 * unread in the app, and still turns up in the notification centre; it just
 * does not ring.
 */
export async function sendGroupMessage(body: string, imageUrl?: string | null, silent = false): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: imageUrl || null, is_group: true });
  revalidatePath("/messages");

  if (silent) return;

  // Push all OTHER group members (every client + the trainer) except the sender.
  // Uses the admin client so the recipient list isn't limited by the sender's RLS.
  try {
    const admin: any = createAdminClient();
    const [{ data: members }, { data: trainerId }] = await Promise.all([
      admin.from('clients').select('auth_user_id').not('auth_user_id', 'is', null).is('archived_at', null),
      supabase.rpc('trainer_user_id'),
    ]);
    const targets = new Set<string>();
    (members || []).forEach((m: any) => { if (m.auth_user_id) targets.add(m.auth_user_id as string); });
    if (trainerId) targets.add(trainerId as string);
    targets.delete(user.id);
    await Promise.all([...targets].map((uid) =>
      sendPushToUser(uid, NOTIFICATION_EVENTS.GROUP_MESSAGE, 'New group message', (body || '📷 Photo').slice(0, 140), { url: '/messages?client=group' }).catch(() => {})
    ));
  } catch (e) { console.error('group push failed', e); }
}

// Soft-delete: sets deleted_at so a message/thread disappears from every view
// but the row is preserved (reversible by clearing deleted_at). Never a hard delete.
export async function deleteMessage(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/messages");
}

export async function deleteThread(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !clientId) return;
  await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("deleted_at", null);
  revalidatePath("/messages");
}

/**
 * Tell the author of a message that somebody reacted to it.
 *
 * Dustin, 13 Aug, asking for this: "add options for them to get notifications
 * on emojis on their group chat comments." And on who chooses, 14 Aug: "the
 * person that sent the message should be able to set if they want
 * notifications when others react with emojis to it." Per-SENDER, and that
 * includes clients — whoever wrote the message decides.
 *
 * Until now `message_reactions` was written straight from the browser under RLS
 * and nothing fired at all, so a 👊 on someone's win was invisible unless they
 * happened to be looking at the screen. In a group chat that is the entire
 * point of the feature, and the person who earned it never found out.
 *
 * Three rules, all of them the obvious-in-hindsight kind:
 *
 *   1. Never notify you about your own reaction.
 *   2. Coalesce. Five 👊 in a minute is one buzz, not five — the second person
 *      to react should not cost the author another notification. Approximated
 *      by "did anything else land on this message in the last minute", which
 *      needs no new table and errs toward sending less.
 *   3. The preference check is NOT here. It lives in sendPushToUser, so it
 *      cannot be forgotten by this caller or the next one.
 *
 * Best-effort throughout: a failure here must never make the reaction itself
 * look like it failed, because the reaction is already saved by the time we
 * are called.
 */
export async function notifyMessageReaction(messageId: string, emoji: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const admin = createAdminClient();

    const { data: msg } = await admin
      .from('messages')
      .select('id, from_id, body, is_group, deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    const m = msg as { from_id: string | null; body: string | null; deleted_at: string | null } | null;
    if (!m?.from_id || m.deleted_at) return;

    // Rule 1 — your own reaction is not news.
    if (m.from_id === user.id) return;

    // Rule 2 — coalesce. Anything else on this message in the last minute means
    // the author has already been buzzed for this little flurry.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('message_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId)
      .neq('user_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) > 1) return;

    const { data: reactor } = await admin
      .from('clients')
      .select('name')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    const who = (reactor as { name?: string } | null)?.name?.split(' ')[0] || 'Someone';

    const preview = (m.body || 'your message').slice(0, 60);
    await sendPushToUser(
      m.from_id,
      NOTIFICATION_EVENTS.REACTION_ON_MY_MESSAGE,
      `${who} reacted ${emoji}`,
      preview,
      { url: '/messages?client=group' },
    );
  } catch {
    /* a reaction that saved but did not notify is still a saved reaction */
  }
}
