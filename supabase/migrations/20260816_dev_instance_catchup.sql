-- Dev instance catch-up — 16 Aug 2026
--
-- APPLIED TO THE DEV PROJECT ONLY (giiovjfpbuzmrvpdglhv). Every statement is
-- idempotent, so running this against live is a no-op — live already has all
-- of it. That is deliberate: this file is the record of what dev received, and
-- the repo is the only channel dev schema is supposed to arrive through.
--
-- WHY IT WAS NEEDED. Dev was built from a schema dump on 20 July and last
-- touched on 3 August. Live moved a long way after that. Comparing the two
-- catalogs directly — not the migration filenames, which do not correspond,
-- because dev came from a dump — dev was missing 35 tables and 82 columns,
-- including `recipes` and `recipe_ingredients`. Dylan's instance would have
-- errored on most screens, and the meal library he is meant to be testing had
-- nowhere to live.
--
-- THE ONE DELIBERATE DIFFERENCE FROM LIVE. Seven of live's policies name
-- 'symmetrypersonaltraining@gmail.com' literally instead of calling
-- is_trainer(). Copied verbatim they compile perfectly and show Dylan EMPTY
-- TABLES on those screens — no error, nothing to notice, he simply reports
-- working features as broken. On dev they call is_trainer(), which there
-- resolves to Dustin and Dylan. Each rewrite is marked at its line. Dev now has
-- zero hardcoded-email policies; live still has 14, which is its own cleanup.
--
-- Verified after applying, against the database rather than a success response:
-- dev went 53 -> 88 tables, 1,169 columns, 0 columns still missing versus live,
-- 166 policies, RLS enabled on all 88 tables, 108 foreign keys.

-- ── dev_catchup_01_tables_a  (applied to dev as 20260816035132) ───────────────────────

