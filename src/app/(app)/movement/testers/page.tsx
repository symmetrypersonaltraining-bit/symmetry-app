import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TestersClient from './TestersClient';
import { isTrainerEmail } from "@/lib/trainer";

export default async function TestersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!isTrainerEmail((user.email ?? ''))) redirect('/home');
  return (
    <div className="p-4 lg:p-6">
      <TestersClient />
    </div>
  );
}
