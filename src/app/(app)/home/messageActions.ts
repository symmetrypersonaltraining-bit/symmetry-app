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
async function emailTrainerNewMessage(clientName: string, body: string, hasImage: boolean, toEmail?: string | null): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const payload = buildTrainerMessageEmail(clientName, body, hasImage, APP_URL, toEmail);
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

// ── These return an error STRING now. The push is why ────────────────────────
//
// The insert was unchecked and the push fired regardless, so a refused write
// notified the recipient "New message from your coach" about a message that did
// not exist. They open the app, find nothing, and the sender has been told
// nothing at all — MessagesClient clears the input box and refreshes on the
// success path, so the typed text is gone too.
//
// deleteMessage and deleteThread in this same file were given exactly this
// treatment on 15 Aug, for exactly this reason. The send paths were missed.
export async function sendMessage(clientId: string, body: string, imageUrl?: string | null): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'You are signed out — sign in and try again.';
  const { data: clientRow } = await supabase
    .from('clients')
    .select('auth_user_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientRow?.auth_user_id) return 'That client has no login yet, so they cannot receive messages.';
  const { error } = await supabase.from('messages').insert({
    from_id: user.id,
    to_id: clientRow.auth_user_id,
    client_id: clientId,
    body,
    image_url: imageUrl || null,
  });
  // Return BEFORE the push. Notifying someone about a message that was not
  // written is worse than the failure itself.
  if (error) return `Message not sent: ${error.message}`;
  revalidatePath('/messages');

  // Push the client (deep-links to their trainer thread). Guarded — never blocks.
  try {
    await sendPushToUser(clientRow.auth_user_id as string, NOTIFICATION_EVENTS.MESSAGE_FROM_COACH, 'New message from your coach', (body || '📷 Photo').slice(0, 140), { url: '/messages' });
  } catch (e) { console.error('client push failed', e); }
  return null;
}

export async function sendClientMessage(body: string, imageUrl?: string | null): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'You are signed out — sign in and try again.';

  const { data: clientRecord } = await supabase
    .from('clients')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!clientRecord) return 'We could not find your client record.';

  // THEIR coach, not THE coach. `trainer_user_id` returns the single configured
  // trainer, so from 20 Aug every one of Stephanie's clients would have
  // messaged Dustin — his inbox, his push, and she would never have known they
  // wrote. Falls back to the old behaviour if a client somehow has no trainer,
  // because a message reaching the owner beats one reaching nobody.
  //
  // The fallback used to be `trainer_user_id()`, which is `trainer_settings ...
  // LIMIT 1` with no ORDER BY — an arbitrary coach, which is a worse answer
  // than a deliberate one. `my_trainer_owner_user_id()` names the owner.
  const { data: ownTrainerId } = await supabase.rpc("my_trainer_user_id");
  const { data: fallbackTrainerId } = ownTrainerId
    ? { data: null }
    : await supabase.rpc("owner_trainer_user_id");
  const trainerId = ownTrainerId || fallbackTrainerId;
  if (!trainerId) return 'No trainer is configured to receive this.';
  const { data: trainerEmail } = await supabase.rpc("my_trainer_email");

  const { error } = await supabase.from('messages').insert({
    from_id: user.id,
    to_id: (trainerId as string),
    client_id: clientRecord.id,
    body,
    image_url: imageUrl || null,
  });
  if (error) return `Message not sent: ${error.message}`;
  revalidatePath('/messages');

  // Notify the trainer. Push is unreliable (single Android token), so we ALSO
  // send an email — the reliable backstop. Both are best-effort and never block.
  // Push deep-links straight to this client's thread.
  const who = (clientRecord as { name?: string }).name || 'A client';
  try {
    await sendPushToUser(trainerId as string, NOTIFICATION_EVENTS.MESSAGE_FROM_CLIENT, `New message from ${who}`, (body || '📷 Photo').slice(0, 140), { url: `/messages?client=${clientRecord.id}` });
  } catch (e) { console.error('trainer push failed', e); }
  await emailTrainerNewMessage(who, body || '', !!imageUrl, trainerEmail as string | null);
  return null;
}

