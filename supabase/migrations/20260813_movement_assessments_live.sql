-- ─────────────────────────────────────────────────────────────────────────────
-- movement_assessments — APPLIED 2026-08-13
--
-- Supersedes the 2026-07-18 draft, which was never applied ("DO NOT APPLY until
-- Dustin reviews"). Only one piece of that draft ever reached prod by hand:
-- clients.movement_screen_enabled.
--
-- THE CONSEQUENCE OF IT NEVER LANDING
-- /api/movement-analyze inserts into movement_assessments on every capture. The
-- table did not exist, so every insert failed — and the route catches the error
-- and returns the analysis anyway with persisted:false. The results screen
-- renders normally. Nothing looks wrong. It is the most expensive single call
-- in the app and every result was thrown away.
--
-- WHAT CHANGED FROM THE DRAFT
-- The draft's RLS hardcoded the trainer's email address in every policy. That
-- predates the 11 Aug work making "trainer" a setting backed by public.trainers,
-- and applying it as written would have reintroduced the exact fault
-- tests/unit/trainerIdentity.test.ts now fails the build over. These policies
-- call is_trainer().
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client_assessments
  add column if not exists source text default 'manual',
  add column if not exists compensation_severity jsonb,
  add column if not exists compensation_confidence jsonb,
  add column if not exists movement_assessment_id uuid;

create table if not exists public.movement_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid,
  captured_by text not null default 'client',
  assessment_type text not null default 'OHSA',
  captured_at timestamptz not null default now(),

  views jsonb not null default '[]',
  calibration jsonb,
  quality jsonb,

  intake_words text,
  pain_map jsonb not null default '[]',
  acute_flag boolean not null default false,
  suspected_root text,
  red_flags jsonb not null default '[]',
  red_flags_acknowledged_at timestamptz,

  findings jsonb not null default '[]',
  chain jsonb not null default '[]',
  wedge jsonb,
  keyframes jsonb not null default '[]',
  keyframe_urls jsonb not null default '[]',
  center_of_mass jsonb,
  overall_confidence numeric,
  ensemble jsonb,

  ai_diagnosis jsonb,
  proposed_program jsonb,
  routed_program text,

  status text not null default 'captured',
  trainer_edits jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,
  reassess_of uuid references public.movement_assessments(id),
  scheduled_program_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_movement_assessments_client on public.movement_assessments(client_id, captured_at desc);
create index if not exists idx_movement_assessments_status on public.movement_assessments(status);

create table if not exists public.movement_assessment_frames (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.movement_assessments(id) on delete cascade,
  view text not null,
  rep_index int,
  t_ms int,
  keypoints jsonb not null,
  features jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_maf_assessment on public.movement_assessment_frames(assessment_id);

create or replace function public.touch_movement_assessments()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_movement_assessments on public.movement_assessments;
create trigger trg_touch_movement_assessments before update on public.movement_assessments
  for each row execute function public.touch_movement_assessments();

alter table public.movement_assessments enable row level security;
alter table public.movement_assessment_frames enable row level security;

drop policy if exists ma_trainer_all on public.movement_assessments;
create policy ma_trainer_all on public.movement_assessments
  for all using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists ma_client_own on public.movement_assessments;
create policy ma_client_own on public.movement_assessments
  for select using (
    client_id in (select id from public.clients where auth_user_id = auth.uid())
  );

drop policy if exists ma_client_insert on public.movement_assessments;
create policy ma_client_insert on public.movement_assessments
  for insert with check (
    client_id in (
      select id from public.clients
      where auth_user_id = auth.uid() and movement_screen_enabled = true
    )
  );

drop policy if exists maf_trainer_all on public.movement_assessment_frames;
create policy maf_trainer_all on public.movement_assessment_frames
  for all using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists maf_client_own on public.movement_assessment_frames;
create policy maf_client_own on public.movement_assessment_frames
  for select using (
    assessment_id in (
      select a.id from public.movement_assessments a
      join public.clients c on c.id = a.client_id
      where c.auth_user_id = auth.uid()
    )
  );

-- VERIFIED IN PROD, not just applied: inserted a row with the ROUTE'S EXACT
-- column list on the test account, confirmed it was accepted, confirmed the
-- updated_at trigger fires on update, then removed it. movement_assessments is
-- back to 0 rows.
