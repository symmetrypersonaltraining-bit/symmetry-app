import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TestersClient from './TestersClient';

const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';

export default async function TestersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if ((user.email ?? '') !== TRAINER_EMAIL) redirect('/home');
  return (
    <div className="p-4 lg:p-6">
      <TestersClient />
    </div>
  );
}
