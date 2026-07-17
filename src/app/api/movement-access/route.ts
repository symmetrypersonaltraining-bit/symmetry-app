// ─────────────────────────────────────────────────────────────────────────────
// POST /api/movement-access  — trainer-only per-client tester toggle.
// Flips clients.movement_screen_enabled so a selected client sees the self-serve
// Movement Screen tab in their app (exactly as the paid app will ship it).
// GET  /api/movement-access  — list clients + their enabled state + queue counts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';

async function requireTrainer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) return { supabase, ok: false as const };
  return { supabase, ok: true as const };
}

export async function GET() {
  const { supabase, ok } = await requireTrainer();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, movement_screen_enabled')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Review-queue counts per client (best-effort; table may not exist yet)
  let queues: Record<string, number> = {};
  const { data: pending } = await supabase
    .from('movement_assessments')
    .select('client_id, status')
    .in('status', ['analyzed', 'reviewed']);
  if (pending) {
    queues = pending.reduce<Record<string, number>>((acc, r: { client_id: string }) => {
      acc[r.client_id] = (acc[r.client_id] || 0) + 1;
      return acc;
    }, {});
  }

  return NextResponse.json({
    clients: (clients ?? []).map((c: { id: string; name: string; movement_screen_enabled?: boolean }) => ({
      id: c.id,
      name: c.name,
      enabled: !!c.movement_screen_enabled,
      queued: queues[c.id] || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { supabase, ok } = await requireTrainer();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId, enabled } = (await req.json()) as { clientId: string; enabled: boolean };
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });

  const { error } = await supabase
    .from('clients')
    .update({ movement_screen_enabled: !!enabled })
    .eq('id', clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, clientId, enabled: !!enabled });
}