create table if not exists public.ai_action_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  actor text default 'trainer_agent'::text not null,
  action text not null,
  client_id uuid,
  summary text not null,
  undo jsonb,
  undone_at timestamp with time zone,
  undo_error text
);
create table if not exists public.ai_chat_turns (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  role text not null,
  content text not null,
  surface text,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.ai_client_memory (
  client_id uuid not null,
  summary text default ''::text not null,
  facts jsonb default '[]'::jsonb not null,
  folded_through timestamp with time zone,
  turn_count integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.ai_nudge_log (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  segment text not null,
  tone text,
  body text,
  sent boolean default false not null,
  suppressed text,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.app_api_keys (
  name text not null,
  value text not null,
  note text,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.app_flags (
  key text not null,
  enabled boolean default false not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.app_scheduler_key (
  id smallint default 1 not null,
  key text not null,
  created_at timestamp with time zone default now() not null,
  rotated_at timestamp with time zone
);
create table if not exists public.birthday_posts (
  client_id uuid not null,
  year integer not null,
  kind text not null,
  posted_at timestamp with time zone default now() not null
);
create table if not exists public.group_challenges (
  id uuid default gen_random_uuid() not null,
  title text not null,
  metric text default 'sessions'::text not null,
  starts_on date not null,
  ends_on date not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone,
  emoji text,
  tagline text,
  rules text,
  scoring_stat text,
  scoring_note text,
  status text default 'live'::text,
  auto_generated boolean default false,
  winner_client_id uuid,
  winner_score numeric,
  next_pick_client_id uuid,
  announced_at timestamp with time zone,
  scored_at timestamp with time zone,
  counts_external boolean default false not null
);
create table if not exists public.challenge_participants (
  id uuid default gen_random_uuid() not null,
  challenge_id uuid not null,
  client_id uuid not null,
  joined_at timestamp with time zone default now() not null
);
create table if not exists public.challenge_templates (
  ord smallint not null,
  title text not null,
  emoji text not null,
  tagline text not null,
  metric text not null,
  scoring_note text not null
);
create table if not exists public.claude_handoff (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  title text not null,
  status text default 'active'::text,
  body text not null
);
create table if not exists public.client_announcements_seen (
  client_id uuid not null,
  key text not null,
  seen_at timestamp with time zone default now() not null
);
create table if not exists public.client_goals (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  metric text not null,
  target_value numeric not null,
  target_date date not null,
  start_value numeric,
  start_date date,
  set_by text not null,
  status text default 'active'::text not null,
  rolled_from_id uuid,
  rolled_to_id uuid,
  note text,
  accepted_at timestamp with time zone,
  achieved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.client_program_feedback (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  week_start date not null,
  question text not null,
  answer text,
  asked_at timestamp with time zone default now() not null,
  answered_at timestamp with time zone,
  delivered_at timestamp with time zone
);
create table if not exists public.client_training_patterns (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  weekday smallint not null,
  day_id uuid not null,
  supervised boolean default false not null,
  "position" smallint default 1 not null,
  effective_from date not null,
  effective_to date,
  gcal_recurring_id text,
  note text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.exercise_video_candidates (
  id uuid default gen_random_uuid() not null,
  exercise_id uuid not null,
  exercise_name text not null,
  url text not null,
  title text,
  channel text,
  duration_sec integer,
  confidence text,
  note text,
  status text default 'pending'::text not null,
  found_by text,
  created_at timestamp with time zone default now() not null,
  reviewed_at timestamp with time zone,
  previous_video_url text,
  applied_at timestamp with time zone
);
create table if not exists public.food_import_state (
  source text not null,
  cursor integer default 0 not null,
  imported_count integer default 0 not null,
  status text default 'pending'::text not null,
  updated_at timestamp with time zone default now() not null,
  total_available bigint,
  last_error text,
  fail_count integer default 0 not null
);
create table if not exists public.gcal_sync_runs (
  id bigint generated always as identity not null,
  request_id bigint,
  source text default 'pg_cron'::text not null,
  queued_at timestamp with time zone default now() not null,
  status_code integer,
  ok boolean,
  response jsonb,
  error text,
  harvested_at timestamp with time zone
);
create table if not exists public.group_reads (
  user_id uuid not null,
  last_read_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ── dev_catchup_02_tables_b  (applied to dev as 20260816035156) ───────────────────────

create table if not exists public.health_connections (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  provider text not null,
  status text default 'active'::text not null,
  external_id text,
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  scopes text[] default '{}'::text[] not null,
  last_sync_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.health_daily (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  day date not null,
  provider text not null,
  steps integer,
  active_kcal integer,
  resting_kcal integer,
  distance_m numeric,
  exercise_min integer,
  avg_hr integer,
  resting_hr integer,
  hrv_ms numeric,
  sleep_min integer,
  sleep_score integer,
  raw jsonb,
  synced_at timestamp with time zone default now() not null
);
create table if not exists public.health_workouts (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  provider text not null,
  external_id text not null,
  started_at timestamp with time zone not null,
  ended_at timestamp with time zone,
  type text,
  duration_min numeric,
  distance_m numeric,
  calories integer,
  avg_hr integer,
  max_hr integer,
  raw jsonb,
  linked_log_id uuid,
  created_log_id uuid,
  ignored boolean default false not null,
  synced_at timestamp with time zone default now() not null
);
create table if not exists public.integrity_checks (
  id bigint generated by default as identity not null,
  check_name text not null,
  severity text not null,
  count integer not null,
  detail jsonb,
  ran_at timestamp with time zone default now() not null
);
create table if not exists public.message_reactions (
  id uuid default gen_random_uuid() not null,
  message_id uuid not null,
  user_id uuid not null,
  emoji text not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.movement_assessments (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  created_by uuid,
  captured_by text default 'client'::text not null,
  assessment_type text default 'OHSA'::text not null,
  captured_at timestamp with time zone default now() not null,
  views jsonb default '[]'::jsonb not null,
  calibration jsonb,
  quality jsonb,
  intake_words text,
  pain_map jsonb default '[]'::jsonb not null,
  acute_flag boolean default false not null,
  suspected_root text,
  red_flags jsonb default '[]'::jsonb not null,
  red_flags_acknowledged_at timestamp with time zone,
  findings jsonb default '[]'::jsonb not null,
  chain jsonb default '[]'::jsonb not null,
  wedge jsonb,
  keyframes jsonb default '[]'::jsonb not null,
  keyframe_urls jsonb default '[]'::jsonb not null,
  center_of_mass jsonb,
  overall_confidence numeric,
  ensemble jsonb,
  ai_diagnosis jsonb,
  proposed_program jsonb,
  routed_program text,
  status text default 'captured'::text not null,
  trainer_edits jsonb,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  approved_at timestamp with time zone,
  reassess_of uuid,
  scheduled_program_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.movement_assessment_frames (
  id uuid default gen_random_uuid() not null,
  assessment_id uuid not null,
  view text not null,
  rep_index integer,
  t_ms integer,
  keypoints jsonb not null,
  features jsonb,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.notification_preferences (
  user_id uuid not null,
  event_key text not null,
  enabled boolean default true not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.progress_photos (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  photo_url text not null,
  taken_date date not null,
  pose text,
  notes text,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.recipes (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  title text not null,
  description text,
  servings numeric default 1 not null,
  prep_minutes integer,
  cook_minutes integer,
  instructions text[] default '{}'::text[] not null,
  image_url text,
  tags text[] default '{}'::text[] not null,
  visibility text default 'private'::text not null,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  review_note text,
  total_kcal numeric default 0 not null,
  total_protein numeric default 0 not null,
  total_carbs numeric default 0 not null,
  total_fats numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  total_micros jsonb
);
create table if not exists public.recipe_ingredients (
  id uuid default gen_random_uuid() not null,
  recipe_id uuid not null,
  "position" integer default 1 not null,
  food text not null,
  amount numeric,
  unit text,
  protein numeric default 0 not null,
  carbs numeric default 0 not null,
  fats numeric default 0 not null,
  food_id uuid,
  source text default 'manual'::text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  micros jsonb
);
create table if not exists public.schedule_change_proposals (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  scheduled_workout_id uuid,
  day_id uuid,
  appointment_id uuid,
  gcal_recurring_id text,
  from_date date,
  to_date date,
  reason text not null,
  confidence text not null,
  status text default 'pending'::text not null,
  detail jsonb,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone
);
create table if not exists public.schedule_generation_log (
  id uuid default gen_random_uuid() not null,
  generated_batch_id uuid not null,
  client_id uuid not null,
  pattern_id uuid,
  scheduled_date date not null,
  day_id uuid,
  action text not null,
  detail text,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.usda_nutrient_map (
  usda_id integer not null,
  nutrient_key text not null,
  target_unit text not null,
  max_plausible numeric not null,
  usda_number text
);
create table if not exists public.weekly_focus_drafts (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  week_start date not null,
  focus text not null,
  focus_ai text,
  edited_at timestamp with time zone,
  approved_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- ── dev_catchup_03_keys_and_indexes  (applied to dev as 20260816035244) ───────────────

do $$
declare s text;
begin
  foreach s in array array[
    'alter table public.ai_action_log add constraint ai_action_log_pkey PRIMARY KEY (id)',
    'alter table public.ai_chat_turns add constraint ai_chat_turns_pkey PRIMARY KEY (id)',
    'alter table public.ai_chat_turns add constraint ai_chat_turns_role_check CHECK ((role = ANY (ARRAY[''client''::text, ''coach''::text])))',
    'alter table public.ai_client_memory add constraint ai_client_memory_pkey PRIMARY KEY (client_id)',
    'alter table public.ai_nudge_log add constraint ai_nudge_log_pkey PRIMARY KEY (id)',
    'alter table public.app_api_keys add constraint app_api_keys_pkey PRIMARY KEY (name)',
    'alter table public.app_flags add constraint app_flags_pkey PRIMARY KEY (key)',
    'alter table public.app_scheduler_key add constraint app_scheduler_key_id_check CHECK ((id = 1))',
    'alter table public.app_scheduler_key add constraint app_scheduler_key_pkey PRIMARY KEY (id)',
    'alter table public.birthday_posts add constraint birthday_posts_kind_check CHECK ((kind = ANY (ARRAY[''group''::text, ''heads_up''::text])))',
    'alter table public.birthday_posts add constraint birthday_posts_pkey PRIMARY KEY (client_id, year, kind)',
    'alter table public.challenge_participants add constraint challenge_participants_challenge_id_client_id_key UNIQUE (challenge_id, client_id)',
    'alter table public.challenge_participants add constraint challenge_participants_pkey PRIMARY KEY (id)',
    'alter table public.challenge_templates add constraint challenge_templates_pkey PRIMARY KEY (ord)',
    'alter table public.claude_handoff add constraint claude_handoff_pkey PRIMARY KEY (id)',
    'alter table public.client_announcements_seen add constraint client_announcements_seen_pkey PRIMARY KEY (client_id, key)',
    'alter table public.client_goals add constraint client_goals_metric_check CHECK ((metric = ANY (ARRAY[''weight''::text, ''body_fat_pct''::text, ''lean_mass''::text])))',
    'alter table public.client_goals add constraint client_goals_pkey PRIMARY KEY (id)',
    'alter table public.client_goals add constraint client_goals_set_by_check CHECK ((set_by = ANY (ARRAY[''trainer''::text, ''client''::text])))',
    'alter table public.client_goals add constraint client_goals_status_check CHECK ((status = ANY (ARRAY[''proposed''::text, ''active''::text, ''hit''::text, ''rolled''::text, ''declined''::text, ''closed''::text])))',
    'alter table public.client_program_feedback add constraint client_program_feedback_client_id_week_start_key UNIQUE (client_id, week_start)',
    'alter table public.client_program_feedback add constraint client_program_feedback_pkey PRIMARY KEY (id)',
    'alter table public.client_training_patterns add constraint client_training_patterns_pkey PRIMARY KEY (id)',
    'alter table public.client_training_patterns add constraint client_training_patterns_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))',
    'alter table public.exercise_video_candidates add constraint exercise_video_candidates_confidence_check CHECK ((confidence = ANY (ARRAY[''high''::text, ''medium''::text, ''low''::text])))',
    'alter table public.exercise_video_candidates add constraint exercise_video_candidates_pkey PRIMARY KEY (id)',
    'alter table public.exercise_video_candidates add constraint exercise_video_candidates_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text, ''too_long''::text, ''dead''::text, ''superseded''::text])))',
    'alter table public.food_import_state add constraint food_import_state_pkey PRIMARY KEY (source)',
    'alter table public.gcal_sync_runs add constraint gcal_sync_runs_pkey PRIMARY KEY (id)',
    'alter table public.group_challenges add constraint group_challenges_dates_check CHECK ((ends_on >= starts_on))',
    'alter table public.group_challenges add constraint group_challenges_metric_check CHECK ((metric = ANY (ARRAY[''sessions''::text, ''logging''::text])))',
    'alter table public.group_challenges add constraint group_challenges_pkey PRIMARY KEY (id)',
    'alter table public.group_challenges add constraint group_challenges_stat_chk CHECK (((scoring_stat IS NULL) OR (scoring_stat = ANY (ARRAY[''workout_count''::text, ''streak_days''::text, ''pr_count''::text, ''protein_days''::text, ''cardio_minutes''::text, ''mobility_sessions''::text, ''group_shares''::text, ''team_total''::text, ''improvement''::text]))))',
    'alter table public.group_challenges add constraint group_challenges_status_chk CHECK ((status = ANY (ARRAY[''draft''::text, ''live''::text, ''scoring''::text, ''complete''::text])))',
    'alter table public.group_reads add constraint group_reads_pkey PRIMARY KEY (user_id)',
    'alter table public.health_connections add constraint health_connections_client_id_provider_key UNIQUE (client_id, provider)',
    'alter table public.health_connections add constraint health_connections_pkey PRIMARY KEY (id)',
    'alter table public.health_connections add constraint health_connections_status_chk CHECK ((status = ANY (ARRAY[''active''::text, ''revoked''::text, ''error''::text])))',
    'alter table public.health_daily add constraint health_daily_client_id_day_provider_key UNIQUE (client_id, day, provider)',
    'alter table public.health_daily add constraint health_daily_pkey PRIMARY KEY (id)',
    'alter table public.health_workouts add constraint health_workouts_pkey PRIMARY KEY (id)',
    'alter table public.health_workouts add constraint health_workouts_provider_external_id_key UNIQUE (provider, external_id)',
    'alter table public.integrity_checks add constraint integrity_checks_pkey PRIMARY KEY (id)',
    'alter table public.integrity_checks add constraint integrity_checks_severity_check CHECK ((severity = ANY (ARRAY[''critical''::text, ''warn''::text, ''info''::text])))',
    'alter table public.message_reactions add constraint message_reactions_allowed CHECK ((emoji = ANY (ARRAY[''ð''::text, ''ðª''::text, ''ð¥''::text, ''ð''::text, ''â¤ï¸''::text, ''ð''::text])))',
    'alter table public.message_reactions add constraint message_reactions_pkey PRIMARY KEY (id)',
    'alter table public.message_reactions add constraint message_reactions_unique UNIQUE (message_id, user_id, emoji)',
    'alter table public.movement_assessment_frames add constraint movement_assessment_frames_pkey PRIMARY KEY (id)',
    'alter table public.movement_assessments add constraint movement_assessments_pkey PRIMARY KEY (id)',
    'alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id, event_key)',
    'alter table public.progress_photos add constraint progress_photos_pkey PRIMARY KEY (id)',
    'alter table public.recipe_ingredients add constraint recipe_ingredients_pkey PRIMARY KEY (id)',
    'alter table public.recipe_ingredients add constraint recipe_ingredients_source_check CHECK ((source = ANY (ARRAY[''manual''::text, ''database''::text, ''ai''::text])))',
    'alter table public.recipes add constraint recipes_pkey PRIMARY KEY (id)',
    'alter table public.recipes add constraint recipes_servings_check CHECK ((servings > (0)::numeric))',
    'alter table public.recipes add constraint recipes_visibility_check CHECK ((visibility = ANY (ARRAY[''private''::text, ''submitted''::text, ''public''::text, ''rejected''::text])))',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_confidence_check CHECK ((confidence = ANY (ARRAY[''one_off''::text, ''pattern''::text])))',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_pkey PRIMARY KEY (id)',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_reason_check CHECK ((reason = ANY (ARRAY[''moved''::text, ''cancelled''::text, ''uncovered''::text, ''orphaned''::text, ''pattern_shift''::text, ''retired''::text])))',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text, ''superseded''::text])))',
    'alter table public.schedule_generation_log add constraint schedule_generation_log_action_check CHECK ((action = ANY (ARRAY[''inserted''::text, ''skipped_existing''::text, ''skipped_no_assignment''::text])))',
    'alter table public.schedule_generation_log add constraint schedule_generation_log_pkey PRIMARY KEY (id)',
    'alter table public.usda_nutrient_map add constraint usda_nutrient_map_pkey PRIMARY KEY (usda_id)',
    'alter table public.weekly_focus_drafts add constraint weekly_focus_drafts_client_id_week_start_key UNIQUE (client_id, week_start)',
    'alter table public.weekly_focus_drafts add constraint weekly_focus_drafts_pkey PRIMARY KEY (id)'
  ] loop
    begin execute s; exception when duplicate_table or duplicate_object or invalid_table_definition then null; end;
  end loop;
end $$;

create index if not exists ai_action_log_recent_idx on public.ai_action_log using btree (created_at desc);
create index if not exists ai_chat_turns_client_time on public.ai_chat_turns using btree (client_id, created_at desc);
create index if not exists idx_ai_nudge_log_client_created on public.ai_nudge_log using btree (client_id, created_at desc);
create index if not exists idx_challenge_participants_challenge on public.challenge_participants using btree (challenge_id);
create index if not exists idx_client_goals_client on public.client_goals using btree (client_id, status);
create unique index if not exists uq_client_goal_one_active_per_metric on public.client_goals using btree (client_id, metric) where (status = any (array['proposed'::text, 'active'::text]));
create index if not exists cpf_client_idx on public.client_program_feedback using btree (client_id, week_start desc);
create index if not exists cpf_open_idx on public.client_program_feedback using btree (client_id) where (answered_at is null);
create index if not exists ix_ctp_client_active on public.client_training_patterns using btree (client_id) where is_active;
create unique index if not exists uq_ctp_client_weekday_position on public.client_training_patterns using btree (client_id, weekday, "position", effective_from);
create unique index if not exists evc_one_per_url on public.exercise_video_candidates using btree (exercise_id, url);
create index if not exists evc_status on public.exercise_video_candidates using btree (status, exercise_name);
create index if not exists gcal_sync_runs_queued_idx on public.gcal_sync_runs using btree (queued_at desc);
create unique index if not exists gcal_sync_runs_request_idx on public.gcal_sync_runs using btree (request_id) where (request_id is not null);
create index if not exists group_challenges_window_idx on public.group_challenges using btree (starts_on, ends_on);
create index if not exists health_daily_client_day_idx on public.health_daily using btree (client_id, day desc);
create index if not exists health_workouts_client_started_idx on public.health_workouts using btree (client_id, started_at desc);
create index if not exists idx_integrity_checks_recent on public.integrity_checks using btree (check_name, ran_at desc);
create index if not exists message_reactions_message_idx on public.message_reactions using btree (message_id);
create index if not exists idx_maf_assessment on public.movement_assessment_frames using btree (assessment_id);
create index if not exists idx_movement_assessments_client on public.movement_assessments using btree (client_id, captured_at desc);
create index if not exists idx_movement_assessments_status on public.movement_assessments using btree (status);
create index if not exists idx_progress_photos_client_date on public.progress_photos using btree (client_id, taken_date);
create index if not exists recipe_ing_recipe_idx on public.recipe_ingredients using btree (recipe_id, "position");
create index if not exists recipes_client_idx on public.recipes using btree (client_id);
create index if not exists recipes_visibility_idx on public.recipes using btree (visibility);
create unique index if not exists uq_scp_open on public.schedule_change_proposals using btree (client_id, coalesce(from_date, '1900-01-01'::date), coalesce(to_date, '1900-01-01'::date), reason) where (status = 'pending'::text);
create index if not exists ix_sgl_batch on public.schedule_generation_log using btree (generated_batch_id);
create index if not exists ix_sgl_client_date on public.schedule_generation_log using btree (client_id, scheduled_date);
create unique index if not exists ux_usda_nutrient_map_number on public.usda_nutrient_map using btree (usda_number) where (usda_number is not null);
create index if not exists wfd_week_idx on public.weekly_focus_drafts using btree (week_start desc, published_at);

-- ── dev_catchup_04_foreign_keys  (applied to dev as 20260816035309) ───────────────────

do $$
declare s text;
begin
  foreach s in array array[
    'alter table public.ai_action_log add constraint ai_action_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL',
    'alter table public.ai_chat_turns add constraint ai_chat_turns_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.ai_client_memory add constraint ai_client_memory_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.ai_nudge_log add constraint ai_nudge_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.birthday_posts add constraint birthday_posts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.challenge_participants add constraint challenge_participants_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES group_challenges(id) ON DELETE CASCADE',
    'alter table public.challenge_participants add constraint challenge_participants_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.client_announcements_seen add constraint client_announcements_seen_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.client_goals add constraint client_goals_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.client_goals add constraint client_goals_rolled_from_id_fkey FOREIGN KEY (rolled_from_id) REFERENCES client_goals(id) ON DELETE SET NULL',
    'alter table public.client_goals add constraint client_goals_rolled_to_id_fkey FOREIGN KEY (rolled_to_id) REFERENCES client_goals(id) ON DELETE SET NULL',
    'alter table public.client_program_feedback add constraint client_program_feedback_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.client_training_patterns add constraint client_training_patterns_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.client_training_patterns add constraint client_training_patterns_day_id_fkey FOREIGN KEY (day_id) REFERENCES days(id)',
    'alter table public.exercise_video_candidates add constraint exercise_video_candidates_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE',
    'alter table public.group_challenges add constraint group_challenges_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL',
    'alter table public.group_challenges add constraint group_challenges_next_pick_client_id_fkey FOREIGN KEY (next_pick_client_id) REFERENCES clients(id)',
    'alter table public.group_challenges add constraint group_challenges_winner_client_id_fkey FOREIGN KEY (winner_client_id) REFERENCES clients(id)',
    'alter table public.group_reads add constraint group_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
    'alter table public.health_connections add constraint health_connections_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.health_daily add constraint health_daily_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.health_workouts add constraint health_workouts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.health_workouts add constraint health_workouts_created_log_id_fkey FOREIGN KEY (created_log_id) REFERENCES workout_logs(id) ON DELETE SET NULL',
    'alter table public.health_workouts add constraint health_workouts_linked_log_id_fkey FOREIGN KEY (linked_log_id) REFERENCES workout_logs(id) ON DELETE SET NULL',
    'alter table public.message_reactions add constraint message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE',
    'alter table public.message_reactions add constraint message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
    'alter table public.movement_assessment_frames add constraint movement_assessment_frames_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES movement_assessments(id) ON DELETE CASCADE',
    'alter table public.movement_assessments add constraint movement_assessments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.movement_assessments add constraint movement_assessments_reassess_of_fkey FOREIGN KEY (reassess_of) REFERENCES movement_assessments(id)',
    'alter table public.progress_photos add constraint progress_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.recipe_ingredients add constraint recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE',
    'alter table public.recipes add constraint recipes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_day_id_fkey FOREIGN KEY (day_id) REFERENCES days(id)',
    'alter table public.schedule_change_proposals add constraint schedule_change_proposals_scheduled_workout_id_fkey FOREIGN KEY (scheduled_workout_id) REFERENCES scheduled_workouts(id) ON DELETE CASCADE',
    'alter table public.schedule_generation_log add constraint schedule_generation_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
    'alter table public.weekly_focus_drafts add constraint weekly_focus_drafts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE'
  ] loop
    begin execute s; exception when duplicate_object then null; end;
  end loop;
end $$;

-- ── dev_catchup_05_rls_and_policies  (applied to dev as 20260816035353) ───────────────

-- Columns the new policies depend on. The full column sweep is a separate step;
-- these are the ones without which the policies below cannot even be created.
alter table public.clients add column if not exists movement_screen_enabled boolean default false;

alter table public.ai_action_log enable row level security;
alter table public.ai_chat_turns enable row level security;
alter table public.ai_client_memory enable row level security;
alter table public.ai_nudge_log enable row level security;
alter table public.app_api_keys enable row level security;
alter table public.app_flags enable row level security;
alter table public.app_scheduler_key enable row level security;
alter table public.birthday_posts enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_templates enable row level security;
alter table public.claude_handoff enable row level security;
alter table public.client_announcements_seen enable row level security;
alter table public.client_goals enable row level security;
alter table public.client_program_feedback enable row level security;
alter table public.client_training_patterns enable row level security;
alter table public.exercise_video_candidates enable row level security;
alter table public.food_import_state enable row level security;
alter table public.gcal_sync_runs enable row level security;
alter table public.group_challenges enable row level security;
alter table public.group_reads enable row level security;
alter table public.health_connections enable row level security;
alter table public.health_daily enable row level security;
alter table public.health_workouts enable row level security;
alter table public.integrity_checks enable row level security;
alter table public.message_reactions enable row level security;
alter table public.movement_assessment_frames enable row level security;
alter table public.movement_assessments enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.progress_photos enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.schedule_change_proposals enable row level security;
alter table public.schedule_generation_log enable row level security;
alter table public.usda_nutrient_map enable row level security;
alter table public.weekly_focus_drafts enable row level security;

-- ââ The hardcoded-identity rewrite ââââââââââââââââââââââââââââââââââââââââââ
-- Seven of live's policies name 'symmetrypersonaltraining@gmail.com' literally
-- instead of calling is_trainer(). Copied to dev verbatim they would compile
-- fine and lock Dylan out of exactly those screens, with no error to notice â
-- the tables would simply look empty to him. On dev they call is_trainer(),
-- which here resolves to Dustin + Dylan. Marked below so the difference from
-- live is deliberate and visible.
do $$
declare s text;
begin
  foreach s in array array[
    -- REWRITTEN from a hardcoded email:
    'create policy ai_action_log_trainer_read on public.ai_action_log for select to authenticated using (is_trainer())',
    'create policy ai_chat_turns_read on public.ai_chat_turns for select to public using (is_trainer() or client_id in (select clients.id from clients where clients.auth_user_id = auth.uid()))',
    'create policy ai_client_memory_read on public.ai_client_memory for select to public using (is_trainer() or client_id in (select clients.id from clients where clients.auth_user_id = auth.uid()))',
    'create policy trainer_all_ai_nudge_log on public.ai_nudge_log for all to authenticated using (is_trainer()) with check (is_trainer())',
    'create policy read_app_flags on public.app_flags for select to authenticated using (true)',
    'create policy trainer_write_app_flags on public.app_flags for all to authenticated using (is_trainer()) with check (is_trainer())',
    'create policy birthday_posts_trainer_read on public.birthday_posts for select to public using (is_trainer())',
    'create policy cp_join on public.challenge_participants for insert to authenticated with check (client_id = my_client_id() or is_trainer())',
    'create policy cp_leave on public.challenge_participants for delete to authenticated using (client_id = my_client_id() or is_trainer())',
    'create policy cp_read on public.challenge_participants for select to authenticated using (true)',
    'create policy cas_own_read on public.client_announcements_seen for select to authenticated using (client_id = my_client_id())',
    'create policy cas_own_write on public.client_announcements_seen for insert to authenticated with check (client_id = my_client_id())',
    'create policy client_rw_goals on public.client_goals for all to public using (client_id = my_client_id()) with check (client_id = my_client_id())',
    'create policy trainer_all_goals on public.client_goals for all to public using (is_trainer()) with check (is_trainer())',
    'create policy cpf_own_answer on public.client_program_feedback for update to authenticated using (client_id = my_client_id()) with check (client_id = my_client_id())',
    -- REWRITTEN from a hardcoded email:
    'create policy cpf_own_read on public.client_program_feedback for select to authenticated using (client_id = my_client_id() or is_trainer())',
    -- REWRITTEN from a hardcoded email:
    'create policy trainer_reads_patterns on public.client_training_patterns for select to authenticated using (is_trainer())',
    'create policy evc_trainer_all on public.exercise_video_candidates for all to public using (is_trainer()) with check (is_trainer())',
    -- REWRITTEN from a hardcoded email:
    'create policy gcal_sync_runs_trainer_read on public.gcal_sync_runs for select to authenticated using (is_trainer())',
    'create policy group_challenges_delete on public.group_challenges for delete to authenticated using (is_trainer())',
    'create policy group_challenges_insert on public.group_challenges for insert to authenticated with check (is_trainer())',
    'create policy group_challenges_select on public.group_challenges for select to authenticated using (true)',
    'create policy group_challenges_update on public.group_challenges for update to authenticated using (is_trainer()) with check (is_trainer())',
    'create policy group_reads_insert_own on public.group_reads for insert to public with check (auth.uid() = user_id)',
    'create policy group_reads_select_own on public.group_reads for select to public using (auth.uid() = user_id)',
    'create policy group_reads_update_own on public.group_reads for update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)',
    'create policy health_daily_own on public.health_daily for select to public using (client_id in (select clients.id from clients where clients.auth_user_id = auth.uid()))',
    'create policy health_daily_trainer on public.health_daily for select to public using (is_trainer())',
    'create policy health_workouts_own on public.health_workouts for select to public using (client_id in (select clients.id from clients where clients.auth_user_id = auth.uid()))',
    'create policy health_workouts_trainer on public.health_workouts for select to public using (is_trainer())',
    'create policy trainer_all_integrity_checks on public.integrity_checks for all to authenticated using (is_trainer()) with check (is_trainer())',
    'create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid() or is_trainer())',
    'create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_reactions.message_id and m.deleted_at is null and (m.is_group = true or m.from_id = auth.uid() or m.to_id = auth.uid())))',
    'create policy message_reactions_select on public.message_reactions for select to authenticated using (exists (select 1 from messages m where m.id = message_reactions.message_id and (m.is_group = true or m.from_id = auth.uid() or m.to_id = auth.uid())))',
    'create policy maf_client_own on public.movement_assessment_frames for select to public using (assessment_id in (select a.id from movement_assessments a join clients c on c.id = a.client_id where c.auth_user_id = auth.uid()))',
    'create policy maf_trainer_all on public.movement_assessment_frames for all to public using (is_trainer()) with check (is_trainer())',
    'create policy ma_client_insert on public.movement_assessments for insert to public with check (client_id in (select clients.id from clients where clients.auth_user_id = auth.uid() and clients.movement_screen_enabled = true))',
    'create policy ma_client_own on public.movement_assessments for select to public using (client_id in (select clients.id from clients where clients.auth_user_id = auth.uid()))',
    'create policy ma_trainer_all on public.movement_assessments for all to public using (is_trainer()) with check (is_trainer())',
    'create policy notif_prefs_delete_own on public.notification_preferences for delete to public using (auth.uid() = user_id)',
    'create policy notif_prefs_insert_own on public.notification_preferences for insert to public with check (auth.uid() = user_id)',
    'create policy notif_prefs_select_own on public.notification_preferences for select to public using (auth.uid() = user_id)',
    'create policy notif_prefs_update_own on public.notification_preferences for update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)',
    'create policy client_rw_progress_photos on public.progress_photos for all to public using (client_id = my_client_id()) with check (client_id = my_client_id())',
    'create policy trainer_all_progress_photos on public.progress_photos for all to public using (is_trainer()) with check (is_trainer())',
    'create policy recipe_ing_library_read on public.recipe_ingredients for select to public using (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and r.client_id is null))',
    'create policy recipe_ing_read on public.recipe_ingredients for select to public using (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and (r.visibility = ''public'' or r.client_id = my_client_id() or is_trainer())))',
    'create policy recipe_ing_write on public.recipe_ingredients for all to public using (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and (r.client_id = my_client_id() or is_trainer()))) with check (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and (r.client_id = my_client_id() or is_trainer())))',
    'create policy recipes_delete on public.recipes for delete to public using (client_id = my_client_id() or is_trainer())',
    'create policy recipes_insert on public.recipes for insert to public with check (client_id = my_client_id() or is_trainer())',
    'create policy recipes_library_read on public.recipes for select to public using (client_id is null)',
    'create policy recipes_read on public.recipes for select to public using (visibility = ''public'' or client_id = my_client_id() or is_trainer())',
    'create policy recipes_update on public.recipes for update to public using (client_id = my_client_id() or is_trainer()) with check (client_id = my_client_id() or is_trainer())',
    'create policy trainer_all_scp on public.schedule_change_proposals for all to authenticated using (is_trainer()) with check (is_trainer())',
    -- REWRITTEN from a hardcoded email:
    'create policy trainer_reads_generation_log on public.schedule_generation_log for select to authenticated using (is_trainer())',
    -- REWRITTEN from a hardcoded email:
    'create policy wfd_trainer_read on public.weekly_focus_drafts for select to authenticated using (is_trainer())',
    -- REWRITTEN from a hardcoded email:
    'create policy wfd_trainer_write on public.weekly_focus_drafts for update to authenticated using (is_trainer()) with check (is_trainer())'
  ] loop
    begin execute s; exception when duplicate_object then null; end;
  end loop;
end $$;

-- ── dev_catchup_06_functions_and_triggers  (applied to dev as 20260816035434) ─────────

create or replace function public.touch_movement_assessments()
returns trigger language plpgsql as $function$
begin new.updated_at = now(); return new; end $function$;

-- The recipe publish gate. Worth stating plainly because it caused a real
-- incident on live: the service role is NOT a trainer, so a bulk insert of
-- public library recipes is silently downgraded to private by this trigger and
-- the route still returns 200 with correct-looking counts. The fix there was a
-- read policy for library rows (client_id is null), NOT weakening this.
create or replace function public.enforce_recipe_publish()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    if new.visibility = 'public' and not is_trainer() then
      new.visibility := 'private';
    end if;
    return new;
  end if;
  if new.visibility is distinct from old.visibility
     and (new.visibility = 'public' or old.visibility = 'public')
     and not is_trainer() then
    new.visibility := old.visibility;
  end if;
  new.updated_at := now();
  return new;
end $function$;

drop trigger if exists trg_touch_movement_assessments on public.movement_assessments;
create trigger trg_touch_movement_assessments
  before update on public.movement_assessments
  for each row execute function touch_movement_assessments();

drop trigger if exists trg_recipe_publish on public.recipes;
create trigger trg_recipe_publish
  before insert or update on public.recipes
  for each row execute function enforce_recipe_publish();

-- ── dev_catchup_07_missing_columns  (applied to dev as 20260816035639) ────────────────

-- The 82 columns live grew on shared tables since dev was built, found by
-- diffing the two catalogs rather than by reading migration filenames â dev was
-- built from a schema dump, so its migration names do not correspond to the
-- repo's and a name-based diff would have missed most of these.
--
-- Added nullable even where live has NOT NULL. Dev holds seeded rows, so a
-- blind NOT NULL would fail on some of these; a column that exists and accepts
-- null is a working app, a migration that aborts halfway is not. Defaults are
-- copied exactly, which is what the code actually reads.
alter table public.ai_usage_log add column if not exists model text;
alter table public.ai_usage_log add column if not exists status text default 'ok'::text;
alter table public.ai_usage_log add column if not exists error text;
alter table public.ai_usage_log add column if not exists latency_ms integer;
alter table public.ai_usage_log add column if not exists started_at timestamp with time zone;
alter table public.app_feedback add column if not exists client_id uuid;
alter table public.app_feedback add column if not exists image_summary text;
alter table public.client_app_settings add column if not exists workout_ai boolean default true;
alter table public.client_app_settings add column if not exists workout_build_daily_limit integer;
alter table public.client_app_settings add column if not exists seen_ai_workout_notice boolean default false;
alter table public.client_app_settings add column if not exists leaderboard_opt_in boolean default false;
alter table public.client_app_settings add column if not exists nudges_enabled boolean default true;
alter table public.client_app_settings add column if not exists ai_daily_plan_build_limit integer;
alter table public.client_app_settings add column if not exists ai_daily_verify_limit integer;
alter table public.client_app_settings add column if not exists depth_level smallint;
alter table public.client_app_settings add column if not exists checkin_nudges_off boolean default false;
alter table public.client_app_settings add column if not exists checkin_snoozed_until date;
alter table public.client_app_settings add column if not exists ai_tier text default 'standard'::text;
alter table public.client_app_settings add column if not exists ai_daily_chat_limit_advanced integer;
alter table public.client_app_settings add column if not exists ai_pool_only boolean default false;
alter table public.client_assessments add column if not exists trained_days_per_week integer;
alter table public.client_assessments add column if not exists trained_days_of_week text[];
alter table public.client_assessments add column if not exists cardio_days_per_week integer;
alter table public.client_assessments add column if not exists cardio_days_of_week text[];
alter table public.client_assessments add column if not exists solo_days_per_week integer;
alter table public.client_assessments add column if not exists solo_days_of_week text[];
alter table public.client_assessments add column if not exists solo_day_focus text;
alter table public.client_assessments add column if not exists session_length_minutes integer;
alter table public.client_assessments add column if not exists training_location text;
alter table public.client_assessments add column if not exists equipment_access text;
alter table public.client_assessments add column if not exists cardio_modality text;
alter table public.client_assessments add column if not exists cardio_intensity text;
alter table public.client_assessments add column if not exists contraindicated_movements text;
alter table public.client_assessments add column if not exists block_length_weeks integer;
alter table public.client_assessments add column if not exists block_start_date date;
alter table public.client_assessments add column if not exists source text default 'manual'::text;
alter table public.client_assessments add column if not exists compensation_severity jsonb;
alter table public.client_assessments add column if not exists compensation_confidence jsonb;
alter table public.client_assessments add column if not exists movement_assessment_id uuid;
alter table public.clients add column if not exists billing_cadence text default 'monthly'::text;
alter table public.clients add column if not exists training_days text;
alter table public.clients add column if not exists ai_focus text;
alter table public.clients add column if not exists ai_focus_question text;
alter table public.clients add column if not exists ai_focus_date date;
alter table public.clients add column if not exists ai_focus_question_date date;
alter table public.clients add column if not exists week_brief_seen_week text;
alter table public.clients add column if not exists archived_at timestamp with time zone;
alter table public.clients add column if not exists weekly_focus_week text;
alter table public.clients add column if not exists weekly_focus_source text;
alter table public.clients add column if not exists ai_food_focus text;
alter table public.clients add column if not exists ai_food_focus_week text;
alter table public.clients add column if not exists billing_type text;
alter table public.clients add column if not exists exclude_from_rankings boolean default false;
alter table public.days add column if not exists client_owner_id uuid;
alter table public.days add column if not exists created_by text default 'trainer'::text;
alter table public.days add column if not exists origin text;
alter table public.days add column if not exists swapped_from_day_id uuid;
alter table public.exercises add column if not exists client_owner_id uuid;
alter table public.exercises add column if not exists created_by text default 'trainer'::text;
alter table public.exercises add column if not exists video_status text;
alter table public.exercises add column if not exists video_checked_at timestamp with time zone;
alter table public.exercises add column if not exists default_tracked_fields text[];
alter table public.exercises add column if not exists load_is_assistance boolean default false;
alter table public.food_catalog add column if not exists micros jsonb;
alter table public.food_catalog add column if not exists micros_source text;
alter table public.foods add column if not exists kcal numeric;
alter table public.foods add column if not exists micros jsonb;
alter table public.meal_adherence_logs add column if not exists est_fiber numeric;
alter table public.meal_adherence_logs add column if not exists est_sugar numeric;
alter table public.meal_adherence_logs add column if not exists est_sodium numeric;
alter table public.meal_adherence_logs add column if not exists est_sat_fat numeric;
alter table public.meal_adherence_logs add column if not exists est_micros jsonb;
alter table public.meal_items add column if not exists kcal numeric;
alter table public.meal_items add column if not exists micros jsonb;
alter table public.messages add column if not exists sender_kind text;
alter table public.programs add column if not exists personal_for_client_id uuid;
alter table public.scheduled_workouts add column if not exists appointment_id uuid;
alter table public.trainer_notes add column if not exists exercise_id uuid;
alter table public.trainer_notes add column if not exists prescribed_exercise_id uuid;
alter table public.trainer_notes add column if not exists author text default 'trainer'::text;
alter table public.trainers add column if not exists name text;
alter table public.trainers add column if not exists active boolean default true;

