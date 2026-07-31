'use server'; // trigger deploy
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { sendPushToUser } from '@/lib/push';
import { buildTrainerMessageEmail } from '@/lib/messageEmail';

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
    await sendPushToUser(clientRow.auth_user_id as string, 'New message from your coach', (body || '📷 Photo').slice(0, 140), { url: '/messages' });
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
    await sendPushToUser(trainerId as string, `New message from ${who}`, (body || '📷 Photo').slice(0, 140), { url: `/messages?client=${clientRecord.id}` });
  } catch (e) { console.error('trainer push failed', e); }
  await emailTrainerNewMessage(who, body || '', !!imageUrl);
}

export async function sendBroadcastMessage(body: string, imageUrl?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'symmetrypersonaltraining@gmail.com') return 0;
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
      sendPushToUser(c.auth_user_id as string, 'Announcement from Symmetry', (body || '📷 Photo').slice(0, 140), { url: '/messages' }).catch(() => {})
    ));
  } catch (e) { console.error('broadcast push failed', e); }

  return rows.length;
}

export async function sendGroupMessage(body: string, imageUrl?: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: imageUrl || null, is_group: true });
  revalidatePath("/messages");

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
      sendPushToUser(uid, 'New group message', (body || '📷 Photo').slice(0, 140), { url: '/messages?client=group' }).catch(() => {})
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
