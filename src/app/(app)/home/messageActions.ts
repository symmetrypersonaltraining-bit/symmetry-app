'use server'; // trigger deploy
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markMessageRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function sendMessage(clientId: string, body: string): Promise<void> {
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
  });
  revalidatePath('/messages');
}

export async function sendClientMessage(body: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: clientRecord } = await supabase
    .from('clients')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!clientRecord) return;

  const { data: trainerSettings } = await supabase
    .from('trainer_settings')
    .select('user_id')
    .limit(1)
    .maybeSingle();
  if (!trainerSettings?.user_id) return;

  await supabase.from('messages').insert({
    from_id: user.id,
    to_id: trainerSettings.user_id,
    client_id: clientRecord.id,
    body,
  });
  revalidatePath('/messages');
}

export async function sendBroadcastMessage(body: string): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'symmetrypersonaltraining@gmail.com') return 0;
  const { data: clients } = await supabase
    .from('clients')
    .select('id, auth_user_id')
    .not('auth_user_id', 'is', null);
  const rows = (clients || [])
    .filter((c: any) => c.auth_user_id && c.auth_user_id !== user.id)
    .map((c: any) => ({ from_id: user.id, to_id: c.auth_user_id, client_id: c.id, body }));
  if (rows.length) {
    await supabase.from('messages').insert(rows);
  }
  revalidatePath('/messages');
  if (rows.length) {
    await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, is_broadcast: true });
  }
  return rows.length;
}

export async function sendGroupMessage(body: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, is_group: true });
  revalidatePath("/messages");
}
