-- ─────────────────────────────────────────────────────────────────────────────
-- Symmetry Movement Method — camera assessment schema
-- DRAFT migration (2026-07-18). DO NOT APPLY until Dustin reviews.
-- Adds: movement_assessments, movement_assessment_frames (audit),
--       client_assessments severity/confidence/source columns,
--       clients.movement_screen_enabled (trainer tester toggle).
-- All camera/body data is biometric-grade: on-device processing, keypoints +
-- consented keyframes only, RLS locked to trainer + owning client.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trainer-controlled tester toggle (self-serve screen unlock per client) ----
alter table public.clients
  add column if not exists movement_screen_enabled boolean not null default false;

comment on column public.clients.movement_screen_enabled is
  'Trainer flips this on to unlock the self-serve camera Movement Screen tab in that client''s app (beta testing).';

-- 2. Severity / confidence / source on the existing OHSA flags -----------------
alter table public.client_assessments
  add column if not exists source text default 'manual',           -- 'manual' | 'camera'
  add column if not exists compensation_severity jsonb,            -- { knees_cave_in: 'moderate', ... }
  add column if not exists compensation_confidence jsonb,          -- { knees_cave_in: 0.82, ... }
  add column if not exists movement_assessment_id uuid;            -- link to the camera run

-- 3. movement_assessments (one camera run) -------------------------------------
create table if not exists public.movement_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid,                                                  -- trainer or client auth uid
  captured_by text not null default 'client',                      -- 'client' | 'trainer'
  assessment_type text not null default 'OHSA',                    -- OHSA|BOX_SQUAT|SLS|SPLIT_SQUAT|PUSH|PULL|POSTURE
  captured_at timestamptz not null default now(),

  -- capture
  views jsonb not null default '[]',                               -- [{view, wedge, reps, quality}]
  calibration jsonb,                                               -- personal body model
  quality jsonb,                                                   -- capture quality summary

  -- intake + pain
  intake_words text,
  pain_map jsonb not null default '[]',                            -- [{area, level, description, durationWeeks}]
  acute_flag boolean not null default false,
  suspected_root text,
  red_flags jsonb not null default '[]',                           -- [{tier, trigger}]
  red_flags_acknowledged_at timestamptz,

  -- analysis output
  findings jsonb not null default '[]',                            -- Finding[] (§rules)
  chain jsonb not null default '[]',                               -- ChainNode[] (ground-up)
  wedge jsonb,                                                     -- WedgeCompare
  keyframes jsonb not null default '[]',                           -- per-view still summaries
  keyframe_urls jsonb not null default '[]',                       -- consented annotated stills (storage)
  center_of_mass jsonb,                                            -- COM/BOS analysis
  overall_confidence numeric,
  ensemble jsonb,                                                  -- 4-signal agreement record

  -- AI narrative (education chain, 5 layers) + program
  ai_diagnosis jsonb,                                              -- {layers, muscle_findings, ...}
  proposed_program jsonb,                                          -- GeneratedProgram
  routed_program text,

  -- lifecycle + trainer-in-the-loop
  status text not null default 'captured',                         -- captured|analyzed|reviewed|approved|scheduled|archived
  trainer_edits jsonb,                                             -- expert corrections (data flywheel)
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,
  reassess_of uuid references public.movement_assessments(id),     -- baseline link for reassessment
  scheduled_program_id uuid,                                       -- programs.id once scheduled

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_movement_assessments_client on public.movement_assessments(client_id, captured_at desc);
create index if not exists idx_movement_assessments_status on public.movement_assessments(status);

-- 4. per-keyframe keypoints for audit / re-analysis (optional) -----------------
create table if not exists public.movement_assessment_frames (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.movement_assessments(id) on delete cascade,
  view text not null,
  rep_index int,
  t_ms int,
  keypoints jsonb not null,                                        -- normalized landmarks + scores
  features jsonb,                                                  -- extracted FrameFeatures
  created_at timestamptz not null default now()
);
create index if not exists idx_maf_assessment on public.movement_assessment_frames(assessment_id);

-- 5. updated_at trigger --------------------------------------------------------
create or replace function public.touch_movement_assessments()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_movement_assessments on public.movement_assessments;
create trigger trg_touch_movement_assessments before update on public.movement_assessments
  for each row execute function public.touch_movement_assessments();

-- 6. RLS — trainer sees all; a client sees only their own runs -----------------
alter table public.movement_assessments enable row level security;
alter table public.movement_assessment_frames enable row level security;

-- NOTE: adapt these to the app's existing auth model (trainer email match /
-- clients.auth_user_id link). Drafted permissively-explicit for review.
drop policy if exists ma_trainer_all on public.movement_assessments;
create policy ma_trainer_all on public.movement_assessments
  for all using (
    auth.jwt() ->> 'email' = 'symmetrypersonaltraining@gmail.com'
  ) with check (
    auth.jwt() ->> 'email' = 'symmetrypersonaltraining@gmail.com'
  );

drop policy if exists ma_client_own on public.movement_assessments;
create policy ma_client_own on public.movement_assessments
  for select using (
    client_id in (select id from public.clients where auth_user_id = auth.uid())
  );

drop policy if exists ma_client_insert on public.movement_assessments;
create policy ma_client_insert on public.movement_assessments
  for insert with check (
    client_id in (select id from public.clients where auth_user_id = auth.uid()
                  and movement_screen_enabled = true)
  );

drop policy if exists maf_trainer_all on public.movement_assessment_frames;
create policy maf_trainer_all on public.movement_assessment_frames
  for all using (auth.jwt() ->> 'email' = 'symmetrypersonaltraining@gmail.com')
  with check (auth.jwt() ->> 'email' = 'symmetrypersonaltraining@gmail.com');

-- 7. Private storage bucket for consented annotated keyframes -------------------
-- (run once; keep RLS locked — see storage.objects policies in a follow-up)
-- insert into storage.buckets (id, name, public) values ('movement-keyframes','movement-keyframes', false)
--   on conflict (id) do nothing;