export async function sendBroadcastMessage(body: string, imageUrl?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isTrainerEmail(user.email)) return 0;
  // Archived clients are off the roster — a broadcast never reaches them.
  //
  // AND IT ONLY REACHES YOUR OWN. This read the whole table, so from 20 Aug
  // Stephanie's announcement would have gone to all 35 of Dustin's clients and
  // his to hers. RLS already scopes what this select returns — the owner sees
  // everyone, a trainer sees her own — so the fix is that the query is now
  // trusted to be scoped rather than being run with an admin client.
  //
  // The GROUP CHAT below is deliberately NOT scoped: one Symmetry community,
  // Dustin's decision — "All clients can go in there since they're all going to
  // train with Symmetry Personal Training." A broadcast is addressed FROM a
  // coach TO their people, which is a different thing from the room everyone
  // shares.
  const { data: clients } = await supabase
    .from('clients')
    .select('id, auth_user_id')
    .not('auth_user_id', 'is', null)
    .is('archived_at', null);
  const rows = (clients || [])
    .filter((c: any) => c.auth_user_id && c.auth_user_id !== user.id)
    .map((c: any) => ({ from_id: user.id, to_id: c.auth_user_id, client_id: c.id, body, image_url: imageUrl || null, is_broadcast: true }));
  // The returned count is what the trainer is SHOWN ("sent to 22"). It used to
  // be rows.length — the number this function intended to send, reported
  // identically whether the insert landed or was refused outright. A broadcast
  // that reached nobody said 22.
  let sent = 0;
  if (rows.length) {
    const { data: inserted, error } = await supabase.from('messages').insert(rows).select('id');
    if (error) return 0;
    sent = (inserted as { id: string }[] | null)?.length ?? 0;
  }
  revalidatePath('/messages');
  if (sent > 0) {
    // Self-copy (client_id null) so the trainer can confirm the broadcast went
    // out. Only written if something actually did — a self-copy of a broadcast
    // that reached nobody is a receipt for a thing that did not happen.
    await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: imageUrl || null, is_broadcast: true });
  }

  // Push every recipient (deep-links to their trainer thread). Guarded per user.
  try {
    const recipients = (clients || []).filter((c: any) => c.auth_user_id && c.auth_user_id !== user.id);
    await Promise.all(recipients.map((c: any) =>
      sendPushToUser(c.auth_user_id as string, NOTIFICATION_EVENTS.ANNOUNCEMENT, 'Announcement from Symmetry', (body || '📷 Photo').slice(0, 140), { url: '/messages' }).catch(() => {})
    ));
  } catch (e) { console.error('broadcast push failed', e); }

  return sent;
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
export async function sendGroupMessage(body: string, imageUrl?: string | null, silent = false): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'You are signed out — sign in and try again.';
  const { error } = await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: imageUrl || null, is_group: true });
  // Before the fan-out: buzzing thirty-five phones about a message that was
  // never written is the loudest possible way to be wrong.
  if (error) return `Message not posted to the group: ${error.message}`;
  revalidatePath("/messages");

  if (silent) return null;

  // Push all OTHER group members (every client + the trainer) except the sender.
  // Uses the admin client so the recipient list isn't limited by the sender's RLS.
  try {
    const admin: any = createAdminClient();
    // EVERY active trainer, not "the" trainer. This asked `trainer_user_id()`,
    // whose body is `trainer_settings ... LIMIT 1` with no ORDER BY and a
    // hardcoded fallback to Dustin's address — it can only ever return one
    // person, so the second coach was never on the list. It happens not to bite
    // today only because both trainers also have a client row of their own and
    // therefore fall out of the member sweep; archive either row, or add a
    // trainer who is not also a client, and that coach silently stops hearing
    // the group chat. The group itself is shared by decision, so both coaches
    // belong on it.
    const [{ data: members }, { data: coaches }] = await Promise.all([
      admin.from('clients').select('auth_user_id').not('auth_user_id', 'is', null).is('archived_at', null),
      admin.from('trainers').select('auth_user_id').eq('active', true).not('auth_user_id', 'is', null),
    ]);
    const targets = new Set<string>();
    (members || []).forEach((m: any) => { if (m.auth_user_id) targets.add(m.auth_user_id as string); });
    (coaches || []).forEach((t: any) => { if (t.auth_user_id) targets.add(t.auth_user_id as string); });
    targets.delete(user.id);
    await Promise.all([...targets].map((uid) =>
      sendPushToUser(uid, NOTIFICATION_EVENTS.GROUP_MESSAGE, 'New group message', (body || '📷 Photo').slice(0, 140), { url: '/messages?client=group' }).catch(() => {})
    ));
  } catch (e) { console.error('group push failed', e); }
  return null;
}

// Soft-delete: sets deleted_at so a message/thread disappears from every view
// but the row is preserved (reversible by clearing deleted_at). Never a hard delete.
//
// BOTH OF THESE NOW THROW ON FAILURE, and the reason is the caller.
//
// MessagesClient wraps them in
//   try { await deleteThread(...); router.push(...); router.refresh(); } catch {}
// which LOOKS like error handling and was not, because neither function could
// throw. So the success path ran unconditionally: the view navigated away, the
// list refreshed, and if the write had failed — RLS, a bad id, a transient
// error — the thread was still there and nothing was said.
//
// A confirmed "Delete the entire conversation with X" that silently does
// nothing is the same class of fault as the six writes that had never once
// succeeded. Throwing gives that catch block something real to catch.
export async function deleteMessage(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Couldn't delete that message: ${error.message}`);
  revalidatePath("/messages");
}

export async function deleteThread(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !clientId) return;
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("deleted_at", null);
  if (error) throw new Error(`Couldn't delete that conversation: ${error.message}`);
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
