import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TestersClient from './TestersClient';
import { viewerIsTrainer } from "@/lib/auth/viewer";

export default async function TestersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await viewerIsTrainer(supabase, user))) redirect('/home');
  return (
    <div className="p-4 lg:p-6">
      <TestersClient />
    </div>
  );
}
