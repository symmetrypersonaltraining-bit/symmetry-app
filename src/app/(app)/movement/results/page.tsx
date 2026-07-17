import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ResultsClient from './ResultsClient';

// Results are read client-side from sessionStorage right after a capture.
// (A persisted-assessment view by ?id can be added for the trainer review queue.)
export default async function MovementResultsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <ResultsClient />;
}
