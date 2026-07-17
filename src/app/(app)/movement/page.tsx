import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import CaptureClient from './CaptureClient';

const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';

async function isClientMode(): Promise<boolean> {
  const store = await cookies();
  return store.get('symmetry_client_mode')?.value === '1';
}

// Trainer can run a screen on any client (?client=<id>); a client can run their
// own only when the trainer has enabled movement_screen_enabled for them.
export default async function MovementPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isTrainer = (user.email ?? '') === TRAINER_EMAIL;
  const inClientMode = isTrainer ? await isClientMode() : false;
  const sp = await searchParams;

  if (isTrainer && !inClientMode) {
    // Trainer test mode — pick the target client from ?client, else self.
    let clientId = sp.client ?? '';
    let clientName = 'Trainer test';
    if (clientId) {
      const { data } = await supabase.from('clients').select('name').eq('id', clientId).single();
      clientName = data?.name ?? 'Client';
    }
    return <CaptureClient clientId={clientId} clientName={clientName} capturedBy="trainer" />;
  }

  // Client path — resolve their client row + gate on the tester toggle.
  const { data: me } = await supabase
    .from('clients')
    .select('id, name, movement_screen_enabled')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!me?.movement_screen_enabled) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#9fb0d4' }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 8 }}>◍</div>
          <h2 style={{ color: '#eaf2ff' }}>Movement Screen — coming soon</h2>
          <p>Your trainer will turn this on for you when it&apos;s ready to try.</p>
        </div>
      </div>
    );
  }

  return <CaptureClient clientId={me.id} clientName={me.name ?? ''} capturedBy="client" />;
}
