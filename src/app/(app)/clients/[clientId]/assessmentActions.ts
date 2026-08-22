'use server';

// Read and write a client's assessment from the profile.
//
// This exists because the assessment was effectively write-once and invisible:
// client_assessments held Sariah Duncan's wrist surgery, frozen shoulder and
// severe shoulder restriction from the day she signed up, and nothing surfaced
// it anywhere. A program was built without it.
//
// Writes go to client_assessments, NOT to clients. trg_sync_assessment_to_client
// pushes the clinical fields onto clients.injuries_limitations / medical_notes
// automatically, so the assessment stays the single source of truth and the
// denormalised copy can never drift again.
//
// Service role, because client_assessments is not readable with the anon key any
// more (that hole was closed) and this is a trainer-only surface. The trainer
// check is explicit here rather than inherited from RLS, since the service role
// bypasses RLS by design.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { TRAINER_EMAIL } from '@/lib/ai/scope';
import { revalidatePath } from 'next/cache';
import { viewerIsTrainer } from "@/lib/auth/viewer";

const EDITABLE = [
  'current_injuries', 'prior_surgeries', 'chronic_conditions', 'medications',
  'pain_location', 'pain_onset', 'contraindicated_movements', 'medical_clearance',
  'ohsa_notes',
  'feet_turn_out', 'excessive_forward_lean', 'knees_cave_in', 'low_back_arch',
  'arms_fall_forward', 'forward_head', 'lateral_asymmetry', 'balance_deficits', 'hip_issues',
  'experience_level', 'activity_level', 'primary_goal', 'secondary_goal',
  'goal_notes', 'goal_timeline',
  'session_length_minutes', 'training_location', 'equipment_access',
  'trainer_notes',
] as const;

export type AssessmentFields = Partial<Record<(typeof EDITABLE)[number], string | boolean | number | null>>;

async function requireTrainer() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) throw new Error('Trainer only');
}

function service() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAssessment(clientId: string) {
  await requireTrainer();
  const sb = service();
  const { data, error } = await sb
    .from('client_assessments')
    .select('*')
    .eq('client_id', clientId)
    .order('assessed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message, assessment: null };
  return { ok: true as const, error: null, assessment: data };
}

export async function saveAssessment(clientId: string, fields: AssessmentFields) {
  try {
    await requireTrainer();
    const sb = service();

    // Only ever write the whitelist. Nothing here can touch client_id, ids, or
    // anything structural.
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (k in fields) {
        const v = fields[k];
        patch[k] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true as const, error: null };
    patch.updated_at = new Date().toISOString();

    const { data: existing } = await sb
      .from('client_assessments')
      .select('id')
      .eq('client_id', clientId)
      .order('assessed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await sb.from('client_assessments').update(patch).eq('id', existing.id);
      if (error) return { ok: false as const, error: error.message };
    } else {
      // No assessment yet — create one so there is somewhere for this to live.
      // assessed_at is Central, not UTC: after 7pm the UTC date is tomorrow.
      const { error } = await sb.from('client_assessments').insert({
        client_id: clientId,
        assessed_at: new Date().toISOString(),
        status: 'active',
        ...patch,
      });
      if (error) return { ok: false as const, error: error.message };
    }

    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, error: null };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
