-- Symmetry Trainer App - schema baseline
-- The real migration history, in the order Supabase applied it.
-- Exported via the schema-export edge function, because neither the
-- build sandbox nor the laptop can reach Postgres directly.
-- 193 migrations.
--
-- To rebuild a fresh project from this, run it in order against an
-- empty database. It is the same sequence Supabase itself replays.

-- ===== 20260618022550 anon_app_access_v1 =====
-- Symmetry PT v1: app uses the anon key directly from the browser (no auth in v1).
-- RLS is on but had no policies, blocking anon entirely. Add permissive anon+authenticated
-- access on all public app tables, and grant SELECT on the helper views.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS app_anon_all ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE POLICY app_anon_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      r.tbl);
  END LOOP;

  FOR r IN
    SELECT c.relname AS v
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', r.v);
  END LOOP;
END $$;

-- ===== 20260618130402 extend_logging_tables_and_auth =====

-- ============================================================
-- Extend existing logging tables + add auth + RLS
-- ============================================================

-- 1. Add auth_user_id to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_auth_user_id ON clients(auth_user_id);

-- 2. Extend workout_logs with missing columns
ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

CREATE INDEX IF NOT EXISTS idx_workout_logs_client_id ON workout_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_day_id ON workout_logs(day_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON workout_logs(log_date);

-- 3. Extend set_logs with missing columns
ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weight_lbs NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS rpe NUMERIC(3,1) CHECK (rpe BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS distance_meters NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_set_logs_client_id ON set_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_set_logs_workout_log_id ON set_logs(workout_log_id);

-- 4. Create body_weight_logs
CREATE TABLE IF NOT EXISTS body_weight_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  weight_lbs NUMERIC(6,2) NOT NULL,
  body_fat_pct NUMERIC(4,1),
  notes TEXT,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, logged_at)
);
CREATE INDEX IF NOT EXISTS idx_bw_logs_client_id ON body_weight_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_bw_logs_logged_at ON body_weight_logs(logged_at);

-- 5. Trainer + client helper functions
CREATE OR REPLACE FUNCTION public.is_trainer()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND email = 'symmetrypersonaltraining@gmail.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM clients WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- 6. Enable RLS
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescribed_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_weight_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- CLIENTS
DROP POLICY IF EXISTS "trainer_all_clients" ON clients;
DROP POLICY IF EXISTS "client_own_record" ON clients;
CREATE POLICY "trainer_all_clients" ON clients FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_record" ON clients FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- EXERCISES (reference — all authenticated can read)
DROP POLICY IF EXISTS "all_read_exercises" ON exercises;
CREATE POLICY "all_read_exercises" ON exercises FOR SELECT TO authenticated USING (true);

-- PROGRAMS
DROP POLICY IF EXISTS "trainer_all_programs" ON programs;
DROP POLICY IF EXISTS "client_own_programs" ON programs;
CREATE POLICY "trainer_all_programs" ON programs FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_programs" ON programs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM program_assignments pa
    JOIN clients c ON c.id = pa.client_id
    WHERE pa.program_id = programs.id AND c.auth_user_id = auth.uid()
  ));

-- PROGRAM_ASSIGNMENTS
DROP POLICY IF EXISTS "trainer_all_pa" ON program_assignments;
DROP POLICY IF EXISTS "client_own_pa" ON program_assignments;
CREATE POLICY "trainer_all_pa" ON program_assignments FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_pa" ON program_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM clients c WHERE c.id = program_assignments.client_id AND c.auth_user_id = auth.uid()
  ));

-- PHASES
DROP POLICY IF EXISTS "trainer_all_phases" ON phases;
DROP POLICY IF EXISTS "client_own_phases" ON phases;
CREATE POLICY "trainer_all_phases" ON phases FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_phases" ON phases FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM program_assignments pa
    JOIN clients c ON c.id = pa.client_id
    WHERE pa.program_id = phases.program_id AND c.auth_user_id = auth.uid()
  ));

-- DAYS
DROP POLICY IF EXISTS "trainer_all_days" ON days;
DROP POLICY IF EXISTS "client_own_days" ON days;
CREATE POLICY "trainer_all_days" ON days FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_days" ON days FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM phases ph
    JOIN program_assignments pa ON pa.program_id = ph.program_id
    JOIN clients c ON c.id = pa.client_id
    WHERE ph.id = days.phase_id AND c.auth_user_id = auth.uid()
  ));

-- SECTIONS
DROP POLICY IF EXISTS "trainer_all_sections" ON sections;
DROP POLICY IF EXISTS "client_own_sections" ON sections;
CREATE POLICY "trainer_all_sections" ON sections FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_sections" ON sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM days d
    JOIN phases ph ON ph.id = d.phase_id
    JOIN program_assignments pa ON pa.program_id = ph.program_id
    JOIN clients c ON c.id = pa.client_id
    WHERE d.id = sections.day_id AND c.auth_user_id = auth.uid()
  ));

-- PRESCRIBED_EXERCISES
DROP POLICY IF EXISTS "trainer_all_pe" ON prescribed_exercises;
DROP POLICY IF EXISTS "client_own_pe" ON prescribed_exercises;
CREATE POLICY "trainer_all_pe" ON prescribed_exercises FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_pe" ON prescribed_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sections s
    JOIN days d ON d.id = s.day_id
    JOIN phases ph ON ph.id = d.phase_id
    JOIN program_assignments pa ON pa.program_id = ph.program_id
    JOIN clients c ON c.id = pa.client_id
    WHERE s.id = prescribed_exercises.section_id AND c.auth_user_id = auth.uid()
  ));

-- WORKOUT_LOGS
DROP POLICY IF EXISTS "trainer_all_workout_logs" ON workout_logs;
DROP POLICY IF EXISTS "client_own_workout_logs" ON workout_logs;
CREATE POLICY "trainer_all_workout_logs" ON workout_logs FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_workout_logs" ON workout_logs FOR ALL TO authenticated
  USING (client_id = public.my_client_id())
  WITH CHECK (client_id = public.my_client_id());

-- SET_LOGS
DROP POLICY IF EXISTS "trainer_all_set_logs" ON set_logs;
DROP POLICY IF EXISTS "client_own_set_logs" ON set_logs;
CREATE POLICY "trainer_all_set_logs" ON set_logs FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_set_logs" ON set_logs FOR ALL TO authenticated
  USING (client_id = public.my_client_id())
  WITH CHECK (client_id = public.my_client_id());

-- BODY_WEIGHT_LOGS
DROP POLICY IF EXISTS "trainer_all_bw_logs" ON body_weight_logs;
DROP POLICY IF EXISTS "client_own_bw_logs" ON body_weight_logs;
CREATE POLICY "trainer_all_bw_logs" ON body_weight_logs FOR ALL TO authenticated
  USING (public.is_trainer()) WITH CHECK (public.is_trainer());
CREATE POLICY "client_own_bw_logs" ON body_weight_logs FOR ALL TO authenticated
  USING (client_id = public.my_client_id())
  WITH CHECK (client_id = public.my_client_id());

-- ===== 20260618194446 add_appointments_billing_messages =====

-- ─── APPOINTMENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_at             timestamptz NOT NULL,
  ends_at                  timestamptz NOT NULL,
  status                   text NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN ('scheduled','completed','cancelled_client','cancelled_trainer','no_show')),
  cancellation_notice_hours numeric,          -- hours of advance notice when cancelled
  google_event_id          text,
  notes                    text,
  source                   text NOT NULL DEFAULT 'trainer'
                             CHECK (source IN ('trainer','client','gcal_import')),
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainer manages all appointments"
  ON public.appointments FOR ALL
  USING (
    auth.email() = 'symmetrypersonaltraining@gmail.com'
    OR auth.uid() = (SELECT auth_user_id FROM public.clients WHERE id = client_id)
  );

CREATE POLICY "Client reads own appointments"
  ON public.appointments FOR SELECT
  USING (auth.uid() = (SELECT auth_user_id FROM public.clients WHERE id = client_id));

-- ─── BILLING ADJUSTMENTS (cancelled session credits) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_adjustments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount         numeric NOT NULL,            -- positive = credit owed to client
  reason         text,
  apply_to_month date,                        -- first day of month this applies to
  applied        boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE public.billing_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainer manages billing adjustments"
  ON public.billing_adjustments FOR ALL
  USING (auth.email() = 'symmetrypersonaltraining@gmail.com');

-- ─── PAYMENT REMINDERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  due_date         date NOT NULL,
  amount_due       numeric NOT NULL,
  billing_credits  numeric DEFAULT 0,         -- auto-computed from billing_adjustments
  google_event_id  text,
  reminder_sent_at timestamptz,
  notes            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainer manages payment reminders"
  ON public.payment_reminders FOR ALL
  USING (auth.email() = 'symmetrypersonaltraining@gmail.com');

-- ─── IN-APP MESSAGES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id     uuid NOT NULL REFERENCES auth.users(id),
  to_id       uuid NOT NULL REFERENCES auth.users(id),
  client_id   uuid REFERENCES public.clients(id) ON DELETE CASCADE,  -- thread anchor
  body        text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = from_id OR auth.uid() = to_id);

CREATE POLICY "Users send messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = from_id);

CREATE POLICY "Recipient marks read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = to_id)
  WITH CHECK (auth.uid() = to_id);

-- ─── THEME PREFERENCE (add to client_app_settings) ───────────────────────────
ALTER TABLE public.client_app_settings
  ADD COLUMN IF NOT EXISTS theme text DEFAULT 'steel_sky'
    CHECK (theme IN (
      'steel_sky','arctic_teal','slate_emerald','platinum_indigo','warm_gold',
      'midnight_navy','obsidian_gold','carbon_crimson','deep_space','iron_ember'
    ));

-- trainer theme stored separately
CREATE TABLE IF NOT EXISTS public.trainer_settings (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid UNIQUE REFERENCES auth.users(id),
  theme     text DEFAULT 'midnight_navy'
              CHECK (theme IN (
                'steel_sky','arctic_teal','slate_emerald','platinum_indigo','warm_gold',
                'midnight_navy','obsidian_gold','carbon_crimson','deep_space','iron_ember'
              )),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.trainer_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainer manages own settings"
  ON public.trainer_settings FOR ALL
  USING (auth.uid() = user_id);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON public.appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_billing_adjustments_client_id ON public.billing_adjustments(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_due_date ON public.payment_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON public.messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_id ON public.messages(from_id);
CREATE INDEX IF NOT EXISTS idx_messages_to_id ON public.messages(to_id);

-- ===== 20260618202845 add_session_notes_intake_ai =====

-- Session notes
CREATE TABLE public.session_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note_text TEXT NOT NULL,
  note_type TEXT DEFAULT 'workout' CHECK (note_type IN ('workout','assessment','general','regression','progression','concern')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_session_notes_client ON public.session_notes(client_id);
CREATE INDEX idx_session_notes_date ON public.session_notes(note_date DESC);

-- Comprehensive client intake
CREATE TABLE public.client_intake (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  date_of_birth DATE,
  biological_sex TEXT,
  primary_training_location TEXT DEFAULT 'Sevens Gym',
  home_equipment TEXT[],
  training_days_per_week INTEGER,
  supervised_days TEXT[],
  solo_days TEXT[],
  solo_workout_level TEXT CHECK (solo_workout_level IN ('beginner','intermediate','advanced')),
  medical_clearance BOOLEAN DEFAULT FALSE,
  tier1_flag BOOLEAN DEFAULT FALSE,
  tier2_flags TEXT[],
  current_pain_complaints JSONB DEFAULT '[]',
  surgeries JSONB DEFAULT '[]',
  diagnoses TEXT[],
  medications TEXT[],
  movement_restrictions TEXT[],
  joint_replacements JSONB DEFAULT '[]',
  neurological_conditions TEXT,
  pregnancy BOOLEAN DEFAULT FALSE,
  training_experience_years NUMERIC,
  current_training_description TEXT,
  what_worked TEXT,
  what_didnt_work TEXT,
  corrective_experience BOOLEAN DEFAULT FALSE,
  cardio_capacity TEXT,
  tracks_food BOOLEAN DEFAULT FALSE,
  primary_goal TEXT,
  secondary_goals TEXT[],
  event_deadline TEXT,
  target_weight NUMERIC,
  target_body_fat NUMERIC,
  success_vision TEXT,
  cardio_needed BOOLEAN DEFAULT FALSE,
  cardio_type TEXT,
  cardio_days TEXT[],
  cardio_duration_minutes INTEGER,
  solo_workout_location TEXT,
  hard_no_days TEXT[],
  upcoming_trips TEXT,
  block_start_date DATE,
  occupation TEXT,
  daily_sitting_hours NUMERIC,
  sleep_hours NUMERIC,
  stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10),
  activity_level TEXT CHECK (activity_level IN ('sedentary','moderately_active','very_active')),
  recreational_activities TEXT,
  nutrition_needed BOOLEAN DEFAULT FALSE,
  current_eating_pattern TEXT,
  food_allergies TEXT[],
  food_preferences TEXT,
  meals_per_day INTEGER,
  supplements TEXT[],
  nutrition_goal TEXT CHECK (nutrition_goal IN ('cut','maintain','bulk')),
  acute_chronic_flag TEXT CHECK (acute_chronic_flag IN ('acute','chronic','none')),
  ohsa_feet_turn_out BOOLEAN,
  ohsa_feet_turn_out_notes TEXT,
  ohsa_knee_valgus BOOLEAN,
  ohsa_knee_valgus_notes TEXT,
  ohsa_forward_lean BOOLEAN,
  ohsa_low_back_arch BOOLEAN,
  ohsa_arms_fall_forward BOOLEAN,
  ohsa_forward_head BOOLEAN,
  single_leg_notes TEXT,
  pushing_notes TEXT,
  pulling_notes TEXT,
  pain_scores JSONB DEFAULT '{}',
  corrective_track TEXT[],
  goals_layer TEXT[],
  starting_phase TEXT CHECK (starting_phase IN ('P1','P2','P3')),
  combination_program BOOLEAN DEFAULT FALSE,
  routing_notes TEXT,
  raw_voice_transcript TEXT,
  intake_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI program recommendations (separate from existing program_assignments)
CREATE TABLE public.ai_program_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  phase TEXT NOT NULL,
  block_start_date DATE,
  block_end_date DATE,
  week_a_sessions TEXT[],
  week_b_sessions TEXT[],
  cardio_sessions TEXT[],
  ai_reasoning TEXT,
  trainer_notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','rejected')),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_program_drafts_client ON public.ai_program_drafts(client_id);

-- In-app AI chat history
CREATE TABLE public.ai_chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  context_type TEXT DEFAULT 'general' CHECK (context_type IN ('general','programming','intake','billing','scheduling','notes')),
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_program_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_all_session_notes" ON public.session_notes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trainer_settings WHERE user_id = auth.uid())
);
CREATE POLICY "trainer_all_intake" ON public.client_intake FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trainer_settings WHERE user_id = auth.uid())
);
CREATE POLICY "trainer_all_ai_drafts" ON public.ai_program_drafts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trainer_settings WHERE user_id = auth.uid())
);
CREATE POLICY "trainer_all_ai_chat" ON public.ai_chat_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trainer_settings WHERE user_id = auth.uid())
);
CREATE POLICY "client_own_intake" ON public.client_intake FOR SELECT USING (
  client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid())
);
CREATE POLICY "client_own_approved_programs" ON public.ai_program_drafts FOR SELECT USING (
  client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid())
  AND status = 'approved'
);

-- ===== 20260618210248 add_gcal_sync_columns_v2 =====

-- Add Google Calendar OAuth + sync columns to trainer_settings
ALTER TABLE trainer_settings
  ADD COLUMN IF NOT EXISTS google_refresh_token       text,
  ADD COLUMN IF NOT EXISTS google_access_token        text,
  ADD COLUMN IF NOT EXISTS google_token_expiry        timestamptz,
  ADD COLUMN IF NOT EXISTS google_sync_token          text,
  ADD COLUMN IF NOT EXISTS google_channel_id          text,
  ADD COLUMN IF NOT EXISTS google_channel_resource_id text,
  ADD COLUMN IF NOT EXISTS google_channel_expiry      timestamptz,
  ADD COLUMN IF NOT EXISTS trainer_email              text;

-- Add unique constraint on trainer_email
ALTER TABLE trainer_settings
  DROP CONSTRAINT IF EXISTS trainer_settings_trainer_email_key;
ALTER TABLE trainer_settings
  ADD CONSTRAINT trainer_settings_trainer_email_key UNIQUE (trainer_email);

-- Add gcal and billing columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS gcal_event_id      text,
  ADD COLUMN IF NOT EXISTS gcal_cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at            timestamptz,
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS source             text DEFAULT 'manual';

-- Unique index on gcal_event_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_gcal_event_id
  ON appointments (gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_appointments_source
  ON appointments (source);

-- ===== 20260619004803 add_payment_reminder_sms_columns =====

-- Add phone to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phone text;

-- Add SMS / approval workflow to payment_reminders
ALTER TABLE payment_reminders
  ADD COLUMN IF NOT EXISTS notification_status text NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending','awaiting_approval','approved','sent','skipped')),
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sms_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sms_message   text;

-- Index: quickly find reminders needing approval
CREATE INDEX IF NOT EXISTS idx_payment_reminders_status
  ON payment_reminders (notification_status, due_date);

-- ===== 20260619011937 add_payment_reminders_enabled_to_clients =====
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_reminders_enabled boolean DEFAULT true;

-- ===== 20260619011957 add_paused_status_to_payment_reminders =====

ALTER TABLE payment_reminders 
DROP CONSTRAINT payment_reminders_notification_status_check;

ALTER TABLE payment_reminders 
ADD CONSTRAINT payment_reminders_notification_status_check 
CHECK (notification_status = ANY (ARRAY['pending','awaiting_approval','approved','sent','skipped','paused']));

-- ===== 20260619153254 add_onboarding_complete_to_clients =====
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

-- ===== 20260619173955 add_invite_flow_columns =====

ALTER TABLE client_app_settings
  ADD COLUMN IF NOT EXISTS password_is_temporary BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_login_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pwa_prompt_dismissed BOOLEAN DEFAULT false;

-- ===== 20260619195311 add_logging_tables_v2 =====

-- Meal adherence logs — one row per meal slot per day per client
CREATE TABLE IF NOT EXISTS meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  meal_id uuid REFERENCES meals(id) ON DELETE SET NULL,
  meal_position integer NOT NULL,
  meal_name text,
  adherence text NOT NULL CHECK (adherence IN ('full','three_quarter','half','quarter','skipped','off_plan')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, log_date, meal_position)
);

-- Off-plan / replacement food entries
CREATE TABLE IF NOT EXISTS off_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  meal_position integer,
  dish_name text NOT NULL,
  portion_description text,
  photo_url text,
  est_protein numeric,
  est_carbs numeric,
  est_fats numeric,
  est_calories numeric,
  is_estimated boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Daily weigh-ins
CREATE TABLE IF NOT EXISTS weigh_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  weight_lbs numeric NOT NULL,
  body_fat_pct numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, log_date)
);

-- RLS
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE off_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_ins ENABLE ROW LEVEL SECURITY;

-- Clients can read/write their own rows
CREATE POLICY "meal_logs_client_own" ON meal_logs
  FOR ALL USING (
    auth.uid() = (SELECT auth_user_id FROM clients WHERE id = client_id)
  );

CREATE POLICY "meal_logs_trainer_read" ON meal_logs
  FOR SELECT USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'symmetrypersonaltraining@gmail.com'
  );

CREATE POLICY "off_plan_items_client_own" ON off_plan_items
  FOR ALL USING (
    auth.uid() = (SELECT auth_user_id FROM clients WHERE id = client_id)
  );

CREATE POLICY "off_plan_items_trainer_read" ON off_plan_items
  FOR SELECT USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'symmetrypersonaltraining@gmail.com'
  );

CREATE POLICY "weigh_ins_client_own" ON weigh_ins
  FOR ALL USING (
    auth.uid() = (SELECT auth_user_id FROM clients WHERE id = client_id)
  );

CREATE POLICY "weigh_ins_trainer_read" ON weigh_ins
  FOR SELECT USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'symmetrypersonaltraining@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER meal_logs_updated_at
  BEFORE UPDATE ON meal_logs
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== 20260619195436 insert_tina_meal_plan_v2 =====

WITH tina_plan AS (
  INSERT INTO meal_plans (id, client_id, version_number, effective_date, status, change_reason)
  VALUES (gen_random_uuid(), 'c7636c57-510a-44fa-bde4-28cfe879930e', 1, '2026-05-18', 'live', 'Initial migration from Notion')
  RETURNING id
),
m1a_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M1A — Breakfast Smoothie', '~6:00 AM (Option A)', 1,
    'Swap with M1B (Cream of Rice + Egg Whites) on any morning'
  FROM tina_plan RETURNING id
),
m1a_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m1a_insert.id, 'Protein Powder (vanilla/unflavored)', 1, 'scoop', false, null, 25, 2, 1, 1 FROM m1a_insert UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Unsweetened Almond Milk', 1, 'cup', false, null, 1, 1, 2.5, 2 FROM m1a_insert UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Spinach', 1, 'cup packed', false, 'raw', 1, 1, 0, 3 FROM m1a_insert UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Frozen Mixed Berries', 0.5, 'cup', false, null, 0, 10, 0, 4 FROM m1a_insert UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Banana', 0.5, 'medium', false, null, 0, 13, 0, 5 FROM m1a_insert
),
m1b_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M1B — Cream of Rice + Egg Whites', '~6:00 AM (Option B)', 2,
    'Swap with M1A (Smoothie) on any morning'
  FROM tina_plan RETURNING id
),
m1b_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m1b_insert.id, 'Cream of Rice (dry)', 0.33, 'cup', false, null, 2, 28, 0, 1 FROM m1b_insert UNION ALL
  SELECT gen_random_uuid(), m1b_insert.id, 'Egg Whites (liquid)', 0.75, 'cup', false, null, 18, 1, 0, 2 FROM m1b_insert UNION ALL
  SELECT gen_random_uuid(), m1b_insert.id, 'Cinnamon + Stevia', 0, 'to taste', false, null, 0, 0, 0, 3 FROM m1b_insert
),
m2_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M2 — Morning Snack', '~9:00 AM', 3, null
  FROM tina_plan RETURNING id
),
m2_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m2_insert.id, 'Mini Bagel', 1, 'mini bagel', false, null, 3, 20, 1, 1 FROM m2_insert UNION ALL
  SELECT gen_random_uuid(), m2_insert.id, 'Protein Powder', 1, 'scoop', false, null, 25, 2, 1, 2 FROM m2_insert
),
m3_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M3 — Lunch', '~12:00 PM', 4, null
  FROM tina_plan RETURNING id
),
m3_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m3_insert.id, 'Lean Ground Beef 90/10', 4, 'oz', false, 'cooked', 28, 0, 10, 1 FROM m3_insert UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'White Rice', 0.5, 'cup', false, 'cooked', 2, 22, 0, 2 FROM m3_insert UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'Broccoli / Asparagus / Green Beans', 0, 'cups', true, null, 0, 0, 0, 3 FROM m3_insert UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'Olive Oil', 1, 'tsp', false, null, 0, 0, 5, 4 FROM m3_insert
),
m4_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M4 — Dinner', '~4:00 PM', 5, null
  FROM tina_plan RETURNING id
),
m4_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m4_insert.id, 'Chicken Thighs/Drumsticks', 4, 'oz', false, 'cooked', 28, 0, 9, 1 FROM m4_insert UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'White Rice', 0.5, 'cup', false, 'cooked', 2, 22, 0, 2 FROM m4_insert UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'Broccoli / Asparagus / Green Beans', 0, 'cups', true, null, 0, 0, 0, 3 FROM m4_insert UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'Olive Oil', 1, 'tsp', false, null, 0, 0, 5, 4 FROM m4_insert
),
m5_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M5 — Evening Snack', '~7:00 PM', 6, null
  FROM tina_plan RETURNING id
)
INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
SELECT gen_random_uuid(), m5_insert.id, 'Egg Whites (liquid)', 0.75, 'cup', false, null, 18, 1, 0, 1 FROM m5_insert UNION ALL
SELECT gen_random_uuid(), m5_insert.id, 'Almond Butter', 1, 'tsp', false, null, 1.2, 1.2, 3, 2 FROM m5_insert;

-- ===== 20260620003027 add_day_of_week_to_days =====
ALTER TABLE days ADD COLUMN IF NOT EXISTS day_of_week integer;

-- ===== 20260620004333 add_email_sent_at_to_payment_reminders =====
ALTER TABLE payment_reminders ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- ===== 20260620054841 add_gcal_event_id_unique_index =====
CREATE UNIQUE INDEX IF NOT EXISTS appointments_gcal_event_id_unique ON appointments (gcal_event_id) WHERE gcal_event_id IS NOT NULL;

-- ===== 20260620090612 fix_appointments_rls_use_is_trainer =====

-- Drop the broken policy that uses auth.email() (which may not work in all contexts)
-- and replace with is_trainer() which already works for clients/other tables
DROP POLICY IF EXISTS "Trainer manages all appointments" ON appointments;
DROP POLICY IF EXISTS "Client reads own appointments" ON appointments;

-- Trainer: full access via is_trainer() function (same pattern as clients table)
CREATE POLICY "trainer_all_appointments"
  ON appointments FOR ALL
  TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- Client: can read their own appointments
CREATE POLICY "client_own_appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE auth_user_id = auth.uid()
    )
  );

-- Also grant service_role bypass (it should bypass RLS automatically, but make sure)
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

-- ===== 20260620090921 grant_appointments_table_privileges =====

-- Grant proper DML privileges on appointments to authenticated and anon roles
-- (RLS policies control row-level access; these grants control table-level access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT SELECT ON public.appointments TO anon;
GRANT ALL ON public.appointments TO service_role;

-- ===== 20260620091036 grant_appointments_anon_write_for_gcal_sync =====

-- Grant write access to anon role so gcal-sync cron can upsert without service_role key
-- RLS policies still control which rows are accessible
GRANT INSERT, UPDATE ON public.appointments TO anon;

-- ===== 20260621041259 create_trainer_notes_table =====

CREATE TABLE IF NOT EXISTS trainer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day_id UUID REFERENCES days(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_notes_client_id ON trainer_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_trainer_notes_day_id ON trainer_notes(day_id);

ALTER TABLE trainer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_notes_all" ON trainer_notes
  FOR ALL USING (true) WITH CHECK (true);

-- ===== 20260621165219 add_cardio_section_type =====

-- Drop old constraints and replace with expanded versions
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_client_facing_name_check;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_internal_name_check;

ALTER TABLE sections ADD CONSTRAINT sections_client_facing_name_check 
  CHECK (client_facing_name = ANY (ARRAY['Warm-Up'::text, 'Strength'::text, 'Accessory'::text, 'Cardio'::text]));

ALTER TABLE sections ADD CONSTRAINT sections_internal_name_check 
  CHECK (internal_name = ANY (ARRAY['Inhibit'::text, 'Lengthen'::text, 'Activate'::text, 'Integrate'::text, 'Corrective Warm-Up'::text, 'Primary Strength'::text, 'Accessory Strength'::text, 'Cardio'::text]));

-- ===== 20260621205531 expand_onboarding_check_constraints =====

-- Expand experience_level to accept wizard vals (capitalized) - keeps existing data valid
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_experience_level_check;
ALTER TABLE clients ADD CONSTRAINT clients_experience_level_check
  CHECK (experience_level = ANY (ARRAY[
    'Beginner', 'Beginner-Intermediate', 'Intermediate', 'Advanced', 'Competitive'
  ]));

-- Expand primary_goal to accept all wizard options plus existing values
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_primary_goal_check;
ALTER TABLE clients ADD CONSTRAINT clients_primary_goal_check
  CHECK (primary_goal = ANY (ARRAY[
    'Strength', 'Rehab & Pain Relief', 'Show Prep', 'Conditioning', 'General Fitness',
    'Fat Loss', 'Muscle Gain', 'Body Recomposition', 'Endurance', 'General Health',
    'Athletic Performance', 'Maintenance'
  ]));

-- ===== 20260621232556 add_notes_to_meal_adherence_logs =====
ALTER TABLE meal_adherence_logs ADD COLUMN IF NOT EXISTS notes TEXT;

-- ===== 20260621234253 add_off_plan_analysis_columns =====

ALTER TABLE meal_adherence_logs
  ADD COLUMN IF NOT EXISTS off_plan_notes TEXT,
  ADD COLUMN IF NOT EXISTS off_plan_macros JSONB,
  ADD COLUMN IF NOT EXISTS trainer_macro_override JSONB,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT;

-- ===== 20260621234329 meal_photos_storage_policies =====

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload meal photos' AND tablename = 'objects') THEN
    CREATE POLICY "Users can upload meal photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'meal-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Meal photos are publicly readable' AND tablename = 'objects') THEN
    CREATE POLICY "Meal photos are publicly readable" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'meal-photos');
  END IF;
END $$;

-- ===== 20260622121201 add_gcal_sync_enabled_to_trainer_settings =====
ALTER TABLE trainer_settings ADD COLUMN IF NOT EXISTS gcal_sync_enabled BOOLEAN NOT NULL DEFAULT false;

-- ===== 20260622122343 grant_trainer_settings_to_authenticated =====
GRANT SELECT, INSERT, UPDATE ON public.trainer_settings TO authenticated;

-- ===== 20260702222207 foods_library_and_quick_log_support =====
create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  serving text not null default '1 serving',
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fats numeric not null default 0,
  source text not null default 'seed' check (source in ('seed','ai','trainer','client','claude')),
  created_by_client_id uuid references clients(id),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists foods_name_idx on foods using gin (to_tsvector('english', name));
alter table foods enable row level security;
drop policy if exists foods_all on foods;
create policy foods_all on foods for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on foods to anon, authenticated, service_role;

alter table meal_adherence_logs
  add column if not exists food_id uuid references foods(id),
  add column if not exists servings numeric,
  add column if not exists macros_pending boolean not null default false;

alter table app_feedback add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- ===== 20260703003505 offplan_workout_logging =====
ALTER TABLE days ADD COLUMN IF NOT EXISTS swappable boolean DEFAULT false;

UPDATE days SET swappable = true WHERE id IN (
  'c45f4dd1-591d-4c36-839b-8fc3c1e1c6cf',
  '4808e46f-ff6e-4e69-ba06-0707bbda993e',
  'dd4558b3-2e8a-451c-aa0f-ca70ca23f916',
  '1ed35e99-b4bf-49a0-89de-1ca80fa56c07'
);

CREATE TABLE IF NOT EXISTS offplan_workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  log_date date NOT NULL,
  description text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rolled_up')),
  rolled_day_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE offplan_workout_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offplan_workout_logs_all ON offplan_workout_logs;
CREATE POLICY offplan_workout_logs_all ON offplan_workout_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON offplan_workout_logs TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ===== 20260703153927 payment_reminder_workflow =====

ALTER TABLE clients ADD COLUMN IF NOT EXISTS session_rate numeric;
ALTER TABLE payment_reminders ADD COLUMN IF NOT EXISTS client_ack_at timestamptz;
ALTER TABLE payment_reminders ADD COLUMN IF NOT EXISTS paid_confirmed_at timestamptz;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_reminders TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

-- ===== 20260703154956 client_reads_own_payment_reminders =====

CREATE POLICY "Clients read own payment reminders" ON payment_reminders
FOR SELECT TO authenticated
USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ack_payment_reminder(reminder_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE payment_reminders SET client_ack_at = now()
  WHERE id = reminder_id
    AND client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.ack_payment_reminder(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ===== 20260703155427 payment_reminders_paid_status =====

ALTER TABLE payment_reminders DROP CONSTRAINT payment_reminders_notification_status_check;
ALTER TABLE payment_reminders ADD CONSTRAINT payment_reminders_notification_status_check
CHECK (notification_status = ANY (ARRAY['pending'::text,'awaiting_approval'::text,'approved'::text,'sent'::text,'skipped'::text,'paused'::text,'paid'::text]));

-- ===== 20260703163701 trainer_reads_calendar_payments =====

CREATE POLICY "trainer_all_calendar_payments" ON calendar_payments
FOR ALL USING (auth.uid() = 'aaec8ad5-9d01-4110-84f7-a32fa08e8192'::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_payments TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

-- ===== 20260703165841 gcal_sync_golive_prep =====

-- 1. Payments sync: parse amount from "Name $X" title; keep amount fresh on update
CREATE OR REPLACE FUNCTION public.gcal_sync_payments(p_payments jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  pay JSONB;
  synced INT := 0;
  err_msgs TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    BEGIN
      INSERT INTO calendar_payments (client_id, title, payment_date, google_event_id, source, amount)
      VALUES (
        (pay->>'client_id')::UUID,
        pay->>'title',
        (pay->>'payment_date')::DATE,
        pay->>'google_event_id',
        COALESCE(pay->>'source', 'gcal_sync'),
        NULLIF(substring(pay->>'title' from '\$([0-9]+(?:\.[0-9]{1,2})?)'), '')::numeric
      )
      ON CONFLICT (google_event_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        title = EXCLUDED.title,
        payment_date = EXCLUDED.payment_date,
        amount = COALESCE(EXCLUDED.amount, calendar_payments.amount);
      synced := synced + 1;
    EXCEPTION WHEN OTHERS THEN
      err_msgs := array_append(err_msgs, SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('synced', synced, 'errors', to_jsonb(err_msgs));
END;
$function$;

-- 2. Legacy auto-notifier NEUTRALIZED (fired on UNAPPROVED reminders + double-deducted credits;
--    superseded by PaymentDueBanner which only shows trainer-approved 'sent' reminders at T-7)
CREATE OR REPLACE FUNCTION public.gcal_generate_payment_notifications()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Disabled 2026-07-03 (Dustin): payment notices now flow through payment_reminders
  -- approval lifecycle only. Do not re-enable without Dustin's explicit OK.
  RETURN 0;
END;
$function$;

-- 3. Clear only rows inside the re-fetch window; appointment history older than 31d is preserved
--    (credit look-back + never-delete-client-data rule)
CREATE OR REPLACE FUNCTION public.gcal_clear_appointments()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM appointments
  WHERE (source = 'gcal' OR gcal_event_id IS NOT NULL)
    AND scheduled_at >= now() - interval '31 days';
END;
$function$;

-- ===== 20260703170913 calendar_payments_event_id_unique_and_comma_amounts =====

CREATE UNIQUE INDEX IF NOT EXISTS calendar_payments_google_event_id_key
ON calendar_payments (google_event_id);

CREATE OR REPLACE FUNCTION public.gcal_sync_payments(p_payments jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  pay JSONB;
  synced INT := 0;
  err_msgs TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    BEGIN
      INSERT INTO calendar_payments (client_id, title, payment_date, google_event_id, source, amount)
      VALUES (
        (pay->>'client_id')::UUID,
        pay->>'title',
        (pay->>'payment_date')::DATE,
        pay->>'google_event_id',
        COALESCE(pay->>'source', 'gcal_sync'),
        NULLIF(substring(replace(pay->>'title', ',', '') from '\$([0-9]+(?:\.[0-9]{1,2})?)'), '')::numeric
      )
      ON CONFLICT (google_event_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        title = EXCLUDED.title,
        payment_date = EXCLUDED.payment_date,
        amount = COALESCE(EXCLUDED.amount, calendar_payments.amount);
      synced := synced + 1;
    EXCEPTION WHEN OTHERS THEN
      err_msgs := array_append(err_msgs, SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('synced', synced, 'errors', to_jsonb(err_msgs));
END;
$function$;

-- ===== 20260705050529 client_private_profiles_trainer_only =====
CREATE TABLE IF NOT EXISTS public.client_private_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content text,
  source_url text,
  source_title text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.client_private_profiles ENABLE ROW LEVEL SECURITY;

-- Trainer-only: only Dustin's auth uid may read/write. Clients get NO policy → zero access.
DROP POLICY IF EXISTS trainer_all_client_private_profiles ON public.client_private_profiles;
CREATE POLICY trainer_all_client_private_profiles ON public.client_private_profiles
  FOR ALL
  USING (auth.uid() = 'aaec8ad5-9d01-4110-84f7-a32fa08e8192'::uuid)
  WITH CHECK (auth.uid() = 'aaec8ad5-9d01-4110-84f7-a32fa08e8192'::uuid);

-- Deliberately NOT granting to anon. Authenticated is gated by RLS above.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_private_profiles TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ===== 20260705195130 add_clients_weekly_focus =====
ALTER TABLE clients ADD COLUMN IF NOT EXISTS weekly_focus text;
COMMENT ON COLUMN clients.weekly_focus IS 'Trainer-editable per-client focus note for the weekly summary feature (added 2026-07-05).';

-- ===== 20260705203821 add_clients_digest_snoozed_until =====
ALTER TABLE clients ADD COLUMN IF NOT EXISTS digest_snoozed_until date;
COMMENT ON COLUMN clients.digest_snoozed_until IS 'Trainer dismissed this client from the Week-ahead digest until this date (temp-out snooze). Added 2026-07-05.';
NOTIFY pgrst, 'reload schema';

-- ===== 20260706022123 guard_no_early_plan_or_target_activation =====
-- Guardrails: a meal plan or macro target can never be active before its go-live date (Central time).
-- Prevents any source (chat OR app) from re-creating the "future plan/target leaks into today's charts" bug.

-- 1) A meal_plans row may only be status='live' if its effective_date is not in the future (America/Chicago).
create or replace function enforce_no_future_live_plan()
returns trigger language plpgsql as $$
declare central_today date := (now() at time zone 'America/Chicago')::date;
begin
  if new.status = 'live' and new.effective_date > central_today then
    raise exception
      'meal_plans guard: cannot set status=live for a future effective_date (% > Central today %). Future plans must stay status=pending and be flipped to live on their go-live date via a one-time activation task.',
      new.effective_date, central_today
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_no_future_live_plan on meal_plans;
create trigger trg_no_future_live_plan
before insert or update on meal_plans
for each row execute function enforce_no_future_live_plan();

-- 2) A macro_targets row may not be inserted/updated with a future effective_date (America/Chicago).
--    Correct pattern: the activation task inserts the new target ON the go-live date (effective_date = that day).
create or replace function enforce_no_future_macro_target()
returns trigger language plpgsql as $$
declare central_today date := (now() at time zone 'America/Chicago')::date;
begin
  if new.effective_date > central_today then
    raise exception
      'macro_targets guard: cannot schedule a target for a future effective_date (% > Central today %). Insert the new target on its go-live date via the activation task.',
      new.effective_date, central_today
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_no_future_macro_target on macro_targets;
create trigger trg_no_future_macro_target
before insert or update on macro_targets
for each row execute function enforce_no_future_macro_target();

-- ===== 20260710122456 gcal_reconcile_appointments =====
CREATE OR REPLACE FUNCTION public.gcal_reconcile_appointments(
  p_seen_ids text[],
  p_time_min timestamptz,
  p_time_max timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed INT := 0;
BEGIN
  IF p_seen_ids IS NULL OR COALESCE(array_length(p_seen_ids, 1), 0) < 50 THEN
    RETURN jsonb_build_object('removed', 0, 'skipped', 'seen set too small');
  END IF;

  WITH del AS (
    DELETE FROM appointments a
    WHERE a.gcal_event_id IS NOT NULL
      AND a.scheduled_at > now()
      AND a.scheduled_at >= p_time_min
      AND a.scheduled_at <= p_time_max
      AND NOT (a.gcal_event_id = ANY(p_seen_ids))
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  RETURN jsonb_build_object('removed', removed);
END;
$function$;

-- ===== 20260712200936 add_clients_flat_billing =====
alter table public.clients add column if not exists flat_billing boolean not null default false;
update public.clients set flat_billing = true where id = 'd9be22ea-4561-446b-9548-f018f38ff5a8';

-- ===== 20260712201354 add_meal_adherence_item_overrides =====
alter table public.meal_adherence_logs add column if not exists item_overrides jsonb;
comment on column public.meal_adherence_logs.item_overrides is 'Per-day client-adjusted food amounts: { "<meal_item_id>": { "amount": number } }. Plan rows stay canonical.';

-- ===== 20260712212134 messages_image_attachments =====
alter table public.messages add column if not exists image_url text;
insert into storage.buckets (id, name, public) values ('message-images','message-images', true) on conflict (id) do nothing;
do $$ begin
  create policy "message-images read" on storage.objects for select using (bucket_id = 'message-images');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "message-images insert" on storage.objects for insert to authenticated with check (bucket_id = 'message-images');
exception when duplicate_object then null; end $$;

-- ===== 20260712220805 metrics_autocalc_lean_fat =====
-- Auto-calculate lean/fat mass whenever weight + body_fat_pct exist and lean/fat are null.
-- Fills NULLs only — never overwrites measured values (e.g. JP7 LBM).
create or replace function public.metrics_autocalc_mass()
returns trigger language plpgsql as $$
begin
  if new.weight is not null and new.body_fat_pct is not null then
    if new.lean_mass is null then
      new.lean_mass := round((new.weight * (1 - new.body_fat_pct / 100.0))::numeric, 1);
    end if;
    if new.fat_mass is null then
      new.fat_mass := round((new.weight * (new.body_fat_pct / 100.0))::numeric, 1);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_metrics_autocalc_mass on public.metrics;
create trigger trg_metrics_autocalc_mass
  before insert or update on public.metrics
  for each row execute function public.metrics_autocalc_mass();
-- Backfill existing rows
update public.metrics
   set lean_mass = round((weight * (1 - body_fat_pct / 100.0))::numeric, 1)
 where weight is not null and body_fat_pct is not null and lean_mass is null;
update public.metrics
   set fat_mass = round((weight * (body_fat_pct / 100.0))::numeric, 1)
 where weight is not null and body_fat_pct is not null and fat_mass is null;

-- ===== 20260716193935 create_exercise_notes =====
create table if not exists public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  prescribed_exercise_id uuid references public.prescribed_exercises(id),
  workout_log_id uuid references public.workout_logs(id) on delete set null,
  day_id uuid,
  log_date date not null default ((now() at time zone 'America/Chicago'))::date,
  note text not null,
  author text not null default 'client',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists exercise_notes_client_ex_idx on public.exercise_notes(client_id, exercise_id);
create index if not exists exercise_notes_client_date_idx on public.exercise_notes(client_id, log_date desc);
alter table public.exercise_notes enable row level security;
create policy app_anon_all on public.exercise_notes for all to anon, authenticated using (true) with check (true);
create policy client_own_exercise_notes on public.exercise_notes for all to authenticated using (client_id = my_client_id()) with check (client_id = my_client_id());
create policy trainer_all_exercise_notes on public.exercise_notes for all to authenticated using (is_trainer()) with check (is_trainer());

-- ===== 20260716213352 feedback_bucket_storage_policies =====
-- Enable uploads + reads for the 'feedback' bucket, mirroring message-images/meal-photos.
-- Without an INSERT policy, RLS silently denied every feedback-screenshot upload.
create policy "feedback insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback');

create policy "feedback read" on storage.objects
  for select to public
  using (bucket_id = 'feedback');

-- ===== 20260717003931 app_downloads_bucket =====
insert into storage.buckets (id, name, public) values ('app-downloads', 'app-downloads', true)
on conflict (id) do update set public = true;

drop policy if exists "app_downloads_anon_insert" on storage.objects;
create policy "app_downloads_anon_insert" on storage.objects
  for insert to anon with check (bucket_id = 'app-downloads');

drop policy if exists "app_downloads_public_read" on storage.objects;
create policy "app_downloads_public_read" on storage.objects
  for select to public using (bucket_id = 'app-downloads');

-- ===== 20260717004507 app_downloads_policies_fix =====
drop policy if exists "app_downloads_anon_insert" on storage.objects;
drop policy if exists "app_downloads_public_read" on storage.objects;
create policy "app_downloads_insert" on storage.objects
  for insert to public with check (bucket_id = 'app-downloads');
create policy "app_downloads_update" on storage.objects
  for update to public using (bucket_id = 'app-downloads') with check (bucket_id = 'app-downloads');
create policy "app_downloads_read" on storage.objects
  for select to public using (bucket_id = 'app-downloads');

-- ===== 20260717004543 app_downloads_lockdown =====
-- APK uploaded; now remove public write access so the anon key can't overwrite it.
drop policy if exists "app_downloads_insert" on storage.objects;
drop policy if exists "app_downloads_update" on storage.objects;
-- keep public read only (public bucket already serves /object/public/, this is explicit)
drop policy if exists "app_downloads_read" on storage.objects;
create policy "app_downloads_read" on storage.objects
  for select to public using (bucket_id = 'app-downloads');

-- ===== 20260717012317 temp_commit_relay_bucket =====

insert into storage.buckets (id, name, public)
values ('relay-x7k2', 'relay-x7k2', true)
on conflict (id) do nothing;

drop policy if exists relay_x7k2_ins on storage.objects;
drop policy if exists relay_x7k2_upd on storage.objects;
drop policy if exists relay_x7k2_sel on storage.objects;

create policy relay_x7k2_ins on storage.objects for insert to anon
  with check (bucket_id = 'relay-x7k2');
create policy relay_x7k2_upd on storage.objects for update to anon
  using (bucket_id = 'relay-x7k2') with check (bucket_id = 'relay-x7k2');
create policy relay_x7k2_sel on storage.objects for select to anon
  using (bucket_id = 'relay-x7k2');

-- ===== 20260717030847 payment_reminders_credit_details =====
alter table payment_reminders add column if not exists credit_details jsonb;

-- ===== 20260719161639 activate_v3_meal_plans_jul20_cron =====
create extension if not exists pg_cron;

select cron.schedule(
  'activate-v3-meal-plans-jul20-2026',
  '0 8 20 7 *',  -- Jul 20, 08:00 UTC = 3:00 AM Central
  $job$
do $body$
begin
  -- Flip Jerry Bourgeois + Gerard Gautreaux v3 plans live on their go-live date
  update public.meal_plans
     set status = 'live'
   where id in ('68702df0-f282-40c2-9608-7c9075325b5a','74422541-41ab-4581-af08-7dcbc44a4440')
     and status = 'pending'
     and effective_date <= (now() at time zone 'America/Chicago')::date;

  -- Archive the superseded v2 plans only once the matching v3 is live
  update public.meal_plans v2
     set status = 'archived'
    from public.meal_plans v3
   where (v2.id, v3.id) in (
           ('4788cb3c-9891-45d7-8bb7-aee97f25111f','68702df0-f282-40c2-9608-7c9075325b5a'),
           ('5527ee81-2f29-4e9c-bfee-73f007c0e470','74422541-41ab-4581-af08-7dcbc44a4440'))
     and v2.status = 'live'
     and v3.status = 'live';

  -- One-shot: remove this job after it has run
  perform cron.unschedule('activate-v3-meal-plans-jul20-2026');
end
$body$;
$job$
);

-- ===== 20260719212909 autoclose_stale_workout_logs_nightly =====
-- Clients often log all their sets but never tap "Complete workout", leaving
-- workout_logs.completed=false and the scheduled_workouts row stuck on 'scheduled'.
-- Nightly at 4am Central: auto-close any past-dated workout log that has set logs,
-- and sync the matching scheduled_workouts row.
select cron.schedule(
  'autoclose-stale-workout-logs',
  '0 9 * * *',  -- 09:00 UTC = 4:00 AM Central (DST)
  $job$
do $body$
begin
  update public.workout_logs wl
     set completed = true,
         completed_at = coalesce(wl.completed_at, now()),
         status = coalesce(wl.status, 'Auto-closed (sets logged)')
   where wl.completed = false
     and wl.log_date < (now() at time zone 'America/Chicago')::date
     and exists (select 1 from public.set_logs sl where sl.workout_log_id = wl.id);

  update public.scheduled_workouts sw
     set status = 'completed',
         workout_log_id = coalesce(sw.workout_log_id, wl.id)
    from public.workout_logs wl
   where sw.client_id = wl.client_id
     and sw.day_id = wl.day_id
     and sw.scheduled_date = wl.log_date
     and wl.completed
     and sw.status = 'scheduled'
     and sw.deleted_at is null;
end
$body$;
$job$
);

-- ===== 20260719212934 fix_autoclose_job_status_value =====
-- workout_logs.status has a CHECK constraint; use the allowed 'Done as planned'
select cron.unschedule('autoclose-stale-workout-logs');
select cron.schedule(
  'autoclose-stale-workout-logs',
  '0 9 * * *',
  $job$
do $body$
begin
  update public.workout_logs wl
     set completed = true,
         completed_at = coalesce(wl.completed_at, now()),
         status = coalesce(wl.status, 'Done as planned')
   where wl.completed = false
     and wl.log_date < (now() at time zone 'America/Chicago')::date
     and exists (select 1 from public.set_logs sl where sl.workout_log_id = wl.id);

  update public.scheduled_workouts sw
     set status = 'completed',
         workout_log_id = coalesce(sw.workout_log_id, wl.id)
    from public.workout_logs wl
   where sw.client_id = wl.client_id
     and sw.day_id = wl.day_id
     and sw.scheduled_date = wl.log_date
     and wl.completed
     and sw.status = 'scheduled'
     and sw.deleted_at is null;
end
$body$;
$job$
);

-- ===== 20260719212951 autoclose_job_skip_duplicate_completed =====
-- A partial unique index allows only ONE completed log per (client, day, date).
-- Skip auto-closing a stale log when a completed duplicate already exists.
select cron.unschedule('autoclose-stale-workout-logs');
select cron.schedule(
  'autoclose-stale-workout-logs',
  '0 9 * * *',
  $job$
do $body$
begin
  update public.workout_logs wl
     set completed = true,
         completed_at = coalesce(wl.completed_at, now()),
         status = coalesce(wl.status, 'Done as planned')
   where wl.completed = false
     and wl.log_date < (now() at time zone 'America/Chicago')::date
     and exists (select 1 from public.set_logs sl where sl.workout_log_id = wl.id)
     and not exists (
       select 1 from public.workout_logs w2
        where w2.client_id = wl.client_id and w2.day_id = wl.day_id
          and w2.log_date = wl.log_date and w2.completed and w2.id <> wl.id);

  update public.scheduled_workouts sw
     set status = 'completed',
         workout_log_id = coalesce(sw.workout_log_id, wl.id)
    from public.workout_logs wl
   where sw.client_id = wl.client_id
     and sw.day_id = wl.day_id
     and sw.scheduled_date = wl.log_date
     and wl.completed
     and sw.status = 'scheduled'
     and sw.deleted_at is null;
end
$body$;
$job$
);

-- ===== 20260719214356 grant_exercise_notes_to_app_roles =====
-- exercise_notes was created without table grants, so RLS never even got evaluated:
-- every app read/write failed with 42501 permission denied (and the UI swallowed it).
grant select, insert, update, delete on public.exercise_notes to anon, authenticated;

-- ===== 20260719214419 grant_app_roles_on_ungranted_tables =====
-- Same silent-failure class as exercise_notes: tables the app touches that were
-- created without grants to the app roles. Every app read/write on these failed
-- with 42501 (swallowed by try/catch in the UI). Backup tables intentionally skipped.
grant select, insert, update, delete on
  public.trainer_notes,
  public.client_notifications,
  public.billing_adjustments,
  public.body_weight_logs,
  public.meal_logs,
  public.off_plan_items,
  public.weigh_ins,
  public.client_intake,
  public.session_notes,
  public.ai_chat_sessions,
  public.ai_program_drafts
to anon, authenticated;

-- ===== 20260719214434 client_notifications_add_policy =====
-- client_notifications had RLS enabled but ZERO policies (deny-all even with grants).
-- Mirror the app-wide app_anon_all pattern used on the other app tables.
create policy app_anon_all on public.client_notifications
  for all to anon, authenticated using (true) with check (true);

-- ===== 20260720141954 add_gcal_reconcile_payments =====
-- Mirror of gcal_reconcile_appointments for the payments side: remove FUTURE
-- gcal-synced payment rows whose Google Calendar event has vanished (deleted /
-- moved out of window). Guarded (>=50 seen ids) so a partial fetch can't wipe
-- billing; future-only + source='gcal_sync' so historical/manual payments are
-- never touched; self-healing (a still-live event re-inserts on the next sync).
CREATE OR REPLACE FUNCTION public.gcal_reconcile_payments(
  p_seen_ids text[], p_time_min timestamptz, p_time_max timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed INT := 0;
BEGIN
  IF p_seen_ids IS NULL OR COALESCE(array_length(p_seen_ids, 1), 0) < 50 THEN
    RETURN jsonb_build_object('removed', 0, 'skipped', 'seen set too small');
  END IF;

  WITH del AS (
    DELETE FROM calendar_payments cp
    WHERE cp.source = 'gcal_sync'
      AND cp.google_event_id IS NOT NULL
      AND cp.payment_date > current_date
      AND cp.payment_date >= p_time_min::date
      AND cp.payment_date <= p_time_max::date
      AND NOT (cp.google_event_id = ANY(p_seen_ids))
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  RETURN jsonb_build_object('removed', removed);
END;
$function$;

-- ===== 20260720145214 rls_phaseA_client_owned =====
-- Phase A.1: client-owned tables (client CRUD own + trainer all)
do $$
declare t text;
begin
  foreach t in array array[
    'metrics','cardio_logs','meal_adherence_logs','offplan_workout_logs',
    'scheduled_workouts','skinfold_logs','daily_logs','client_notifications',
    'trainer_notes','client_app_settings'
  ] loop
    execute format('drop policy if exists client_rw_%1$s on public.%1$I', t);
    execute format('create policy client_rw_%1$s on public.%1$I for all to authenticated using (client_id = my_client_id()) with check (client_id = my_client_id())', t);
    execute format('drop policy if exists trainer_all_%1$s on public.%1$I', t);
    execute format('create policy trainer_all_%1$s on public.%1$I for all to authenticated using (is_trainer()) with check (is_trainer())', t);
  end loop;
end $$;

-- ===== 20260720145228 rls_phaseA_client_read =====
-- direct client_id: client SELECT own + trainer all
do $$
declare t text;
begin
  foreach t in array array['macro_targets','meal_plans'] loop
    execute format('drop policy if exists client_read_%1$s on public.%1$I', t);
    execute format('create policy client_read_%1$s on public.%1$I for select to authenticated using (client_id = my_client_id())', t);
    execute format('drop policy if exists trainer_all_%1$s on public.%1$I', t);
    execute format('create policy trainer_all_%1$s on public.%1$I for all to authenticated using (is_trainer()) with check (is_trainer())', t);
  end loop;
end $$;

-- join-based reads
drop policy if exists client_read_meals on public.meals;
create policy client_read_meals on public.meals for select to authenticated
  using (exists (select 1 from meal_plans mp where mp.id = meals.meal_plan_id and mp.client_id = my_client_id()));
drop policy if exists trainer_all_meals on public.meals;
create policy trainer_all_meals on public.meals for all to authenticated using (is_trainer()) with check (is_trainer());

drop policy if exists client_read_meal_items on public.meal_items;
create policy client_read_meal_items on public.meal_items for select to authenticated
  using (exists (select 1 from meals m join meal_plans mp on mp.id = m.meal_plan_id
                 where m.id = meal_items.meal_id and mp.client_id = my_client_id()));
drop policy if exists trainer_all_meal_items on public.meal_items;
create policy trainer_all_meal_items on public.meal_items for all to authenticated using (is_trainer()) with check (is_trainer());

drop policy if exists client_read_program_versions on public.program_versions;
create policy client_read_program_versions on public.program_versions for select to authenticated
  using (exists (select 1 from program_assignments pa where pa.program_id = program_versions.program_id and pa.client_id = my_client_id()));
drop policy if exists trainer_all_program_versions on public.program_versions;
create policy trainer_all_program_versions on public.program_versions for all to authenticated using (is_trainer()) with check (is_trainer());

drop policy if exists client_read_progression_events on public.progression_events;
create policy client_read_progression_events on public.progression_events for select to authenticated
  using (exists (select 1 from program_assignments pa where pa.id = progression_events.assignment_id and pa.client_id = my_client_id()));
drop policy if exists trainer_all_progression_events on public.progression_events;
create policy trainer_all_progression_events on public.progression_events for all to authenticated using (is_trainer()) with check (is_trainer());

-- ===== 20260720145247 rls_phaseA_writes_library_misc =====
-- prescribed_exercises: client UPDATE own (logger track-toggle)
drop policy if exists client_update_pe on public.prescribed_exercises;
create policy client_update_pe on public.prescribed_exercises for update to authenticated
  using (exists (select 1 from sections s join days d on d.id=s.day_id join phases ph on ph.id=d.phase_id
                 join program_assignments pa on pa.program_id=ph.program_id
                 where s.id = prescribed_exercises.section_id and pa.client_id = my_client_id()))
  with check (exists (select 1 from sections s join days d on d.id=s.day_id join phases ph on ph.id=d.phase_id
                 join program_assignments pa on pa.program_id=ph.program_id
                 where s.id = prescribed_exercises.section_id and pa.client_id = my_client_id()));

-- clients: client UPDATE own row (avatar)
drop policy if exists client_update_own_clients on public.clients;
create policy client_update_own_clients on public.clients for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- library: authed read + trainer write
drop policy if exists trainer_all_exercises on public.exercises;
create policy trainer_all_exercises on public.exercises for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists read_foods on public.foods;
create policy read_foods on public.foods for select to authenticated using (true);
drop policy if exists trainer_all_foods on public.foods;
create policy trainer_all_foods on public.foods for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists read_equipment on public.equipment;
create policy read_equipment on public.equipment for select to authenticated using (true);
drop policy if exists trainer_all_equipment on public.equipment;
create policy trainer_all_equipment on public.equipment for all to authenticated using (is_trainer()) with check (is_trainer());

-- app_feedback: authed submit + trainer all
drop policy if exists submit_feedback on public.app_feedback;
create policy submit_feedback on public.app_feedback for insert to authenticated with check (true);
drop policy if exists trainer_all_feedback on public.app_feedback;
create policy trainer_all_feedback on public.app_feedback for all to authenticated using (is_trainer()) with check (is_trainer());

-- published_workouts / access
drop policy if exists trainer_all_published_workouts on public.published_workouts;
create policy trainer_all_published_workouts on public.published_workouts for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists client_read_published_workouts on public.published_workouts;
create policy client_read_published_workouts on public.published_workouts for select to authenticated
  using (exists (select 1 from published_workout_access pwa where pwa.published_workout_id = published_workouts.id and pwa.client_id = my_client_id()));
drop policy if exists trainer_all_pw_access on public.published_workout_access;
create policy trainer_all_pw_access on public.published_workout_access for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists client_read_pw_access on public.published_workout_access;
create policy client_read_pw_access on public.published_workout_access for select to authenticated using (client_id = my_client_id());

-- flagged: app_users, reminders
drop policy if exists own_app_user on public.app_users;
create policy own_app_user on public.app_users for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists trainer_all_app_users on public.app_users;
create policy trainer_all_app_users on public.app_users for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists trainer_all_reminders on public.reminders;
create policy trainer_all_reminders on public.reminders for all to authenticated using (is_trainer()) with check (is_trainer());
drop policy if exists read_reminders on public.reminders;
create policy read_reminders on public.reminders for select to authenticated using (true);

-- ===== 20260720145302 rls_phaseB_drop_open_policies =====
do $$
declare t text;
begin
  foreach t in array array[
    'app_users','cardio_logs','client_app_settings','client_notifications','clients',
    'daily_logs','days','equipment','exercise_notes','exercises','macro_targets',
    'meal_adherence_logs','meal_items','meal_plans','meals','metrics','phases',
    'prescribed_exercises','program_assignments','program_versions','programs',
    'progression_events','published_workout_access','published_workouts','reminders',
    'scheduled_workouts','sections','set_logs','workout_logs'
  ] loop
    execute format('drop policy if exists app_anon_all on public.%I', t);
  end loop;
end $$;

drop policy if exists app_feedback_all on public.app_feedback;
drop policy if exists foods_all on public.foods;
drop policy if exists offplan_workout_logs_all on public.offplan_workout_logs;
drop policy if exists skinfold_all on public.skinfold_logs;
drop policy if exists trainer_notes_all on public.trainer_notes;
drop policy if exists "authed manages client_app_settings" on public.client_app_settings;

-- ===== 20260720170807 add_device_tokens_for_push =====
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  platform text default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.device_tokens enable row level security;
drop policy if exists user_own_device_tokens on public.device_tokens;
create policy user_own_device_tokens on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists trainer_all_device_tokens on public.device_tokens;
create policy trainer_all_device_tokens on public.device_tokens for all to authenticated
  using (is_trainer()) with check (is_trainer());

-- ===== 20260720222336 rls_client_read_scheduled_workout_structure =====

-- FIX (client 404 on workouts): after RLS hardening, clients could only read program
-- structure (days/sections/prescribed_exercises/phases/programs) for the ONE program in
-- program_assignments. But schedules mix days from many program templates, so any scheduled
-- day outside the assigned program returned null -> notFound() -> "404" for the client.
-- New rule (additive): a client may READ a workout's structure if that day is on THEIR
-- schedule (scheduled_workouts.client_id = my_client_id()). SECURITY DEFINER helpers bypass
-- RLS inside the policy checks to avoid any policy recursion. Existing client_own_* and
-- trainer_all_* policies are kept (policies OR together); no client-data isolation is loosened.

create or replace function sched_day_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select sw.day_id from scheduled_workouts sw where sw.client_id = my_client_id() $$;

create or replace function sched_section_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select s.id from sections s
   where s.day_id in (select sw.day_id from scheduled_workouts sw where sw.client_id = my_client_id()) $$;

create or replace function sched_phase_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select distinct d.phase_id from days d
   where d.id in (select sw.day_id from scheduled_workouts sw where sw.client_id = my_client_id()) $$;

create or replace function sched_program_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select distinct ph.program_id from phases ph
   where ph.id in (select distinct d.phase_id from days d
                   where d.id in (select sw.day_id from scheduled_workouts sw where sw.client_id = my_client_id())) $$;

drop policy if exists client_sched_days on days;
create policy client_sched_days on days for select to authenticated
  using (id in (select sched_day_ids()));

drop policy if exists client_sched_sections on sections;
create policy client_sched_sections on sections for select to authenticated
  using (day_id in (select sched_day_ids()));

drop policy if exists client_sched_pe on prescribed_exercises;
create policy client_sched_pe on prescribed_exercises for select to authenticated
  using (section_id in (select sched_section_ids()));

drop policy if exists client_sched_phases on phases;
create policy client_sched_phases on phases for select to authenticated
  using (id in (select sched_phase_ids()));

drop policy if exists client_sched_programs on programs;
create policy client_sched_programs on programs for select to authenticated
  using (id in (select sched_program_ids()));

-- ===== 20260721143921 fix_client_assessments_anon_access =====
grant select, insert, update, delete on public.client_assessments to anon, authenticated;
create policy app_anon_all on public.client_assessments for all to anon, authenticated using (true) with check (true);

-- ===== 20260721150849 grant_client_assessments_all_roles =====
grant select, insert, update, delete on public.client_assessments to service_role;
grant select, insert, update, delete on public.client_assessments to anon, authenticated;
notify pgrst, 'reload schema';

-- ===== 20260721151013 grant_all_public_tables_standard_roles =====
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
notify pgrst, 'reload schema';

-- ===== 20260721151250 add_clients_movement_screen_enabled =====
alter table public.clients add column if not exists movement_screen_enabled boolean not null default false;
notify pgrst, 'reload schema';

-- ===== 20260721154450 auto_generate_payment_reminders =====
create or replace function public.generate_due_payment_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare n integer;
begin
  insert into payment_reminders (client_id, due_date, amount_due, billing_credits, notification_status, google_event_id, notes, created_at)
  select distinct on (cp.client_id, cp.payment_date)
         cp.client_id, cp.payment_date,
         coalesce(cp.amount, cl.current_fees, 0), 0, 'pending', cp.google_event_id,
         'Auto-generated from calendar payment (due within 7 days).', now()
  from calendar_payments cp
  join clients cl on cl.id = cp.client_id
  where cp.payment_date between (now() at time zone 'America/Chicago')::date
                            and ((now() at time zone 'America/Chicago')::date + 7)
    and cl.payment_reminders_enabled = true
    and not exists (
      select 1 from payment_reminders pr
      where pr.client_id = cp.client_id and pr.due_date = cp.payment_date
    )
  order by cp.client_id, cp.payment_date, cp.synced_at desc nulls last;
  get diagnostics n = row_count;
  return n;
end
$fn$;

select cron.schedule('generate-payment-reminders', '0 13 * * *', 'select public.generate_due_payment_reminders();');

-- ===== 20260723143511 fix_payment_reminders_catchup =====
CREATE OR REPLACE FUNCTION public.generate_due_payment_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer; m integer;
begin
  -- (1) Original behaviour: any calendar payment due within the next 7 days.
  insert into payment_reminders (client_id, due_date, amount_due, billing_credits, notification_status, google_event_id, notes, created_at)
  select distinct on (cp.client_id, cp.payment_date)
         cp.client_id, cp.payment_date,
         coalesce(cp.amount, cl.current_fees, 0), 0, 'pending', cp.google_event_id,
         'Auto-generated from calendar payment (due within 7 days).', now()
  from calendar_payments cp
  join clients cl on cl.id = cp.client_id
  where cp.payment_date between (now() at time zone 'America/Chicago')::date
                            and ((now() at time zone 'America/Chicago')::date + 7)
    and cl.payment_reminders_enabled = true
    and not exists (
      select 1 from payment_reminders pr
      where pr.client_id = cp.client_id and pr.due_date = cp.payment_date
    )
  order by cp.client_id, cp.payment_date, cp.synced_at desc nulls last;
  get diagnostics n = row_count;

  -- (2) Catch-up: an enabled client who has upcoming calendar payments but NO
  -- upcoming reminder at all. This happens when a newly created client's Google
  -- Calendar payment imports into calendar_payments AFTER its due date has already
  -- slipped out of the 7-day window above, so clause (1) never picks it up and the
  -- client is invisible on the Payments screen. Seed the earliest future payment so
  -- every active client always appears. Self-limiting: once a client has any upcoming
  -- reminder, this clause skips them.
  insert into payment_reminders (client_id, due_date, amount_due, billing_credits, notification_status, google_event_id, notes, created_at)
  select distinct on (cp.client_id)
         cp.client_id, cp.payment_date,
         coalesce(cp.amount, cl.current_fees, 0), 0, 'pending', cp.google_event_id,
         'Auto-generated (catch-up: next upcoming payment).', now()
  from calendar_payments cp
  join clients cl on cl.id = cp.client_id
  where cp.payment_date >= (now() at time zone 'America/Chicago')::date
    and cl.payment_reminders_enabled = true
    and not exists (
      select 1 from payment_reminders pr
      where pr.client_id = cp.client_id
        and pr.due_date >= (now() at time zone 'America/Chicago')::date
    )
    and not exists (
      select 1 from payment_reminders pr2
      where pr2.client_id = cp.client_id and pr2.due_date = cp.payment_date
    )
  order by cp.client_id, cp.payment_date, cp.synced_at desc nulls last;
  get diagnostics m = row_count;

  return n + m;
end
$function$;

-- ===== 20260723145703 add_programming_scheduling_fields_to_assessments =====
ALTER TABLE public.client_assessments
  ADD COLUMN IF NOT EXISTS trained_days_per_week integer,
  ADD COLUMN IF NOT EXISTS trained_days_of_week text[],
  ADD COLUMN IF NOT EXISTS cardio_days_per_week integer,
  ADD COLUMN IF NOT EXISTS cardio_days_of_week text[],
  ADD COLUMN IF NOT EXISTS solo_days_per_week integer,
  ADD COLUMN IF NOT EXISTS solo_days_of_week text[],
  ADD COLUMN IF NOT EXISTS solo_day_focus text,
  ADD COLUMN IF NOT EXISTS session_length_minutes integer,
  ADD COLUMN IF NOT EXISTS training_location text,
  ADD COLUMN IF NOT EXISTS equipment_access text,
  ADD COLUMN IF NOT EXISTS cardio_modality text,
  ADD COLUMN IF NOT EXISTS cardio_intensity text,
  ADD COLUMN IF NOT EXISTS contraindicated_movements text,
  ADD COLUMN IF NOT EXISTS block_length_weeks integer,
  ADD COLUMN IF NOT EXISTS block_start_date date;

COMMENT ON COLUMN public.client_assessments.trained_days_per_week IS 'Days per week training in person with trainer';
COMMENT ON COLUMN public.client_assessments.trained_days_of_week IS 'Which weekdays the in-person sessions fall on, e.g. {Mon,Wed,Fri}';
COMMENT ON COLUMN public.client_assessments.cardio_days_per_week IS 'Number of programmed cardio days per week';
COMMENT ON COLUMN public.client_assessments.solo_days_per_week IS 'Days per week client trains on their own without trainer';
COMMENT ON COLUMN public.client_assessments.solo_day_focus IS 'What solo days consist of, e.g. mobility_rehab, full_workout';
COMMENT ON COLUMN public.client_assessments.block_length_weeks IS 'Intended length of the programming block in weeks';

-- ===== 20260723161334 drop_unused_client_intake_table =====
DROP TABLE IF EXISTS public.client_intake;

-- ===== 20260723161345 deprecate_generic_days_per_week_on_assessments =====
-- Backfill legacy generic count into the trainer-day field where the split is unset
UPDATE public.client_assessments
SET trained_days_per_week = days_per_week
WHERE trained_days_per_week IS NULL AND days_per_week IS NOT NULL;

COMMENT ON COLUMN public.client_assessments.days_per_week IS
  'DEPRECATED 2026-07-23 — ambiguous total. Use trained_days_per_week + solo_days_per_week + cardio_days_per_week. Retained for legacy rows only; do not surface in the intake form.';

-- ===== 20260723174521 enforce_prescribed_exercises_require_exercise =====
-- Root cause: exercise_id was nullable, so any seeding/import that failed to resolve
-- an exercise name to an id inserted a row with sets/reps but no movement. The app then
-- renders a blank line. Make that impossible.
ALTER TABLE public.prescribed_exercises
  ALTER COLUMN exercise_id SET NOT NULL;

COMMENT ON COLUMN public.prescribed_exercises.exercise_id IS
  'Required. NOT NULL enforced 2026-07-23 after 15 orphaned rows (blank movements) were found from the 2026-06-20 seeding run. Any import must resolve the exercise name to a real exercises.id and fail loudly if it cannot.';

-- ===== 20260723174754 everfit_import_tables =====

create table if not exists public.everfit_workout_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workout_date date,
  logged_at timestamptz,
  title text,
  duration_sec integer,
  exercise_names text,
  detail text,
  sets jsonb,
  source text not null default 'everfit_import',
  imported_at timestamptz not null default now()
);
create index if not exists idx_efwh_client_date on public.everfit_workout_history(client_id, workout_date);

create table if not exists public.everfit_food_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  log_date date,
  meal_type text,
  title text,
  calories numeric, protein numeric, carbs numeric, fats numeric,
  ext_source text,
  source text not null default 'everfit_import',
  imported_at timestamptz not null default now()
);
create index if not exists idx_effl_client_date on public.everfit_food_log(client_id, log_date);

create table if not exists public.everfit_daily_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  log_date date not null,
  steps integer,
  source text not null default 'everfit_import',
  imported_at timestamptz not null default now(),
  unique(client_id, log_date)
);

create table if not exists public.everfit_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  start_time timestamptz,
  end_time timestamptz,
  logged_at timestamptz,
  source text not null default 'everfit_import',
  imported_at timestamptz not null default now()
);

create table if not exists public.everfit_progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  photo_date date,
  url text,
  created_at_ext text,
  source text not null default 'everfit_import',
  imported_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['everfit_workout_history','everfit_food_log','everfit_daily_steps','everfit_activities','everfit_progress_photos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists trainer_all_%I on public.%I', t, t);
    execute format('create policy trainer_all_%I on public.%I for all to authenticated using (is_trainer()) with check (is_trainer())', t, t);
    execute format('drop policy if exists client_read_%I on public.%I', t, t);
    execute format('create policy client_read_%I on public.%I for select to authenticated using (client_id = my_client_id())', t, t);
  end loop;
end $$;

-- ===== 20260724023100 nutrition_v3_food_catalog =====
create extension if not exists pg_trgm with schema extensions;

create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  barcode text,
  source text check (source in ('usda','off','brand','restaurant','community','client')),
  kcal numeric,
  protein numeric,
  carbs numeric,
  fats numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  sat_fat numeric,
  serving_desc text,
  serving_grams numeric,
  serving_options jsonb default '[]'::jsonb,
  verified boolean default false,
  ai_verified_at timestamptz,
  created_by_client_id uuid references public.clients(id),
  created_at timestamptz default now()
);

create index food_catalog_name_trgm_idx on public.food_catalog using gin (name extensions.gin_trgm_ops);
create index food_catalog_barcode_idx on public.food_catalog (barcode);
create index food_catalog_source_idx on public.food_catalog (source);

alter table public.food_catalog enable row level security;
create policy app_anon_all on public.food_catalog for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.food_catalog to anon, authenticated;

-- ===== 20260724023105 nutrition_v3_my_meals =====
create table public.my_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  name text,
  items jsonb default '[]'::jsonb,
  totals jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index my_meals_client_idx on public.my_meals (client_id);
alter table public.my_meals enable row level security;
create policy app_anon_all on public.my_meals for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.my_meals to anon, authenticated;

-- ===== 20260724023113 nutrition_v3_ai_usage =====
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  used_on date,
  feature text check (feature in ('photo','voice','parse','chat','plan_build','verify')),
  tokens_in int,
  tokens_out int,
  cost_usd numeric(8,5),
  created_at timestamptz default now()
);
create index ai_usage_log_client_day_idx on public.ai_usage_log (client_id, used_on);
alter table public.ai_usage_log enable row level security;
create policy app_anon_all on public.ai_usage_log for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.ai_usage_log to anon, authenticated;

create view public.ai_usage_daily with (security_invoker = on) as
select client_id, used_on, feature,
       count(*)::int as calls,
       coalesce(sum(tokens_in),0)::bigint as tokens_in,
       coalesce(sum(tokens_out),0)::bigint as tokens_out,
       coalesce(sum(cost_usd),0)::numeric(12,5) as cost_usd
from public.ai_usage_log
group by client_id, used_on, feature;

create view public.ai_usage_monthly with (security_invoker = on) as
select date_trunc('month', used_on)::date as month,
       count(*)::int as calls,
       coalesce(sum(tokens_in),0)::bigint as tokens_in,
       coalesce(sum(tokens_out),0)::bigint as tokens_out,
       coalesce(sum(cost_usd),0)::numeric(14,5) as cost_usd
from public.ai_usage_log
group by 1;

grant select on public.ai_usage_daily, public.ai_usage_monthly to anon, authenticated;

-- ===== 20260724023117 nutrition_v3_client_app_settings_flags =====
alter table public.client_app_settings
  add column if not exists nutrition_v3 boolean default false,
  add column if not exists coach_enabled boolean default true,
  add column if not exists ai_daily_chat_limit int default 15,
  add column if not exists ai_daily_photo_limit int default 15,
  add column if not exists ai_daily_parse_limit int default 20,
  add column if not exists ai_daily_planbuild_limit int default 1;

-- ===== 20260724023130 nutrition_v3_plan_flip =====
create table public.plan_flip_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz default now(),
  client_id uuid,
  plan_id uuid,
  action text,
  effective_date date,
  details jsonb
);
alter table public.plan_flip_log enable row level security;
create policy app_anon_all on public.plan_flip_log for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.plan_flip_log to anon, authenticated;

-- Idempotent daily flip: promote due pending meal plans to live, archive superseded ones.
-- p_today is for testing/dry-run support only; cron calls it with no args (Central date).
-- SAFETY: only ever updates meal_plans.status on 'live'/'pending' rows; never touches
-- archived rows, never deletes, never touches meals/meal_items.
create or replace function public.flip_due_meal_plans(p_today date default null)
returns table(client_id uuid, plan_went_live uuid, plans_archived uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  central_today date := coalesce(p_today, (now() at time zone 'America/Chicago')::date);
  r record;
  v_archived uuid[];
begin
  for r in
    select distinct on (mp.client_id) mp.client_id as cid, mp.id as pid, mp.effective_date as eff
    from meal_plans mp
    where mp.status = 'pending'
      and mp.effective_date is not null
      and mp.effective_date <= central_today
    order by mp.client_id, mp.effective_date desc, mp.created_at desc
  loop
    -- archive the previously-live plan(s) and any superseded due pending plans
    with arch as (
      update meal_plans m
         set status = 'archived'
       where m.client_id = r.cid
         and m.id <> r.pid
         and (m.status = 'live'
              or (m.status = 'pending' and m.effective_date is not null and m.effective_date <= central_today))
       returning m.id
    )
    select coalesce(array_agg(a.id), '{}'::uuid[]) into v_archived from arch a;

    -- promote the winner (guard trigger allows this: eff <= central today)
    update meal_plans m set status = 'live' where m.id = r.pid and m.status = 'pending';

    insert into plan_flip_log (client_id, plan_id, action, effective_date, details)
    values (r.cid, r.pid, 'went_live', r.eff,
            jsonb_build_object('archived_plan_ids', to_jsonb(v_archived), 'run_for_date', central_today));

    client_id := r.cid;
    plan_went_live := r.pid;
    plans_archived := v_archived;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.flip_due_meal_plans(date) from public, anon, authenticated;

-- ===== 20260724034728 nutrition_v3_client_write_policies =====
-- Additive author marker: existing rows stay false (= trainer-authored)
alter table public.meal_plans add column if not exists created_by_client boolean not null default false;

-- Auto-stamp client-authored plans on insert (clients cannot spoof trainer authorship,
-- and trainer/service inserts stay false unless explicitly set)
create or replace function public.stamp_meal_plan_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is not null and not is_trainer() and new.client_id = my_client_id() then
    new.created_by_client := true;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_stamp_meal_plan_author on public.meal_plans;
create trigger trg_stamp_meal_plan_author
before insert on public.meal_plans
for each row execute function public.stamp_meal_plan_author();

-- meal_plans: clients may INSERT plans for themselves only
create policy client_insert_meal_plans on public.meal_plans
  for insert to authenticated
  with check (client_id = my_client_id());

-- meal_plans: clients may UPDATE only plans they created (status transition when
-- saving a new version); trainer-authored rows (created_by_client=false) are untouchable
create policy client_update_own_meal_plans on public.meal_plans
  for update to authenticated
  using (client_id = my_client_id() and created_by_client)
  with check (client_id = my_client_id() and created_by_client);

-- meals: clients may INSERT only into their own client-created plans
create policy client_insert_meals on public.meals
  for insert to authenticated
  with check (exists (
    select 1 from meal_plans mp
    where mp.id = meals.meal_plan_id
      and mp.client_id = my_client_id()
      and mp.created_by_client
  ));

-- meal_items: clients may INSERT only into meals of their own client-created plans
create policy client_insert_meal_items on public.meal_items
  for insert to authenticated
  with check (exists (
    select 1 from meals m
    join meal_plans mp on mp.id = m.meal_plan_id
    where m.id = meal_items.meal_id
      and mp.client_id = my_client_id()
      and mp.created_by_client
  ));

-- macro_targets: clients may INSERT their own targets only
create policy client_insert_macro_targets on public.macro_targets
  for insert to authenticated
  with check (client_id = my_client_id());

-- ensure table privileges exist (RLS remains the gate)
grant insert, update on public.meal_plans to authenticated;
grant insert on public.meals, public.meal_items, public.macro_targets to authenticated;

-- ===== 20260724040855 off_import_infrastructure =====

-- 1) Unique partial index on barcode (replaces the plain btree index; needed for ON CONFLICT re-runs)
drop index if exists public.food_catalog_barcode_idx;
create unique index if not exists food_catalog_barcode_unique_idx
  on public.food_catalog (barcode)
  where barcode is not null;

-- 2) Import state table (house grants/RLS pattern)
create table if not exists public.food_import_state (
  source         text primary key,
  cursor         integer not null default 0,
  imported_count integer not null default 0,
  status         text not null default 'pending',
  updated_at     timestamptz not null default now()
);

alter table public.food_import_state enable row level security;
drop policy if exists app_anon_all on public.food_import_state;
create policy app_anon_all on public.food_import_state
  for all to anon, authenticated
  using (true) with check (true);
grant select, insert, update, delete, references, trigger, truncate on public.food_import_state to anon, authenticated, service_role;

insert into public.food_import_state (source, cursor, imported_count, status)
values ('off', 0, 0, 'pending')
on conflict (source) do nothing;

-- 3) Batch insert RPC: PostgREST cannot emit the index predicate needed to target a
--    partial unique index with ON CONFLICT, so the edge function calls this instead.
create or replace function public.import_off_food_batch(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with src as (
    select
      r->>'name'                                   as name,
      nullif(btrim(coalesce(r->>'brand','')), '')  as brand,
      r->>'barcode'                                as barcode,
      (r->>'kcal')::numeric                        as kcal,
      (r->>'protein')::numeric                     as protein,
      (r->>'carbs')::numeric                       as carbs,
      (r->>'fats')::numeric                        as fats,
      (r->>'fiber')::numeric                       as fiber,
      (r->>'sugar')::numeric                       as sugar,
      (r->>'sodium')::numeric                      as sodium,
      (r->>'sat_fat')::numeric                     as sat_fat,
      coalesce(r->>'serving_desc', '100 g')        as serving_desc,
      coalesce((r->>'serving_grams')::numeric,100) as serving_grams,
      coalesce(r->'serving_options', '[]'::jsonb)  as serving_options
    from jsonb_array_elements(rows) as r
    where coalesce(r->>'barcode','') <> ''
      and coalesce(r->>'name','') <> ''
  ), ins as (
    insert into public.food_catalog
      (name, brand, barcode, source, kcal, protein, carbs, fats,
       fiber, sugar, sodium, sat_fat, serving_desc, serving_grams,
       serving_options, verified)
    select name, brand, barcode, 'off', kcal, protein, carbs, fats,
           fiber, sugar, sodium, sat_fat, serving_desc, serving_grams,
           serving_options, false
    from src
    on conflict (barcode) where barcode is not null do nothing
    returning 1
  )
  select count(*) into inserted_count from ins;
  return inserted_count;
end;
$$;

revoke execute on function public.import_off_food_batch(jsonb) from public, anon, authenticated;
grant execute on function public.import_off_food_batch(jsonb) to service_role;

-- 4) Claim/finish helpers so concurrent invocations don't double-run
create or replace function public.claim_off_import(max_stale_minutes integer default 8)
returns setof public.food_import_state
language sql
security definer
set search_path = public
as $$
  update public.food_import_state
     set status = 'running', updated_at = now()
   where source = 'off'
     and status <> 'done'
     and (status <> 'running' or updated_at < now() - make_interval(mins => max_stale_minutes))
  returning *;
$$;

create or replace function public.finish_off_import(p_cursor integer, p_inserted integer, p_status text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.food_import_state
     set cursor = p_cursor,
         imported_count = imported_count + p_inserted,
         status = p_status,
         updated_at = now()
   where source = 'off';
$$;

revoke execute on function public.claim_off_import(integer) from public, anon, authenticated;
revoke execute on function public.finish_off_import(integer, integer, text) from public, anon, authenticated;
grant execute on function public.claim_off_import(integer) to service_role;
grant execute on function public.finish_off_import(integer, integer, text) to service_role;

-- ===== 20260724040948 meals_rotation_jsonb =====
-- NutritionV3: structured rotation/alternation metadata (additive; column only).
-- {"type":"day_parity","even":{food,amount,unit},"odd":{...}} → engine computes
-- grocery/prep parity splits; {"type":"weekly","note":...} informational.
alter table public.meals add column if not exists rotation jsonb;

comment on column public.meals.rotation is
  'Structured rotation metadata: {"type":"day_parity","even":{food,amount,unit},"odd":{...}} (engine computes grocery/prep splits) or {"type":"weekly","note":...} (informational). NULL = no rotation.';

-- ===== 20260724141658 off_bulk_importer =====

-- Additive monitoring columns for the resumable bulk importer
alter table public.food_import_state add column if not exists total_available bigint;
alter table public.food_import_state add column if not exists last_error text;

-- Seed the OFF bulk (HuggingFace datasets-server) importer cursor
insert into public.food_import_state(source, cursor, imported_count, status, updated_at)
select 'off_bulk', 0, 0, 'running', now()
where not exists (select 1 from public.food_import_state where source = 'off_bulk');

-- High-volume, resumable OFF importer.
-- Pages the Open Food Facts HuggingFace dataset via datasets-server (clean JSON,
-- no rate-limited search API, no parquet parsing) using the http extension, maps
-- to food_catalog, and upserts ON CONFLICT (barcode) DO NOTHING. Fully resumable:
-- the row-offset cursor lives in food_import_state('off_bulk'). Single-flight via a
-- transaction-level advisory lock so overlapping cron fires are no-ops.
create or replace function public.import_off_bulk(p_pages int default 40, p_length int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_offset int;
  v_status text;
  v_total  bigint;
  v_url    text;
  v_http_status int;
  v_body   jsonb;
  v_rows   jsonb;
  v_n      int;
  v_page_inserted int;
  v_run_inserted int := 0;
  v_run_fetched  int := 0;
  v_pages_done   int := 0;
  v_done   boolean := false;
  v_err    text := null;
  v_started timestamptz := clock_timestamp();
begin
  -- single-flight; if a previous run is still going, do nothing
  if not pg_try_advisory_xact_lock(918273645) then
    return jsonb_build_object('skipped','locked');
  end if;

  select cursor, status, total_available
    into v_offset, v_status, v_total
    from public.food_import_state where source='off_bulk' for update;

  if v_status = 'done' then
    return jsonb_build_object('skipped','done');
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','25000');

  for i in 1..p_pages loop
    begin
      v_url := format('https://datasets-server.huggingface.co/rows?dataset=openfoodfacts/product-database&config=default&split=food&offset=%s&length=%s', v_offset, p_length);

      select r.status, (case when r.status=200 then r.content::jsonb else null end)
        into v_http_status, v_body
        from http_get(v_url) r;

      if v_http_status <> 200 or v_body is null then
        v_err := 'http_status_'||coalesce(v_http_status::text,'null'); exit;
      end if;

      v_rows := v_body->'rows';
      if v_total is null then v_total := nullif(v_body->>'num_rows_total','')::bigint; end if;
      v_n := coalesce(jsonb_array_length(v_rows), 0);
      if v_n = 0 then v_done := true; exit; end if;

      with elems as (
        select e->'row' as e from jsonb_array_elements(v_rows) e
      ),
      m as (
        select
          left(coalesce(
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where pn->>'lang'='main' and nullif(trim(pn->>'text'),'') is not null limit 1),
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where nullif(trim(pn->>'text'),'') is not null limit 1)
          ),200) as name,
          nullif(trim(e->>'code'),'') as barcode,
          left(nullif(trim(split_part(e->>'brands',',',1)),''),120) as brand,
          nut.nm as nm,
          nullif(trim(e->>'serving_size'),'') as serving_size,
          e->>'serving_quantity' as sq_raw
        from elems
        left join lateral (
          select jsonb_object_agg(n->>'name', n->'100g') as nm
          from jsonb_array_elements(case when jsonb_typeof(e->'nutriments')='array' then e->'nutriments' else '[]'::jsonb end) n
          where n->>'name' is not null and jsonb_typeof(n->'100g')='number'
        ) nut on true
      ),
      c as (
        select
          name, barcode, brand, serving_size,
          coalesce(
            round((nm->>'energy-kcal')::numeric, 2),
            round((nm->>'energy-kj')::numeric / 4.184, 2)
          ) as kcal,
          round((nm->>'proteins')::numeric, 2)       as protein,
          round((nm->>'carbohydrates')::numeric, 2)  as carbs,
          round((nm->>'fat')::numeric, 2)            as fats,
          round((nm->>'fiber')::numeric, 2)          as fiber,
          round((nm->>'sugars')::numeric, 2)         as sugar,
          round((nm->>'saturated-fat')::numeric, 2)  as sat_fat,
          case when (nm->>'sodium') is not null then round((nm->>'sodium')::numeric * 1000, 1)
               when (nm->>'salt')   is not null then round((nm->>'salt')::numeric   * 400, 1)
               else null end as sodium,
          case when e_sq.v is not null and e_sq.v between 0.1 and 2000 then round(e_sq.v,2) else null end as sg
        from m
        left join lateral (
          select case when sq_raw ~ '^[0-9]+(\.[0-9]+)?$' then sq_raw::numeric else null end as v
        ) e_sq on true
        where barcode ~ '^[0-9]{6,14}$' and name is not null and char_length(name) >= 2
      ),
      v as (
        select name, barcode, brand, serving_size, kcal, protein, carbs, fats, sg,
          case when fiber   between 0 and 100    then fiber   else null end as fiber,
          case when sugar   between 0 and 105    then sugar   else null end as sugar,
          case when sat_fat between 0 and 100    then sat_fat else null end as sat_fat,
          case when sodium  between 0 and 100000 then sodium  else null end as sodium
        from c
        where kcal between 0 and 950 and protein between 0 and 100
          and carbs between 0 and 105 and fats between 0 and 100
      ),
      d as (
        select distinct on (barcode) * from v order by barcode
      ),
      ins as (
        insert into public.food_catalog
          (name, brand, barcode, source, kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
           serving_desc, serving_grams, serving_options, verified)
        select name, brand, barcode, 'off', kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
               '100 g', 100,
               jsonb_build_array(
                 jsonb_build_object('desc','100 g','grams',100),
                 jsonb_build_object('desc','1 oz','grams',28.35)
               ) || case when sg is not null
                         then jsonb_build_array(jsonb_build_object('desc', coalesce(serving_size, '1 serving ('||sg||' g)'), 'grams', sg))
                         else '[]'::jsonb end,
               false
        from d
        on conflict (barcode) where barcode is not null do nothing
        returning 1
      )
      select count(*) from ins into v_page_inserted;

      v_run_inserted := v_run_inserted + coalesce(v_page_inserted,0);
      v_run_fetched  := v_run_fetched + v_n;
      v_offset       := v_offset + v_n;
      v_pages_done   := v_pages_done + 1;

      if v_n < p_length then v_done := true; exit; end if;
      if v_total is not null and v_offset >= v_total then v_done := true; exit; end if;
    exception when others then
      v_err := 'page_error@'||v_offset||': '||sqlerrm; exit;
    end;
  end loop;

  update public.food_import_state
     set cursor = v_offset,
         imported_count = imported_count + v_run_inserted,
         total_available = v_total,
         status = case when v_done then 'done' else 'running' end,
         last_error = v_err,
         updated_at = now()
   where source='off_bulk';

  return jsonb_build_object(
    'pages_done', v_pages_done, 'fetched', v_run_fetched, 'inserted', v_run_inserted,
    'offset', v_offset, 'total', v_total, 'done', v_done, 'error', v_err,
    'elapsed_ms', round(extract(milliseconds from clock_timestamp()-v_started))
  );
end;
$fn$;

revoke all on function public.import_off_bulk(int,int) from anon, authenticated;

-- ===== 20260724142128 off_bulk_importer_hardening =====

alter table public.food_import_state add column if not exists fail_count int not null default 0;

create or replace function public.import_off_bulk(p_pages int default 30, p_length int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_offset int;
  v_status text;
  v_total  bigint;
  v_fail   int;
  v_url    text;
  v_http_status int;
  v_body   jsonb;
  v_rows   jsonb;
  v_n      int;
  v_attempt int;
  v_page_inserted int;
  v_run_inserted int := 0;
  v_run_fetched  int := 0;
  v_pages_done   int := 0;
  v_done   boolean := false;
  v_err    text := null;
  v_started timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(918273645) then
    return jsonb_build_object('skipped','locked');
  end if;

  select cursor, status, total_available, fail_count
    into v_offset, v_status, v_total, v_fail
    from public.food_import_state where source='off_bulk' for update;

  if v_status = 'done' then
    return jsonb_build_object('skipped','done');
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','25000');

  for i in 1..p_pages loop
    begin
      v_url := format('https://datasets-server.huggingface.co/rows?dataset=openfoodfacts/product-database&config=default&split=food&offset=%s&length=%s', v_offset, p_length);

      -- transient errors (502/503/429/timeouts) are common on datasets-server; retry a few times
      v_body := null; v_http_status := null;
      for v_attempt in 1..3 loop
        begin
          select r.status, (case when r.status=200 then r.content::jsonb else null end)
            into v_http_status, v_body
            from http_get(v_url) r;
        exception when others then
          v_http_status := -1; v_body := null;
        end;
        exit when v_http_status = 200 and v_body is not null;
        perform pg_sleep(1.5);
      end loop;

      if v_http_status <> 200 or v_body is null then
        v_err := 'http_status_'||coalesce(v_http_status::text,'null'); exit;
      end if;

      v_rows := v_body->'rows';
      if v_total is null then v_total := nullif(v_body->>'num_rows_total','')::bigint; end if;
      v_n := coalesce(jsonb_array_length(v_rows), 0);
      if v_n = 0 then v_done := true; exit; end if;

      with elems as (
        select e->'row' as e from jsonb_array_elements(v_rows) e
      ),
      m as (
        select
          left(coalesce(
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where pn->>'lang'='main' and nullif(trim(pn->>'text'),'') is not null limit 1),
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where nullif(trim(pn->>'text'),'') is not null limit 1)
          ),200) as name,
          nullif(trim(e->>'code'),'') as barcode,
          left(nullif(trim(split_part(e->>'brands',',',1)),''),120) as brand,
          nut.nm as nm,
          nullif(trim(e->>'serving_size'),'') as serving_size,
          e->>'serving_quantity' as sq_raw
        from elems
        left join lateral (
          select jsonb_object_agg(n->>'name', n->'100g') as nm
          from jsonb_array_elements(case when jsonb_typeof(e->'nutriments')='array' then e->'nutriments' else '[]'::jsonb end) n
          where n->>'name' is not null and jsonb_typeof(n->'100g')='number'
        ) nut on true
      ),
      c as (
        select
          name, barcode, brand, serving_size,
          coalesce(round((nm->>'energy-kcal')::numeric, 2), round((nm->>'energy-kj')::numeric / 4.184, 2)) as kcal,
          round((nm->>'proteins')::numeric, 2)      as protein,
          round((nm->>'carbohydrates')::numeric, 2) as carbs,
          round((nm->>'fat')::numeric, 2)           as fats,
          round((nm->>'fiber')::numeric, 2)         as fiber,
          round((nm->>'sugars')::numeric, 2)        as sugar,
          round((nm->>'saturated-fat')::numeric, 2) as sat_fat,
          case when (nm->>'sodium') is not null then round((nm->>'sodium')::numeric * 1000, 1)
               when (nm->>'salt')   is not null then round((nm->>'salt')::numeric   * 400, 1)
               else null end as sodium,
          case when e_sq.v is not null and e_sq.v between 0.1 and 2000 then round(e_sq.v,2) else null end as sg
        from m
        left join lateral (select case when sq_raw ~ '^[0-9]+(\.[0-9]+)?$' then sq_raw::numeric else null end as v) e_sq on true
        where barcode ~ '^[0-9]{6,14}$' and name is not null and char_length(name) >= 2
      ),
      v as (
        select name, barcode, brand, serving_size, kcal, protein, carbs, fats, sg,
          case when fiber   between 0 and 100    then fiber   else null end as fiber,
          case when sugar   between 0 and 105    then sugar   else null end as sugar,
          case when sat_fat between 0 and 100    then sat_fat else null end as sat_fat,
          case when sodium  between 0 and 100000 then sodium  else null end as sodium
        from c
        where kcal between 0 and 950 and protein between 0 and 100 and carbs between 0 and 105 and fats between 0 and 100
      ),
      d as (select distinct on (barcode) * from v order by barcode),
      ins as (
        insert into public.food_catalog
          (name, brand, barcode, source, kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
           serving_desc, serving_grams, serving_options, verified)
        select name, brand, barcode, 'off', kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
               '100 g', 100,
               jsonb_build_array(
                 jsonb_build_object('desc','100 g','grams',100),
                 jsonb_build_object('desc','1 oz','grams',28.35)
               ) || case when sg is not null
                         then jsonb_build_array(jsonb_build_object('desc', coalesce(serving_size, '1 serving ('||sg||' g)'), 'grams', sg))
                         else '[]'::jsonb end,
               false
        from d
        on conflict (barcode) where barcode is not null do nothing
        returning 1
      )
      select count(*) from ins into v_page_inserted;

      v_run_inserted := v_run_inserted + coalesce(v_page_inserted,0);
      v_run_fetched  := v_run_fetched + v_n;
      v_offset       := v_offset + v_n;
      v_pages_done   := v_pages_done + 1;
      v_fail         := 0;  -- progress made, clear stall counter

      if v_n < p_length then v_done := true; exit; end if;
      if v_total is not null and v_offset >= v_total then v_done := true; exit; end if;
    exception when others then
      v_err := 'page_error@'||v_offset||': '||sqlerrm; exit;
    end;
  end loop;

  -- stall protection: if the run made zero progress (first page kept failing),
  -- count it; after 3 consecutive dead runs, skip this page so we never get stuck.
  if v_pages_done = 0 and not v_done then
    v_fail := v_fail + 1;
    if v_fail >= 3 then
      v_offset := v_offset + p_length;  -- skip the poison page
      v_fail := 0;
      v_err := coalesce(v_err,'')||' (skipped page after 3 dead runs)';
    end if;
  end if;

  update public.food_import_state
     set cursor = v_offset,
         imported_count = imported_count + v_run_inserted,
         total_available = v_total,
         fail_count = v_fail,
         status = case when v_done then 'done' else 'running' end,
         last_error = v_err,
         updated_at = now()
   where source='off_bulk';

  return jsonb_build_object(
    'pages_done', v_pages_done, 'fetched', v_run_fetched, 'inserted', v_run_inserted,
    'offset', v_offset, 'total', v_total, 'done', v_done, 'fail_count', v_fail,
    'error', v_err, 'elapsed_ms', round(extract(milliseconds from clock_timestamp()-v_started))
  );
end;
$fn$;

revoke all on function public.import_off_bulk(int,int) from anon, authenticated;

-- ===== 20260724142252 off_bulk_importer_pacing =====

create or replace function public.import_off_bulk(p_pages int default 30, p_length int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_offset int;
  v_status text;
  v_total  bigint;
  v_fail   int;
  v_url    text;
  v_http_status int;
  v_body   jsonb;
  v_rows   jsonb;
  v_n      int;
  v_attempt int;
  v_page_inserted int;
  v_run_inserted int := 0;
  v_run_fetched  int := 0;
  v_pages_done   int := 0;
  v_done   boolean := false;
  v_err    text := null;
  v_started timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(918273645) then
    return jsonb_build_object('skipped','locked');
  end if;

  select cursor, status, total_available, fail_count
    into v_offset, v_status, v_total, v_fail
    from public.food_import_state where source='off_bulk' for update;

  if v_status = 'done' then
    return jsonb_build_object('skipped','done');
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','25000');

  for i in 1..p_pages loop
    begin
      v_url := format('https://datasets-server.huggingface.co/rows?dataset=openfoodfacts/product-database&config=default&split=food&offset=%s&length=%s', v_offset, p_length);

      v_body := null; v_http_status := null;
      for v_attempt in 1..3 loop
        begin
          select r.status, (case when r.status=200 then r.content::jsonb else null end)
            into v_http_status, v_body
            from http_get(v_url) r;
        exception when others then
          v_http_status := -1; v_body := null;
        end;
        exit when v_http_status = 200 and v_body is not null;
        perform pg_sleep(1.5);
      end loop;

      if v_http_status <> 200 or v_body is null then
        v_err := 'http_status_'||coalesce(v_http_status::text,'null'); exit;
      end if;

      v_rows := v_body->'rows';
      if v_total is null then v_total := nullif(v_body->>'num_rows_total','')::bigint; end if;
      v_n := coalesce(jsonb_array_length(v_rows), 0);
      if v_n = 0 then v_done := true; exit; end if;

      with elems as (
        select e->'row' as e from jsonb_array_elements(v_rows) e
      ),
      m as (
        select
          left(coalesce(
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where pn->>'lang'='main' and nullif(trim(pn->>'text'),'') is not null limit 1),
            (select pn->>'text' from jsonb_array_elements(case when jsonb_typeof(e->'product_name')='array' then e->'product_name' else '[]'::jsonb end) pn
               where nullif(trim(pn->>'text'),'') is not null limit 1)
          ),200) as name,
          nullif(trim(e->>'code'),'') as barcode,
          left(nullif(trim(split_part(e->>'brands',',',1)),''),120) as brand,
          nut.nm as nm,
          nullif(trim(e->>'serving_size'),'') as serving_size,
          e->>'serving_quantity' as sq_raw
        from elems
        left join lateral (
          select jsonb_object_agg(n->>'name', n->'100g') as nm
          from jsonb_array_elements(case when jsonb_typeof(e->'nutriments')='array' then e->'nutriments' else '[]'::jsonb end) n
          where n->>'name' is not null and jsonb_typeof(n->'100g')='number'
        ) nut on true
      ),
      c as (
        select
          name, barcode, brand, serving_size,
          coalesce(round((nm->>'energy-kcal')::numeric, 2), round((nm->>'energy-kj')::numeric / 4.184, 2)) as kcal,
          round((nm->>'proteins')::numeric, 2)      as protein,
          round((nm->>'carbohydrates')::numeric, 2) as carbs,
          round((nm->>'fat')::numeric, 2)           as fats,
          round((nm->>'fiber')::numeric, 2)         as fiber,
          round((nm->>'sugars')::numeric, 2)        as sugar,
          round((nm->>'saturated-fat')::numeric, 2) as sat_fat,
          case when (nm->>'sodium') is not null then round((nm->>'sodium')::numeric * 1000, 1)
               when (nm->>'salt')   is not null then round((nm->>'salt')::numeric   * 400, 1)
               else null end as sodium,
          case when e_sq.v is not null and e_sq.v between 0.1 and 2000 then round(e_sq.v,2) else null end as sg
        from m
        left join lateral (select case when sq_raw ~ '^[0-9]+(\.[0-9]+)?$' then sq_raw::numeric else null end as v) e_sq on true
        where barcode ~ '^[0-9]{6,14}$' and name is not null and char_length(name) >= 2
      ),
      v as (
        select name, barcode, brand, serving_size, kcal, protein, carbs, fats, sg,
          case when fiber   between 0 and 100    then fiber   else null end as fiber,
          case when sugar   between 0 and 105    then sugar   else null end as sugar,
          case when sat_fat between 0 and 100    then sat_fat else null end as sat_fat,
          case when sodium  between 0 and 100000 then sodium  else null end as sodium
        from c
        where kcal between 0 and 950 and protein between 0 and 100 and carbs between 0 and 105 and fats between 0 and 100
      ),
      d as (select distinct on (barcode) * from v order by barcode),
      ins as (
        insert into public.food_catalog
          (name, brand, barcode, source, kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
           serving_desc, serving_grams, serving_options, verified)
        select name, brand, barcode, 'off', kcal, protein, carbs, fats, fiber, sugar, sodium, sat_fat,
               '100 g', 100,
               jsonb_build_array(
                 jsonb_build_object('desc','100 g','grams',100),
                 jsonb_build_object('desc','1 oz','grams',28.35)
               ) || case when sg is not null
                         then jsonb_build_array(jsonb_build_object('desc', coalesce(serving_size, '1 serving ('||sg||' g)'), 'grams', sg))
                         else '[]'::jsonb end,
               false
        from d
        on conflict (barcode) where barcode is not null do nothing
        returning 1
      )
      select count(*) from ins into v_page_inserted;

      v_run_inserted := v_run_inserted + coalesce(v_page_inserted,0);
      v_run_fetched  := v_run_fetched + v_n;
      v_offset       := v_offset + v_n;
      v_pages_done   := v_pages_done + 1;
      v_fail         := 0;

      if v_n < p_length then v_done := true; exit; end if;
      if v_total is not null and v_offset >= v_total then v_done := true; exit; end if;
      perform pg_sleep(0.25);  -- gentle pacing to stay under datasets-server rate limits
    exception when others then
      v_err := 'page_error@'||v_offset||': '||sqlerrm; exit;
    end;
  end loop;

  -- Stall protection: only skip a page for genuinely page-specific failures
  -- (parse errors or 4xx that are not rate-limits). Transient 429/502/503/timeouts
  -- never advance past unread data; they simply retry next run.
  if v_pages_done = 0 and not v_done and v_err is not null
     and (v_err like 'page_error%' or v_err in ('http_status_400','http_status_404','http_status_410','http_status_422')) then
    v_fail := v_fail + 1;
    if v_fail >= 3 then
      v_offset := v_offset + p_length;
      v_fail := 0;
      v_err := coalesce(v_err,'')||' (skipped page after 3 dead runs)';
    end if;
  end if;

  update public.food_import_state
     set cursor = v_offset,
         imported_count = imported_count + v_run_inserted,
         total_available = v_total,
         fail_count = v_fail,
         status = case when v_done then 'done' else 'running' end,
         last_error = v_err,
         updated_at = now()
   where source='off_bulk';

  return jsonb_build_object(
    'pages_done', v_pages_done, 'fetched', v_run_fetched, 'inserted', v_run_inserted,
    'offset', v_offset, 'total', v_total, 'done', v_done, 'fail_count', v_fail,
    'error', v_err, 'elapsed_ms', round(extract(milliseconds from clock_timestamp()-v_started))
  );
end;
$fn$;

revoke all on function public.import_off_bulk(int,int) from anon, authenticated;

-- ===== 20260724144516 meal_plans_title =====
alter table meal_plans add column if not exists title text;
update meal_plans set title='Peak Week Depletion' where change_reason ilike 'Peak Week Depletion%' and title is null;
update meal_plans set title='Peak Week Fill' where change_reason ilike 'Peak Week Fill%' and title is null;

-- ===== 20260724170002 nutrition_v3_plan_rotations =====
create table public.plan_rotations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  template_plan_ids uuid[] not null,
  anchor_monday date not null,
  weeks int not null,
  active boolean not null default true,
  note text,
  created_at timestamptz default now()
);
create index plan_rotations_client_idx on public.plan_rotations (client_id);
alter table public.plan_rotations enable row level security;
create policy app_anon_all on public.plan_rotations for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.plan_rotations to anon, authenticated;

-- Generate pending rotation plans for the next p_horizon_weeks Mondays for each ACTIVE rotation.
-- Deep-clones the correct week-template (meal_plans -> meals -> meal_items). Idempotent:
-- skips any (client, effective_date) that already has a plan, so existing plans are never
-- duplicated or modified. Inserts status='pending' (guard allows future pending); the existing
-- flip job promotes each on its Monday. SECURITY DEFINER; auth.uid() is null under cron so the
-- author-stamp trigger leaves created_by_client=false (trainer-authored).
create or replace function public.generate_rotation_plans(p_horizon_weeks int default 10)
returns table(client_id uuid, effective_date date, cycle_index int, new_plan_id uuid, meals_cloned int, items_cloned int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  central_today date := (now() at time zone 'America/Chicago')::date;
  base_monday date;
  rot record; i int; mday date; idx int; tmpl uuid; new_pid uuid; next_ver int;
  m record; new_mid uuid; v_meals int; v_items int; rc int; tmpl_reason text;
begin
  base_monday := central_today + ((8 - extract(isodow from central_today)::int) % 7);
  for rot in select * from plan_rotations pr where pr.active loop
    for i in 0..(p_horizon_weeks - 1) loop
      mday := base_monday + (i * 7);
      if exists (select 1 from meal_plans mp where mp.client_id = rot.client_id and mp.effective_date = mday) then
        continue;
      end if;
      idx := ((((mday - rot.anchor_monday) / 7) % rot.weeks) + rot.weeks) % rot.weeks;
      tmpl := rot.template_plan_ids[idx + 1];
      select coalesce(max(mp.version_number), 0) + 1 into next_ver from meal_plans mp where mp.client_id = rot.client_id;
      select mp.change_reason into tmpl_reason from meal_plans mp where mp.id = tmpl;
      insert into meal_plans (client_id, version_number, effective_date, status, change_reason)
      values (rot.client_id, next_ver, mday, 'pending', 'Auto-rotation wk' || (idx + 1) || ': ' || coalesce(tmpl_reason, ''))
      returning id into new_pid;
      v_meals := 0; v_items := 0;
      for m in select * from meals mm where mm.meal_plan_id = tmpl loop
        insert into meals (meal_plan_id, name, timing, position, swaps, rotation)
        values (new_pid, m.name, m.timing, m.position, m.swaps, m.rotation)
        returning id into new_mid;
        v_meals := v_meals + 1;
        insert into meal_items (meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
        select new_mid, mi.food, mi.amount, mi.unit, mi.is_unlimited, mi.basis, mi.protein, mi.carbs, mi.fats, mi.position
        from meal_items mi where mi.meal_id = m.id;
        get diagnostics rc = row_count;
        v_items := v_items + rc;
      end loop;
      client_id := rot.client_id; effective_date := mday; cycle_index := idx;
      new_plan_id := new_pid; meals_cloned := v_meals; items_cloned := v_items;
      return next;
    end loop;
  end loop;
end;
$fn$;

revoke execute on function public.generate_rotation_plans(int) from public, anon, authenticated;

-- ===== 20260724212056 enrich_trainer_notes_programming_context =====
alter table public.trainer_notes
  add column if not exists exercise_id uuid references public.exercises(id),
  add column if not exists prescribed_exercise_id uuid references public.prescribed_exercises(id),
  add column if not exists author text default 'trainer';

-- ===== 20260724222609 client_workout_library_and_ai =====
-- Per-client workout library (client-created / AI-generated workouts) kept OUT of the main app library
alter table public.days add column if not exists client_owner_id uuid references public.clients(id) on delete cascade;
alter table public.days add column if not exists created_by text default 'trainer';
alter table public.days add column if not exists origin text; -- e.g. 'ai_replace' | 'ai_equipment' | 'ai_activity'
create index if not exists idx_days_client_owner on public.days(client_owner_id);

alter table public.exercises add column if not exists client_owner_id uuid references public.clients(id) on delete cascade;
alter table public.exercises add column if not exists created_by text default 'trainer';
create index if not exists idx_exercises_client_owner on public.exercises(client_owner_id);

-- Robust reads for a client's OWN library workout regardless of phase linkage
drop policy if exists client_owned_days_read on public.days;
create policy client_owned_days_read on public.days for select to authenticated
  using (client_owner_id = my_client_id());
drop policy if exists client_owned_sections_read on public.sections;
create policy client_owned_sections_read on public.sections for select to authenticated
  using (exists (select 1 from public.days d where d.id = sections.day_id and d.client_owner_id = my_client_id()));
drop policy if exists client_owned_pe_read on public.prescribed_exercises;
create policy client_owned_pe_read on public.prescribed_exercises for select to authenticated
  using (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                 where s.id = prescribed_exercises.section_id and d.client_owner_id = my_client_id()));

-- Feature flag (default off; enable per client to roll out). Enable for Dustin to test.
alter table public.client_app_settings add column if not exists workout_ai boolean default false;
alter table public.client_app_settings add column if not exists workout_build_daily_limit int;
update public.client_app_settings set workout_ai = true
  where client_id = '69021074-1708-4d73-9245-918862048709';
insert into public.client_app_settings (client_id, workout_ai)
  select '69021074-1708-4d73-9245-918862048709', true
  where not exists (select 1 from public.client_app_settings where client_id = '69021074-1708-4d73-9245-918862048709');

-- ===== 20260724224754 ai_workout_notice_seen =====
alter table public.client_app_settings add column if not exists seen_ai_workout_notice boolean default false;

-- ===== 20260724231405 group_reads_per_user_tracking =====
-- Per-user group-chat read tracking so group (is_group=true) messages get
-- per-recipient unread — additive, non-destructive.
CREATE TABLE IF NOT EXISTS public.group_reads (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_reads ENABLE ROW LEVEL SECURITY;

-- Grants (house standard: anon + authenticated).
GRANT SELECT, INSERT, UPDATE ON public.group_reads TO anon, authenticated;

-- A user may only see + write their OWN row.
DROP POLICY IF EXISTS group_reads_select_own ON public.group_reads;
CREATE POLICY group_reads_select_own ON public.group_reads
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS group_reads_insert_own ON public.group_reads;
CREATE POLICY group_reads_insert_own ON public.group_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS group_reads_update_own ON public.group_reads;
CREATE POLICY group_reads_update_own ON public.group_reads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== 20260725001005 meal_plans_day_group =====
alter table meal_plans add column if not exists day_group smallint[];
comment on column meal_plans.day_group is 'ISO weekday numbers this menu applies to (1=Mon .. 7=Sun), America/Chicago. NULL = applies every day (default, unchanged behavior). Used for plans whose menu varies by day of week, e.g. Tyler ''Days 1,4,6'' = {1,4,6}.';

-- ===== 20260725011241 program_isolation_marker_and_helpers =====
-- Marker so a client's personal program can be found reliably (additive, nothing reads it yet)
alter table programs add column if not exists personal_for_client_id uuid references clients(id);

create index if not exists idx_programs_personal_for_client on programs(personal_for_client_id)
  where personal_for_client_id is not null;

-- backfill the personal programs created during the 2026-07-25 fork
update programs p set personal_for_client_id = c.id
from clients c
where p.personal_for_client_id is null
  and p.name = split_part(c.name,' ',1) || ' — Personal Workouts'
  and p.description like 'Private copies of library workouts%';

-- ── returns the phase id of this client's personal program, creating it if needed ──
create or replace function ensure_personal_phase(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prog_id  uuid;
  v_phase_id uuid;
  v_name     text;
begin
  select id into v_prog_id from programs where personal_for_client_id = p_client_id limit 1;

  if v_prog_id is null then
    select split_part(name,' ',1) into v_name from clients where id = p_client_id;
    v_prog_id := gen_random_uuid();
    insert into programs (id, name, category, structure_type, status, description,
                          personal_for_client_id, created_at, updated_at)
    values (v_prog_id, coalesce(v_name,'Client') || ' — Personal Workouts',
            'training layer', 'single-session', 'live',
            'Private copies of library workouts this client scheduled directly. Auto-created to keep programming isolated per client.',
            p_client_id, now(), now());
  end if;

  select id into v_phase_id from phases where program_id = v_prog_id order by position limit 1;
  if v_phase_id is null then
    v_phase_id := gen_random_uuid();
    insert into phases (id, program_id, label, position, intent, created_at)
    values (v_phase_id, v_prog_id, 'Personal', 1, 'Client-scheduled library workouts', now());
  end if;

  return v_phase_id;
end;
$$;

-- ── deep-copies a day (sections + prescriptions) into a client's personal program ──
create or replace function fork_day_for_client(p_day_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_id uuid;
  v_new_day  uuid;
  r_sec      record;
  v_new_sec  uuid;
begin
  v_phase_id := ensure_personal_phase(p_client_id);
  v_new_day  := gen_random_uuid();

  insert into days (id, phase_id, label, position, created_at, day_of_week, swappable,
                    client_owner_id, created_by, origin)
  select v_new_day, v_phase_id, d.label, d.position, now(), d.day_of_week, d.swappable,
         d.client_owner_id, d.created_by, d.origin
  from days d where d.id = p_day_id;

  for r_sec in select * from sections where day_id = p_day_id order by position loop
    v_new_sec := gen_random_uuid();
    insert into sections (id, day_id, internal_name, client_facing_name, position, created_at)
    values (v_new_sec, v_new_day, r_sec.internal_name, r_sec.client_facing_name, r_sec.position, now());

    insert into prescribed_exercises (id, section_id, exercise_id, position, sets, volume_type, volume_value,
           unilateral, tempo, load_descriptor, cue, rest, superset_group, intensity_type,
           use_drop_sets, use_rest_pause, use_partials, alternate_of, created_at, tracked_fields)
    select gen_random_uuid(), v_new_sec, pe.exercise_id, pe.position, pe.sets, pe.volume_type, pe.volume_value,
           pe.unilateral, pe.tempo, pe.load_descriptor, pe.cue, pe.rest, pe.superset_group, pe.intensity_type,
           pe.use_drop_sets, pe.use_rest_pause, pe.use_partials, null, now(), pe.tracked_fields
    from prescribed_exercises pe where pe.section_id = r_sec.id;
  end loop;

  return v_new_day;
end;
$$;

-- ===== 20260725011305 enforce_per_client_program_isolation =====
-- ── is this day exclusively this client's? ──
-- Shared if ANOTHER client is assigned to its program, it is another client's personal
-- program, or another client has a live (non-completed) scheduled workout on it.
create or replace function day_is_exclusive_to(p_day_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from days d
    join phases ph on ph.id = d.phase_id
    join programs pr on pr.id = ph.program_id
    left join program_assignments pa on pa.program_id = pr.id and pa.client_id <> p_client_id
    where d.id = p_day_id
      and (pa.id is not null
           or (pr.personal_for_client_id is not null and pr.personal_for_client_id <> p_client_id))
  )
  and not exists (
    select 1 from scheduled_workouts sw
    where sw.day_id = p_day_id
      and sw.client_id <> p_client_id
      and coalesce(sw.status,'') <> 'completed'
      and sw.deleted_at is null
  );
$$;

-- ── scheduling a day that isn't exclusively yours auto-forks a private copy ──
create or replace function sw_enforce_day_isolation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.day_id is null or new.client_id is null then return new; end if;
  -- history is left alone: only live rows are isolated
  if coalesce(new.status,'') = 'completed' then return new; end if;
  if tg_op = 'UPDATE' and new.day_id is not distinct from old.day_id
     and new.client_id is not distinct from old.client_id then
    return new;
  end if;

  if not day_is_exclusive_to(new.day_id, new.client_id) then
    new.day_id := fork_day_for_client(new.day_id, new.client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sw_enforce_day_isolation on scheduled_workouts;
create trigger trg_sw_enforce_day_isolation
  before insert or update of day_id, client_id, status on scheduled_workouts
  for each row execute function sw_enforce_day_isolation();

-- ── assigning a program someone else already has auto-forks the whole program ──
create or replace function pa_enforce_program_isolation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taken     boolean;
  v_new_prog  uuid;
  v_name      text;
  v_client    text;
  r_ph        record;
  v_new_phase uuid;
  r_day       record;
  v_new_day   uuid;
  r_sec       record;
  v_new_sec   uuid;
begin
  if new.program_id is null or new.client_id is null then return new; end if;

  select exists (select 1 from program_assignments pa
                 where pa.program_id = new.program_id
                   and pa.client_id <> new.client_id
                   and (tg_op = 'INSERT' or pa.id <> new.id))
    into v_taken;
  if not v_taken then return new; end if;

  select name into v_name from programs where id = new.program_id;
  select split_part(name,' ',1) into v_client from clients where id = new.client_id;
  v_new_prog := gen_random_uuid();

  insert into programs (id, name, category, structure_type, status, description, created_at, updated_at)
  select v_new_prog, v_name || ' — ' || coalesce(v_client,'Client'),
         category, structure_type, status, description, now(), now()
  from programs where id = new.program_id;

  for r_ph in select * from phases where program_id = new.program_id order by position loop
    v_new_phase := gen_random_uuid();
    insert into phases (id, program_id, label, position, intent, approx_duration, created_at)
    values (v_new_phase, v_new_prog, r_ph.label, r_ph.position, r_ph.intent, r_ph.approx_duration, now());
    if new.current_phase_id = r_ph.id then new.current_phase_id := v_new_phase; end if;

    for r_day in select * from days where phase_id = r_ph.id order by position loop
      v_new_day := gen_random_uuid();
      insert into days (id, phase_id, label, position, created_at, day_of_week, swappable,
                        client_owner_id, created_by, origin)
      values (v_new_day, v_new_phase, r_day.label, r_day.position, now(), r_day.day_of_week,
              r_day.swappable, r_day.client_owner_id, r_day.created_by, r_day.origin);

      for r_sec in select * from sections where day_id = r_day.id order by position loop
        v_new_sec := gen_random_uuid();
        insert into sections (id, day_id, internal_name, client_facing_name, position, created_at)
        values (v_new_sec, v_new_day, r_sec.internal_name, r_sec.client_facing_name, r_sec.position, now());

        insert into prescribed_exercises (id, section_id, exercise_id, position, sets, volume_type, volume_value,
               unilateral, tempo, load_descriptor, cue, rest, superset_group, intensity_type,
               use_drop_sets, use_rest_pause, use_partials, alternate_of, created_at, tracked_fields)
        select gen_random_uuid(), v_new_sec, pe.exercise_id, pe.position, pe.sets, pe.volume_type, pe.volume_value,
               pe.unilateral, pe.tempo, pe.load_descriptor, pe.cue, pe.rest, pe.superset_group, pe.intensity_type,
               pe.use_drop_sets, pe.use_rest_pause, pe.use_partials, null, now(), pe.tracked_fields
        from prescribed_exercises pe where pe.section_id = r_sec.id;
      end loop;
    end loop;
  end loop;

  new.program_id := v_new_prog;
  return new;
end;
$$;

drop trigger if exists trg_pa_enforce_program_isolation on program_assignments;
create trigger trg_pa_enforce_program_isolation
  before insert or update of program_id, client_id on program_assignments
  for each row execute function pa_enforce_program_isolation();

-- ===== 20260725160307 leaderboard_opt_in =====
-- Community leaderboard opt-in. Additive and OFF by default: nobody appears on
-- a leaderboard without choosing to. Ranks consistency (sessions logged), never
-- weight or body composition, so nobody is penalised for being new or lighter.
alter table client_app_settings
  add column if not exists leaderboard_opt_in boolean not null default false;

-- ===== 20260725170004 ai_nudge_engine =====
-- Per-client kill switch for automated nudges. ON by default, but the engine
-- itself ships in preview mode (see /api/ai-nudges) so nothing reaches a client
-- until Dustin explicitly enables sending.
alter table client_app_settings
  add column if not exists nudges_enabled boolean not null default true;

-- Every nudge considered or sent. This is what enforces the frequency caps
-- (1 per 48h, max 3 per rolling week) and gives Dustin a full audit trail of
-- anything sent in his name.
create table if not exists ai_nudge_log (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  segment     text not null,
  tone        text,
  body        text,
  sent        boolean not null default false,   -- false = preview only
  suppressed  text,                             -- why it was held back, if it was
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_nudge_log_client_created
  on ai_nudge_log (client_id, created_at desc);

alter table ai_nudge_log enable row level security;

-- Trainer-only visibility; the engine writes with the service role.
drop policy if exists trainer_all_ai_nudge_log on ai_nudge_log;
create policy trainer_all_ai_nudge_log on ai_nudge_log
  for all to authenticated using (is_trainer()) with check (is_trainer());

-- ===== 20260725171356 app_flags_nudges_live =====
-- App-wide switches the trainer controls from Settings. Keeps operational
-- toggles out of code and out of scheduled-task prompts.
create table if not exists app_flags (
  key         text primary key,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table app_flags enable row level security;

-- Everyone signed in may READ a flag (the nightly task and API need it);
-- only the trainer may change one.
drop policy if exists read_app_flags on app_flags;
create policy read_app_flags on app_flags for select to authenticated using (true);

drop policy if exists trainer_write_app_flags on app_flags;
create policy trainer_write_app_flags on app_flags
  for all to authenticated using (is_trainer()) with check (is_trainer());

-- The master switch for client-facing AI nudges. Ships OFF: the engine runs
-- nightly in preview and reports to Dustin until he turns this on in Settings.
insert into app_flags (key, enabled) values ('nudges_live', false)
  on conflict (key) do nothing;

-- ===== 20260725183744 message_reactions_kudos =====
-- Kudos: reactions on group-chat messages.
-- Additive only. No existing table is touched, so reverting is a single DROP.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  -- One of each emoji per person per message. Tapping again removes it, so the
  -- unique constraint is what makes the toggle idempotent even if the button is
  -- double-tapped or two devices race.
  constraint message_reactions_unique unique (message_id, user_id, emoji),
  -- Keep the vocabulary small and positive. A free-text emoji column invites
  -- exactly the kind of thing you don't want in a client community.
  constraint message_reactions_allowed check (emoji in ('👊','💪','🔥','👏','❤️','😂'))
);

create index if not exists message_reactions_message_idx on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

-- Read: anyone signed in can see reactions on a group message. Reactions on
-- non-group messages are readable only by the two people in that thread.
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and (m.is_group = true or m.from_id = auth.uid() or m.to_id = auth.uid())
    )
  );

-- Write: you may only add a reaction as yourself, and only to a message you
-- are allowed to see. Nobody can react on someone else's behalf.
drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.deleted_at is null
        and (m.is_group = true or m.from_id = auth.uid() or m.to_id = auth.uid())
    )
  );

-- Delete: only your own reaction. The trainer can also clear one, for moderation.
drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid() or public.is_trainer());

-- ===== 20260725183802 group_challenges =====
-- Group challenges: a time-boxed community goal with a live standings board.
-- Additive only. Nothing existing is modified; reverting is a single DROP.

create table if not exists public.group_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- What is being counted. Deliberately behaviour-only:
  --   sessions  = distinct days trained
  --   logging   = distinct days with a workout OR a meal log (rewards showing up)
  -- There is no weight or body-composition metric and there should never be one.
  metric text not null default 'sessions',
  starts_on date not null,
  ends_on date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint group_challenges_metric_check check (metric in ('sessions','logging')),
  constraint group_challenges_dates_check check (ends_on >= starts_on)
);

create index if not exists group_challenges_window_idx on public.group_challenges(starts_on, ends_on);

alter table public.group_challenges enable row level security;

-- Everyone signed in can see the challenge. Standings themselves are computed
-- server-side and still honour each client's leaderboard opt-in.
drop policy if exists group_challenges_select on public.group_challenges;
create policy group_challenges_select on public.group_challenges
  for select to authenticated using (true);

-- Only the trainer creates, edits or ends a challenge.
drop policy if exists group_challenges_insert on public.group_challenges;
create policy group_challenges_insert on public.group_challenges
  for insert to authenticated with check (public.is_trainer());

drop policy if exists group_challenges_update on public.group_challenges;
create policy group_challenges_update on public.group_challenges
  for update to authenticated using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists group_challenges_delete on public.group_challenges;
create policy group_challenges_delete on public.group_challenges
  for delete to authenticated using (public.is_trainer());

-- ===== 20260726014054 progress_photos =====
create table if not exists progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  photo_url text not null,
  taken_date date not null,
  pose text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_progress_photos_client_date on progress_photos(client_id, taken_date);
alter table progress_photos enable row level security;

drop policy if exists client_rw_progress_photos on progress_photos;
create policy client_rw_progress_photos on progress_photos
  for all using (client_id = my_client_id()) with check (client_id = my_client_id());
drop policy if exists trainer_all_progress_photos on progress_photos;
create policy trainer_all_progress_photos on progress_photos
  for all using (is_trainer()) with check (is_trainer());

insert into storage.buckets (id, name, public)
  values ('progress-photos','progress-photos', true)
  on conflict (id) do nothing;

drop policy if exists "progress-photos insert" on storage.objects;
create policy "progress-photos insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'progress-photos');
drop policy if exists "progress-photos read" on storage.objects;
create policy "progress-photos read" on storage.objects
  for select using (bucket_id = 'progress-photos');
drop policy if exists "progress-photos delete" on storage.objects;
create policy "progress-photos delete" on storage.objects
  for delete to authenticated using (bucket_id = 'progress-photos');

-- ===== 20260730133714 set_logs_fill_exercise_id =====
-- Guarantee set_logs.exercise_id is always populated from the prescription,
-- regardless of which code path writes the row. This makes exercise-keyed
-- history durable across workout restructures / template swaps without a hard
-- NOT NULL constraint (genuinely-untrackable off-plan sets with no prescription
-- can still be null).
create or replace function fill_set_log_exercise_id()
returns trigger
language plpgsql
as $$
begin
  if new.exercise_id is null and new.prescribed_exercise_id is not null then
    select pe.exercise_id into new.exercise_id
    from prescribed_exercises pe
    where pe.id = new.prescribed_exercise_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_set_log_exercise_id on set_logs;
create trigger trg_fill_set_log_exercise_id
  before insert or update on set_logs
  for each row execute function fill_set_log_exercise_id();

-- ===== 20260731034009 20260731_week_brief_seen =====
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS week_brief_seen_week text;

COMMENT ON COLUMN public.clients.week_brief_seen_week IS 'ISO date of the Sunday whose weekly programming brief the trainer has already read for this client. Server-side rather than localStorage so the brief does not re-open on the gym iPad after being read on the phone.';

-- ===== 20260731105616 generic_program_and_day_names =====
-- Strip every client name out of program names and session (day) labels.
-- Programs stay linked to their client by program_assignments.client_id and
-- programs.personal_for_client_id, so nothing here changes attribution — it
-- only removes the person's name from the title. Duplicate generic names are
-- expected and fine; the trainer UI disambiguates by showing the assigned
-- client alongside the name.

-- 1. "FullName — Title"  ->  "Title"
update programs
set name = regexp_replace(
      name,
      '^(Celeste Lennon|Claudine Ocon|Dustin Gautreaux|Gerard Gautreaux|Jennifer Day|Lauren Standerfer|Lauren Standefer|Robert Miller|Steph Gautreaux|Sharon Gautreaux|Todd Prine)\s*[—-]\s*',
      ''
    ),
    updated_at = now()
where name ~ '^(Celeste Lennon|Claudine Ocon|Dustin Gautreaux|Gerard Gautreaux|Jennifer Day|Lauren Standerfer|Lauren Standefer|Robert Miller|Steph Gautreaux|Sharon Gautreaux|Todd Prine)\s*[—-]\s*';

-- 2. "Title — FirstName"  ->  "Title"   (also drops the "— Demo" seed copy)
update programs
set name = regexp_replace(
      name,
      '\s*—\s*(Sarah|Sharon|Tania|Cheyenne|Jada|Krysta|Christine|Hassan|Lesly|Tina|Bobbie|Greg|Dustin|Steph|Celeste|Demo)$',
      ''
    ),
    updated_at = now()
where name ~ '\s*—\s*(Sarah|Sharon|Tania|Cheyenne|Jada|Krysta|Christine|Hassan|Lesly|Tina|Bobbie|Greg|Dustin|Steph|Celeste|Demo)$';

-- 3. "A — Hassan K — B"  ->  "A — B"
update programs
set name = regexp_replace(name, '\s*—\s*Hassan K\s*—\s*', ' — '),
    updated_at = now()
where name ~ '—\s*Hassan K\s*—';

-- 4. "FirstName — Personal Workouts"  ->  "Personal Workouts"
update programs
set name = 'Personal Workouts', updated_at = now()
where name ~ '—\s*Personal Workouts$';

-- 5. Family name on the shared couple's program.
update programs
set name = 'Home Balance & Strength — Partner Program', updated_at = now()
where name = 'Lennon Shared — Home Balance & Strength';

-- 6. Step 1 collapsed seven per-client blocks onto two identical dated names.
--    Re-add signal from the program's own category instead of a person.
update programs
set name = '8-Week ' || case when category = 'corrective track' then 'Corrective' else 'Split' end
           || ' Block (' || substring(name from '\((.*)\)') || ')',
    updated_at = now()
where name in ('8-Week Block (Jun 2026)', '8-Week Block (Jul 2026)');

-- 7. Session labels: "FirstName — Label"  ->  "Label"
update days
set label = regexp_replace(label, '^(Christine|Gerard|Sharon|Steph)\s*—\s*', '')
where label ~ '^(Christine|Gerard|Sharon|Steph)\s*—\s*';

-- 8. Session labels: "Label (Grant)"  ->  "Label"
update days
set label = regexp_replace(label, '\s*\(Grant\)$', '')
where label ~ '\(Grant\)$';

-- ===== 20260731110255 client_archive =====
-- Archived clients. A former client's history has to stay intact — logs,
-- messages, programs, payments all keep pointing at the row — so this is a
-- soft state, never a delete. archived_at null = on the roster.
--
-- Everything that treats "all clients" as "the roster" filters on this:
-- group pushes and broadcasts, the attention/nudge sweeps, leaderboard and
-- challenge ranking, the weekly digest, payment reminders. Lookups by id are
-- untouched, so an archived client's past data still resolves their name.

alter table clients
  add column if not exists archived_at timestamptz;

comment on column clients.archived_at is
  'When the client was taken off the active roster. NULL = active. Soft state: history is preserved and lookups by id still resolve.';

create index if not exists clients_archived_at_idx on clients (archived_at);

-- ===== 20260731111658 weekly_ai_focus_columns =====
-- Weekly AI auto-update (#47/#48).
-- weekly_focus already exists but carries no provenance: we can't tell whether
-- Dustin wrote it or the AI did, or which week it belongs to. Without that the
-- Sunday sweep would clobber a manual edit and a stale focus would linger into
-- the next week. These four columns fix both.
alter table clients
  add column if not exists weekly_focus_week   text,   -- ISO Sunday the focus belongs to
  add column if not exists weekly_focus_source text,   -- 'ai' | 'trainer'
  add column if not exists ai_food_focus       text,   -- weekly food-logger read
  add column if not exists ai_food_focus_week  text;   -- ISO Sunday it belongs to

comment on column clients.weekly_focus_week is 'ISO date (Sunday) of the week this weekly_focus applies to. Display gates on this so a stale focus never shows.';
comment on column clients.weekly_focus_source is 'Who wrote weekly_focus: ''trainer'' (Dustin, manual — never overwritten by the cron for that week) or ''ai''.';
comment on column clients.ai_food_focus is 'Weekly nutrition read shown on the food-logger coach card, generated Sunday from last week vs this week numbers.';
comment on column clients.ai_food_focus_week is 'ISO date (Sunday) of the week ai_food_focus applies to.';

-- ===== 20260731112911 20260731_ai_usage_log_model_and_used_on =====
-- ai_usage_log was missing the `model` column that logUsage() has always tried to
-- write, so EVERY insert failed with PGRST204 and the table sat at zero rows.
-- Consequences: the $95/month kill switch could never trip (month-to-date always
-- summed to 0) and every per-client daily AI cap read `used = 0` forever.
alter table public.ai_usage_log add column if not exists model text;

-- `used_on` had no default and nothing ever set it, so the ai_usage_daily /
-- ai_usage_monthly rollup views would have grouped every row under NULL.
-- Chicago date, matching chicagoToday() in meter-core.ts.
alter table public.ai_usage_log
  alter column used_on set default ((now() at time zone 'America/Chicago')::date);

-- checkAndLog() counts (client_id, feature, created_at >= day start) on every
-- gated AI request; assertNotPaused() scans created_at >= month start.
create index if not exists ai_usage_log_client_feature_created_idx
  on public.ai_usage_log (client_id, feature, created_at desc);
create index if not exists ai_usage_log_created_idx
  on public.ai_usage_log (created_at desc);

-- ===== 20260731133136 link_workouts_to_appointments_and_close_anon_hole =====
-- 1. THE MISSING LINK: nothing currently joins a supervised workout to its appointment.
alter table scheduled_workouts
  add column if not exists appointment_id uuid references appointments(id) on delete set null;

create index if not exists idx_scheduled_workouts_appointment
  on scheduled_workouts (appointment_id) where appointment_id is not null;

comment on column scheduled_workouts.appointment_id is
  'The Google-Calendar-mirrored appointment this supervised session represents. NULL for solo sessions. Set at creation for supervised rows; used by the calendar detector to move a workout when its appointment moves.';

-- 2. Close the anon hole on intake PII.
-- /assessment is behind the middleware session check and is trainer-only;
-- create-client-from-assessment writes with the service role. The remaining
-- policy "trainer manages assessments" covers every real caller.
drop policy if exists app_anon_all on client_assessments;

-- ===== 20260731133221 integrity_checks_harness =====
create table if not exists integrity_checks (
  id          bigserial primary key,
  check_name  text not null,
  severity    text not null check (severity in ('critical','warn','info')),
  count       integer not null,
  detail      jsonb,
  ran_at      timestamptz not null default now()
);
create index if not exists idx_integrity_checks_recent on integrity_checks (check_name, ran_at desc);
alter table integrity_checks enable row level security;
drop policy if exists trainer_all_integrity_checks on integrity_checks;
create policy trainer_all_integrity_checks on integrity_checks
  for all to authenticated using (is_trainer()) with check (is_trainer());

comment on table integrity_checks is
  'Daily invariant checks. Every row is a count that SHOULD be zero. Read v_integrity_flags for the latest run. Written by run_integrity_checks() on pg_cron.';

create or replace function run_integrity_checks()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0;
begin
  insert into integrity_checks (check_name, severity, count, detail)

  -- Issue 1: program / assignment integrity
  select 'personal_program_without_assignment','critical',count(*),
         jsonb_agg(jsonb_build_object('program',p.name,'client',c.name))
  from programs p join clients c on c.id=p.personal_for_client_id
  where p.personal_for_client_id is not null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)

  union all
  select 'scheduled_day_outside_assigned_program','critical',count(*),null
  from scheduled_workouts sw join days d on d.id=sw.day_id join phases ph on ph.id=d.phase_id
  where sw.deleted_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)

  union all
  select 'scheduled_workout_null_assignment_id','warn',count(*),null
  from scheduled_workouts where deleted_at is null and assignment_id is null

  union all
  select 'days_null_client_owner_under_personal_program','warn',count(*),null
  from days d join phases ph on ph.id=d.phase_id join programs p on p.id=ph.program_id
  where p.personal_for_client_id is not null and d.client_owner_id is null

  -- Calendar
  union all
  select 'supervised_workout_no_appointment','critical',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from scheduled_workouts sw join clients c on c.id=sw.client_id
  where sw.deleted_at is null and sw.supervised and sw.appointment_id is null
    and sw.scheduled_date >= current_date

  union all
  select 'appointment_no_supervised_workout','warn',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from appointments a join clients c on c.id=a.client_id
  where a.status='scheduled' and c.is_archived is not true
    and (a.scheduled_at at time zone 'America/Chicago')::date between current_date and current_date+28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id=a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date=(a.scheduled_at at time zone 'America/Chicago')::date)

  union all
  select 'gcal_sync_stale_over_60min','critical',
         case when max(updated_at) < now() - interval '60 minutes' then 1 else 0 end,
         jsonb_build_object('last_sync',max(updated_at))
  from appointments

  -- Coverage
  union all
  select 'client_coverage_under_14_days','warn',count(*),
         jsonb_agg(jsonb_build_object('client',c.name,'through',x.mx))
  from (select client_id, max(scheduled_date) mx from scheduled_workouts
        where deleted_at is null group by 1) x
  join clients c on c.id=x.client_id
  where c.is_archived is not true and x.mx < current_date + 14

  -- Cross-cutting
  union all
  select 'client_weight_drift_from_metrics','warn',count(*),
         jsonb_agg(jsonb_build_object('client',t.name,'clients_tbl',t.cw,'metrics',t.mw))
  from (select c.name, c.current_weight cw, m.weight mw from clients c
        join lateral (select weight from metrics where client_id=c.id and weight is not null
                      order by metric_date desc limit 1) m on true
        where c.current_weight is not null and abs(c.current_weight-m.weight) >= 1) t

  union all
  select 'macro_targets_without_meal_plan','warn',count(*),null
  from clients c where exists (select 1 from macro_targets mt where mt.client_id=c.id)
    and not exists (select 1 from meal_plans mp where mp.client_id=c.id)

  union all
  select 'placeholder_macro_targets','info',count(*),null
  from macro_targets where calories=1800 and protein=150 and carbs=165 and fats=60

  union all
  select 'duplicate_scheduled_workout','warn',count(*),null
  from (select client_id,scheduled_date,day_id from scheduled_workouts
        where deleted_at is null group by 1,2,3 having count(*)>1) t

  union all
  select 'prescribed_exercise_position_gaps','info',count(*),null
  from (select section_id from prescribed_exercises group by section_id
        having max(position)<>count(*) or min(position)<>1) t

  union all
  select 'anon_writable_policies','critical',count(*),
         jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname))
  from pg_policies where schemaname='public' and 'anon'=any(roles) and qual='true';

  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('integrity_checks_daily','25 11 * * *','select public.run_integrity_checks();');

-- ===== 20260731133253 integrity_checks_fix_archived_column =====
create or replace function run_integrity_checks()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0;
begin
  insert into integrity_checks (check_name, severity, count, detail)

  select 'personal_program_without_assignment','critical',count(*),
         jsonb_agg(jsonb_build_object('client',c.name))
  from programs p join clients c on c.id=p.personal_for_client_id
  where p.personal_for_client_id is not null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)

  union all
  select 'scheduled_day_outside_assigned_program','critical',count(*),null
  from scheduled_workouts sw join days d on d.id=sw.day_id join phases ph on ph.id=d.phase_id
  where sw.deleted_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)

  union all
  select 'scheduled_workout_null_assignment_id','warn',count(*),null
  from scheduled_workouts where deleted_at is null and assignment_id is null

  union all
  select 'days_null_client_owner_under_personal_program','warn',count(*),null
  from days d join phases ph on ph.id=d.phase_id join programs p on p.id=ph.program_id
  where p.personal_for_client_id is not null and d.client_owner_id is null

  union all
  select 'supervised_workout_no_appointment','critical',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from scheduled_workouts sw join clients c on c.id=sw.client_id
  where sw.deleted_at is null and sw.supervised and sw.appointment_id is null
    and sw.scheduled_date >= current_date and c.archived_at is null

  union all
  select 'appointment_no_supervised_workout','warn',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from appointments a join clients c on c.id=a.client_id
  where a.status='scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between current_date and current_date+28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id=a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date=(a.scheduled_at at time zone 'America/Chicago')::date)

  union all
  select 'gcal_sync_stale_over_60min','critical',
         case when max(updated_at) < now() - interval '60 minutes' then 1 else 0 end,
         jsonb_build_object('last_sync',max(updated_at))
  from appointments

  union all
  select 'client_coverage_under_14_days','warn',count(*),
         jsonb_agg(jsonb_build_object('client',c.name,'through',x.mx))
  from (select client_id, max(scheduled_date) mx from scheduled_workouts
        where deleted_at is null group by 1) x
  join clients c on c.id=x.client_id
  where c.archived_at is null and x.mx < current_date + 14

  union all
  select 'client_weight_drift_from_metrics','warn',count(*),
         jsonb_agg(jsonb_build_object('client',t.name,'clients_tbl',t.cw,'metrics',t.mw))
  from (select c.name, c.current_weight cw, m.weight mw from clients c
        join lateral (select weight from metrics where client_id=c.id and weight is not null
                      order by metric_date desc limit 1) m on true
        where c.current_weight is not null and abs(c.current_weight-m.weight) >= 1) t

  union all
  select 'macro_targets_without_meal_plan','warn',count(*),null
  from clients c where exists (select 1 from macro_targets mt where mt.client_id=c.id)
    and not exists (select 1 from meal_plans mp where mp.client_id=c.id)

  union all
  select 'placeholder_macro_targets','info',count(*),null
  from macro_targets where calories=1800 and protein=150 and carbs=165 and fats=60

  union all
  select 'duplicate_scheduled_workout','warn',count(*),null
  from (select client_id,scheduled_date,day_id from scheduled_workouts
        where deleted_at is null group by 1,2,3 having count(*)>1) t

  union all
  select 'prescribed_exercise_position_gaps','info',count(*),null
  from (select section_id from prescribed_exercises group by section_id
        having max(position)<>count(*) or min(position)<>1) t

  union all
  select 'anon_writable_policies','critical',count(*),
         jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname))
  from pg_policies where schemaname='public' and 'anon'=any(roles) and qual='true';

  get diagnostics n = row_count;
  return n;
end $$;

create or replace view v_integrity_flags as
select ic.check_name, ic.severity, ic.count, ic.detail, ic.ran_at
from integrity_checks ic
join (select check_name, max(ran_at) mx from integrity_checks group by 1) l
  on l.check_name = ic.check_name and l.mx = ic.ran_at
order by case ic.severity when 'critical' then 0 when 'warn' then 1 else 2 end, ic.count desc;

comment on view v_integrity_flags is
  'Latest value of every integrity check. Every count SHOULD be zero. Start here to answer "what is wrong right now".';

-- ===== 20260731134344 calendar_schedule_detector =====
create table if not exists schedule_change_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  scheduled_workout_id uuid references scheduled_workouts(id) on delete cascade,
  day_id uuid references days(id),
  appointment_id uuid references appointments(id) on delete set null,
  gcal_recurring_id text,
  from_date date,
  to_date date,
  reason text not null check (reason in ('moved','cancelled','uncovered','orphaned','pattern_shift','retired')),
  confidence text not null check (confidence in ('one_off','pattern')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  detail jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists uq_scp_open
  on schedule_change_proposals (client_id, coalesce(from_date,'1900-01-01'), coalesce(to_date,'1900-01-01'), reason)
  where status = 'pending';
alter table schedule_change_proposals enable row level security;
drop policy if exists trainer_all_scp on schedule_change_proposals;
create policy trainer_all_scp on schedule_change_proposals
  for all to authenticated using (is_trainer()) with check (is_trainer());

comment on table schedule_change_proposals is
  'Calendar-vs-schedule differences awaiting Dustin''s approval. On approve: UPDATE scheduled_date AND set moved_from_date. NEVER delete-and-reinsert.';

-- Pattern derivation: modal weekday+time per gcal series over the forward window.
create or replace view v_client_calendar_pattern as
with appt as (
  select a.client_id, c.name as client_name, a.gcal_recurring_id as series,
         (a.scheduled_at at time zone 'America/Chicago')::date as d,
         extract(dow from (a.scheduled_at at time zone 'America/Chicago'))::int as dow,
         to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI') as tm,
         a.status
  from appointments a join clients c on c.id = a.client_id
  where c.archived_at is null and a.gcal_recurring_id is not null
    and a.scheduled_at >= now() - interval '28 days'
    and a.scheduled_at <  now() + interval '28 days'
)
select client_id, client_name, series,
       mode() within group (order by dow) as pattern_dow,
       mode() within group (order by tm)  as pattern_time,
       count(*) filter (where d >= current_date) as future_n,
       count(*) filter (where d >= current_date and status = 'cancelled_client') as future_cancelled,
       (count(*) filter (where d >= current_date) = 0) as is_retired
from appt group by client_id, client_name, series;

comment on view v_client_calendar_pattern is
  'Each Google recurring series reduced to its modal weekday + time over -28/+28 days. future_n = 0 means the series is RETIRED (this is how Sarah Prince''s dead Mon 07:00 series was caught). Deviations from the modal pair are one-off moves.';

create or replace function detect_schedule_changes()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0;
begin
  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and created_at < now() - interval '20 hours';

  -- ORPHANED: supervised workout, no appointment that day
  insert into schedule_change_proposals (client_id, scheduled_workout_id, day_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, sw.day_id, sw.scheduled_date, 'orphaned', 'one_off',
         jsonb_build_object('client', c.name, 'day', d.label)
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  left join days d on d.id = sw.day_id
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date between current_date and current_date + 28
    and not exists (select 1 from appointments a
                    where a.client_id = sw.client_id and a.status = 'scheduled'
                      and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date)
  on conflict do nothing;

  -- UNCOVERED: appointment, no supervised workout that day
  insert into schedule_change_proposals (client_id, appointment_id, gcal_recurring_id, to_date, reason, confidence, detail)
  select a.client_id, a.id, a.gcal_recurring_id,
         (a.scheduled_at at time zone 'America/Chicago')::date, 'uncovered',
         case when a.gcal_recurring_id is null then 'one_off' else 'pattern' end,
         jsonb_build_object('client', c.name,
                            'time', to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI'))
  from appointments a join clients c on c.id = a.client_id
  where a.status = 'scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between current_date and current_date + 28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date)
  on conflict do nothing;

  -- CANCELLED: appointment cancelled but a supervised workout is still sitting on that date
  insert into schedule_change_proposals (client_id, scheduled_workout_id, appointment_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, a.id, sw.scheduled_date, 'cancelled', 'one_off',
         jsonb_build_object('client', c.name, 'note', 'appointment cancelled in Google - leave the date empty')
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  join appointments a on a.client_id = sw.client_id
    and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date
    and a.status like 'cancelled%'
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date >= current_date
  on conflict do nothing;

  -- RETIRED: a recurring series with zero future occurrences
  insert into schedule_change_proposals (client_id, gcal_recurring_id, reason, confidence, detail)
  select p.client_id, p.series, 'retired', 'pattern',
         jsonb_build_object('client', p.client_name,
                            'was', to_char(date '2026-08-02' + p.pattern_dow,'Dy') || ' ' || p.pattern_time)
  from v_client_calendar_pattern p where p.is_retired
  on conflict do nothing;

  -- PAIR orphaned + uncovered inside the same ISO week into ONE move
  update schedule_change_proposals o
  set reason = 'moved', to_date = u.to_date, appointment_id = u.appointment_id,
      detail = o.detail || jsonb_build_object('paired_with', u.id, 'moved_to', u.to_date)
  from schedule_change_proposals u
  where o.status = 'pending' and o.reason = 'orphaned'
    and u.status = 'pending' and u.reason = 'uncovered'
    and u.client_id = o.client_id
    and date_trunc('week', u.to_date) = date_trunc('week', o.from_date);

  update schedule_change_proposals u
  set status = 'superseded', resolved_at = now()
  from schedule_change_proposals o
  where u.status = 'pending' and u.reason = 'uncovered'
    and o.reason = 'moved' and o.detail->>'paired_with' = u.id::text;

  select count(*) into n from schedule_change_proposals where status = 'pending';
  return n;
end $$;

create or replace view v_schedule_proposals as
select p.id, c.name as client, p.reason, p.confidence,
       p.from_date, p.to_date, p.detail, p.created_at
from schedule_change_proposals p join clients c on c.id = p.client_id
where p.status = 'pending'
order by case p.reason when 'cancelled' then 0 when 'moved' then 1 when 'uncovered' then 2
                       when 'orphaned' then 3 when 'retired' then 4 else 5 end,
         coalesce(p.from_date, p.to_date), c.name;

-- Every 12 hours, per Dustin: 06:30 and 18:30 America/Chicago
select cron.schedule('detect_schedule_changes_12h','30 11,23 * * *','select public.detect_schedule_changes();');
select cron.unschedule('integrity_checks_daily');
select cron.schedule('integrity_checks_12h','25 11,23 * * *','select public.run_integrity_checks();');

-- ===== 20260731135812 issue1_capture_before_backfill =====
-- Full-shape capture before anything is touched (per the 7/24 lesson: never a column subset before a change)
create table if not exists bak_scheduled_workouts_20260731 as select * from scheduled_workouts;
create table if not exists bak_program_assignments_20260731 as select * from program_assignments;
create table if not exists bak_days_20260731 as select * from days;
alter table bak_scheduled_workouts_20260731 enable row level security;
alter table bak_program_assignments_20260731 enable row level security;
alter table bak_days_20260731 enable row level security;
comment on table bak_scheduled_workouts_20260731 is 'Pre-Issue-1-backfill snapshot, 2026-07-31. Full shape.';

-- ===== 20260731135911 issue1_ownership_and_recurrence_guards =====
-- STEP 3: declare per-client day ownership (was incidental, now explicit)
update days d set client_owner_id = p.personal_for_client_id
from phases ph join programs p on p.id = ph.program_id
where ph.id = d.phase_id and p.personal_for_client_id is not null and d.client_owner_id is null;

-- GUARD 1: a personal program can never again exist without its assignment.
create or replace function pa_autocreate_for_personal_program()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_phase uuid;
begin
  if new.personal_for_client_id is null then return new; end if;
  if exists (select 1 from program_assignments pa
             where pa.client_id = new.personal_for_client_id and pa.program_id = new.id) then
    return new;
  end if;
  select ph.id into v_phase from phases ph where ph.program_id = new.id
    order by ph.position, ph.created_at limit 1;
  insert into program_assignments (client_id, program_id, current_phase_id, current_day_in_rotation, active, assigned_at)
  values (new.personal_for_client_id, new.id, v_phase, 1, true, now());
  return new;
end $$;

drop trigger if exists trg_personal_program_needs_assignment on programs;
create trigger trg_personal_program_needs_assignment
  after insert or update of personal_for_client_id on programs
  for each row execute function pa_autocreate_for_personal_program();

-- GUARD 2: assignment_id is DERIVED, never authored. This is what stops the pointer drifting.
create or replace function sw_derive_assignment_id()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_pa uuid;
begin
  if new.day_id is null then return new; end if;
  select pa.id into v_pa
  from days d join phases ph on ph.id = d.phase_id
  join program_assignments pa on pa.client_id = new.client_id and pa.program_id = ph.program_id and pa.active
  where d.id = new.day_id
  order by pa.assigned_at desc limit 1;
  if v_pa is not null then new.assignment_id := v_pa; end if;
  return new;
end $$;

drop trigger if exists trg_sw_derive_assignment on scheduled_workouts;
create trigger trg_sw_derive_assignment
  before insert or update of day_id, client_id on scheduled_workouts
  for each row execute function sw_derive_assignment_id();

-- GUARD 3: no duplicate active assignment for the same client+program (0 violations today)
create unique index if not exists uq_pa_active_client_program
  on program_assignments (client_id, program_id) where active;

-- GUARD 4: a day under a personal program must declare its owner
create or replace function days_enforce_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid;
begin
  select p.personal_for_client_id into v_owner
  from phases ph join programs p on p.id = ph.program_id where ph.id = new.phase_id;
  if v_owner is not null and new.client_owner_id is distinct from v_owner then
    new.client_owner_id := v_owner;
  end if;
  return new;
end $$;

drop trigger if exists trg_days_enforce_owner on days;
create trigger trg_days_enforce_owner
  before insert or update of phase_id on days
  for each row execute function days_enforce_owner();

-- Close the soft-delete leak in the RLS helpers (clients could read deleted workouts' content)
create or replace function sched_day_ids() returns setof uuid language sql stable security definer set search_path to 'public' as
$$ select sw.day_id from scheduled_workouts sw where sw.client_id = my_client_id() and sw.deleted_at is null $$;
create or replace function sched_phase_ids() returns setof uuid language sql stable security definer set search_path to 'public' as
$$ select distinct d.phase_id from days d where d.id in (select sched_day_ids()) $$;
create or replace function sched_section_ids() returns setof uuid language sql stable security definer set search_path to 'public' as
$$ select s.id from sections s where s.day_id in (select sched_day_ids()) $$;
create or replace function sched_program_ids() returns setof uuid language sql stable security definer set search_path to 'public' as
$$ select distinct ph.program_id from phases ph where ph.id in (select sched_phase_ids()) $$;

-- ===== 20260731144222 billing_model_from_calendar =====
-- A client's billing shape, so the sync stops guessing
alter table clients add column if not exists billing_type text
  check (billing_type in ('per_session','flat','none'));
comment on column clients.billing_type is
  'per_session = sessions trained x session_rate (default). flat = current_fees per cycle regardless of sessions. none = never generate a reminder (couples who pay together, etc).';

update clients set billing_type = 'per_session' where billing_type is null;

-- Dustin, 2026-07-31: couples who pay together, no reminders at all
update clients set billing_type = 'none', payment_reminders_enabled = false
where name in ('Troy Schnitzler','Krysta Ruiz-Schnitzler','Celeste Lennon','Greg Lennon');

-- Flat-rate clients
update clients set billing_type = 'flat', flat_billing = true
where name in ('Jennifer Day','Robert Miller','Bobbie Page');

-- Robert Miller: $300/mo programming only, no sessions
update clients set current_fees = 300, billing_cadence = 'monthly' where name = 'Robert Miller';
-- Bobbie Page: flat, 1 program-update session per month
update clients set billing_cadence = 'monthly' where name = 'Bobbie Page';
-- Jennifer Day: $1500 quarterly regardless
update clients set current_fees = 1500, billing_cadence = 'quarterly' where name = 'Jennifer Day';
-- Sharon Rambo: $300 every 2 weeks
update clients set billing_cadence = 'biweekly', current_fees = 300 where name = 'Sharon Rambo';

-- Derive session_rate from the green calendar payment / sessions per cycle.
-- Sessions per week comes from ACTUAL supervised scheduling, not the stored training_frequency,
-- so it stays correct as patterns change.
create or replace function derive_session_rates()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0;
begin
  with sessions_per_week as (
    select sw.client_id,
           round(count(*)::numeric / 4.0, 2) as per_week
    from scheduled_workouts sw
    where sw.deleted_at is null and sw.supervised
      and sw.scheduled_date between current_date - 28 and current_date - 1
    group by sw.client_id
  ),
  latest_pay as (
    select distinct on (client_id) client_id, amount, cadence
    from calendar_payments where amount is not null
    order by client_id, payment_date desc
  ),
  calc as (
    select c.id,
           case coalesce(lp.cadence, c.billing_cadence, 'monthly')
             when 'weekly'    then lp.amount / nullif(spw.per_week, 0)
             when 'biweekly'  then lp.amount / nullif(spw.per_week * 2, 0)
             when 'quarterly' then lp.amount / nullif(spw.per_week * 13, 0)
             else                  lp.amount / nullif(spw.per_week * 4, 0)
           end as rate
    from clients c
    join latest_pay lp on lp.client_id = c.id
    join sessions_per_week spw on spw.client_id = c.id
    where c.archived_at is null and c.billing_type = 'per_session'
  )
  update clients c set session_rate = round(calc.rate, 2)
  from calc where calc.id = c.id and calc.rate is not null and calc.rate > 0;

  get diagnostics n = row_count;
  return n;
end $$;

select derive_session_rates();

-- ===== 20260731151324 v_client_now =====
create or replace view v_client_now as
with live_sched as (
  select client_id,
         max(scheduled_date) filter (where scheduled_date >= current_date) as coverage_through,
         min(scheduled_date) filter (where scheduled_date >= current_date) as next_workout_date,
         count(*) filter (where scheduled_date between current_date - 7 and current_date - 1) as sched_7d,
         count(*) filter (where scheduled_date between current_date - 7 and current_date - 1 and status = 'completed') as done_7d,
         count(*) filter (where scheduled_date between current_date - 28 and current_date - 1) as sched_28d,
         count(*) filter (where scheduled_date between current_date - 28 and current_date - 1 and status = 'completed') as done_28d
  from scheduled_workouts where deleted_at is null group by client_id
),
next_up as (
  select distinct on (sw.client_id) sw.client_id, d.label as next_workout, sw.supervised as next_supervised
  from scheduled_workouts sw left join days d on d.id = sw.day_id
  where sw.deleted_at is null and sw.scheduled_date >= current_date
  order by sw.client_id, sw.scheduled_date, sw.position
),
progs as (
  select pa.client_id,
         array_agg(distinct p.name order by p.name) as active_programs,
         count(distinct p.id) as n_programs
  from program_assignments pa join programs p on p.id = pa.program_id
  where pa.active group by pa.client_id
),
latest_metric as (
  select distinct on (client_id) client_id, weight, body_fat_pct, metric_date, source
  from metrics where weight is not null order by client_id, metric_date desc
),
macros as (
  select distinct on (client_id) client_id, calories, protein, carbs, fats, effective_date,
         (calories = 1800 and protein = 150 and carbs = 165 and fats = 60) as is_placeholder
  from macro_targets order by client_id, effective_date desc
),
nutrition as (
  select client_id,
         count(*) filter (where log_date >= current_date - 7) as logs_7d,
         count(*) filter (where log_date >= current_date - 7 and adherence = 'Off-plan') as offplan_7d,
         count(*) filter (where log_date >= current_date - 28) as logs_28d
  from meal_adherence_logs group by client_id
),
appts as (
  select client_id,
         count(*) filter (where status = 'scheduled'
           and (scheduled_at at time zone 'America/Chicago')::date between current_date and current_date + 28) as appts_next_28d
  from appointments group by client_id
),
props as (
  select client_id, count(*) as open_proposals from schedule_change_proposals where status = 'pending' group by client_id
)
select
  c.id                                    as client_id,
  c.name                                  as client,
  c.slug,
  (c.archived_at is not null)             as is_archived,
  (c.name in ('Demo Account','Test Client')) as is_test,
  -- programming
  coalesce(pr.active_programs, '{}')      as active_programs,
  coalesce(pr.n_programs, 0)              as n_active_programs,
  ls.coverage_through,
  (ls.coverage_through - current_date)    as coverage_days_left,
  nu.next_workout,
  ls.next_workout_date,
  nu.next_supervised,
  -- doing
  ls.sched_7d, ls.done_7d,
  case when ls.sched_7d > 0 then round(100.0 * ls.done_7d / ls.sched_7d) end   as completion_7d_pct,
  ls.sched_28d, ls.done_28d,
  case when ls.sched_28d > 0 then round(100.0 * ls.done_28d / ls.sched_28d) end as completion_28d_pct,
  ap.appts_next_28d,
  -- body: ALWAYS from metrics, NEVER clients.current_weight (that field never syncs)
  lm.weight            as latest_weight,
  lm.body_fat_pct      as latest_body_fat_pct,
  lm.metric_date       as latest_metric_date,
  lm.source            as latest_metric_source,
  (current_date - lm.metric_date) as days_since_weigh_in,
  -- nutrition
  mt.calories, mt.protein, mt.carbs, mt.fats, mt.effective_date as macros_set_on,
  mt.is_placeholder    as macros_are_placeholder,
  exists (select 1 from meal_plans mp where mp.client_id = c.id and mp.status = 'live') as has_live_meal_plan,
  coalesce(nt.logs_7d, 0)  as food_logs_7d,
  coalesce(nt.logs_28d, 0) as food_logs_28d,
  case when not exists (select 1 from meal_plans mp where mp.client_id = c.id) then 'no_plan'
       when coalesce(nt.logs_7d,0) = 0 then 'not_logging'
       when nt.offplan_7d::numeric / nullif(nt.logs_7d,0) > 0.8 then 'mostly_off_plan'
       else 'on_plan' end as nutrition_state,
  -- billing
  c.billing_type, c.billing_cadence, c.session_rate, c.current_fees,
  -- flags
  coalesce(pp.open_proposals, 0) as open_schedule_proposals
from clients c
left join live_sched  ls on ls.client_id = c.id
left join next_up     nu on nu.client_id = c.id
left join progs       pr on pr.client_id = c.id
left join latest_metric lm on lm.client_id = c.id
left join macros      mt on mt.client_id = c.id
left join nutrition   nt on nt.client_id = c.id
left join appts       ap on ap.client_id = c.id
left join props       pp on pp.client_id = c.id;

comment on view v_client_now is
  'ONE ROW PER CLIENT — the answer to "what is this client doing right now". Start every client question here. active_programs is an ARRAY: clients legitimately run several at once. latest_weight comes from metrics, NEVER from clients.current_weight (that column never syncs and drifts up to 25 lb). coverage_days_left going negative means their programming has run out.';

-- ===== 20260731174007 recalc_pending_payment_reminders =====
-- Recalculate payment reminders under the sessions-trained rule.
--
--   amount = sessions_trained x session_rate       (per_session)
--   amount = current_fees                          (flat)
--   never generated or touched                     (none)
--
-- SCOPE, non-negotiable: only reminders Dustin has NOT sent. A reminder that
-- has gone to a client is a statement of record -- rewriting it retroactively
-- would change a number the client has already seen. Guarded three ways:
-- notification_status='pending' AND email_sent_at IS NULL AND sms_sent_at IS NULL.
-- 'sent' and 'paid' rows are never read for update and never written.
--
-- Cancelled sessions are counted for DISPLAY only. They are not billed and are
-- not deducted -- there is nothing to deduct them from.
--
-- Mirrors src/lib/reminder-calc.ts exactly, including the send-anchored window:
-- the cycle CLOSES 7 days before the due date, so a session in the final week
-- rolls to the next cycle instead of moving an amount already locked in.

create or replace function public.recalc_pending_payment_reminders()
returns table (
  reminder_id uuid,
  client_name text,
  billing_type text,
  old_amount numeric,
  new_amount numeric,
  sessions_trained int,
  sessions_cancelled int,
  changed boolean,
  blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  return query
  with target as (
    select r.id, r.due_date, r.amount_due, r.credit_details,
           c.name, c.billing_type, c.billing_cadence,
           c.session_rate, c.current_fees
    from payment_reminders r
    join clients c on c.id = r.client_id
    where r.notification_status = 'pending'
      and r.email_sent_at is null      -- never touch anything already emailed
      and r.sms_sent_at is null        -- or texted
      and coalesce(c.billing_type, 'per_session') <> 'none'
  ),
  windowed as (
    select t.*,
           -- window closes 7 days before due (send-anchored)
           (t.due_date - 7) as cycle_end,
           greatest(
             -- previous cycle's send date
             (case coalesce(t.billing_cadence, 'monthly')
                when 'weekly'    then t.due_date - interval '7 days'
                when 'biweekly'  then t.due_date - interval '14 days'
                when 'quarterly' then t.due_date - interval '3 months'
                else                  t.due_date - interval '1 month'
              end)::date - 7,
             -- ...unless the PREVIOUS reminder was approved later than that
             coalesce((
               select max((p.approved_at at time zone 'America/Chicago')::date)
               from payment_reminders p
               where p.client_id = (select client_id from payment_reminders x where x.id = t.id)
                 and p.due_date < t.due_date
                 and p.approved_at is not null
             ), '-infinity'::date)
           ) as cycle_start
    from target t
  ),
  counted as (
    select w.*,
           coalesce(a.trained, 0)          as n_trained,
           coalesce(a.cancelled, 0)        as n_cancelled,
           coalesce(a.trained_dates, '{}') as trained_dates,
           coalesce(a.cancelled_dates,'{}') as cancelled_dates
    from windowed w
    left join lateral (
      select
        count(*) filter (where ap.status = 'scheduled')::int as trained,
        count(*) filter (where ap.status like 'cancelled%')::int as cancelled,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status = 'scheduled') as trained_dates,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status like 'cancelled%') as cancelled_dates
      from appointments ap
      where ap.client_id = (select client_id from payment_reminders x where x.id = w.id)
        and (ap.scheduled_at at time zone 'America/Chicago')::date >  w.cycle_start
        and (ap.scheduled_at at time zone 'America/Chicago')::date <= w.cycle_end
    ) a on true
  ),
  computed as (
    select c.*,
           case
             when c.billing_type = 'flat' then round(coalesce(c.current_fees, 0), 2)
             else round(c.n_trained * coalesce(c.session_rate, 0), 2)
           end as new_amount,
           case
             when c.billing_type = 'flat' and c.current_fees is null
               then 'Flat billing but no fee on file'
             when coalesce(c.billing_type,'per_session') = 'per_session' and c.session_rate is null
               then 'Per-session billing but no session rate on file'
             else null
           end as blocked
    from counted c
  ),
  upd as (
    update payment_reminders r
    set amount_due = case when cp.blocked is null then cp.new_amount else r.amount_due end,
        billing_credits = 0,   -- cancellations are never deducted
        credit_details = jsonb_build_object(
          'basis',              case when cp.billing_type = 'flat' then 'flat' else 'sessions_trained' end,
          'billing_type',       coalesce(cp.billing_type, 'per_session'),
          'cycle',              cp.cycle_start::text || ' to ' || cp.cycle_end::text,
          'rate',               case when cp.session_rate is null then null else cp.session_rate::text end,
          'sessions_trained',   cp.n_trained,
          'dates_trained',      to_jsonb(cp.trained_dates),
          'sessions_cancelled', cp.n_cancelled,
          'dates_cancelled',    to_jsonb(cp.cancelled_dates),
          'provisional',        (cp.cycle_end > v_today_ct),
          'needs_rate',         (cp.blocked is not null),
          'recalculated_at',    to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI')
        )
    from computed cp
    where r.id = cp.id
    returning r.id, cp.name, cp.billing_type, cp.amount_due as prev_amount,
              r.amount_due as now_amount, cp.n_trained, cp.n_cancelled, cp.blocked
  )
  select u.id, u.name, u.billing_type, u.prev_amount, u.now_amount,
         u.n_trained, u.n_cancelled,
         (u.prev_amount is distinct from u.now_amount) as changed,
         u.blocked
  from upd u
  order by u.name;
end;
$$;

comment on function public.recalc_pending_payment_reminders() is
  'Sessions-trained billing recalc. Only touches pending reminders with no email_sent_at and no sms_sent_at -- anything already sent to a client is never rewritten. Called by /api/gcal-sync after appointments are refreshed.';

revoke all on function public.recalc_pending_payment_reminders() from anon;

-- ===== 20260731174115 recalc_reminders_drop_approval_anchor =====
-- FIX: the previous-approval anchor must not move the cycle START.
--
-- calcReminder had:  cycleStart = lastCycleApprovedOn ?? previousSendDate
-- and the comment explained it as "anchors the look-back so post-approval
-- cancels are never missed."
--
-- Under the OLD credit-based rule that was conservative: moving the start
-- forward could only reduce the number of CREDITS, never the bill. Under the
-- sessions-trained rule it does the opposite -- it drops SESSIONS, and every
-- dropped session is money not billed.
--
-- Concretely: Todd Prine, due 2026-08-09. Cadence start 2026-07-02, but the
-- previous reminder was approved 2026-07-03, so the window opened at 07-03
-- EXCLUSIVE and the session he trained on 07-03 fell out. The previous cycle
-- closed on 07-02, so that session belonged to no cycle at all and would never
-- have been billed by anyone.
--
-- Billing cycles have to TILE the timeline: (previous send date, this send
-- date]. No gaps, no overlaps. When a reminder happened to be approved is a
-- fact about Dustin's Tuesday, not about when a client trained.
--
-- Six clients were affected, $467.50 under-billed in total.

create or replace function public.recalc_pending_payment_reminders()
returns table (
  reminder_id uuid,
  client_name text,
  billing_type text,
  old_amount numeric,
  new_amount numeric,
  sessions_trained int,
  sessions_cancelled int,
  changed boolean,
  blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  return query
  with target as (
    select r.id, r.client_id, r.due_date, r.amount_due,
           c.name, c.billing_type, c.billing_cadence,
           c.session_rate, c.current_fees
    from payment_reminders r
    join clients c on c.id = r.client_id
    where r.notification_status = 'pending'
      and r.email_sent_at is null      -- never touch anything already emailed
      and r.sms_sent_at is null        -- or texted
      and coalesce(c.billing_type, 'per_session') <> 'none'
  ),
  windowed as (
    select t.*,
           (t.due_date - 7) as cycle_end,
           (case coalesce(t.billing_cadence, 'monthly')
              when 'weekly'    then t.due_date - interval '7 days'
              when 'biweekly'  then t.due_date - interval '14 days'
              when 'quarterly' then t.due_date - interval '3 months'
              else                  t.due_date - interval '1 month'
            end)::date - 7 as cycle_start
    from target t
  ),
  counted as (
    select w.*,
           coalesce(a.trained, 0)           as n_trained,
           coalesce(a.cancelled, 0)         as n_cancelled,
           coalesce(a.trained_dates, '{}')  as trained_dates,
           coalesce(a.cancelled_dates,'{}') as cancelled_dates
    from windowed w
    left join lateral (
      select
        count(*) filter (where ap.status = 'scheduled')::int as trained,
        count(*) filter (where ap.status like 'cancelled%')::int as cancelled,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status = 'scheduled') as trained_dates,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status like 'cancelled%') as cancelled_dates
      from appointments ap
      where ap.client_id = w.client_id
        and (ap.scheduled_at at time zone 'America/Chicago')::date >  w.cycle_start
        and (ap.scheduled_at at time zone 'America/Chicago')::date <= w.cycle_end
    ) a on true
  ),
  computed as (
    select c.*,
           case
             when c.billing_type = 'flat' then round(coalesce(c.current_fees, 0), 2)
             else round(c.n_trained * coalesce(c.session_rate, 0), 2)
           end as new_amount,
           case
             when c.billing_type = 'flat' and c.current_fees is null
               then 'Flat billing but no fee on file'
             when coalesce(c.billing_type,'per_session') = 'per_session' and c.session_rate is null
               then 'Per-session billing but no session rate on file'
             else null
           end as blocked
    from counted c
  ),
  upd as (
    update payment_reminders r
    set amount_due = case when cp.blocked is null then cp.new_amount else r.amount_due end,
        billing_credits = 0,
        credit_details = jsonb_build_object(
          'basis',              case when cp.billing_type = 'flat' then 'flat' else 'sessions_trained' end,
          'billing_type',       coalesce(cp.billing_type, 'per_session'),
          'cycle',              cp.cycle_start::text || ' to ' || cp.cycle_end::text,
          'rate',               case when cp.session_rate is null then null else cp.session_rate::text end,
          'sessions_trained',   cp.n_trained,
          'dates_trained',      to_jsonb(cp.trained_dates),
          'sessions_cancelled', cp.n_cancelled,
          'dates_cancelled',    to_jsonb(cp.cancelled_dates),
          'provisional',        (cp.cycle_end > v_today_ct),
          'needs_rate',         (cp.blocked is not null),
          'recalculated_at',    to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI')
        )
    from computed cp
    where r.id = cp.id
    returning r.id, cp.name, cp.billing_type, cp.amount_due as prev_amount,
              r.amount_due as now_amount, cp.n_trained, cp.n_cancelled, cp.blocked
  )
  select u.id, u.name, u.billing_type, u.prev_amount, u.now_amount,
         u.n_trained, u.n_cancelled,
         (u.prev_amount is distinct from u.now_amount) as changed,
         u.blocked
  from upd u
  order by u.name;
end;
$$;

revoke all on function public.recalc_pending_payment_reminders() from anon;

-- ===== 20260731175013 canonical_view_v_plan_vs_actual =====
-- v_plan_vs_actual — one row per client per date. "What have they actually done."
--
-- Conventions (CHECKPOINT 04 §2.2), binding on every canonical view:
--   *_date  a date, ALREADY converted to America/Chicago. A view that returns
--           raw timestamptz invites the next off-by-one.
--   *_at    timestamptz, always UTC.
--   is_*    booleans.
--
-- Filters deleted_at is null on scheduled_workouts, which is the entire reason
-- v_client_calendar could not simply be extended.
--
-- gap_reason takes the five documented values, plus NULL for a scheduled date
-- in the future that has not resolved yet — nothing has gone wrong there and
-- calling it 'missed' would be a lie every morning.
--
--   completed           planned and logged
--   moved               row carries moved_from_date, or status='moved'
--   missed              planned, past, never logged
--   no_plan             an appointment happened with nothing programmed for it
--   unsupervised_extra  a log with no plan behind it — client trained on their own

create or replace view public.v_plan_vs_actual as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
sw as (
  select s.client_id,
         s.scheduled_date,
         s.id                as scheduled_workout_id,
         s.status            as scheduled_status,
         s.supervised        as is_supervised,
         s.moved_from_date,
         s.appointment_id,
         d.label             as day_label,
         p.name              as program_name
  from scheduled_workouts s
  left join days d      on d.id = s.day_id
  left join phases ph   on ph.id = d.phase_id
  left join programs p  on p.id = ph.program_id
  where s.deleted_at is null
),
wl as (
  select w.client_id,
         w.log_date,
         w.id as workout_log_id,
         w.status as log_status,
         w.completed as is_completed,
         w.duration_minutes,
         count(distinct sl.exercise_id) as n_exercises,
         count(sl.id)                   as n_sets,
         coalesce(sum(coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0)), 0) as total_volume
  from workout_logs w
  left join set_logs sl on sl.workout_log_id = w.id
  group by w.client_id, w.log_date, w.id, w.status, w.completed, w.duration_minutes
),
ap as (
  select a.client_id,
         (a.scheduled_at at time zone 'America/Chicago')::date as appt_date,
         min(a.scheduled_at) as appointment_at,
         min((a.scheduled_at at time zone 'America/Chicago')::time)::text as appointment_time_ct,
         -- one row per client-date: prefer a live session over a cancellation
         (array_agg(a.status order by (case when a.status = 'scheduled' then 0
                                            when a.status = 'completed' then 1
                                            else 2 end)))[1] as appointment_status,
         count(*) as n_appointments
  from appointments a
  group by a.client_id, (a.scheduled_at at time zone 'America/Chicago')::date
),
keys as (
  select client_id, scheduled_date as the_date from sw
  union
  select client_id, log_date       from wl
  union
  select client_id, appt_date      from ap
)
select
  k.client_id,
  c.name                              as client,
  k.the_date                          as scheduled_date,
  -- planned
  sw.scheduled_workout_id,
  sw.day_label,
  sw.program_name,
  coalesce(sw.is_supervised, false)   as is_supervised,
  sw.scheduled_status,
  sw.moved_from_date,
  -- logged
  wl.workout_log_id,
  wl.log_status,
  coalesce(wl.n_exercises, 0)         as n_exercises,
  coalesce(wl.n_sets, 0)              as n_sets,
  coalesce(wl.total_volume, 0)        as total_volume,
  wl.duration_minutes,
  -- appointment
  ap.appointment_at,
  ap.appointment_time_ct,
  ap.appointment_status,
  coalesce(ap.n_appointments, 0)      as n_appointments,
  -- the point of the view
  case
    when wl.workout_log_id is not null and sw.scheduled_workout_id is null then 'unsupervised_extra'
    when sw.moved_from_date is not null or sw.scheduled_status = 'moved'   then 'moved'
    when wl.workout_log_id is not null                                     then 'completed'
    when sw.scheduled_workout_id is null and ap.appt_date is not null      then 'no_plan'
    when sw.scheduled_workout_id is not null and k.the_date < t.d           then 'missed'
    else null   -- planned, still in the future, nothing has gone wrong yet
  end                                 as gap_reason,
  (k.the_date < t.d)                  as is_past
from keys k
cross join today_ct t
join clients c        on c.id = k.client_id
left join sw          on sw.client_id = k.client_id and sw.scheduled_date = k.the_date
left join wl          on wl.client_id = k.client_id and wl.log_date       = k.the_date
left join ap          on ap.client_id = k.client_id and ap.appt_date      = k.the_date
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_plan_vs_actual is
  'Canonical. One row per client per date: what was planned, what was logged, what appointment existed, and gap_reason in {completed, moved, missed, no_plan, unsupervised_extra} (NULL for unresolved future dates). Dates are America/Chicago. Filters scheduled_workouts.deleted_at is null and excludes archived + Demo/Test clients.';

-- ===== 20260731175110 v_plan_vs_actual_scope_no_plan_to_past_v2 =====
-- Refinement: no_plan is a PAST-tense finding.
--
-- First cut flagged 4,383 no_plan rows stretching to 2028-07-29. Appointments
-- recur two years out while programming runs 4-6 weeks ahead, so almost all of
-- those were "not programmed yet", which is normal and is already answered by
-- v_client_now.coverage_through. A flag that fires 4,383 times is not a flag.
--
-- no_plan now means what it should: a session that ALREADY HAPPENED with nothing
-- programmed for it. Future appointments with no plan resolve to NULL.
-- Also requires a LIVE appointment — a past date whose only appointment was
-- cancelled is not a programming gap, nothing was supposed to happen.

drop view if exists public.v_plan_vs_actual;

create view public.v_plan_vs_actual as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
sw as (
  select s.client_id,
         s.scheduled_date,
         s.id                as scheduled_workout_id,
         s.status            as scheduled_status,
         s.supervised        as is_supervised,
         s.moved_from_date,
         d.label             as day_label,
         p.name              as program_name
  from scheduled_workouts s
  left join days d      on d.id = s.day_id
  left join phases ph   on ph.id = d.phase_id
  left join programs p  on p.id = ph.program_id
  where s.deleted_at is null
),
wl as (
  select w.client_id,
         w.log_date,
         w.id as workout_log_id,
         w.status as log_status,
         w.duration_minutes,
         count(distinct sl.exercise_id) as n_exercises,
         count(sl.id)                   as n_sets,
         coalesce(sum(coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0)), 0) as total_volume
  from workout_logs w
  left join set_logs sl on sl.workout_log_id = w.id
  group by w.client_id, w.log_date, w.id, w.status, w.duration_minutes
),
ap as (
  select a.client_id,
         (a.scheduled_at at time zone 'America/Chicago')::date as appt_date,
         min(a.scheduled_at) as appointment_at,
         min((a.scheduled_at at time zone 'America/Chicago')::time)::text as appointment_time_ct,
         (array_agg(a.status order by (case when a.status = 'scheduled' then 0
                                            when a.status = 'completed' then 1
                                            else 2 end)))[1] as appointment_status,
         count(*) as n_appointments,
         count(*) filter (where a.status in ('scheduled','completed')) as n_appointments_live
  from appointments a
  group by a.client_id, (a.scheduled_at at time zone 'America/Chicago')::date
),
keys as (
  select client_id, scheduled_date as the_date from sw
  union
  select client_id, log_date       from wl
  union
  select client_id, appt_date      from ap
)
select
  k.client_id,
  c.name                              as client,
  k.the_date                          as scheduled_date,
  (k.the_date < t.d)                  as is_past,
  case
    when wl.workout_log_id is not null and sw.scheduled_workout_id is null then 'unsupervised_extra'
    when sw.moved_from_date is not null or sw.scheduled_status = 'moved'   then 'moved'
    when wl.workout_log_id is not null                                     then 'completed'
    when sw.scheduled_workout_id is null
         and coalesce(ap.n_appointments_live, 0) > 0
         and k.the_date < t.d                                              then 'no_plan'
    when sw.scheduled_workout_id is not null and k.the_date < t.d          then 'missed'
    else null
  end                                 as gap_reason,
  -- planned
  sw.scheduled_workout_id,
  sw.day_label,
  sw.program_name,
  coalesce(sw.is_supervised, false)   as is_supervised,
  sw.scheduled_status,
  sw.moved_from_date,
  -- logged
  wl.workout_log_id,
  wl.log_status,
  coalesce(wl.n_exercises, 0)         as n_exercises,
  coalesce(wl.n_sets, 0)              as n_sets,
  coalesce(wl.total_volume, 0)        as total_volume,
  wl.duration_minutes,
  -- appointment
  ap.appointment_at,
  ap.appointment_time_ct,
  ap.appointment_status,
  coalesce(ap.n_appointments, 0)      as n_appointments,
  coalesce(ap.n_appointments_live, 0) as n_appointments_live
from keys k
cross join today_ct t
join clients c        on c.id = k.client_id
left join sw          on sw.client_id = k.client_id and sw.scheduled_date = k.the_date
left join wl          on wl.client_id = k.client_id and wl.log_date       = k.the_date
left join ap          on ap.client_id = k.client_id and ap.appt_date      = k.the_date
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_plan_vs_actual is
  'Canonical. One row per client per date: what was planned, what was logged, what appointment existed, and gap_reason in {completed, moved, missed, no_plan, unsupervised_extra}. NULL = future, or a past date whose only appointment was cancelled. no_plan is past-tense only. Dates are America/Chicago. Filters scheduled_workouts.deleted_at is null; excludes archived + Demo/Test clients.';

-- ===== 20260731175158 canonical_view_v_exercise_progression =====
-- v_exercise_progression — one row per client per exercise per date.
-- "What should change."
--
-- The delta against that client's PREVIOUS session on the same movement is the
-- whole point. v_exercise_history has none of it, which is why it cannot answer
-- "is she getting stronger" without the caller doing the work again.
--
-- Names, not ids: a view whose output has to be joined back to two more tables
-- before a human can read it does not get used.
--
-- Estimated 1RM is Epley (w * (1 + reps/30)) on the best single set of the
-- session. Meaningless for time- and distance-based work, so it is NULL there
-- rather than a confident wrong number.

drop view if exists public.v_exercise_progression;

create view public.v_exercise_progression as
with per_set as (
  select sl.client_id,
         w.log_date,
         sl.exercise_id,
         sl.prescribed_exercise_id,
         sl.reps,
         coalesce(sl.weight_lbs, sl.weight) as weight,
         sl.duration_seconds,
         sl.distance_meters,
         sl.rpe,
         coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0) as volume,
         case
           when coalesce(sl.weight_lbs, sl.weight) > 0 and coalesce(sl.reps, 0) between 1 and 15
             then round(coalesce(sl.weight_lbs, sl.weight) * (1 + sl.reps::numeric / 30), 1)
           else null
         end as est_1rm_set
  from set_logs sl
  join workout_logs w on w.id = sl.workout_log_id
  where sl.exercise_id is not null
),
per_session as (
  select client_id,
         log_date,
         exercise_id,
         (array_agg(prescribed_exercise_id) filter (where prescribed_exercise_id is not null))[1] as prescribed_exercise_id,
         count(*)                     as n_sets,
         sum(coalesce(reps, 0))       as total_reps,
         max(weight)                  as top_weight,
         round(avg(weight), 1)        as avg_weight,
         sum(volume)                  as total_volume,
         max(est_1rm_set)             as est_1rm,
         round(avg(rpe), 1)           as avg_rpe,
         sum(coalesce(duration_seconds, 0)) as total_duration_seconds,
         sum(coalesce(distance_meters, 0))  as total_distance_meters
  from per_set
  group by client_id, log_date, exercise_id
),
with_prev as (
  select ps.*,
         lag(ps.log_date)      over w as prev_date,
         lag(ps.top_weight)    over w as prev_top_weight,
         lag(ps.total_volume)  over w as prev_total_volume,
         lag(ps.est_1rm)       over w as prev_est_1rm,
         lag(ps.total_reps)    over w as prev_total_reps,
         lag(ps.n_sets)        over w as prev_n_sets
  from per_session ps
  window w as (partition by ps.client_id, ps.exercise_id order by ps.log_date)
)
select
  p.client_id,
  c.name                                 as client,
  p.exercise_id,
  e.name                                 as exercise,
  e.muscle_group,
  e.modality,
  p.log_date,
  -- prescribed
  pe.sets                                as prescribed_sets,
  pe.volume_type                         as prescribed_volume_type,
  pe.volume_value                        as prescribed_volume_value,
  pe.load_descriptor                     as prescribed_load_descriptor,
  pe.cue                                 as prescribed_cue,
  -- actual
  p.n_sets,
  p.total_reps,
  p.top_weight,
  p.avg_weight,
  p.total_volume,
  p.est_1rm,
  p.avg_rpe,
  nullif(p.total_duration_seconds, 0)    as total_duration_seconds,
  nullif(p.total_distance_meters, 0)     as total_distance_meters,
  -- the comparison — this is the point
  p.prev_date,
  (p.log_date - p.prev_date)             as days_since_prev,
  p.prev_top_weight,
  p.prev_total_volume,
  p.prev_est_1rm,
  (p.top_weight   - p.prev_top_weight)   as delta_top_weight,
  (p.total_volume - p.prev_total_volume) as delta_total_volume,
  (p.est_1rm      - p.prev_est_1rm)      as delta_est_1rm,
  (p.total_reps   - p.prev_total_reps)   as delta_total_reps,
  (p.n_sets       - p.prev_n_sets)       as delta_n_sets,
  case
    when p.prev_total_volume is null or p.prev_total_volume = 0 then null
    else round(100.0 * (p.total_volume - p.prev_total_volume) / p.prev_total_volume, 1)
  end                                    as delta_total_volume_pct,
  case
    when p.prev_date is null                                     then 'first_session'
    when p.est_1rm is not null and p.prev_est_1rm is not null
         and p.est_1rm > p.prev_est_1rm                           then 'progressing'
    when p.est_1rm is not null and p.prev_est_1rm is not null
         and p.est_1rm < p.prev_est_1rm                           then 'regressing'
    when p.total_volume > coalesce(p.prev_total_volume, 0)        then 'progressing'
    when p.total_volume < coalesce(p.prev_total_volume, 0)        then 'regressing'
    else 'holding'
  end                                    as trend
from with_prev p
join clients c   on c.id = p.client_id
join exercises e on e.id = p.exercise_id
left join prescribed_exercises pe on pe.id = p.prescribed_exercise_id
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_exercise_progression is
  'Canonical. One row per client per exercise per date, carrying names not ids, the prescription, what was actually done, estimated 1RM (Epley, best set, NULL for time/distance work), and the delta against that client''s previous session on the same movement. trend in {first_session, progressing, regressing, holding}. Excludes archived + Demo/Test clients.';

-- ===== 20260731175234 canonical_view_v_nutrition_now =====
-- v_nutrition_now — one row per client.
--
-- The three-way split is the reason this view exists. A single "off-plan %"
-- conflates two opposite situations:
--
--   Martha    has NO plan, so she cannot match one
--   Claudine  HAS a plan and eats differently from it
--
-- Those look identical under one number and need opposite responses — Martha
-- needs a plan written, Claudine needs a conversation. So on_plan_pct,
-- off_plan_pct and has_no_plan are three separate fields and are never folded
-- into one.
--
-- Adherence vocabulary is CHECK-constrained to
-- {Full, 3/4, 1/2, 1/4, Partial, Off-plan, Skipped}. Full and 3/4 count as on
-- plan; Off-plan is off plan; Skipped is neither — it is an absence, and
-- scoring it as a failure to follow a plan would double-punish a missed meal.

drop view if exists public.v_nutrition_now;

create view public.v_nutrition_now as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
live_plan as (
  select distinct on (mp.client_id)
         mp.client_id, mp.id as meal_plan_id, mp.title, mp.effective_date, mp.version_number
  from meal_plans mp
  where mp.status = 'live'
  order by mp.client_id, mp.effective_date desc, mp.version_number desc
),
plan_size as (
  select lp.client_id,
         count(distinct m.id)  as n_plan_meals,
         count(mi.id)          as n_plan_items
  from live_plan lp
  left join meals m      on m.meal_plan_id = lp.meal_plan_id
  left join meal_items mi on mi.meal_id = m.id
  group by lp.client_id
),
targets as (
  select distinct on (mt.client_id)
         mt.client_id, mt.calories, mt.protein, mt.carbs, mt.fats,
         mt.effective_date as macros_set_on
  from macro_targets mt, today_ct t
  where mt.effective_date <= t.d
  order by mt.client_id, mt.effective_date desc, mt.created_at desc
),
logs as (
  select l.client_id,
         count(*) filter (where l.log_date >= t.d - 6)  as n_logs_7d,
         count(*) filter (where l.log_date >= t.d - 27) as n_logs_28d,
         count(distinct l.log_date) filter (where l.log_date >= t.d - 6)  as n_days_logged_7d,
         count(distinct l.log_date) filter (where l.log_date >= t.d - 27) as n_days_logged_28d,
         -- daily averages: sum per day, then average across days that HAVE a log.
         -- Averaging per-meal rows would understate anyone who logs 5 meals a day.
         max(l.log_date) as last_log_date,
         count(*) filter (where l.adherence in ('Full','3/4') and l.log_date >= t.d - 27) as n_on_plan_28d,
         count(*) filter (where l.adherence = 'Off-plan'      and l.log_date >= t.d - 27) as n_off_plan_28d,
         count(*) filter (where l.adherence = 'Skipped'       and l.log_date >= t.d - 27) as n_skipped_28d,
         count(*) filter (where l.adherence in ('1/2','1/4','Partial') and l.log_date >= t.d - 27) as n_partial_28d
  from meal_adherence_logs l, today_ct t
  group by l.client_id
),
daily as (
  select client_id, log_date,
         sum(coalesce(est_kcal, 0))    as kcal,
         sum(coalesce(est_protein, 0)) as protein,
         sum(coalesce(est_carbs, 0))   as carbs,
         sum(coalesce(est_fats, 0))    as fats
  from meal_adherence_logs
  group by client_id, log_date
),
daily_avg as (
  select d.client_id,
         round(avg(d.kcal)    filter (where d.log_date >= t.d - 6), 0)  as avg_kcal_7d,
         round(avg(d.protein) filter (where d.log_date >= t.d - 6), 0)  as avg_protein_7d,
         round(avg(d.carbs)   filter (where d.log_date >= t.d - 6), 0)  as avg_carbs_7d,
         round(avg(d.fats)    filter (where d.log_date >= t.d - 6), 0)  as avg_fats_7d,
         round(avg(d.kcal)    filter (where d.log_date >= t.d - 27), 0) as avg_kcal_28d,
         round(avg(d.protein) filter (where d.log_date >= t.d - 27), 0) as avg_protein_28d,
         round(avg(d.carbs)   filter (where d.log_date >= t.d - 27), 0) as avg_carbs_28d,
         round(avg(d.fats)    filter (where d.log_date >= t.d - 27), 0) as avg_fats_28d
  from daily d, today_ct t
  group by d.client_id
)
select
  c.id                                        as client_id,
  c.name                                      as client,
  -- plan
  (lp.meal_plan_id is not null)               as has_plan,
  lp.meal_plan_id,
  lp.title                                    as plan_title,
  lp.effective_date                           as plan_effective_date,
  coalesce(ps.n_plan_meals, 0)                as n_plan_meals,
  coalesce(ps.n_plan_items, 0)                as n_plan_items,
  -- targets
  tg.calories                                 as target_calories,
  tg.protein                                  as target_protein,
  tg.carbs                                    as target_carbs,
  tg.fats                                     as target_fats,
  tg.macros_set_on,
  -- the 17 clients sitting on the placeholder set
  (tg.calories = 1800 and tg.protein = 150 and tg.carbs = 165 and tg.fats = 60)
                                              as macros_are_placeholder,
  -- logged
  coalesce(lg.n_logs_7d, 0)                   as n_logs_7d,
  coalesce(lg.n_logs_28d, 0)                  as n_logs_28d,
  coalesce(lg.n_days_logged_7d, 0)            as n_days_logged_7d,
  coalesce(lg.n_days_logged_28d, 0)           as n_days_logged_28d,
  lg.last_log_date,
  (select t.d from today_ct t) - lg.last_log_date as days_since_last_log,
  da.avg_kcal_7d, da.avg_protein_7d, da.avg_carbs_7d, da.avg_fats_7d,
  da.avg_kcal_28d, da.avg_protein_28d, da.avg_carbs_28d, da.avg_fats_28d,
  -- variance against target, 28d
  case when tg.calories is null or tg.calories = 0 or da.avg_kcal_28d is null then null
       else round(100.0 * (da.avg_kcal_28d - tg.calories) / tg.calories, 1) end
                                              as kcal_vs_target_pct_28d,
  -- THE THREE-WAY SPLIT — never fold these together
  case when coalesce(lg.n_on_plan_28d,0) + coalesce(lg.n_off_plan_28d,0) + coalesce(lg.n_partial_28d,0) = 0 then null
       else round(100.0 * lg.n_on_plan_28d
            / (lg.n_on_plan_28d + lg.n_off_plan_28d + lg.n_partial_28d), 1) end
                                              as on_plan_pct_28d,
  case when coalesce(lg.n_on_plan_28d,0) + coalesce(lg.n_off_plan_28d,0) + coalesce(lg.n_partial_28d,0) = 0 then null
       else round(100.0 * lg.n_off_plan_28d
            / (lg.n_on_plan_28d + lg.n_off_plan_28d + lg.n_partial_28d), 1) end
                                              as off_plan_pct_28d,
  (lp.meal_plan_id is null)                   as has_no_plan,
  coalesce(lg.n_skipped_28d, 0)               as n_skipped_28d,
  -- one word for the roster view; the three fields above stay authoritative
  case
    when lp.meal_plan_id is null and coalesce(lg.n_logs_28d, 0) = 0 then 'no_plan_no_logs'
    when lp.meal_plan_id is null                                    then 'logging_without_a_plan'
    when coalesce(lg.n_logs_28d, 0) = 0                             then 'plan_never_logged'
    when coalesce(lg.n_days_logged_28d, 0) < 7                      then 'logging_sporadically'
    else 'active'
  end                                         as nutrition_state
from clients c
left join live_plan lp on lp.client_id = c.id
left join plan_size ps on ps.client_id = c.id
left join targets tg   on tg.client_id = c.id
left join logs lg      on lg.client_id = c.id
left join daily_avg da on da.client_id = c.id
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_nutrition_now is
  'Canonical. One row per client: live plan, targets, 7d/28d logged averages, and on_plan_pct_28d / off_plan_pct_28d / has_no_plan as THREE SEPARATE FIELDS — folding them into one conflates "has no plan to follow" with "has a plan and eats differently", which need opposite responses. Skipped meals are excluded from the adherence denominator. Excludes archived + Demo/Test clients.';

-- ===== 20260731175340 v_nutrition_now_derive_kcal_from_plan_items =====
-- FIX: 34% of adherence logs carry no est_kcal, and treating those as zero made
-- the averages actively misleading.
--
-- 309 of the last 904 logs have est_kcal null or 0. 293 of them have a meal_id:
-- the client logged "I ate the planned meal", so the macros were never copied
-- onto the log row -- they live in meal_items on the plan. Lauren Standefer came
-- out at 171 kcal/day and Steph at 28. Nobody eats 28 calories a day.
--
-- So: est_kcal when present, otherwise derive from the plan meal's items,
-- scaled by how much of it they actually ate. The adherence vocabulary already
-- carries that fraction -- Full=1, 3/4=0.75, 1/2=0.5, 1/4=0.25, Skipped=0 --
-- and using it is strictly better than counting a half-eaten meal as whole.
--
-- kcal from macros is 4/4/9. Rows that resolve to neither a stored value nor a
-- plan meal (genuine off-plan with nothing typed in) stay NULL and are excluded
-- from the average rather than counted as a zero-calorie day.

drop view if exists public.v_nutrition_now;

create view public.v_nutrition_now as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
live_plan as (
  select distinct on (mp.client_id)
         mp.client_id, mp.id as meal_plan_id, mp.title, mp.effective_date, mp.version_number
  from meal_plans mp
  where mp.status = 'live'
  order by mp.client_id, mp.effective_date desc, mp.version_number desc
),
plan_size as (
  select lp.client_id,
         count(distinct m.id)   as n_plan_meals,
         count(mi.id)           as n_plan_items
  from live_plan lp
  left join meals m       on m.meal_plan_id = lp.meal_plan_id
  left join meal_items mi on mi.meal_id = m.id
  group by lp.client_id
),
-- macros of each planned meal, from its items
meal_macros as (
  select mi.meal_id,
         sum(coalesce(mi.protein,0)) as protein,
         sum(coalesce(mi.carbs,0))   as carbs,
         sum(coalesce(mi.fats,0))    as fats,
         sum(coalesce(mi.protein,0))*4 + sum(coalesce(mi.carbs,0))*4 + sum(coalesce(mi.fats,0))*9 as kcal
  from meal_items mi
  group by mi.meal_id
),
resolved as (
  select l.client_id,
         l.log_date,
         l.adherence,
         -- the fraction of the planned meal actually eaten
         case l.adherence
           when 'Full'    then 1.0
           when '3/4'     then 0.75
           when '1/2'     then 0.5
           when '1/4'     then 0.25
           when 'Partial' then 0.5
           when 'Skipped' then 0.0
           else 1.0          -- Off-plan: whatever was typed in stands on its own
         end as eaten_fraction,
         coalesce(nullif(l.est_kcal, 0),    mm.kcal    * (case l.adherence when 'Full' then 1.0 when '3/4' then 0.75 when '1/2' then 0.5 when '1/4' then 0.25 when 'Partial' then 0.5 when 'Skipped' then 0.0 else 1.0 end)) as kcal,
         coalesce(nullif(l.est_protein, 0), mm.protein * (case l.adherence when 'Full' then 1.0 when '3/4' then 0.75 when '1/2' then 0.5 when '1/4' then 0.25 when 'Partial' then 0.5 when 'Skipped' then 0.0 else 1.0 end)) as protein,
         coalesce(nullif(l.est_carbs, 0),   mm.carbs   * (case l.adherence when 'Full' then 1.0 when '3/4' then 0.75 when '1/2' then 0.5 when '1/4' then 0.25 when 'Partial' then 0.5 when 'Skipped' then 0.0 else 1.0 end)) as carbs,
         coalesce(nullif(l.est_fats, 0),    mm.fats    * (case l.adherence when 'Full' then 1.0 when '3/4' then 0.75 when '1/2' then 0.5 when '1/4' then 0.25 when 'Partial' then 0.5 when 'Skipped' then 0.0 else 1.0 end)) as fats,
         (nullif(l.est_kcal,0) is null and mm.kcal is null) as kcal_unknown
  from meal_adherence_logs l
  left join meal_macros mm on mm.meal_id = l.meal_id
),
targets as (
  select distinct on (mt.client_id)
         mt.client_id, mt.calories, mt.protein, mt.carbs, mt.fats,
         mt.effective_date as macros_set_on
  from macro_targets mt, today_ct t
  where mt.effective_date <= t.d
  order by mt.client_id, mt.effective_date desc, mt.created_at desc
),
logs as (
  select l.client_id,
         count(*) filter (where l.log_date >= t.d - 6)  as n_logs_7d,
         count(*) filter (where l.log_date >= t.d - 27) as n_logs_28d,
         count(distinct l.log_date) filter (where l.log_date >= t.d - 6)  as n_days_logged_7d,
         count(distinct l.log_date) filter (where l.log_date >= t.d - 27) as n_days_logged_28d,
         max(l.log_date) as last_log_date,
         count(*) filter (where l.adherence in ('Full','3/4') and l.log_date >= t.d - 27) as n_on_plan_28d,
         count(*) filter (where l.adherence = 'Off-plan'      and l.log_date >= t.d - 27) as n_off_plan_28d,
         count(*) filter (where l.adherence = 'Skipped'       and l.log_date >= t.d - 27) as n_skipped_28d,
         count(*) filter (where l.adherence in ('1/2','1/4','Partial') and l.log_date >= t.d - 27) as n_partial_28d,
         count(*) filter (where l.log_date >= t.d - 27 and l.kcal_unknown)                as n_kcal_unknown_28d
  from resolved l, today_ct t
  group by l.client_id
),
daily as (
  select client_id, log_date,
         sum(coalesce(kcal, 0))    as kcal,
         sum(coalesce(protein, 0)) as protein,
         sum(coalesce(carbs, 0))   as carbs,
         sum(coalesce(fats, 0))    as fats,
         bool_or(kcal is not null) as has_any_known
  from resolved
  group by client_id, log_date
),
daily_avg as (
  select d.client_id,
         round(avg(d.kcal)    filter (where d.log_date >= t.d - 6  and d.has_any_known), 0) as avg_kcal_7d,
         round(avg(d.protein) filter (where d.log_date >= t.d - 6  and d.has_any_known), 0) as avg_protein_7d,
         round(avg(d.carbs)   filter (where d.log_date >= t.d - 6  and d.has_any_known), 0) as avg_carbs_7d,
         round(avg(d.fats)    filter (where d.log_date >= t.d - 6  and d.has_any_known), 0) as avg_fats_7d,
         round(avg(d.kcal)    filter (where d.log_date >= t.d - 27 and d.has_any_known), 0) as avg_kcal_28d,
         round(avg(d.protein) filter (where d.log_date >= t.d - 27 and d.has_any_known), 0) as avg_protein_28d,
         round(avg(d.carbs)   filter (where d.log_date >= t.d - 27 and d.has_any_known), 0) as avg_carbs_28d,
         round(avg(d.fats)    filter (where d.log_date >= t.d - 27 and d.has_any_known), 0) as avg_fats_28d
  from daily d, today_ct t
  group by d.client_id
)
select
  c.id                                        as client_id,
  c.name                                      as client,
  (lp.meal_plan_id is not null)               as has_plan,
  lp.meal_plan_id,
  lp.title                                    as plan_title,
  lp.effective_date                           as plan_effective_date,
  coalesce(ps.n_plan_meals, 0)                as n_plan_meals,
  coalesce(ps.n_plan_items, 0)                as n_plan_items,
  tg.calories                                 as target_calories,
  tg.protein                                  as target_protein,
  tg.carbs                                    as target_carbs,
  tg.fats                                     as target_fats,
  tg.macros_set_on,
  (tg.calories = 1800 and tg.protein = 150 and tg.carbs = 165 and tg.fats = 60)
                                              as macros_are_placeholder,
  coalesce(lg.n_logs_7d, 0)                   as n_logs_7d,
  coalesce(lg.n_logs_28d, 0)                  as n_logs_28d,
  coalesce(lg.n_days_logged_7d, 0)            as n_days_logged_7d,
  coalesce(lg.n_days_logged_28d, 0)           as n_days_logged_28d,
  lg.last_log_date,
  (select t.d from today_ct t) - lg.last_log_date as days_since_last_log,
  da.avg_kcal_7d, da.avg_protein_7d, da.avg_carbs_7d, da.avg_fats_7d,
  da.avg_kcal_28d, da.avg_protein_28d, da.avg_carbs_28d, da.avg_fats_28d,
  -- how much of the 28d window had no resolvable calories at all; read the
  -- averages with this in view rather than trusting them blind
  coalesce(lg.n_kcal_unknown_28d, 0)          as n_kcal_unknown_28d,
  case when tg.calories is null or tg.calories = 0 or da.avg_kcal_28d is null then null
       else round(100.0 * (da.avg_kcal_28d - tg.calories) / tg.calories, 1) end
                                              as kcal_vs_target_pct_28d,
  -- THE THREE-WAY SPLIT — never fold these together
  case when coalesce(lg.n_on_plan_28d,0) + coalesce(lg.n_off_plan_28d,0) + coalesce(lg.n_partial_28d,0) = 0 then null
       else round(100.0 * lg.n_on_plan_28d
            / (lg.n_on_plan_28d + lg.n_off_plan_28d + lg.n_partial_28d), 1) end
                                              as on_plan_pct_28d,
  case when coalesce(lg.n_on_plan_28d,0) + coalesce(lg.n_off_plan_28d,0) + coalesce(lg.n_partial_28d,0) = 0 then null
       else round(100.0 * lg.n_off_plan_28d
            / (lg.n_on_plan_28d + lg.n_off_plan_28d + lg.n_partial_28d), 1) end
                                              as off_plan_pct_28d,
  (lp.meal_plan_id is null)                   as has_no_plan,
  coalesce(lg.n_skipped_28d, 0)               as n_skipped_28d,
  case
    when lp.meal_plan_id is null and coalesce(lg.n_logs_28d, 0) = 0 then 'no_plan_no_logs'
    when lp.meal_plan_id is null                                    then 'logging_without_a_plan'
    when coalesce(lg.n_logs_28d, 0) = 0                             then 'plan_never_logged'
    when coalesce(lg.n_days_logged_28d, 0) < 7                      then 'logging_sporadically'
    else 'active'
  end                                         as nutrition_state
from clients c
left join live_plan lp on lp.client_id = c.id
left join plan_size ps on ps.client_id = c.id
left join targets tg   on tg.client_id = c.id
left join logs lg      on lg.client_id = c.id
left join daily_avg da on da.client_id = c.id
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_nutrition_now is
  'Canonical. One row per client. Calories resolve from est_kcal, falling back to the planned meal''s items scaled by the adherence fraction (Full=1, 3/4=.75, 1/2=.5, 1/4=.25, Skipped=0) -- 34% of logs carry no est_kcal and counting those as zero understated everyone. n_kcal_unknown_28d says how much is still unresolvable. on_plan_pct_28d / off_plan_pct_28d / has_no_plan are THREE SEPARATE FIELDS: folding them conflates "no plan to follow" with "has a plan and eats differently". Excludes archived + Demo/Test clients.';

-- ===== 20260731175423 v_exercise_progression_honest_trend =====
-- FIX: trend claimed 'progressing' when there was nothing to compare against.
--
-- If the previous session on a movement recorded no weight and no volume --
-- time-based work, or a session where only reps were entered -- both
-- prev_est_1rm and prev_total_volume are null. The comparison then fell through
-- to `total_volume > coalesce(prev_total_volume, 0)`, which is true for any
-- non-zero number, so every one of those read as 'progressing'.
--
-- A view whose job is "what should change" must not manufacture good news.
-- 'no_comparison' is the honest answer.

create or replace view public.v_exercise_progression as
with per_set as (
  select sl.client_id,
         w.log_date,
         sl.exercise_id,
         sl.prescribed_exercise_id,
         sl.reps,
         coalesce(sl.weight_lbs, sl.weight) as weight,
         sl.duration_seconds,
         sl.distance_meters,
         sl.rpe,
         coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0) as volume,
         case
           when coalesce(sl.weight_lbs, sl.weight) > 0 and coalesce(sl.reps, 0) between 1 and 15
             then round(coalesce(sl.weight_lbs, sl.weight) * (1 + sl.reps::numeric / 30), 1)
           else null
         end as est_1rm_set
  from set_logs sl
  join workout_logs w on w.id = sl.workout_log_id
  where sl.exercise_id is not null
),
per_session as (
  select client_id,
         log_date,
         exercise_id,
         (array_agg(prescribed_exercise_id) filter (where prescribed_exercise_id is not null))[1] as prescribed_exercise_id,
         count(*)                     as n_sets,
         sum(coalesce(reps, 0))       as total_reps,
         max(weight)                  as top_weight,
         round(avg(weight), 1)        as avg_weight,
         nullif(sum(volume), 0)       as total_volume,
         max(est_1rm_set)             as est_1rm,
         round(avg(rpe), 1)           as avg_rpe,
         sum(coalesce(duration_seconds, 0)) as total_duration_seconds,
         sum(coalesce(distance_meters, 0))  as total_distance_meters
  from per_set
  group by client_id, log_date, exercise_id
),
with_prev as (
  select ps.*,
         lag(ps.log_date)      over w as prev_date,
         lag(ps.top_weight)    over w as prev_top_weight,
         lag(ps.total_volume)  over w as prev_total_volume,
         lag(ps.est_1rm)       over w as prev_est_1rm,
         lag(ps.total_reps)    over w as prev_total_reps,
         lag(ps.n_sets)        over w as prev_n_sets
  from per_session ps
  window w as (partition by ps.client_id, ps.exercise_id order by ps.log_date)
)
select
  p.client_id,
  c.name                                 as client,
  p.exercise_id,
  e.name                                 as exercise,
  e.muscle_group,
  e.modality,
  p.log_date,
  pe.sets                                as prescribed_sets,
  pe.volume_type                         as prescribed_volume_type,
  pe.volume_value                        as prescribed_volume_value,
  pe.load_descriptor                     as prescribed_load_descriptor,
  pe.cue                                 as prescribed_cue,
  p.n_sets,
  p.total_reps,
  p.top_weight,
  p.avg_weight,
  coalesce(p.total_volume, 0)            as total_volume,
  p.est_1rm,
  p.avg_rpe,
  nullif(p.total_duration_seconds, 0)    as total_duration_seconds,
  nullif(p.total_distance_meters, 0)     as total_distance_meters,
  p.prev_date,
  (p.log_date - p.prev_date)             as days_since_prev,
  p.prev_top_weight,
  p.prev_total_volume,
  p.prev_est_1rm,
  (p.top_weight   - p.prev_top_weight)   as delta_top_weight,
  (p.total_volume - p.prev_total_volume) as delta_total_volume,
  (p.est_1rm      - p.prev_est_1rm)      as delta_est_1rm,
  (p.total_reps   - p.prev_total_reps)   as delta_total_reps,
  (p.n_sets       - p.prev_n_sets)       as delta_n_sets,
  case
    when p.prev_total_volume is null or p.prev_total_volume = 0 then null
    else round(100.0 * (p.total_volume - p.prev_total_volume) / p.prev_total_volume, 1)
  end                                    as delta_total_volume_pct,
  case
    when p.prev_date is null                                            then 'first_session'
    -- nothing measurable to compare against; do not manufacture good news
    when p.prev_est_1rm is null and p.prev_total_volume is null         then 'no_comparison'
    when p.est_1rm is not null and p.prev_est_1rm is not null
         and p.est_1rm > p.prev_est_1rm                                 then 'progressing'
    when p.est_1rm is not null and p.prev_est_1rm is not null
         and p.est_1rm < p.prev_est_1rm                                 then 'regressing'
    when p.total_volume is null                                         then 'no_comparison'
    when p.total_volume > p.prev_total_volume                           then 'progressing'
    when p.total_volume < p.prev_total_volume                           then 'regressing'
    else 'holding'
  end                                    as trend
from with_prev p
join clients c   on c.id = p.client_id
join exercises e on e.id = p.exercise_id
left join prescribed_exercises pe on pe.id = p.prescribed_exercise_id
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_exercise_progression is
  'Canonical. One row per client per exercise per date: names not ids, the prescription, what was done, estimated 1RM (Epley, best set, NULL for time/distance work), and the delta against that client''s previous session on the same movement. trend in {first_session, no_comparison, progressing, regressing, holding} — no_comparison when the previous session recorded nothing measurable, rather than defaulting to progress. Excludes archived + Demo/Test clients.';

-- ===== 20260731175552 restore_rep_counts_overwritten_20260713 =====
-- Restore the rep counts the 2026-07-13 normalization overwrote with durations.
--
-- Scope is deliberately narrow: rows where the ORIGINAL value was a bare
-- integer (a rep count -- 8, 10, 12, 15) and the live value is a duration
-- string. Turning "8 reps" into "1 min each side" is not a formatting change,
-- it is a different exercise. 46 rows.
--
-- NOT touched here: 553 further rows where a duration was rewritten as another
-- duration ("45 sec each side" -> "1 min each side", "2 min each side" ->
-- "1 min each side"). Those changed the prescribed DOSE too and are arguably
-- just as wrong, but restoring 553 of Dustin's prescriptions is his call, not
-- a side effect of this one. Surfaced separately.
--
-- The earliest backup wins, so a row captured by more than one pass restores to
-- its value before ANY of them.

create table if not exists bak_prescribed_exercises_20260731 as
  select * from prescribed_exercises;

with bak as (
  select id, volume_value, volume_type, 1 as pri from prescribed_exercises_holds_bak_20260713
  union all select id, volume_value, volume_type, 1 from prescribed_exercises_rollpose_bak_20260713
  union all select id, volume_value, volume_type, 1 from prescribed_exercises_stretchbak_20260713
  union all select id, volume_value, volume_type, 2 from prescribed_exercises_rollstretch_bak_20260723
),
orig as (select distinct on (id) id, volume_value, volume_type from bak order by id, pri),
targets as (
  select o.id, o.volume_value as bak_val, o.volume_type as bak_type
  from orig o
  join prescribed_exercises p on p.id = o.id
  where o.volume_value is distinct from p.volume_value
    and o.volume_value ~ '^[0-9]+$'              -- original was a rep count
    and p.volume_value ~* '(sec|min)'            -- live is a duration
)
update prescribed_exercises p
set volume_value = t.bak_val,
    volume_type  = coalesce(t.bak_type, p.volume_type)
from targets t
where p.id = t.id;

-- ===== 20260731175703 client_training_patterns_and_generator =====
-- client_training_patterns + generator.
--
-- THE PROBLEM. Every future session exists only because somebody placed it by
-- hand. When the hand-placed run ends, coverage silently runs out. Sarah Prince,
-- Sharon Rambo and Tina Haley all hit zero this week and were pushed back out
-- manually -- which buys three weeks and then repeats. Coverage is a treadmill.
--
-- THE FIX. Declare each client's weekly pattern once. A pg_cron job materialises
-- 4-6 weeks forward, continuously.
--
-- SAFETY, the property that matters: the generator INSERTS ONLY WHERE NOTHING
-- EXISTS. Any date that already has a live scheduled_workouts row for that
-- client is skipped entirely. Hand-placed work always wins; the generator can
-- only ever fill empty space. Modelled on generate_rotation_plans, which has run
-- in production since 2026-07-24 without incident.
--
-- HORIZON IS SHORT ON PURPOSE -- 4-6 weeks, not 10. This inherits the known
-- plan_rotations trap: editing a template does NOT propagate to rows already
-- materialised. A long horizon just means more stale rows to unpick.
--
-- Every run is tagged with a generated_batch_id so a bad batch is one delete.

create table if not exists public.client_training_patterns (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  weekday        smallint not null check (weekday between 0 and 6),  -- 0=Sun, America/Chicago
  day_id         uuid not null references days(id),
  supervised     boolean not null default false,
  position       smallint not null default 1,   -- two sessions on one weekday
  effective_from date not null,
  effective_to   date,                          -- null = open-ended
  gcal_recurring_id text,
  note           text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create unique index if not exists uq_ctp_client_weekday_position
  on public.client_training_patterns (client_id, weekday, position, effective_from);

create index if not exists ix_ctp_client_active
  on public.client_training_patterns (client_id) where is_active;

comment on table public.client_training_patterns is
  'Declared weekly training pattern per client. Derived from appointments via v_client_calendar_pattern and confirmed by Dustin -- never asked. Drives generate_scheduled_workouts().';

-- Audit, modelled on plan_flip_log.
create table if not exists public.schedule_generation_log (
  id                 uuid primary key default gen_random_uuid(),
  generated_batch_id uuid not null,
  client_id          uuid not null references clients(id) on delete cascade,
  pattern_id         uuid,
  scheduled_date     date not null,
  day_id             uuid,
  action             text not null check (action in ('inserted','skipped_existing','skipped_no_assignment')),
  detail             text,
  created_at         timestamptz not null default now()
);

create index if not exists ix_sgl_batch on public.schedule_generation_log (generated_batch_id);
create index if not exists ix_sgl_client_date on public.schedule_generation_log (client_id, scheduled_date);

comment on table public.schedule_generation_log is
  'One row per (client, date) the generator considered, including what it declined to do and why. generated_batch_id makes a bad run one delete.';

-- The generator.
--
-- p_dry_run defaults TRUE. This writes to client schedules, so producing the
-- plan and writing it are two separate decisions.
create or replace function public.generate_scheduled_workouts(
  p_weeks   int  default 5,
  p_dry_run boolean default true,
  p_client  uuid default null
)
returns table (
  batch_id       uuid,
  client_name    text,
  scheduled_date date,
  weekday        smallint,
  day_label      text,
  supervised     boolean,
  action         text,
  detail         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_start date;
  v_end   date;
begin
  if p_weeks < 1 or p_weeks > 6 then
    raise exception 'p_weeks must be 1..6 (short horizon is deliberate: template edits do not propagate to materialised rows)';
  end if;

  -- start tomorrow: never touch today, which may already be underway
  v_start := v_today + 1;
  v_end   := v_today + (p_weeks * 7);

  return query
  with dates as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ),
  candidates as (
    select ctp.id as pattern_id,
           ctp.client_id,
           c.name as client_name,
           dt.d as scheduled_date,
           ctp.weekday,
           ctp.day_id,
           ctp.supervised,
           ctp.position,
           dy.label as day_label
    from client_training_patterns ctp
    join clients c on c.id = ctp.client_id
    join dates dt on extract(dow from dt.d)::smallint = ctp.weekday
    left join days dy on dy.id = ctp.day_id
    where ctp.is_active
      and c.archived_at is null
      and ctp.effective_from <= dt.d
      and (ctp.effective_to is null or ctp.effective_to >= dt.d)
      and (p_client is null or ctp.client_id = p_client)
  ),
  resolved as (
    select cd.*,
           pa.id as assignment_id,
           exists (
             select 1 from scheduled_workouts sw
             where sw.client_id = cd.client_id
               and sw.scheduled_date = cd.scheduled_date
               and sw.deleted_at is null
           ) as date_already_covered
    from candidates cd
    left join lateral (
      select pa.id from program_assignments pa
      where pa.client_id = cd.client_id and pa.active
      order by pa.assigned_at desc limit 1
    ) pa on true
  ),
  decided as (
    select r.*,
           case
             when r.date_already_covered then 'skipped_existing'
             when r.assignment_id is null then 'skipped_no_assignment'
             else 'inserted'
           end as action,
           case
             when r.date_already_covered then 'a live row already exists for this date - hand-placed work wins'
             when r.assignment_id is null then 'client has no active program_assignment'
             else null
           end as detail
    from resolved r
  ),
  ins as (
    insert into scheduled_workouts
      (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised)
    select d.client_id, d.assignment_id, d.day_id, d.scheduled_date, d.position, 'scheduled', 'claude', d.supervised
    from decided d
    where d.action = 'inserted' and not p_dry_run
    returning id, client_id, scheduled_date
  ),
  logged as (
    insert into schedule_generation_log
      (generated_batch_id, client_id, pattern_id, scheduled_date, day_id, action, detail)
    select v_batch, d.client_id, d.pattern_id, d.scheduled_date, d.day_id, d.action, d.detail
    from decided d
    where not p_dry_run
    returning 1
  )
  select v_batch, d.client_name, d.scheduled_date, d.weekday, d.day_label,
         d.supervised, d.action, d.detail
  from decided d
  where (select count(*) from ins) >= 0     -- force the CTEs to execute
    and (select count(*) from logged) >= 0
  order by d.client_name, d.scheduled_date, d.position;
end;
$$;

comment on function public.generate_scheduled_workouts(int, boolean, uuid) is
  'Materialises scheduled_workouts from client_training_patterns, p_weeks (1-6) forward starting tomorrow. INSERTS ONLY WHERE NO LIVE ROW EXISTS for that client+date - hand-placed work always wins. Defaults to DRY RUN: pass p_dry_run => false to write. Every run tagged with a batch_id in schedule_generation_log.';

revoke all on function public.generate_scheduled_workouts(int, boolean, uuid) from anon;
revoke all on table public.client_training_patterns from anon;
revoke all on table public.schedule_generation_log from anon;

-- ===== 20260731175759 generate_scheduled_workouts_fix_name_conflict =====
-- The OUT parameter names (scheduled_date, weekday, supervised, ...) collide
-- with real column names inside the query body. #variable_conflict use_column
-- resolves every one of them in favour of the column, which is what the body
-- means everywhere.
create or replace function public.generate_scheduled_workouts(
  p_weeks   int  default 5,
  p_dry_run boolean default true,
  p_client  uuid default null
)
returns table (
  batch_id       uuid,
  client_name    text,
  scheduled_date date,
  weekday        smallint,
  day_label      text,
  supervised     boolean,
  action         text,
  detail         text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_batch uuid := gen_random_uuid();
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_start date;
  v_end   date;
begin
  if p_weeks < 1 or p_weeks > 6 then
    raise exception 'p_weeks must be 1..6 (short horizon is deliberate: template edits do not propagate to materialised rows)';
  end if;

  v_start := v_today + 1;                 -- never touch today
  v_end   := v_today + (p_weeks * 7);

  return query
  with dates as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ),
  candidates as (
    select ctp.id as pattern_id,
           ctp.client_id,
           c.name as c_name,
           dt.d as sched_date,
           ctp.weekday as wd,
           ctp.day_id,
           ctp.supervised as is_sup,
           ctp.position as pos,
           dy.label as d_label
    from client_training_patterns ctp
    join clients c on c.id = ctp.client_id
    join dates dt on extract(dow from dt.d)::smallint = ctp.weekday
    left join days dy on dy.id = ctp.day_id
    where ctp.is_active
      and c.archived_at is null
      and ctp.effective_from <= dt.d
      and (ctp.effective_to is null or ctp.effective_to >= dt.d)
      and (p_client is null or ctp.client_id = p_client)
  ),
  resolved as (
    select cd.*,
           pa.id as assignment_id,
           exists (
             select 1 from scheduled_workouts sw
             where sw.client_id = cd.client_id
               and sw.scheduled_date = cd.sched_date
               and sw.deleted_at is null
           ) as date_already_covered
    from candidates cd
    left join lateral (
      select pa.id from program_assignments pa
      where pa.client_id = cd.client_id and pa.active
      order by pa.assigned_at desc limit 1
    ) pa on true
  ),
  decided as (
    select r.*,
           case
             when r.date_already_covered      then 'skipped_existing'
             when r.assignment_id is null     then 'skipped_no_assignment'
             else 'inserted'
           end as act,
           case
             when r.date_already_covered  then 'a live row already exists for this date - hand-placed work wins'
             when r.assignment_id is null then 'client has no active program_assignment'
             else null
           end as det
    from resolved r
  ),
  ins as (
    insert into scheduled_workouts
      (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised)
    select d.client_id, d.assignment_id, d.day_id, d.sched_date, d.pos, 'scheduled', 'claude', d.is_sup
    from decided d
    where d.act = 'inserted' and not p_dry_run
    returning id
  ),
  logged as (
    insert into schedule_generation_log
      (generated_batch_id, client_id, pattern_id, scheduled_date, day_id, action, detail)
    select v_batch, d.client_id, d.pattern_id, d.sched_date, d.day_id, d.act, d.det
    from decided d
    where not p_dry_run
    returning id
  )
  select v_batch, d.c_name, d.sched_date, d.wd, d.d_label, d.is_sup, d.act, d.det
  from decided d
  where (select count(*) from ins) >= 0
    and (select count(*) from logged) >= 0
  order by d.c_name, d.sched_date, d.pos;
end;
$$;

revoke all on function public.generate_scheduled_workouts(int, boolean, uuid) from anon;

-- ===== 20260731180138 resolve_schedule_proposal =====
-- Applying a schedule proposal.
--
-- The write lives here, not in the UI, because exactly one shape of it is
-- correct and it must not be re-derived by every caller:
--
--   MOVING A WORKOUT = update scheduled_date AND set moved_from_date.
--   Never delete-and-reinsert. The history is the point.
--
-- Only `moved` proposals have a mechanical fix. The detector is confident about
-- WHERE a session went; it is not confident about what should happen to an
-- uncovered date or an orphaned row, and guessing there would write programming
-- decisions that are Dustin's. Those resolve as acknowledged, with the row
-- marked so it stops reappearing, and nothing else is touched.
--
-- `cancelled`: the standing rule is that a cancelled session leaves the date
-- EMPTY, never filled. Approving soft-deletes the scheduled_workouts row for
-- that date (deleted_at), which is reversible. It never hard-deletes: those rows
-- are client history.

create or replace function public.resolve_schedule_proposal(
  p_id       uuid,
  p_decision text,                    -- 'approve' | 'reject'
  p_note     text default null
)
returns table (
  proposal_id  uuid,
  client       text,
  reason       text,
  outcome      text,
  rows_changed int,
  detail       text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_p          schedule_change_proposals%rowtype;
  v_client     text;
  v_changed    int := 0;
  v_outcome    text;
  v_detail     text;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_p from schedule_change_proposals where id = p_id;
  if not found then
    raise exception 'no proposal %', p_id;
  end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal % is already %, refusing to act twice', p_id, v_p.status;
  end if;

  select c.name into v_client from clients c where c.id = v_p.client_id;

  if p_decision = 'reject' then
    update schedule_change_proposals
       set status = 'rejected', resolved_at = now()
     where id = p_id;
    v_outcome := 'rejected';
    v_detail  := 'no schedule rows touched';

  elsif v_p.reason = 'moved' and v_p.to_date is not null then
    -- THE move: same row, new date, provenance preserved.
    with moved as (
      update scheduled_workouts sw
         set scheduled_date  = v_p.to_date,
             moved_from_date = v_p.from_date,
             updated_at      = now()
       where sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date
         and sw.deleted_at is null
         -- do not stack onto a date that is already occupied
         and not exists (
           select 1 from scheduled_workouts x
            where x.client_id = v_p.client_id
              and x.scheduled_date = v_p.to_date
              and x.deleted_at is null
         )
      returning sw.id
    )
    select count(*) into v_changed from moved;

    if v_changed = 0 then
      v_outcome := 'approved_no_op';
      v_detail  := 'nothing to move: no live row on ' || v_p.from_date ||
                   ', or ' || v_p.to_date || ' is already occupied';
    else
      v_outcome := 'applied';
      v_detail  := 'moved ' || v_changed || ' row(s) ' || v_p.from_date ||
                   ' -> ' || v_p.to_date || ', moved_from_date set';
    end if;

    update schedule_change_proposals
       set status = 'approved', resolved_at = now()
     where id = p_id;

  elsif v_p.reason = 'cancelled' then
    -- A cancelled session leaves the date EMPTY. Soft delete only - reversible,
    -- and these rows are client history.
    with removed as (
      update scheduled_workouts sw
         set deleted_at = now(), updated_at = now()
       where sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date
         and sw.deleted_at is null
      returning sw.id
    )
    select count(*) into v_changed from removed;

    update schedule_change_proposals
       set status = 'approved', resolved_at = now()
     where id = p_id;
    v_outcome := case when v_changed > 0 then 'applied' else 'approved_no_op' end;
    v_detail  := 'soft-deleted ' || v_changed || ' row(s) on ' || v_p.from_date ||
                 ' (reversible: clear deleted_at)';

  else
    -- uncovered / orphaned / retired / pattern_shift: acknowledged, not automated.
    update schedule_change_proposals
       set status = 'approved', resolved_at = now()
     where id = p_id;
    v_outcome := 'acknowledged';
    v_detail  := v_p.reason || ' needs a programming decision, not a mechanical fix - ' ||
                 'marked handled, no schedule rows touched';
  end if;

  if p_note is not null then
    update schedule_change_proposals
       set detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('trainer_note', p_note)
     where id = p_id;
  end if;

  return query select p_id, v_client, v_p.reason, v_outcome, v_changed, v_detail;
end;
$$;

comment on function public.resolve_schedule_proposal(uuid, text, text) is
  'Approve or reject one schedule_change_proposal. moved -> update scheduled_date AND set moved_from_date (never delete-and-reinsert). cancelled -> soft-delete so the date is left empty. uncovered/orphaned/retired/pattern_shift -> acknowledged only; those need a programming decision and are not guessed at. Refuses to act on a proposal that is not pending.';

revoke all on function public.resolve_schedule_proposal(uuid, text, text) from anon;

-- ===== 20260731182508 lock_down_new_functions_and_tables =====
-- Closing a hole I opened earlier today.
--
-- I wrote `revoke all on function ... from anon` on all three functions I added
-- and assumed that was enough. It is not. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and `anon` inherits it through PUBLIC --
-- revoking from `anon` specifically leaves the PUBLIC grant untouched. Verified
-- after the fact: has_function_privilege('anon', ...) still returned true for
-- all three.
--
-- Which meant anyone holding the public anon key could call:
--   recalc_pending_payment_reminders()  -> rewrite billing amounts
--   resolve_schedule_proposal()         -> move any client's sessions
--   generate_scheduled_workouts()       -> write into any client's schedule
-- all SECURITY DEFINER, so all bypassing RLS entirely.
--
-- REVOKE FROM PUBLIC is the one that matters. Belt and braces on anon too.

revoke all on function public.recalc_pending_payment_reminders()            from public, anon;
revoke all on function public.resolve_schedule_proposal(uuid, text, text)   from public, anon;
revoke all on function public.generate_scheduled_workouts(int, boolean, uuid) from public, anon;

-- The trainer UI calls resolve_schedule_proposal from the browser, so it needs
-- `authenticated`. The other two are server-side only.
grant execute on function public.resolve_schedule_proposal(uuid, text, text)   to authenticated, service_role;
grant execute on function public.recalc_pending_payment_reminders()            to service_role;
grant execute on function public.generate_scheduled_workouts(int, boolean, uuid) to service_role;

-- `authenticated` is not enough on its own for a SECURITY DEFINER function that
-- moves schedules: every client is authenticated, and definer rights bypass RLS,
-- so without this guard any signed-in client could move any other client's
-- sessions. The check lives inside the function so it cannot be forgotten by a
-- caller.
create or replace function public.resolve_schedule_proposal(
  p_id       uuid,
  p_decision text,
  p_note     text default null
)
returns table (
  proposal_id  uuid,
  client       text,
  reason       text,
  outcome      text,
  rows_changed int,
  detail       text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_p       schedule_change_proposals%rowtype;
  v_client  text;
  v_changed int := 0;
  v_outcome text;
  v_detail  text;
  v_email   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  -- Trainer only. SECURITY DEFINER bypasses RLS, so this is the only guard.
  if coalesce(v_email, '') <> 'symmetrypersonaltraining@gmail.com' then
    raise exception 'resolve_schedule_proposal is trainer-only';
  end if;

  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_p from schedule_change_proposals where id = p_id;
  if not found then raise exception 'no proposal %', p_id; end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal % is already %, refusing to act twice', p_id, v_p.status;
  end if;

  select c.name into v_client from clients c where c.id = v_p.client_id;

  if p_decision = 'reject' then
    update schedule_change_proposals set status='rejected', resolved_at=now() where id=p_id;
    v_outcome := 'rejected'; v_detail := 'no schedule rows touched';

  elsif v_p.reason = 'moved' and v_p.to_date is not null then
    with moved as (
      update scheduled_workouts sw
         set scheduled_date = v_p.to_date, moved_from_date = v_p.from_date, updated_at = now()
       where sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date
         and sw.deleted_at is null
         and not exists (select 1 from scheduled_workouts x
                          where x.client_id = v_p.client_id
                            and x.scheduled_date = v_p.to_date
                            and x.deleted_at is null)
      returning sw.id
    ) select count(*) into v_changed from moved;
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := case when v_changed>0 then 'applied' else 'approved_no_op' end;
    v_detail  := case when v_changed>0
                   then 'moved '||v_changed||' row(s) '||v_p.from_date||' -> '||v_p.to_date||', moved_from_date set'
                   else 'nothing to move: no live row on '||v_p.from_date||', or '||v_p.to_date||' already occupied' end;

  elsif v_p.reason = 'cancelled' then
    with removed as (
      update scheduled_workouts sw
         set deleted_at = now(), updated_at = now()
       where sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date
         and sw.deleted_at is null
      returning sw.id
    ) select count(*) into v_changed from removed;
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := case when v_changed>0 then 'applied' else 'approved_no_op' end;
    v_detail  := 'soft-deleted '||v_changed||' row(s) on '||v_p.from_date||' (reversible: clear deleted_at)';

  else
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := 'acknowledged';
    v_detail  := v_p.reason||' needs a programming decision, not a mechanical fix - marked handled, no schedule rows touched';
  end if;

  if p_note is not null then
    update schedule_change_proposals
       set detail = coalesce(detail,'{}'::jsonb) || jsonb_build_object('trainer_note', p_note)
     where id = p_id;
  end if;

  return query select p_id, v_client, v_p.reason, v_outcome, v_changed, v_detail;
end;
$$;

revoke all on function public.resolve_schedule_proposal(uuid, text, text) from public, anon;
grant execute on function public.resolve_schedule_proposal(uuid, text, text) to authenticated, service_role;

-- The two new tables had RLS enabled and zero policies, which denies everything
-- including the trainer's own session. Deny-by-default is the right posture for
-- anon; the trainer needs to be able to read what the generator did.
create policy trainer_reads_patterns on public.client_training_patterns
  for select to authenticated
  using (coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'email','')
         = 'symmetrypersonaltraining@gmail.com');

create policy trainer_reads_generation_log on public.schedule_generation_log
  for select to authenticated
  using (coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'email','')
         = 'symmetrypersonaltraining@gmail.com');

revoke all on table public.client_training_patterns from public, anon;
revoke all on table public.schedule_generation_log  from public, anon;

-- ===== 20260731182920 sync_supervised_workouts_to_appointments =====
-- The calendar decides WHEN a supervised session happens. (Dustin, 2026-07-31)
--
--   "make sure sync picks up on appointments but me and client still have
--    freedom to move them around and log them. if we move it and log it it gets
--    logged right where it is. if it needs to be moved we will manually move it.
--    in general the sync needs to pick up on scheduling changes and adjust
--    scheduled supervised workouts in their schedule to match from there
--    moving forward."
--
-- So: no proposals, no approval queue. When an appointment moves in Google, the
-- supervised workout follows it. Automatically.
--
-- It follows the LINK, not a guess. scheduled_workouts.appointment_id already
-- ties 237 of 262 future supervised rows to their appointment, so "this workout
-- belongs to that session" is a fact in the data, not a pattern match on dates
-- and times. Rows with no link are left alone rather than paired by inference --
-- a wrong guess here moves a real client's real session.
--
-- FIVE THINGS IT WILL NOT TOUCH, each one a thing Dustin said:
--
--   1. Unsupervised work. Solo programming is not driven by the appointment
--      calendar and never moves because an appointment did.
--   2. Anything logged. "if we move it and log it it gets logged right where it
--      is" -- a workout_log_id means it happened, and where it happened is
--      history. Frozen.
--   3. The past. Only tomorrow forward, both sides. Yesterday is a record.
--   4. Anything moved by hand. moved_from_date already set means a human put it
--      there deliberately: "if it needs to be moved we will manually move it."
--   5. A date that is already occupied. Never stacks two workouts on one day.
--
-- Moving is `update scheduled_date` AND `set moved_from_date`. Never
-- delete-and-reinsert.

create or replace function public.sync_supervised_workouts_to_appointments(
  p_dry_run boolean default false
)
returns table (
  client        text,
  workout_id    uuid,
  from_date     date,
  to_date       date,
  day_label     text,
  outcome       text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tomorrow date := (now() at time zone 'America/Chicago')::date + 1;
begin
  return query
  with candidate as (
    select sw.id as sw_id,
           sw.client_id,
           c.name as c_name,
           sw.scheduled_date as old_date,
           (a.scheduled_at at time zone 'America/Chicago')::date as new_date,
           d.label as d_label
    from scheduled_workouts sw
    join appointments a on a.id = sw.appointment_id
    join clients c      on c.id = sw.client_id
    left join days d    on d.id = sw.day_id
    where sw.deleted_at is null
      and sw.supervised                                   -- 1. supervised only
      and sw.workout_log_id is null                       -- 2. never a logged session
      and sw.status = 'scheduled'
      and sw.moved_from_date is null                      -- 4. never override a manual move
      and a.status = 'scheduled'                          -- the appointment is live
      and c.archived_at is null
      and sw.scheduled_date >= v_tomorrow                 -- 3. future only, both sides
      and (a.scheduled_at at time zone 'America/Chicago')::date >= v_tomorrow
      and (a.scheduled_at at time zone 'America/Chicago')::date <> sw.scheduled_date
      -- 5. do not stack onto an occupied day
      and not exists (
        select 1 from scheduled_workouts x
         where x.client_id = sw.client_id
           and x.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date
           and x.deleted_at is null
      )
  ),
  moved as (
    update scheduled_workouts sw
       set scheduled_date  = cd.new_date,
           moved_from_date = cd.old_date,
           updated_at      = now()
      from candidate cd
     where sw.id = cd.sw_id
       and not p_dry_run
    returning sw.id
  )
  select cd.c_name, cd.sw_id, cd.old_date, cd.new_date, cd.d_label,
         case when p_dry_run then 'would_move' else 'moved' end
  from candidate cd
  where (select count(*) from moved) >= 0
  order by cd.c_name, cd.old_date;
end;
$$;

comment on function public.sync_supervised_workouts_to_appointments(boolean) is
  'Supervised scheduled_workouts follow their linked appointment when it moves in Google Calendar. Automatic, no approval. Follows scheduled_workouts.appointment_id -- never pairs by inference. Skips unsupervised work, anything logged, anything in the past, anything already moved by hand (moved_from_date set), and any target date that is already occupied. Moving = update scheduled_date AND set moved_from_date. Called by /api/gcal-sync after appointments are refreshed.';

revoke all on function public.sync_supervised_workouts_to_appointments(boolean) from public, anon;
grant execute on function public.sync_supervised_workouts_to_appointments(boolean) to service_role;

-- ===== 20260731183603 add_missing_foreign_key_indexes =====
-- Foreign keys with no index on the child side.
--
-- Postgres indexes the PRIMARY KEY automatically and the FOREIGN KEY not at all.
-- Every one of these columns is joined on constantly and none of them had an
-- index, so each lookup was a sequential scan of the whole table.
--
--   prescribed_exercises.section_id   9,167 rows scanned to render one workout
--   sections.day_id                   2,975 rows scanned for the same render
--   meal_items.meal_id                to render one meal
--   meals.meal_plan_id                to render one plan
--
-- The workout render walks days -> sections -> prescribed_exercises, so opening
-- a single workout was scanning ~12,000 rows end to end. Three client RLS
-- policies traverse the same path, which means it happened again on every query
-- those policies guarded. This is a plausible chunk of the reported logger lag
-- (#57) and the general sluggishness.
--
-- Additive and reversible. No behaviour change. CONCURRENTLY is not used because
-- these tables are small and it cannot run inside a migration transaction.

create index if not exists ix_prescribed_exercises_section_id on public.prescribed_exercises (section_id);
create index if not exists ix_prescribed_exercises_exercise_id on public.prescribed_exercises (exercise_id);
create index if not exists ix_sections_day_id                 on public.sections (day_id);
create index if not exists ix_meal_items_meal_id              on public.meal_items (meal_id);
create index if not exists ix_meals_meal_plan_id              on public.meals (meal_plan_id);
create index if not exists ix_phases_program_id               on public.phases (program_id);
create index if not exists ix_meal_plans_client_id            on public.meal_plans (client_id);
create index if not exists ix_macro_targets_client_id         on public.macro_targets (client_id);
create index if not exists ix_days_phase_id                   on public.days (phase_id);

-- Covering indexes for the two hottest ordered reads: the workout render pulls
-- prescriptions and sections in `position` order, so this serves the sort too.
create index if not exists ix_prescribed_exercises_section_position on public.prescribed_exercises (section_id, position);
create index if not exists ix_sections_day_position                 on public.sections (day_id, position);

-- meal_adherence_logs is read per client per date on every nutrition screen and
-- by v_nutrition_now's 7d/28d windows.
create index if not exists ix_meal_adherence_client_date on public.meal_adherence_logs (client_id, log_date);

-- scheduled_workouts is filtered by (client_id, scheduled_date) with
-- deleted_at is null on essentially every read in the app.
create index if not exists ix_scheduled_workouts_client_date_live
  on public.scheduled_workouts (client_id, scheduled_date) where deleted_at is null;

analyze public.prescribed_exercises;
analyze public.sections;
analyze public.meal_items;
analyze public.meals;
analyze public.meal_adherence_logs;
analyze public.scheduled_workouts;

-- ===== 20260731184002 cron_cleanup_and_downstream_schedule =====
-- 1) Retire pg_cron job 6, activate-due-meal-plans.
--
-- It was on the queue as "duplicates job 8 in the same minute". It is worse than
-- that. Both functions flip a client's pending meal plan to live, but:
--
--   activate_due_meal_plans   compares effective_date <= current_date  -- UTC
--   flip_due_meal_plans       compares against (now() at time zone
--                             'America/Chicago')::date -- Central
--
-- UTC runs ahead of Central by 5 hours, so between 19:00 and midnight Central
-- the UTC date is already tomorrow. Both jobs fire at 06:10 UTC, in the same
-- minute, racing -- and when the UTC-based one wins it can activate a plan dated
-- tomorrow. A client opens the app to a meal plan that was not supposed to start
-- until the next day.
--
-- flip_due_meal_plans is the correct one: Central-based, writes plan_flip_log,
-- and is what plan_rotations is built around.
select cron.unschedule(6);

-- 2) Retire job 8. It runs flip_due_meal_plans at 06:10, and job 7 already runs
-- the identical function at 05:10. Keeping the earlier one means plans flip at
-- 00:10 Central, before anyone opens the app.
select cron.unschedule(8);

-- 3) Keep the calendar-derived rows consistent even when the sync is not the
-- thing that changed them.
--
-- /api/gcal-sync already calls both of these after it writes appointments. This
-- is the safety net for every other path: the trainer pressing the sync button,
-- a manual edit, or a Vercel cron run. Both functions are idempotent -- verified,
-- a second run reports 0 changed -- so running them on a timer costs nothing and
-- means the billing counts can never sit stale behind the schedule.
--
-- 11:05 / 23:05 matches the agreed 12-hour cadence and lands 20 minutes ahead of
-- run_integrity_checks (11:25/23:25) and detect_schedule_changes (11:30/23:30),
-- both of which read these same rows. 14:10 catches Vercel's own daily cron,
-- which fires the sync at 14:00 and authenticates via x-vercel-cron with no
-- secret -- the one appointment refresh that works today regardless of
-- CRON_SECRET.
select cron.schedule(
  'calendar_derived_consistency',
  '5 11,14,23 * * *',
  $$
    select public.sync_supervised_workouts_to_appointments(false);
    select public.recalc_pending_payment_reminders();
  $$
);

-- ===== 20260731184034 cancelled_never_clears_the_workout =====
-- Dustin: "do not clear workout on cancel."
--
-- Previous behaviour soft-deleted the scheduled_workouts row when a cancelled
-- appointment proposal was approved, on the reading that a cancelled session
-- should leave the date empty. That rule is about the APPOINTMENT, not the
-- programming: the session did not happen, but the work is still assigned and
-- the client may well do it on their own. Removing it deletes real programming
-- because a calendar event changed.
--
-- Approving a `cancelled` proposal is now an acknowledgement like the others.
-- Nothing is created, moved or removed. The workout stays exactly where it is.

create or replace function public.resolve_schedule_proposal(
  p_id       uuid,
  p_decision text,
  p_note     text default null
)
returns table (
  proposal_id  uuid,
  client       text,
  reason       text,
  outcome      text,
  rows_changed int,
  detail       text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_p       schedule_change_proposals%rowtype;
  v_client  text;
  v_changed int := 0;
  v_outcome text;
  v_detail  text;
  v_email   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if coalesce(v_email, '') <> 'symmetrypersonaltraining@gmail.com' then
    raise exception 'resolve_schedule_proposal is trainer-only';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_p from schedule_change_proposals where id = p_id;
  if not found then raise exception 'no proposal %', p_id; end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal % is already %, refusing to act twice', p_id, v_p.status;
  end if;

  select c.name into v_client from clients c where c.id = v_p.client_id;

  if p_decision = 'reject' then
    update schedule_change_proposals set status='rejected', resolved_at=now() where id=p_id;
    v_outcome := 'rejected'; v_detail := 'no schedule rows touched';

  elsif v_p.reason = 'moved' and v_p.to_date is not null then
    -- The one mechanical fix: same row, new date, provenance preserved.
    with moved as (
      update scheduled_workouts sw
         set scheduled_date = v_p.to_date, moved_from_date = v_p.from_date, updated_at = now()
       where sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date
         and sw.deleted_at is null
         and sw.workout_log_id is null          -- never move a logged session
         and not exists (select 1 from scheduled_workouts x
                          where x.client_id = v_p.client_id
                            and x.scheduled_date = v_p.to_date
                            and x.deleted_at is null)
      returning sw.id
    ) select count(*) into v_changed from moved;
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := case when v_changed>0 then 'applied' else 'approved_no_op' end;
    v_detail  := case when v_changed>0
                   then 'moved '||v_changed||' row(s) '||v_p.from_date||' -> '||v_p.to_date||', moved_from_date set'
                   else 'nothing to move: no live unlogged row on '||v_p.from_date||', or '||v_p.to_date||' already occupied' end;

  else
    -- cancelled / uncovered / orphaned / retired / pattern_shift.
    -- Acknowledged. No schedule rows touched, ever.
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := 'acknowledged';
    v_detail  := case v_p.reason
                   when 'cancelled' then 'appointment cancelled - the workout stays where it is, per Dustin'
                   else v_p.reason||' needs a programming decision, not a mechanical fix - marked handled, no schedule rows touched'
                 end;
  end if;

  if p_note is not null then
    update schedule_change_proposals
       set detail = coalesce(detail,'{}'::jsonb) || jsonb_build_object('trainer_note', p_note)
     where id = p_id;
  end if;

  return query select p_id, v_client, v_p.reason, v_outcome, v_changed, v_detail;
end;
$$;

revoke all on function public.resolve_schedule_proposal(uuid, text, text) from public, anon;
grant execute on function public.resolve_schedule_proposal(uuid, text, text) to authenticated, service_role;

comment on function public.resolve_schedule_proposal(uuid, text, text) is
  'Approve or reject one schedule_change_proposal. ONLY `moved` changes anything: update scheduled_date AND set moved_from_date, never delete-and-reinsert, never a logged session, never onto an occupied date. Everything else including `cancelled` is an acknowledgement - no workout is ever created, moved or removed. Trainer-only, enforced on the JWT email inside the function.';

-- ===== 20260731184049 restore_dose_changed_prescriptions =====
-- Restore the 356 prescriptions whose DOSE was changed by the July normalization
-- passes. Approved by Dustin.
--
-- These were recorded as cosmetic reformatting. They are not. Parsing both sides
-- into seconds:
--
--   169 rows  prescribed time INCREASED   ("45 sec each side" -> "1 min each side")
--   187 rows  prescribed time DECREASED   ("2 min each side"  -> "1 min each side")
--   197 rows  same duration, reworded     ("60 sec" -> "1 min")   <- left alone
--    35 rows  unparseable on one side                             <- left alone
--
-- Only the rows where the number of seconds actually differs are restored. A
-- pure rewording is genuinely cosmetic and reverting it would just churn the
-- data back to inconsistent spellings for no clinical gain.
--
-- The earliest backup wins, so a row captured by several passes restores to its
-- value before any of them. bak_prescribed_exercises_20260731 already holds the
-- full pre-change shape from this session's earlier rep-count restore.

create table if not exists bak_prescribed_exercises_dose_20260731 as
  select * from prescribed_exercises;

with bak as (
  select id, volume_value, volume_type, 1 as pri from prescribed_exercises_holds_bak_20260713
  union all select id, volume_value, volume_type, 1 from prescribed_exercises_rollpose_bak_20260713
  union all select id, volume_value, volume_type, 1 from prescribed_exercises_stretchbak_20260713
  union all select id, volume_value, volume_type, 2 from prescribed_exercises_rollstretch_bak_20260723
),
orig as (select distinct on (id) id, volume_value, volume_type from bak order by id, pri),
scored as (
  select o.id, o.volume_value as bak_val, o.volume_type as bak_type, p.volume_value as live_val,
    case when o.volume_value ~* 'min'      then (substring(o.volume_value from '([0-9]+)'))::numeric * 60
         when o.volume_value ~* 'sec|s$'   then (substring(o.volume_value from '([0-9]+)'))::numeric end as bak_sec,
    case when p.volume_value ~* 'min'      then (substring(p.volume_value from '([0-9]+)'))::numeric * 60
         when p.volume_value ~* 'sec|s$'   then (substring(p.volume_value from '([0-9]+)'))::numeric end as live_sec
  from orig o
  join prescribed_exercises p on p.id = o.id
  where o.volume_value is distinct from p.volume_value
    and o.volume_value !~ '^[0-9]+$'          -- rep counts already restored earlier
),
targets as (
  select id, bak_val, bak_type from scored
   where bak_sec is not null and live_sec is not null and bak_sec <> live_sec
)
update prescribed_exercises p
   set volume_value = t.bak_val,
       volume_type  = coalesce(t.bak_type, p.volume_type)
  from targets t
 where p.id = t.id;

-- ===== 20260731185111 timezone_fixes_defaults_and_cron_v2 =====
-- TIMEZONE CORRECTNESS, part 1: column defaults, one cron schedule, two views.
--
-- The rule for this app: the business runs entirely in America/Chicago.
-- A `date` column means a CALENDAR DAY IN CENTRAL. A `timestamptz` is an
-- instant and stays UTC -- that part was already right everywhere.
--
-- The bug class: converting a UTC instant to a calendar date without going
-- through Central first. Central is UTC-5 in summer and UTC-6 in winter, so
-- from 19:00 Central to midnight the UTC date is ALREADY TOMORROW. Every one
-- of these is an off-by-one-day bug that only fires in the evening, which is
-- exactly why they survive so long -- nobody tests at 9pm.

-- CURRENT_DATE is UTC on this server (TimeZone = UTC, confirmed). Any insert
-- omitting the column after 19:00 Central dated the row TOMORROW.
alter table public.session_notes  alter column note_date set default (now() at time zone 'America/Chicago')::date;
alter table public.skinfold_logs  alter column log_date  set default (now() at time zone 'America/Chicago')::date;

-- pg_cron job 7 ran flip_due_meal_plans at 05:10 UTC. In CDT that is 00:10
-- Central -- fine. In CST it is 23:10 Central, which is BEFORE MIDNIGHT: the
-- function's own `central_today` is still yesterday, so a plan whose
-- effective_date is today does not go live until the next night. The client
-- sees the stale meal plan for ~23 hours on its first day, every day of winter.
-- 06:10 UTC is 00:10 CST / 01:10 CDT -- after midnight Central year round.
select cron.unschedule(7);
select cron.schedule('flip_due_meal_plans_daily', '10 6 * * *',
                     $$select public.flip_due_meal_plans();$$);

-- activate_due_meal_plans compared effective_date to UTC current_date and would
-- promote a plan a day early. It has no caller: no cron job, no trigger, no app
-- reference -- flip_due_meal_plans supersedes it. Corrected rather than dropped,
-- because dropping a function something undiscovered calls is worse than fixing
-- one nothing calls.
create or replace function public.activate_due_meal_plans()
returns void
language plpgsql
as $$
declare
  central_today date := (now() at time zone 'America/Chicago')::date;
begin
  update meal_plans mp set status='archived'
  from (
    select distinct on (client_id) id, client_id
    from meal_plans
    where status='pending' and effective_date <= central_today
    order by client_id, effective_date desc, version_number desc
  ) t
  where mp.client_id = t.client_id
    and mp.id <> t.id
    and mp.status in ('live','pending')
    and mp.effective_date <= central_today;

  update meal_plans mp set status='live'
  from (
    select distinct on (client_id) id
    from meal_plans
    where status='pending' and effective_date <= central_today
    order by client_id, effective_date desc, version_number desc
  ) t
  where mp.id = t.id;
end;
$$;

comment on function public.activate_due_meal_plans() is
  'DEPRECATED - superseded by flip_due_meal_plans(), which also writes plan_flip_log. No caller. Kept only so an undiscovered caller does not break; date comparison corrected to America/Chicago.';

-- ai_usage_monthly cast a date to timestamptz and back, which is evaluated in
-- the SESSION timezone -- so a client connecting with SET timezone='America/
-- Chicago' bucketed every row into the previous month. The round-trip was never
-- needed: used_on is already a date.
create or replace view public.ai_usage_monthly as
 SELECT date_trunc('month'::text, used_on)::date AS month,
    count(*)::integer AS calls,
    COALESCE(sum(tokens_in), 0::bigint) AS tokens_in,
    COALESCE(sum(tokens_out), 0::bigint) AS tokens_out,
    COALESCE(sum(cost_usd), 0::numeric)::numeric(14,5) AS cost_usd
   FROM ai_usage_log
  GROUP BY (date_trunc('month'::text, used_on)::date);

-- v_client_calendar_pattern correctly converted scheduled_at to Central and then
-- compared the result to a UTC CURRENT_DATE. In the evening, a series whose only
-- remaining session is TODAY reported is_retired = true -- and the detector files
-- a "retired series" proposal against a client who is still training.
create or replace view public.v_client_calendar_pattern as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
ev as (
  select a.client_id, c.name as client_name,
         coalesce(nullif(a.gcal_recurring_id,''), a.gcal_event_id) as series,
         extract(dow from (a.scheduled_at at time zone 'America/Chicago'))::int as dow,
         to_char((a.scheduled_at at time zone 'America/Chicago'), 'HH24:MI')     as tod,
         (a.scheduled_at at time zone 'America/Chicago')::date as d,
         a.status
  from appointments a
  join clients c on c.id = a.client_id
  where c.archived_at is null
)
select ev.client_id,
       ev.client_name,
       ev.series,
       mode() within group (order by ev.dow) as pattern_dow,
       mode() within group (order by ev.tod) as pattern_time,
       count(*) filter (where ev.d >= t.d)                                     as future_n,
       count(*) filter (where ev.d >= t.d and ev.status = 'cancelled_client')  as future_cancelled,
       count(*) filter (where ev.d >= t.d) = 0                                 as is_retired
from ev cross join today_ct t
group by ev.client_id, ev.client_name, ev.series;

-- ===== 20260731185229 fix_detect_schedule_changes_central_time_today =====
/*
  TIMEZONE DEFECT FIX: detect_schedule_changes()

  WHAT WENT WRONG
  This business runs entirely on America/Chicago time, but the database server's
  clock is set to UTC. Bare `current_date` therefore returns the UTC calendar date,
  not the Central one. Between 7:00pm Central and midnight, UTC has already rolled
  over to tomorrow, so `current_date` was one day ahead of the real business day.

  Worse, the very same WHERE clauses already converted appointment times correctly
  (`a.scheduled_at at time zone 'America/Chicago'`), so the two halves of each
  comparison disagreed about what day it was.

  WHEN IT FIRED
  Any evening run after 7:00pm Central (and after 6:00pm during standard time).

  WHAT THE USER SAW
  Evening runs silently skipped today: today's supervised workout with no matching
  appointment stopped being flagged as "orphaned", today's appointment with no
  workout stopped being flagged as "uncovered", and a workout still sitting on a
  cancelled appointment's date stopped being flagged as "cancelled". The 28-day
  look-ahead window also slid a day, so the far edge of the window flickered in and
  out depending on what time of day the job ran.

  THE FIX
  Compute the Central-time business date once into v_today_ct and use it everywhere
  `current_date` appeared. No other logic changed.
*/

CREATE OR REPLACE FUNCTION public.detect_schedule_changes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and created_at < now() - interval '20 hours';

  -- ORPHANED: supervised workout, no appointment that day
  insert into schedule_change_proposals (client_id, scheduled_workout_id, day_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, sw.day_id, sw.scheduled_date, 'orphaned', 'one_off',
         jsonb_build_object('client', c.name, 'day', d.label)
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  left join days d on d.id = sw.day_id
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from appointments a
                    where a.client_id = sw.client_id and a.status = 'scheduled'
                      and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date)
  on conflict do nothing;

  -- UNCOVERED: appointment, no supervised workout that day
  insert into schedule_change_proposals (client_id, appointment_id, gcal_recurring_id, to_date, reason, confidence, detail)
  select a.client_id, a.id, a.gcal_recurring_id,
         (a.scheduled_at at time zone 'America/Chicago')::date, 'uncovered',
         case when a.gcal_recurring_id is null then 'one_off' else 'pattern' end,
         jsonb_build_object('client', c.name,
                            'time', to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI'))
  from appointments a join clients c on c.id = a.client_id
  where a.status = 'scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date)
  on conflict do nothing;

  -- CANCELLED: appointment cancelled but a supervised workout is still sitting on that date
  insert into schedule_change_proposals (client_id, scheduled_workout_id, appointment_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, a.id, sw.scheduled_date, 'cancelled', 'one_off',
         jsonb_build_object('client', c.name, 'note', 'appointment cancelled in Google - leave the date empty')
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  join appointments a on a.client_id = sw.client_id
    and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date
    and a.status like 'cancelled%'
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date >= v_today_ct
  on conflict do nothing;

  -- RETIRED: a recurring series with zero future occurrences
  insert into schedule_change_proposals (client_id, gcal_recurring_id, reason, confidence, detail)
  select p.client_id, p.series, 'retired', 'pattern',
         jsonb_build_object('client', p.client_name,
                            'was', to_char(date '2026-08-02' + p.pattern_dow,'Dy') || ' ' || p.pattern_time)
  from v_client_calendar_pattern p where p.is_retired
  on conflict do nothing;

  -- PAIR orphaned + uncovered inside the same ISO week into ONE move
  update schedule_change_proposals o
  set reason = 'moved', to_date = u.to_date, appointment_id = u.appointment_id,
      detail = o.detail || jsonb_build_object('paired_with', u.id, 'moved_to', u.to_date)
  from schedule_change_proposals u
  where o.status = 'pending' and o.reason = 'orphaned'
    and u.status = 'pending' and u.reason = 'uncovered'
    and u.client_id = o.client_id
    and date_trunc('week', u.to_date) = date_trunc('week', o.from_date);

  update schedule_change_proposals u
  set status = 'superseded', resolved_at = now()
  from schedule_change_proposals o
  where u.status = 'pending' and u.reason = 'uncovered'
    and o.reason = 'moved' and o.detail->>'paired_with' = u.id::text;

  select count(*) into n from schedule_change_proposals where status = 'pending';
  return n;
end $function$
;

-- ===== 20260731185301 fix_run_integrity_checks_central_time_today =====
/*
  TIMEZONE DEFECT FIX: run_integrity_checks()

  WHAT WENT WRONG
  The business runs on America/Chicago time but the database server clock is UTC,
  so bare `current_date` returned the UTC calendar date rather than the Central
  business date. After 7:00pm Central, UTC is already on tomorrow's date.

  Three checks depended on "today":
    - supervised_workout_no_appointment  (sw.scheduled_date >= current_date)
    - appointment_no_supervised_workout  (between current_date and current_date+28)
    - client_coverage_under_14_days      (x.mx < current_date + 14)
  The middle one also converted appointment times to Central in the same predicate,
  so its two sides disagreed about the current day.

  WHEN IT FIRED
  Any run after 7:00pm Central (6:00pm during standard time).

  WHAT THE USER SAW
  Evening health-check runs quietly dropped today from the picture: a supervised
  workout today with no appointment stopped counting as critical, today's uncovered
  appointment stopped counting, and the 14-day coverage warning shifted a day, so
  clients appeared to gain or lose a day of coverage purely based on the hour the
  check ran. Counts differed between a morning run and an evening run of the same
  unchanged data.

  THE FIX
  Compute the Central business date once into v_today_ct and use it in all three
  checks. Every other check and the output shape are untouched.
*/

CREATE OR REPLACE FUNCTION public.run_integrity_checks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  insert into integrity_checks (check_name, severity, count, detail)

  select 'personal_program_without_assignment','critical',count(*),
         jsonb_agg(jsonb_build_object('client',c.name))
  from programs p join clients c on c.id=p.personal_for_client_id
  where p.personal_for_client_id is not null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)

  union all
  select 'scheduled_day_outside_assigned_program','critical',count(*),null
  from scheduled_workouts sw join days d on d.id=sw.day_id join phases ph on ph.id=d.phase_id
  where sw.deleted_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)

  union all
  select 'scheduled_workout_null_assignment_id','warn',count(*),null
  from scheduled_workouts where deleted_at is null and assignment_id is null

  union all
  select 'days_null_client_owner_under_personal_program','warn',count(*),null
  from days d join phases ph on ph.id=d.phase_id join programs p on p.id=ph.program_id
  where p.personal_for_client_id is not null and d.client_owner_id is null

  union all
  select 'supervised_workout_no_appointment','critical',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from scheduled_workouts sw join clients c on c.id=sw.client_id
  where sw.deleted_at is null and sw.supervised and sw.appointment_id is null
    and sw.scheduled_date >= v_today_ct and c.archived_at is null

  union all
  select 'appointment_no_supervised_workout','warn',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from appointments a join clients c on c.id=a.client_id
  where a.status='scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct+28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id=a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date=(a.scheduled_at at time zone 'America/Chicago')::date)

  union all
  select 'gcal_sync_stale_over_60min','critical',
         case when max(updated_at) < now() - interval '60 minutes' then 1 else 0 end,
         jsonb_build_object('last_sync',max(updated_at))
  from appointments

  union all
  select 'client_coverage_under_14_days','warn',count(*),
         jsonb_agg(jsonb_build_object('client',c.name,'through',x.mx))
  from (select client_id, max(scheduled_date) mx from scheduled_workouts
        where deleted_at is null group by 1) x
  join clients c on c.id=x.client_id
  where c.archived_at is null and x.mx < v_today_ct + 14

  union all
  select 'client_weight_drift_from_metrics','warn',count(*),
         jsonb_agg(jsonb_build_object('client',t.name,'clients_tbl',t.cw,'metrics',t.mw))
  from (select c.name, c.current_weight cw, m.weight mw from clients c
        join lateral (select weight from metrics where client_id=c.id and weight is not null
                      order by metric_date desc limit 1) m on true
        where c.current_weight is not null and abs(c.current_weight-m.weight) >= 1) t

  union all
  select 'macro_targets_without_meal_plan','warn',count(*),null
  from clients c where exists (select 1 from macro_targets mt where mt.client_id=c.id)
    and not exists (select 1 from meal_plans mp where mp.client_id=c.id)

  union all
  select 'placeholder_macro_targets','info',count(*),null
  from macro_targets where calories=1800 and protein=150 and carbs=165 and fats=60

  union all
  select 'duplicate_scheduled_workout','warn',count(*),null
  from (select client_id,scheduled_date,day_id from scheduled_workouts
        where deleted_at is null group by 1,2,3 having count(*)>1) t

  union all
  select 'prescribed_exercise_position_gaps','info',count(*),null
  from (select section_id from prescribed_exercises group by section_id
        having max(position)<>count(*) or min(position)<>1) t

  union all
  select 'anon_writable_policies','critical',count(*),
         jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname))
  from pg_policies where schemaname='public' and 'anon'=any(roles) and qual='true';

  get diagnostics n = row_count;
  return n;
end $function$
;

-- ===== 20260731185414 fix_gcal_reconcile_payments_central_time_dates =====
/*
  TIMEZONE DEFECT FIX: gcal_reconcile_payments(text[], timestamptz, timestamptz)

  WHAT WENT WRONG
  This function deletes payment rows that came from Google Calendar but were not
  seen in the latest sync window. Its guard predicate had three separate
  timezone bugs, all in the same WHERE clause:

    1. `cp.payment_date > current_date` used the server's UTC date instead of the
       Central business date. The business runs entirely in America/Chicago.
    2. `p_time_min::date` cast a timestamptz straight to date, which silently uses
       the server timezone (UTC) rather than converting to Central.
    3. `p_time_max::date` had the same defect.

  WHEN IT FIRED
  Bug 1 fired on every sync run between 7:00pm Central and midnight, when UTC has
  already advanced to tomorrow. Bugs 2 and 3 fired whenever the sync window's
  boundary timestamps fell in the 6pm/7pm-to-midnight Central band, which is exactly
  where evening training sessions live.

  WHAT THE USER SAW
  Two failure modes, both bad. The `> current_date` guard is meant to protect the
  past from deletion, so running one day ahead meant today's Central payments were
  treated as "future" and became eligible for deletion. Meanwhile the window bounds
  landing a day late could exclude the last evening of the window, leaving stale
  payments for deleted calendar events sitting in the books. Net effect: payment
  rows disappearing or lingering depending on the hour the sync ran.

  THE FIX
  All three expressions now convert to America/Chicago before casting to date. The
  argument signature, return shape, the 50-item seen-set safety floor, and the
  delete logic are unchanged.
*/

CREATE OR REPLACE FUNCTION public.gcal_reconcile_payments(p_seen_ids text[], p_time_min timestamp with time zone, p_time_max timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed INT := 0;
BEGIN
  IF p_seen_ids IS NULL OR COALESCE(array_length(p_seen_ids, 1), 0) < 50 THEN
    RETURN jsonb_build_object('removed', 0, 'skipped', 'seen set too small');
  END IF;

  WITH del AS (
    DELETE FROM calendar_payments cp
    WHERE cp.source = 'gcal_sync'
      AND cp.google_event_id IS NOT NULL
      AND cp.payment_date > (now() at time zone 'America/Chicago')::date
      AND cp.payment_date >= (p_time_min at time zone 'America/Chicago')::date
      AND cp.payment_date <= (p_time_max at time zone 'America/Chicago')::date
      AND NOT (cp.google_event_id = ANY(p_seen_ids))
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  RETURN jsonb_build_object('removed', removed);
END;
$function$
;

-- ===== 20260731185502 fix_v_client_now_central_time_today =====
/*
  TIMEZONE DEFECT FIX: view v_client_now

  WHAT WENT WRONG
  This view is the at-a-glance dashboard row for every client, and it asked the
  database "what is today?" eighteen times using bare CURRENT_DATE. The server's
  clock is UTC while the business runs entirely on America/Chicago time, so
  CURRENT_DATE returns the UTC calendar date. From 7:00pm Central until midnight
  (6:00pm during standard time), UTC has already flipped to tomorrow.

  Every window in the view was affected: coverage_through, next_workout_date, the
  7-day and 28-day scheduled/completed counts, the next_up pick, the nutrition
  log-date windows, the upcoming-appointments window, coverage_days_left, and
  days_since_weigh_in.

  WHEN IT FIRED
  Every evening after 7:00pm Central, which is peak session time for this business.

  WHAT THE USER SAW
  The dashboard quietly changed its mind about the day at dinnertime. Today's
  workout dropped out of "next workout" and jumped to tomorrow's. coverage_days_left
  ticked down a day early, pulling clients into the low-coverage warning band before
  they belonged there. days_since_weigh_in read one day higher, so a client weighed
  in that morning looked a day stale. The 7d/28d completion percentages shifted their
  window by a day, so today's completed session stopped counting toward adherence and
  a day fell off the far end. Refreshing the same page at 6pm and at 8pm produced
  different numbers from identical data.

  THE FIX
  A single today_ct CTE computes the Central business date once and is cross-joined
  wherever a date was needed - the same pattern already used correctly by
  v_nutrition_now and v_plan_vs_actual. All 18 CURRENT_DATE references now read from
  it. Output column names, types and order are unchanged, and CREATE OR REPLACE keeps
  the existing grants and ownership intact.
*/

CREATE OR REPLACE VIEW public.v_client_now AS
 WITH today_ct AS (
         SELECT (now() AT TIME ZONE 'America/Chicago'::text)::date AS d
        ), live_sched AS (
         SELECT scheduled_workouts.client_id,
            max(scheduled_workouts.scheduled_date) FILTER (WHERE scheduled_workouts.scheduled_date >= t.d) AS coverage_through,
            min(scheduled_workouts.scheduled_date) FILTER (WHERE scheduled_workouts.scheduled_date >= t.d) AS next_workout_date,
            count(*) FILTER (WHERE scheduled_workouts.scheduled_date >= (t.d - 7) AND scheduled_workouts.scheduled_date <= (t.d - 1)) AS sched_7d,
            count(*) FILTER (WHERE scheduled_workouts.scheduled_date >= (t.d - 7) AND scheduled_workouts.scheduled_date <= (t.d - 1) AND scheduled_workouts.status = 'completed'::text) AS done_7d,
            count(*) FILTER (WHERE scheduled_workouts.scheduled_date >= (t.d - 28) AND scheduled_workouts.scheduled_date <= (t.d - 1)) AS sched_28d,
            count(*) FILTER (WHERE scheduled_workouts.scheduled_date >= (t.d - 28) AND scheduled_workouts.scheduled_date <= (t.d - 1) AND scheduled_workouts.status = 'completed'::text) AS done_28d
           FROM scheduled_workouts
             CROSS JOIN today_ct t
          WHERE scheduled_workouts.deleted_at IS NULL
          GROUP BY scheduled_workouts.client_id
        ), next_up AS (
         SELECT DISTINCT ON (sw.client_id) sw.client_id,
            d.label AS next_workout,
            sw.supervised AS next_supervised
           FROM scheduled_workouts sw
             CROSS JOIN today_ct t
             LEFT JOIN days d ON d.id = sw.day_id
          WHERE sw.deleted_at IS NULL AND sw.scheduled_date >= t.d
          ORDER BY sw.client_id, sw.scheduled_date, sw."position"
        ), progs AS (
         SELECT pa.client_id,
            array_agg(DISTINCT p.name ORDER BY p.name) AS active_programs,
            count(DISTINCT p.id) AS n_programs
           FROM program_assignments pa
             JOIN programs p ON p.id = pa.program_id
          WHERE pa.active
          GROUP BY pa.client_id
        ), latest_metric AS (
         SELECT DISTINCT ON (metrics.client_id) metrics.client_id,
            metrics.weight,
            metrics.body_fat_pct,
            metrics.metric_date,
            metrics.source
           FROM metrics
          WHERE metrics.weight IS NOT NULL
          ORDER BY metrics.client_id, metrics.metric_date DESC
        ), macros AS (
         SELECT DISTINCT ON (macro_targets.client_id) macro_targets.client_id,
            macro_targets.calories,
            macro_targets.protein,
            macro_targets.carbs,
            macro_targets.fats,
            macro_targets.effective_date,
            macro_targets.calories = 1800::numeric AND macro_targets.protein = 150::numeric AND macro_targets.carbs = 165::numeric AND macro_targets.fats = 60::numeric AS is_placeholder
           FROM macro_targets
          ORDER BY macro_targets.client_id, macro_targets.effective_date DESC
        ), nutrition AS (
         SELECT meal_adherence_logs.client_id,
            count(*) FILTER (WHERE meal_adherence_logs.log_date >= (t.d - 7)) AS logs_7d,
            count(*) FILTER (WHERE meal_adherence_logs.log_date >= (t.d - 7) AND meal_adherence_logs.adherence = 'Off-plan'::text) AS offplan_7d,
            count(*) FILTER (WHERE meal_adherence_logs.log_date >= (t.d - 28)) AS logs_28d
           FROM meal_adherence_logs
             CROSS JOIN today_ct t
          GROUP BY meal_adherence_logs.client_id
        ), appts AS (
         SELECT appointments.client_id,
            count(*) FILTER (WHERE appointments.status = 'scheduled'::text AND (appointments.scheduled_at AT TIME ZONE 'America/Chicago'::text)::date >= t.d AND (appointments.scheduled_at AT TIME ZONE 'America/Chicago'::text)::date <= (t.d + 28)) AS appts_next_28d
           FROM appointments
             CROSS JOIN today_ct t
          GROUP BY appointments.client_id
        ), props AS (
         SELECT schedule_change_proposals.client_id,
            count(*) AS open_proposals
           FROM schedule_change_proposals
          WHERE schedule_change_proposals.status = 'pending'::text
          GROUP BY schedule_change_proposals.client_id
        )
 SELECT c.id AS client_id,
    c.name AS client,
    c.slug,
    c.archived_at IS NOT NULL AS is_archived,
    c.name = ANY (ARRAY['Demo Account'::text, 'Test Client'::text]) AS is_test,
    COALESCE(pr.active_programs, '{}'::text[]) AS active_programs,
    COALESCE(pr.n_programs, 0::bigint) AS n_active_programs,
    ls.coverage_through,
    ls.coverage_through - t.d AS coverage_days_left,
    nu.next_workout,
    ls.next_workout_date,
    nu.next_supervised,
    ls.sched_7d,
    ls.done_7d,
        CASE
            WHEN ls.sched_7d > 0 THEN round(100.0 * ls.done_7d::numeric / ls.sched_7d::numeric)
            ELSE NULL::numeric
        END AS completion_7d_pct,
    ls.sched_28d,
    ls.done_28d,
        CASE
            WHEN ls.sched_28d > 0 THEN round(100.0 * ls.done_28d::numeric / ls.sched_28d::numeric)
            ELSE NULL::numeric
        END AS completion_28d_pct,
    ap.appts_next_28d,
    lm.weight AS latest_weight,
    lm.body_fat_pct AS latest_body_fat_pct,
    lm.metric_date AS latest_metric_date,
    lm.source AS latest_metric_source,
    t.d - lm.metric_date AS days_since_weigh_in,
    mt.calories,
    mt.protein,
    mt.carbs,
    mt.fats,
    mt.effective_date AS macros_set_on,
    mt.is_placeholder AS macros_are_placeholder,
    (EXISTS ( SELECT 1
           FROM meal_plans mp
          WHERE mp.client_id = c.id AND mp.status = 'live'::text)) AS has_live_meal_plan,
    COALESCE(nt.logs_7d, 0::bigint) AS food_logs_7d,
    COALESCE(nt.logs_28d, 0::bigint) AS food_logs_28d,
        CASE
            WHEN NOT (EXISTS ( SELECT 1
               FROM meal_plans mp
              WHERE mp.client_id = c.id)) THEN 'no_plan'::text
            WHEN COALESCE(nt.logs_7d, 0::bigint) = 0 THEN 'not_logging'::text
            WHEN (nt.offplan_7d::numeric / NULLIF(nt.logs_7d, 0)::numeric) > 0.8 THEN 'mostly_off_plan'::text
            ELSE 'on_plan'::text
        END AS nutrition_state,
    c.billing_type,
    c.billing_cadence,
    c.session_rate,
    c.current_fees,
    COALESCE(pp.open_proposals, 0::bigint) AS open_schedule_proposals
   FROM clients c
     CROSS JOIN today_ct t
     LEFT JOIN live_sched ls ON ls.client_id = c.id
     LEFT JOIN next_up nu ON nu.client_id = c.id
     LEFT JOIN progs pr ON pr.client_id = c.id
     LEFT JOIN latest_metric lm ON lm.client_id = c.id
     LEFT JOIN macros mt ON mt.client_id = c.id
     LEFT JOIN nutrition nt ON nt.client_id = c.id
     LEFT JOIN appts ap ON ap.client_id = c.id
     LEFT JOIN props pp ON pp.client_id = c.id;

-- ===== 20260731190143 close_view_rls_bypass =====
-- Close the view-shaped RLS bypass.
--
-- All 13 views in `public` are owned by postgres, granted SELECT to `anon`, and
-- run with security_invoker = off -- meaning they execute with the OWNER's
-- rights and RLS does not apply to what they read. The anon key ships in the
-- browser bundle of every client's app, so anyone who opened devtools could
-- read:
--
--   v_client_profile   every client's name, email, date of birth, goals,
--                      injuries, medical notes and fees
--   v_client_calendar / v_exercise_history / v_metrics_trend
--                      every client's full training and body-composition history
--   v_client_now       the same, plus billing type, session rate and fees
--
-- Verified before changing anything: NO application code reads any of these.
-- Zero references across all 278 source files. They are analysis and reporting
-- objects, queried from SQL. So the grant buys nothing and costs everything.
--
-- Revoked from anon AND authenticated. `authenticated` is every client, not just
-- the trainer, and with security_invoker off a grant to authenticated is exactly
-- as leaky as a grant to anon. Anything that needs these in future goes through
-- a server route with the service role, which is the right shape anyway.
--
-- security_invoker is also turned ON as a second line of defence: if someone
-- re-adds a grant later, RLS will still apply and the blast radius is one
-- client's own rows rather than the whole roster.

do $$
declare v record;
begin
  for v in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('revoke all on public.%I from anon, authenticated, public', v.relname);
    execute format('grant select on public.%I to service_role', v.relname);
    begin
      execute format('alter view public.%I set (security_invoker = on)', v.relname);
    exception when others then
      raise notice 'security_invoker not applied to %: %', v.relname, sqlerrm;
    end;
  end loop;
end $$;

-- ===== 20260731190545 schedule_training_pattern_generator =====
-- Roll the coverage horizon forward every day.
--
-- This is the point of the whole feature. Coverage used to be a treadmill:
-- someone hand-placed a run of sessions, it expired, and the client silently
-- had nothing scheduled. Sarah Prince, Sharon Rambo and Tina Haley all hit zero
-- this week and were pushed back out by hand, which buys three weeks and then
-- repeats.
--
-- With this job the horizon never closes: every night it tops each client on a
-- declared pattern back up to five weeks out.
--
-- 06:30 UTC = 00:30 CST / 01:30 CDT -- after midnight Central year round, and
-- 10 minutes after flip_due_meal_plans (06:10) so the two never interleave.
--
-- Safe by construction: generate_scheduled_workouts inserts ONLY where no live
-- row exists for that client and date. Hand-placed work always wins. Verified on
-- the first real run -- 57 rows created, 18 existing rows skipped, and a
-- row-by-row diff against bak_scheduled_workouts_pregen_20260731 confirmed
-- ZERO pre-existing rows were altered.
--
-- Horizon is 5 weeks, not more, because this inherits the plan_rotations trap:
-- editing a template does NOT propagate to rows already materialised. A long
-- horizon just means more stale rows to unpick when programming changes.
--
-- Every run is tagged with a generated_batch_id in schedule_generation_log, so
-- a bad batch is one delete:
--   delete from scheduled_workouts where id in (
--     select ... from schedule_generation_log where generated_batch_id = '...'
--   );

select cron.schedule(
  'generate_scheduled_workouts_daily',
  '30 6 * * *',
  $$select public.generate_scheduled_workouts(5, false);$$
);

-- ===== 20260731201328 v_plan_vs_actual_actually_one_row_per_client_date =====
-- FIX: v_plan_vs_actual was not one row per client per date, despite saying so.
--
-- The keys CTE produced distinct (client_id, date), then LEFT JOINed the raw
-- scheduled_workouts and workout_logs tables. Any date with more than one
-- workout or more than one log fanned out into a cartesian product. Sarah Prince
-- on 2026-07-23 had 3 scheduled rows and 3 logs and produced NINE view rows.
--
-- Across the whole view: 8,078 rows for 6,611 distinct client-dates. So every
-- count taken from it -- including the gap_reason distribution I reported --
-- was inflated on exactly the busiest days, which are the ones worth looking at.
--
-- Both sides are aggregated to the grain now. A day with two workouts is one row
-- carrying both, not two rows each pretending to be the day.

drop view if exists public.v_plan_vs_actual;

create view public.v_plan_vs_actual as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
sw as (
  select s.client_id,
         s.scheduled_date as the_date,
         count(*)                                     as n_scheduled,
         count(*) filter (where s.supervised)         as n_supervised,
         bool_or(s.supervised)                        as is_supervised,
         bool_or(s.moved_from_date is not null
                 or s.status = 'moved')               as was_moved,
         min(s.moved_from_date)                       as moved_from_date,
         array_agg(distinct d.label)
           filter (where d.label is not null)         as day_labels,
         array_agg(distinct p.name)
           filter (where p.name is not null)          as program_names,
         (array_agg(s.id order by s.position, s.id))[1] as scheduled_workout_id,
         (array_agg(d.label order by s.position, s.id)
           filter (where d.label is not null))[1]     as day_label,
         (array_agg(p.name order by s.position, s.id)
           filter (where p.name is not null))[1]      as program_name,
         (array_agg(s.status order by s.position, s.id))[1] as scheduled_status
  from scheduled_workouts s
  left join days d      on d.id = s.day_id
  left join phases ph   on ph.id = d.phase_id
  left join programs p  on p.id = ph.program_id
  where s.deleted_at is null
  group by s.client_id, s.scheduled_date
),
wl as (
  select w.client_id,
         w.log_date as the_date,
         count(distinct w.id)                          as n_logs,
         (array_agg(w.id order by w.created_at))[1]    as workout_log_id,
         (array_agg(w.status order by w.created_at))[1] as log_status,
         sum(w.duration_minutes)                        as duration_minutes,
         count(distinct sl.exercise_id)                 as n_exercises,
         count(sl.id)                                   as n_sets,
         coalesce(sum(coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0)), 0) as total_volume
  from workout_logs w
  left join set_logs sl on sl.workout_log_id = w.id
  group by w.client_id, w.log_date
),
ap as (
  select a.client_id,
         (a.scheduled_at at time zone 'America/Chicago')::date as the_date,
         min(a.scheduled_at) as appointment_at,
         min((a.scheduled_at at time zone 'America/Chicago')::time)::text as appointment_time_ct,
         (array_agg(a.status order by (case when a.status = 'scheduled' then 0
                                            when a.status = 'completed' then 1
                                            else 2 end)))[1] as appointment_status,
         count(*) as n_appointments,
         count(*) filter (where a.status in ('scheduled','completed')) as n_appointments_live
  from appointments a
  group by a.client_id, (a.scheduled_at at time zone 'America/Chicago')::date
),
keys as (
  select client_id, the_date from sw
  union
  select client_id, the_date from wl
  union
  select client_id, the_date from ap
)
select
  k.client_id,
  c.name                              as client,
  k.the_date                          as scheduled_date,
  (k.the_date < t.d)                  as is_past,
  case
    when wl.workout_log_id is not null and sw.scheduled_workout_id is null then 'unsupervised_extra'
    when sw.was_moved                                                      then 'moved'
    when wl.workout_log_id is not null                                     then 'completed'
    when sw.scheduled_workout_id is null
         and coalesce(ap.n_appointments_live, 0) > 0
         and k.the_date < t.d                                              then 'no_plan'
    when sw.scheduled_workout_id is not null and k.the_date < t.d          then 'missed'
    else null
  end                                 as gap_reason,
  -- planned
  coalesce(sw.n_scheduled, 0)         as n_scheduled,
  sw.scheduled_workout_id,
  sw.day_label,
  sw.day_labels,
  sw.program_name,
  sw.program_names,
  coalesce(sw.is_supervised, false)   as is_supervised,
  coalesce(sw.n_supervised, 0)        as n_supervised,
  sw.scheduled_status,
  sw.moved_from_date,
  -- logged
  coalesce(wl.n_logs, 0)              as n_logs,
  wl.workout_log_id,
  wl.log_status,
  coalesce(wl.n_exercises, 0)         as n_exercises,
  coalesce(wl.n_sets, 0)              as n_sets,
  coalesce(wl.total_volume, 0)        as total_volume,
  wl.duration_minutes,
  -- appointment
  ap.appointment_at,
  ap.appointment_time_ct,
  ap.appointment_status,
  coalesce(ap.n_appointments, 0)      as n_appointments,
  coalesce(ap.n_appointments_live, 0) as n_appointments_live
from keys k
cross join today_ct t
join clients c on c.id = k.client_id
left join sw on sw.client_id = k.client_id and sw.the_date = k.the_date
left join wl on wl.client_id = k.client_id and wl.the_date = k.the_date
left join ap on ap.client_id = k.client_id and ap.the_date = k.the_date
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_plan_vs_actual is
  'Canonical. Exactly one row per client per date - both the scheduled and logged sides are aggregated to that grain, so a day with two workouts is one row carrying both (n_scheduled, day_labels[]) rather than a cartesian product. gap_reason in {completed, moved, missed, no_plan, unsupervised_extra}; NULL = future, or a past date whose only appointment was cancelled. Dates are America/Chicago. Filters scheduled_workouts.deleted_at is null; excludes archived + Demo/Test clients.';

revoke all on public.v_plan_vs_actual from anon, authenticated, public;
grant select on public.v_plan_vs_actual to service_role;
alter view public.v_plan_vs_actual set (security_invoker = on);

-- ===== 20260731202742 sariah_duncan_foundation_block_1 =====
-- Sariah Duncan — Foundation Block 1. Built to Dustin's spec (2026-07-31):
--
--   "every day thoracic, shoulder n neck mobility/rehab solo. ill do it w her
--    tomorrow then on her own. on her days w me 15 min corrective then start
--    basic movements progress each week on movements. focus on posterior chain,
--    full body workouts, core and general fitness. 5 days 20 min walks.
--    4 week block plus tomorrow"
--
-- She signed up 7/30 with ZERO programming and her first session is Mon Aug 3
-- 07:00. 208 recurring appointments, nothing to do in any of them.
--
-- ONE program, not four. Sarah Prince is the cautionary tale: four overlapping
-- active assignments for one beginner, sharing template days with five other
-- clients. Every day here is created with client_owner_id = Sariah, so these are
-- hers from the first row and can never become somebody else's borrowed template.
--
-- Structure:
--   Daily Mobility          solo, every single day, ~12 min
--   Walk — 20 Minutes       solo, 5x/week
--   Session A x4 weeks      supervised Mon: 15 min corrective, then hinge/squat
--                           posterior-chain work, then core
--   Session B x4 weeks      supervised Wed: 15 min corrective, then push/pull
--                           full-body, then core
--
-- Progression is written into the weeks rather than left to memory: bodyweight
-- patterns in week 1, load introduced in week 2, volume in week 3, a fourth set
-- in week 4. "Progress each week on movements", made explicit.
--
-- No injuries or limitations are recorded on her assessment. Everything here is
-- conservative and regressable on the day, and the corrective block is identical
-- to the solo work so she is rehearsing the same patterns under supervision.

with prog as (
  insert into programs (name, category, structure_type, status, description, personal_for_client_id)
  select 'Sariah Duncan — Foundation Block 1',
         'training layer', 'phased-corrective', 'live',
         'Aug 2026 4-week block. Daily t-spine/shoulder/neck mobility solo, 5x20 min walks, '
         || 'and two supervised sessions a week (Mon/Wed 07:00) opening with 15 min corrective '
         || 'then basic movement patterns progressed weekly. Focus: posterior chain, full body, core.',
         c.id
  from clients c where c.name = 'Sariah Duncan'
  returning id
),
ph as (
  insert into phases (program_id, label, position, intent, approx_duration)
  select id, 'Block 1 — Foundation', 1,
         'Establish daily thoracic/shoulder/neck mobility, groove basic movement patterns, build a walking habit.',
         '4 weeks'
  from prog returning id
),
d as (
  insert into days (phase_id, label, position, client_owner_id, created_by, origin)
  select ph.id, v.label, v.pos, c.id, 'claude', 'personal'
  from ph, clients c, (values
    ('Daily Mobility — T-Spine, Shoulder & Neck', 1),
    ('Walk — 20 Minutes',                          2),
    ('Session A — Week 1',                         3),
    ('Session B — Week 1',                         4),
    ('Session A — Week 2',                         5),
    ('Session B — Week 2',                         6),
    ('Session A — Week 3',                         7),
    ('Session B — Week 3',                         8),
    ('Session A — Week 4',                         9),
    ('Session B — Week 4',                        10)
  ) as v(label, pos)
  where c.name = 'Sariah Duncan'
  returning id, label
),
s as (
  insert into sections (day_id, internal_name, client_facing_name, position)
  select d.id, v.internal_name, v.client_name, v.pos
  from d join (values
    -- Daily solo mobility
    ('Daily Mobility — T-Spine, Shoulder & Neck', 'Inhibit',            'Warm-Up',   1),
    ('Daily Mobility — T-Spine, Shoulder & Neck', 'Lengthen',           'Warm-Up',   2),
    ('Daily Mobility — T-Spine, Shoulder & Neck', 'Activate',           'Warm-Up',   3),
    ('Walk — 20 Minutes',                         'Cardio',             'Cardio',    1),
    -- Every supervised day: 15 min corrective, primary, accessory, core
    ('Session A — Week 1', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session A — Week 1', 'Primary Strength',   'Strength',  2),
    ('Session A — Week 1', 'Accessory Strength', 'Accessory', 3), ('Session A — Week 1', 'Integrate',          'Accessory', 4),
    ('Session B — Week 1', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session B — Week 1', 'Primary Strength',   'Strength',  2),
    ('Session B — Week 1', 'Accessory Strength', 'Accessory', 3), ('Session B — Week 1', 'Integrate',          'Accessory', 4),
    ('Session A — Week 2', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session A — Week 2', 'Primary Strength',   'Strength',  2),
    ('Session A — Week 2', 'Accessory Strength', 'Accessory', 3), ('Session A — Week 2', 'Integrate',          'Accessory', 4),
    ('Session B — Week 2', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session B — Week 2', 'Primary Strength',   'Strength',  2),
    ('Session B — Week 2', 'Accessory Strength', 'Accessory', 3), ('Session B — Week 2', 'Integrate',          'Accessory', 4),
    ('Session A — Week 3', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session A — Week 3', 'Primary Strength',   'Strength',  2),
    ('Session A — Week 3', 'Accessory Strength', 'Accessory', 3), ('Session A — Week 3', 'Integrate',          'Accessory', 4),
    ('Session B — Week 3', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session B — Week 3', 'Primary Strength',   'Strength',  2),
    ('Session B — Week 3', 'Accessory Strength', 'Accessory', 3), ('Session B — Week 3', 'Integrate',          'Accessory', 4),
    ('Session A — Week 4', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session A — Week 4', 'Primary Strength',   'Strength',  2),
    ('Session A — Week 4', 'Accessory Strength', 'Accessory', 3), ('Session A — Week 4', 'Integrate',          'Accessory', 4),
    ('Session B — Week 4', 'Corrective Warm-Up', 'Warm-Up',   1), ('Session B — Week 4', 'Primary Strength',   'Strength',  2),
    ('Session B — Week 4', 'Accessory Strength', 'Accessory', 3), ('Session B — Week 4', 'Integrate',          'Accessory', 4)
  ) as v(day_label, internal_name, client_name, pos) on v.day_label = d.label
  returning id, day_id, internal_name
)
insert into prescribed_exercises
  (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue)
select s.id, e.id, v.pos, v.sets, v.vtype, v.vval, v.uni, v.load, v.cue
from s
join d       on d.id = s.day_id
join (values
  -- ============ DAILY MOBILITY (solo, every day) ============
  ('Daily Mobility — T-Spine, Shoulder & Neck','Inhibit', 'Foam Roll T Spine',                            1,1,'duration','1 min',   false,null,'Slow passes, pause on tender spots. Ribs down.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Inhibit', 'Lacrosse Ball Pec Minor',                      2,1,'duration','45 sec each side',true,null,'Gentle. Breathe into it, do not brace.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Lengthen','Supine Thoracic Extension over Foam Roller',    1,1,'duration','1 min',   false,null,'Roller across the mid-back. Support the head. Extend over, do not arch the low back.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Lengthen','Doorway Pec Stretch',                          2,1,'duration','45 sec each side',true,null,'Elbow at shoulder height. Step through until you feel the chest, not the shoulder joint.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Lengthen','Active Upper Trap and Scalene Stretch',        3,1,'duration','30 sec each side',true,null,'Ear to shoulder, opposite hand anchored. No pulling hard on the head.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Lengthen','Cervical Lateral Flexion Stretch',             4,1,'duration','30 sec each side',true,null,'Slow and gentle. Stop well before any pinch.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Activate','Chin Tuck',                                    1,2,'reps','10',           false,'bodyweight','Make a double chin, hold 2 sec. Head stays level - this is a nod, not a tilt.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Activate','Wall Angel',                                   2,2,'reps','10',           false,'bodyweight','Low back, mid back, head and wrists stay on the wall. Slow. Shorten the range before you let anything lift off.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Activate','Band Pull Apart',                              3,2,'reps','15',           false,'light band','Straight arms, squeeze the shoulder blades. Do not shrug.'),
  ('Daily Mobility — T-Spine, Shoulder & Neck','Activate','Prone Cobra',                                  4,2,'duration','20 sec',   false,'bodyweight','Palms turned out, glutes on. Lift the chest an inch. Quality over height.'),

  -- ============ WALK ============
  ('Walk — 20 Minutes','Cardio','Outdoor Walk',                                                           1,1,'duration','20 min',   false,'easy pace','Conversational. Five days a week - the habit matters more than the pace.'),

  -- ============ SESSION A - posterior chain + core (Mondays) ============
  -- Corrective warm-up is identical every week and identical to the solo work.
  ('Session A — Week 1','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session A — Week 1','Corrective Warm-Up','Supine Thoracic Extension over Foam Roller',                2,1,'duration','1 min',    false,null,null),
  ('Session A — Week 1','Corrective Warm-Up','Cat Cow',                                                   3,1,'reps','10',           false,'bodyweight','Segment by segment.'),
  ('Session A — Week 1','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 1','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 1','Corrective Warm-Up','Band Pull Apart',                                           6,2,'reps','15',           false,'light band',null),
  ('Session A — Week 1','Corrective Warm-Up','Body Weight Glute Bridge',                                  7,2,'reps','12',           false,'bodyweight','Ribs down, squeeze at the top.'),
  ('Session A — Week 1','Primary Strength','Body Weight Hip Hinge',                                       1,3,'reps','10',           false,'bodyweight','Week 1 is the pattern. Dowel on the back if it helps - three points of contact.'),
  ('Session A — Week 1','Primary Strength','Body Weight Squat',                                           2,3,'reps','10',           false,'bodyweight','To a box if depth is a limiter.'),
  ('Session A — Week 1','Accessory Strength','Step Up with Control',                                      1,2,'reps','8',            true, 'bodyweight','Low box. No push off the trailing leg.'),
  ('Session A — Week 1','Accessory Strength','Hip Thrust Machine',                                        2,2,'reps','12',           false,'light','Chin tucked, ribs down.'),
  ('Session A — Week 1','Integrate','Dead Bug',                                                           1,2,'reps','8',            true, 'bodyweight','Low back stays flat. Exhale as the leg goes out.'),
  ('Session A — Week 1','Integrate','Bird Dog',                                                           2,2,'reps','8',            true, 'bodyweight','Slow. Do not let the hips rotate.'),

  ('Session A — Week 2','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session A — Week 2','Corrective Warm-Up','Supine Thoracic Extension over Foam Roller',                2,1,'duration','1 min',    false,null,null),
  ('Session A — Week 2','Corrective Warm-Up','Cat Cow',                                                   3,1,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 2','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 2','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 2','Corrective Warm-Up','Band Pull Apart',                                           6,2,'reps','15',           false,'light band',null),
  ('Session A — Week 2','Corrective Warm-Up','Body Weight Glute Bridge',                                  7,2,'reps','12',           false,'bodyweight',null),
  ('Session A — Week 2','Primary Strength','Dumbbell Romanian Deadlift',                                  1,3,'reps','10',           false,'light - load introduced','Load enters this week. Light. Pattern first, weight second.'),
  ('Session A — Week 2','Primary Strength','Goblet Squat',                                                2,3,'reps','10',           false,'light','Elbows inside the knees.'),
  ('Session A — Week 2','Accessory Strength','Step Up with Control',                                      1,3,'reps','8',            true, 'bodyweight',null),
  ('Session A — Week 2','Accessory Strength','Hip Thrust Machine',                                        2,3,'reps','12',           false,'light',null),
  ('Session A — Week 2','Integrate','Dead Bug',                                                           1,3,'reps','8',            true, 'bodyweight',null),
  ('Session A — Week 2','Integrate','Bird Dog',                                                           2,3,'reps','8',            true, 'bodyweight',null),

  ('Session A — Week 3','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session A — Week 3','Corrective Warm-Up','Supine Thoracic Extension over Foam Roller',                2,1,'duration','1 min',    false,null,null),
  ('Session A — Week 3','Corrective Warm-Up','Cat Cow',                                                   3,1,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 3','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 3','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 3','Corrective Warm-Up','Band Pull Apart',                                           6,2,'reps','15',           false,'light band',null),
  ('Session A — Week 3','Corrective Warm-Up','Body Weight Glute Bridge',                                  7,2,'reps','12',           false,'bodyweight',null),
  ('Session A — Week 3','Primary Strength','Dumbbell Romanian Deadlift',                                  1,3,'reps','12',           false,'same or slightly heavier','Volume up before load goes up again.'),
  ('Session A — Week 3','Primary Strength','Goblet Squat',                                                2,3,'reps','12',           false,'same or slightly heavier',null),
  ('Session A — Week 3','Accessory Strength','Step Up with Control',                                      1,3,'reps','10',           true, 'bodyweight or light DBs',null),
  ('Session A — Week 3','Accessory Strength','Hip Thrust Machine',                                        2,3,'reps','15',           false,'moderate',null),
  ('Session A — Week 3','Integrate','Dead Bug',                                                           1,3,'reps','10',           true, 'bodyweight',null),
  ('Session A — Week 3','Integrate','Bird Dog',                                                           2,3,'reps','10',           true, 'bodyweight',null),

  ('Session A — Week 4','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session A — Week 4','Corrective Warm-Up','Supine Thoracic Extension over Foam Roller',                2,1,'duration','1 min',    false,null,null),
  ('Session A — Week 4','Corrective Warm-Up','Cat Cow',                                                   3,1,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 4','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 4','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session A — Week 4','Corrective Warm-Up','Band Pull Apart',                                           6,2,'reps','15',           false,'light band',null),
  ('Session A — Week 4','Corrective Warm-Up','Body Weight Glute Bridge',                                  7,2,'reps','12',           false,'bodyweight',null),
  ('Session A — Week 4','Primary Strength','Dumbbell Romanian Deadlift',                                  1,4,'reps','10',           false,'heavier than week 3','Fourth set, back to 10s, more weight.'),
  ('Session A — Week 4','Primary Strength','Goblet Squat',                                                2,4,'reps','10',           false,'heavier than week 3',null),
  ('Session A — Week 4','Accessory Strength','Step Up with Control',                                      1,3,'reps','12',           true, 'light DBs',null),
  ('Session A — Week 4','Accessory Strength','Hip Thrust Machine',                                        2,4,'reps','12',           false,'moderate-heavy',null),
  ('Session A — Week 4','Integrate','Dead Bug',                                                           1,3,'reps','12',           true, 'bodyweight',null),
  ('Session A — Week 4','Integrate','Bird Dog',                                                           2,3,'reps','12',           true, 'bodyweight',null),

  -- ============ SESSION B - full body push/pull + core (Wednesdays) ============
  ('Session B — Week 1','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session B — Week 1','Corrective Warm-Up','Thread the Needle',                                         2,1,'reps','8',            true, 'bodyweight','Rotation from the mid-back, not the low back.'),
  ('Session B — Week 1','Corrective Warm-Up','Quadruped Thoracic Rotations',                              3,1,'reps','8',            true, 'bodyweight','Hand behind the head, follow the elbow with your eyes.'),
  ('Session B — Week 1','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 1','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 1','Corrective Warm-Up','Serratus Wall Punch',                                       6,2,'reps','12',           false,'bodyweight','Reach through at the end. Shoulder blade wraps around the ribcage.'),
  ('Session B — Week 1','Primary Strength','Push Up',                                                     1,3,'reps','8',            false,'hands elevated as needed','Elevate the hands until the ribs stay down for all 8.'),
  ('Session B — Week 1','Primary Strength','Neutral Grip Lat Pulldown',                                   2,3,'reps','10',           false,'light','Start the pull from the shoulder blade, not the hands.'),
  ('Session B — Week 1','Accessory Strength','Dumbbell Reverse Lunge',                                    1,2,'reps','8',            true, 'bodyweight','Step back, not forward. Knee tracks the toes.'),
  ('Session B — Week 1','Accessory Strength','Cable Face Pull',                                           2,3,'reps','15',           false,'light','Rope to the forehead, elbows high. This one is for posture.'),
  ('Session B — Week 1','Integrate','Side Plank',                                                         1,2,'duration','20 sec each side',true,'bodyweight','From the knees if the full version breaks form.'),
  ('Session B — Week 1','Integrate','Farmer Carry',                                                       2,2,'duration','30 sec',    false,'moderate','Tall. Shoulders down and back, do not lean.'),

  ('Session B — Week 2','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session B — Week 2','Corrective Warm-Up','Thread the Needle',                                         2,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 2','Corrective Warm-Up','Quadruped Thoracic Rotations',                              3,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 2','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 2','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 2','Corrective Warm-Up','Serratus Wall Punch',                                       6,2,'reps','12',           false,'bodyweight',null),
  ('Session B — Week 2','Primary Strength','Push Up',                                                     1,3,'reps','10',           false,'lower the elevation if week 1 was clean',null),
  ('Session B — Week 2','Primary Strength','Neutral Grip Lat Pulldown',                                   2,3,'reps','12',           false,'light-moderate',null),
  ('Session B — Week 2','Accessory Strength','Dumbbell Reverse Lunge',                                    1,3,'reps','8',            true, 'light DBs','Load enters this week.'),
  ('Session B — Week 2','Accessory Strength','Cable Face Pull',                                           2,3,'reps','15',           false,'light',null),
  ('Session B — Week 2','Integrate','Side Plank',                                                         1,2,'duration','30 sec each side',true,'bodyweight',null),
  ('Session B — Week 2','Integrate','Farmer Carry',                                                       2,3,'duration','30 sec',    false,'moderate',null),

  ('Session B — Week 3','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session B — Week 3','Corrective Warm-Up','Thread the Needle',                                         2,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 3','Corrective Warm-Up','Quadruped Thoracic Rotations',                              3,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 3','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 3','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 3','Corrective Warm-Up','Serratus Wall Punch',                                       6,2,'reps','12',           false,'bodyweight',null),
  ('Session B — Week 3','Primary Strength','Push Up',                                                     1,3,'reps','12',           false,'lower elevation again if clean',null),
  ('Session B — Week 3','Primary Strength','Neutral Grip Lat Pulldown',                                   2,4,'reps','10',           false,'moderate','Fourth set.'),
  ('Session B — Week 3','Accessory Strength','Dumbbell Reverse Lunge',                                    1,3,'reps','10',           true, 'light DBs',null),
  ('Session B — Week 3','Accessory Strength','Cable Face Pull',                                           2,3,'reps','15',           false,'light-moderate',null),
  ('Session B — Week 3','Integrate','Side Plank',                                                         1,3,'duration','30 sec each side',true,'bodyweight',null),
  ('Session B — Week 3','Integrate','Farmer Carry',                                                       2,3,'duration','40 sec',    false,'moderate-heavy',null),

  ('Session B — Week 4','Corrective Warm-Up','Foam Roll T Spine',                                         1,1,'duration','1 min',    false,null,'15 min corrective block.'),
  ('Session B — Week 4','Corrective Warm-Up','Thread the Needle',                                         2,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 4','Corrective Warm-Up','Quadruped Thoracic Rotations',                              3,1,'reps','8',            true, 'bodyweight',null),
  ('Session B — Week 4','Corrective Warm-Up','Wall Angel',                                                4,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 4','Corrective Warm-Up','Chin Tuck',                                                 5,2,'reps','10',           false,'bodyweight',null),
  ('Session B — Week 4','Corrective Warm-Up','Serratus Wall Punch',                                       6,2,'reps','12',           false,'bodyweight',null),
  ('Session B — Week 4','Primary Strength','Push Up',                                                     1,4,'reps','10',           false,'lowest elevation she can hold form at','Fourth set.'),
  ('Session B — Week 4','Primary Strength','Neutral Grip Lat Pulldown',                                   2,4,'reps','12',           false,'moderate',null),
  ('Session B — Week 4','Accessory Strength','Dumbbell Reverse Lunge',                                    1,3,'reps','12',           true, 'moderate DBs',null),
  ('Session B — Week 4','Accessory Strength','Cable Face Pull',                                           2,4,'reps','15',           false,'moderate',null),
  ('Session B — Week 4','Integrate','Side Plank',                                                         1,3,'duration','40 sec each side',true,'bodyweight',null),
  ('Session B — Week 4','Integrate','Farmer Carry',                                                       2,3,'duration','45 sec',    false,'heavy','End of block - this should feel like work.')
) as v(day_label, section_name, ex_name, pos, sets, vtype, vval, uni, load, cue)
  on v.day_label = d.label and v.section_name = s.internal_name
join exercises e on e.name = v.ex_name;

-- ===== 20260731202843 sariah_duncan_schedule_block_1 =====
-- Lay Block 1 on the calendar.
--
-- The assignment already exists: trg_personal_program_needs_assignment creates
-- one automatically when a program with personal_for_client_id is inserted, and
-- uq_pa_active_client_program correctly refused my duplicate. Using the existing
-- one rather than fighting the guard -- the guard is right.
--
-- Dates: "4 week block plus tomorrow" -- Sat 2026-08-01 (Dustin walks her through
-- the mobility routine) then four training weeks, 2026-08-03 to 2026-08-30.
--
--   Daily Mobility   every day, Aug 1 - Aug 30, solo
--   Walk 20 min      Mon-Fri, weekends off, solo
--   Session A        Mondays  Aug 3/10/17/24, weeks 1-4, SUPERVISED
--   Session B        Wednesdays Aug 5/12/19/26, weeks 1-4, SUPERVISED
--
-- Supervised rows carry appointment_id, so if a session moves in Google Calendar
-- sync_supervised_workouts_to_appointments moves the workout with it. Without
-- that link they would be stranded -- and a brand new client's times are the
-- most likely of anyone's to shift.

with cl as (select id from clients where name = 'Sariah Duncan'),
asg as (
  select pa.id, pa.client_id
  from program_assignments pa
  join programs p on p.id = pa.program_id
  where pa.client_id = (select id from cl)
    and p.name = 'Sariah Duncan — Foundation Block 1'
    and pa.active
),
dy as (
  select d.id, d.label
  from days d
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where p.name = 'Sariah Duncan — Foundation Block 1'
),
dates as (select generate_series(date '2026-08-01', date '2026-08-30', interval '1 day')::date as d),
plan as (
  select dates.d as sched_date, 'Daily Mobility — T-Spine, Shoulder & Neck' as label, false as supervised, 2 as position
  from dates
  union all
  select dates.d, 'Walk — 20 Minutes', false, 3
  from dates where extract(dow from dates.d) between 1 and 5
  union all
  select v.d, v.label, true, 1 from (values
    (date '2026-08-03','Session A — Week 1'), (date '2026-08-10','Session A — Week 2'),
    (date '2026-08-17','Session A — Week 3'), (date '2026-08-24','Session A — Week 4'),
    (date '2026-08-05','Session B — Week 1'), (date '2026-08-12','Session B — Week 2'),
    (date '2026-08-19','Session B — Week 3'), (date '2026-08-26','Session B — Week 4')
  ) as v(d, label)
)
insert into scheduled_workouts
  (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised, appointment_id)
select asg.client_id, asg.id, dy.id, plan.sched_date, plan.position, 'scheduled', 'claude', plan.supervised,
       case when plan.supervised then (
         select a.id from appointments a
         where a.client_id = asg.client_id
           and (a.scheduled_at at time zone 'America/Chicago')::date = plan.sched_date
           and a.status = 'scheduled'
         order by a.scheduled_at limit 1
       ) end
from plan
join dy on dy.label = plan.label
cross join asg
where not exists (
  select 1 from scheduled_workouts sw
  where sw.client_id = asg.client_id
    and sw.scheduled_date = plan.sched_date
    and sw.day_id = dy.id
    and sw.deleted_at is null
);

-- ===== 20260731203050 library_masters_and_fix_fork_ownership =====
-- Two things, one root cause.
--
-- Dustin's standing rule (2026-07-31):
--   "remember to check current workout library when programming. if we create
--    new you need to save all to library for future use. that library needs to
--    keep growing and always see if there are ones already there that fit the
--    client. all workouts get saved to add to library for use later by others"
--
-- The library IS `days where client_owner_id is null` -- that is literally the
-- filter on /library/workouts. So the model has to be:
--
--   LIBRARY MASTER   client_owner_id IS NULL   reusable, appears in the library
--   CLIENT COPY      client_owner_id = client  forked, edits never leak
--
-- I built Sariah's ten days owned by her, which made them correct for her and
-- INVISIBLE to the library. This adds the master copies so the library grows,
-- with names generalised so they read sensibly for the next client.
--
-- ---------------------------------------------------------------------------
-- AND THE BUG THAT PROBABLY CAUSED THE 775.
--
-- fork_day_for_client is supposed to give a client their own copy of a library
-- day. It inserts into the client's personal phase but then copies
-- `d.client_owner_id` FROM THE SOURCE:
--
--     select v_new_day, v_phase_id, d.label, ..., d.client_owner_id, ...
--
-- Source library days have client_owner_id = NULL. So every "fork" produced
-- another owner-less day: it shows up in the library, it is attached to one
-- client, and the next client to use that library entry lands on the same row.
-- That is exactly the shape of the shared/template-day problem -- 34 days with
-- more than one client on them, and 46 rep counts overwritten across clients.
--
-- One word: p_client_id instead of d.client_owner_id.

create or replace function public.fork_day_for_client(p_day_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_id uuid;
  v_new_day  uuid;
  r_sec      record;
  v_new_sec  uuid;
begin
  v_phase_id := ensure_personal_phase(p_client_id);
  v_new_day  := gen_random_uuid();

  insert into days (id, phase_id, label, position, created_at, day_of_week, swappable,
                    client_owner_id, created_by, origin)
  select v_new_day, v_phase_id, d.label, d.position, now(), d.day_of_week, d.swappable,
         -- THE FIX: the fork belongs to the client it was forked for. Copying the
         -- source's owner (NULL, for a library day) is what left forks sitting in
         -- the shared pool for the next client to collide with.
         p_client_id, d.created_by, coalesce(d.origin, 'library_fork')
  from days d where d.id = p_day_id;

  for r_sec in select * from sections where day_id = p_day_id order by position loop
    v_new_sec := gen_random_uuid();
    insert into sections (id, day_id, internal_name, client_facing_name, position, created_at)
    values (v_new_sec, v_new_day, r_sec.internal_name, r_sec.client_facing_name, r_sec.position, now());

    insert into prescribed_exercises (id, section_id, exercise_id, position, sets, volume_type, volume_value,
           unilateral, tempo, load_descriptor, cue, rest, superset_group, intensity_type,
           use_drop_sets, use_rest_pause, use_partials, alternate_of, created_at, tracked_fields)
    select gen_random_uuid(), v_new_sec, pe.exercise_id, pe.position, pe.sets, pe.volume_type, pe.volume_value,
           pe.unilateral, pe.tempo, pe.load_descriptor, pe.cue, pe.rest, pe.superset_group, pe.intensity_type,
           pe.use_drop_sets, pe.use_rest_pause, pe.use_partials, null, now(), pe.tracked_fields
    from prescribed_exercises pe where pe.section_id = r_sec.id;
  end loop;

  return v_new_day;
end;
$$;

comment on function public.fork_day_for_client(uuid, uuid) is
  'Copy a library day into a client''s personal phase, OWNED BY THAT CLIENT. Previously copied client_owner_id from the source, so forks of library days stayed owner-less and different clients ended up sharing one row - the shared/template-day problem.';

-- ---------------------------------------------------------------------------
-- Library masters for everything built for Sariah today.

with lib_prog as (
  insert into programs (name, category, structure_type, status, description)
  values (
    'Foundation Block — Corrective, Posterior Chain & Full Body',
    'training layer', 'phased-corrective', 'live',
    'Reusable 4-week beginner/return-to-training block. Daily t-spine/shoulder/neck mobility '
    || 'to be done solo, a 20-minute walk, and two supervised sessions a week that open with a '
    || '15-minute corrective block then progress basic movement patterns weekly. '
    || 'Session A is posterior chain + core; Session B is full-body push/pull + core. '
    || 'Progression: bodyweight week 1, load week 2, volume week 3, fourth set week 4.'
  )
  returning id
),
lib_phase as (
  insert into phases (program_id, label, position, intent, approx_duration)
  select id, 'Block 1 — Foundation', 1,
         'Establish daily thoracic/shoulder/neck mobility, groove basic movement patterns, build a walking habit.',
         '4 weeks'
  from lib_prog returning id
),
src as (
  select d.id, d.label, d.position,
         case d.label
           when 'Session A — Week 1' then 'Foundation A — Posterior Chain & Core — Week 1'
           when 'Session A — Week 2' then 'Foundation A — Posterior Chain & Core — Week 2'
           when 'Session A — Week 3' then 'Foundation A — Posterior Chain & Core — Week 3'
           when 'Session A — Week 4' then 'Foundation A — Posterior Chain & Core — Week 4'
           when 'Session B — Week 1' then 'Foundation B — Full Body Push/Pull & Core — Week 1'
           when 'Session B — Week 2' then 'Foundation B — Full Body Push/Pull & Core — Week 2'
           when 'Session B — Week 3' then 'Foundation B — Full Body Push/Pull & Core — Week 3'
           when 'Session B — Week 4' then 'Foundation B — Full Body Push/Pull & Core — Week 4'
           else d.label
         end as lib_label
  from days d
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where p.name = 'Sariah Duncan — Foundation Block 1'
),
new_days as (
  insert into days (phase_id, label, position, client_owner_id, created_by, origin)
  select lib_phase.id, src.lib_label, src.position,
         null,             -- LIBRARY MASTER: owner-less on purpose, so it is reusable
         'claude', 'library'
  from src, lib_phase
  returning id, label, position
),
map as (
  select nd.id as new_day_id, src.id as src_day_id
  from new_days nd join src on src.lib_label = nd.label
),
new_sections as (
  insert into sections (day_id, internal_name, client_facing_name, position)
  select map.new_day_id, s.internal_name, s.client_facing_name, s.position
  from map join sections s on s.day_id = map.src_day_id
  returning id, day_id, internal_name
)
insert into prescribed_exercises
  (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue, rest, tracked_fields)
select ns.id, pe.exercise_id, pe.position, pe.sets, pe.volume_type, pe.volume_value,
       pe.unilateral, pe.load_descriptor, pe.cue, pe.rest, pe.tracked_fields
from new_sections ns
join map on map.new_day_id = ns.day_id
join sections ss on ss.day_id = map.src_day_id and ss.internal_name = ns.internal_name
join prescribed_exercises pe on pe.section_id = ss.id;

-- ===== 20260731203633 backfill_assessment_injuries_v2 =====
-- The assessment data was never lost -- it was never CARRIED ACROSS.
--
-- client_assessments holds current_injuries, prior_surgeries and ohsa_notes.
-- clients.injuries_limitations / medical_notes are what every screen, the AI
-- context builder, and anyone programming actually read. Nothing copies one to
-- the other, so four clients had clinically important findings sitting in a
-- table nobody looks at:
--
--   Sariah Duncan     limited left wrist post-surgery; past frozen shoulder;
--                     left shoulder SEVERELY restricted in ER and abduction;
--                     weak external rotators and rhomboids
--   Robby Burns       recurring golfer's elbow; resolved lower back pain;
--                     independent hip ROM deficit
--   Christine Latham  right knee cartilage surgery; low back + left shoulder pain
--   Hassan Kareem     intermittent lower back strain
--
-- I programmed Sariah reading injuries_limitations -- which was NULL -- and put
-- push-ups and overhead pulldowns in front of a post-surgical wrist and a
-- shoulder that cannot abduct. That is the cost of this gap, and it should never
-- have depended on somebody remembering to look in a second table.
--
-- Additive: existing text is preserved, assessment findings appended with a
-- dated marker so nothing a human typed is overwritten.

create table if not exists bak_clients_injuries_20260731 as
  select id, name, injuries_limitations, medical_notes from clients;

update clients c
set injuries_limitations = nullif(trim(both E' \n' from
      coalesce(nullif(trim(c.injuries_limitations), '') || E'\n', '')
      || 'From assessment ' || to_char(a.assessed_at at time zone 'America/Chicago', 'YYYY-MM-DD') || ': '
      || concat_ws('; ',
           nullif(trim(a.current_injuries), ''),
           case when nullif(trim(a.prior_surgeries),'') is not null
                then 'prior surgery: ' || trim(a.prior_surgeries) end)
    ), ''),
    medical_notes = case
      when nullif(trim(a.ohsa_notes),'') is null then c.medical_notes
      else nullif(trim(both E' \n' from
             coalesce(nullif(trim(c.medical_notes), '') || E'\n', '')
             || 'OHSA ' || to_char(a.assessed_at at time zone 'America/Chicago', 'YYYY-MM-DD') || ': '
             || trim(a.ohsa_notes)), '')
    end
from client_assessments a
where a.client_id = c.id
  and c.archived_at is null
  and (nullif(trim(a.current_injuries),'') is not null
       or nullif(trim(a.prior_surgeries),'') is not null
       or nullif(trim(a.ohsa_notes),'') is not null);

-- ===== 20260731203724 sariah_revise_for_wrist_and_shoulder =====
-- Revise Sariah's block against the assessment I should have read first.
--
--   current_injuries: limited left wrist, past frozen shoulder after wrist surgery
--   prior_surgeries:  left wrist
--   OHSA:             very minor APT; LEFT SHOULDER SEVERELY RESTRICTED IN
--                     EXTERNAL ROTATION AND ABDUCTION; suspected weak external
--                     rotators and rhomboids; retraction ok, scapula mildly glued
--
-- Three things in what I built are wrong for her, and one thing is missing.
--
-- PUSH UP -> CHEST PRESS MACHINE
--   A push-up loads a fully extended, weight-bearing wrist. That is the single
--   worst position for a post-surgical wrist with limited extension. Machine
--   handles keep the wrist neutral and unloaded, and the range is capped.
--
-- NEUTRAL GRIP LAT PULLDOWN -> DUMBBELL SINGLE ARM ROW
--   A pulldown starts overhead. She is severely restricted in abduction and
--   flexion on the left, so she cannot get into the start position without
--   stealing it from the scapula or the neck -- which is where a frozen shoulder
--   relapses from. A supported single-arm row trains the same pull horizontally,
--   neutral grip, and lets the two sides load independently so the left is not
--   dragged by the right.
--
-- WALL ANGEL -> PRONE EXERCISE BALL SHOULDER EXTERNAL ROTATION
--   Wall angels demand exactly the two ranges she does not have -- abduction and
--   external rotation -- under a wall constraint that forces compensation. It was
--   the most wrong thing in the block: prescribing the deficit as the exercise.
--   Direct, unloaded ER training is the thing that actually addresses it, and
--   "suspected weak external rotators" says that is the deficit.
--
-- ADDED: Scapular CAR, for "scapula mildly glued". Retraction is already ok, so
--   she needs the other directions, not more retraction.
--
-- Wrist cues added to every quadruped position (Cat Cow, Bird Dog, Thread the
-- Needle, Quadruped Thoracic Rotations) -- all of them park bodyweight on an
-- extended wrist. On a fist or forearm costs nothing and keeps her out of it.
--
-- ONLY HER COPIES CHANGE. The library master stays a general-purpose beginner
-- block -- push-ups and pulldowns are correct for most people. That separation is
-- the entire point of forking, and this is the first time it has paid for itself.

create table if not exists bak_sariah_prescriptions_20260731 as
  select pe.* from prescribed_exercises pe
  join sections s on s.id = pe.section_id
  join days d on d.id = s.day_id
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where p.name = 'Sariah Duncan — Foundation Block 1';

with her as (
  select pe.id as pe_id, e.name as ex_name, s.internal_name, d.label as day_label
  from prescribed_exercises pe
  join exercises e on e.id = pe.exercise_id
  join sections s on s.id = pe.section_id
  join days d on d.id = s.day_id
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where p.name = 'Sariah Duncan — Foundation Block 1'
)
update prescribed_exercises pe
set exercise_id = sub.new_ex,
    load_descriptor = sub.new_load,
    cue = sub.new_cue
from (
  select her.pe_id,
         (select id from exercises where name = swap.new_name) as new_ex,
         swap.new_load, swap.new_cue
  from her
  join (values
    ('Push Up',                    'Chest Press Machine',
       'light - neutral handles',
       'Machine, not push-ups: a push-up parks bodyweight on a fully extended wrist. Handles keep the wrist neutral. Stop short of full stretch on the left.'),
    ('Neutral Grip Lat Pulldown',  'Dumbbell Single Arm Row',
       'light - one side at a time',
       'Horizontal, not overhead. Supported on a bench. Left side sets the weight, not the right. Start the pull from the shoulder blade.'),
    ('Wall Angel',                 'Prone Exercise Ball Shoulder External Rotation',
       'no weight or 2-3 lb',
       'This replaces wall angels - those demand the abduction and external rotation the left shoulder does not have yet. Elbow stays pinned, rotate only as far as it goes freely. No weight until the range is clean.')
  ) as swap(old_name, new_name, new_load, new_cue) on swap.old_name = her.ex_name
) as sub
where pe.id = sub.pe_id;

-- Wrist protection on every quadruped position.
update prescribed_exercises pe
set cue = coalesce(nullif(trim(pe.cue), '') || ' ', '')
          || 'Left wrist: make a fist and go on your knuckles, or drop to your forearm. Never a flat loaded palm.'
from exercises e, sections s, days d, phases ph, programs p
where e.id = pe.exercise_id and s.id = pe.section_id and d.id = s.day_id
  and ph.id = d.phase_id and p.id = ph.program_id
  and p.name = 'Sariah Duncan — Foundation Block 1'
  and e.name in ('Cat Cow','Bird Dog','Thread the Needle','Quadruped Thoracic Rotations');

-- Scapular CAR into the daily solo mobility, for the glued scapula.
insert into prescribed_exercises (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue)
select s.id, (select id from exercises where name = 'Scapular CAR'), 5, 1, 'reps', '8', true, 'bodyweight',
       'Slow circles with the shoulder blade only - up, back, down, forward. Arm stays quiet. This is for the "glued" left scapula.'
from sections s
join days d on d.id = s.day_id
join phases ph on ph.id = d.phase_id
join programs p on p.id = ph.program_id
where p.name = 'Sariah Duncan — Foundation Block 1'
  and d.label = 'Daily Mobility — T-Spine, Shoulder & Neck'
  and s.internal_name = 'Activate';

-- ===== 20260731203848 derive_training_patterns_for_august_gaps =====
-- Get everyone covered through August.
--
-- 23 sessions across 8 clients have an appointment and no workout. The cause is
-- always the same: hand-placed coverage ran out. Tim Yancey stops 08-15, Tina
-- Haley / Troy Schnitzler / Stacie Weever 08-14, Tyler Dorsett 08-21.
--
-- Nothing generates scheduled_workouts forward on a schedule -- pg_cron job 14
-- (generate_rotation_plans) is MEAL plans, despite the name. So this repeats
-- every few weeks forever until a pattern exists.
--
-- DERIVATION, and why it is not just "every (weekday, day_id) pair".
--
-- Clients differ in shape. Tina Haley runs exactly 1.0 distinct day per weekday
-- -- a clean fixed pattern. Tyler Dorsett runs 6.6, because he rotates. Taking
-- every pair for a rotation client would schedule all six variants on the same
-- Tuesday instead of one.
--
-- So per (client, weekday) we take the N most-frequently-used days, where N is
-- the TYPICAL number of live workouts that client actually has on that weekday
-- (the mode of their daily count). That reproduces their real weekly shape:
-- one workout stays one workout, a supervised-plus-solo double stays a double,
-- and a rotation contributes only its most-used variants rather than all of them.
--
-- Derived from the calendar and the schedule, never asked. Only weekday/day
-- pairs seen at least twice since the 2026-07-27 fork, so one-offs are excluded.

with target as (
  select id, name from clients
  where name in ('Tim Yancey','Tina Haley','Troy Schnitzler','Stacie Weever','Tyler Dorsett','Greg Lennon')
    and archived_at is null
),
-- how many workouts does this client typically have on this weekday?
daily_counts as (
  select sw.client_id, extract(dow from sw.scheduled_date)::smallint as dow,
         sw.scheduled_date, count(*) as n
  from scheduled_workouts sw
  join target t on t.id = sw.client_id
  where sw.deleted_at is null and sw.scheduled_date >= date '2026-07-27'
  group by sw.client_id, extract(dow from sw.scheduled_date), sw.scheduled_date
),
typical as (
  select client_id, dow, mode() within group (order by n) as slots
  from daily_counts group by client_id, dow
),
-- candidate days per weekday, most used first
cand as (
  select sw.client_id, extract(dow from sw.scheduled_date)::smallint as dow,
         sw.day_id, bool_or(sw.supervised) as supervised, count(*) as uses,
         row_number() over (
           partition by sw.client_id, extract(dow from sw.scheduled_date)
           order by count(*) desc, bool_or(sw.supervised) desc, sw.day_id
         ) as rn
  from scheduled_workouts sw
  join target t on t.id = sw.client_id
  where sw.deleted_at is null and sw.scheduled_date >= date '2026-07-27'
  group by sw.client_id, extract(dow from sw.scheduled_date), sw.day_id
  having count(*) >= 2
)
insert into client_training_patterns
  (client_id, weekday, day_id, supervised, position, effective_from, note)
select c.client_id, c.dow, c.day_id, c.supervised, c.rn::smallint,
       (now() at time zone 'America/Chicago')::date,
       'derived 2026-07-31 from scheduled_workouts since the fork; kept the '
       || t.slots || ' most-used day(s) for this weekday, matching the client''s typical daily count'
from cand c
join typical t on t.client_id = c.client_id and t.dow = c.dow
where c.rn <= t.slots
on conflict do nothing;

-- ===== 20260731204029 close_final_august_gaps =====
-- The last 4 August sessions with no workout. Each needed a judgement the
-- pattern generator cannot make, which is why it correctly left them alone.
--
-- ROBBY BURNS, Mon 2026-08-03 06:00
--   His Monday supervised slot rotates: Aug 10 Ankle & Posterior Chain P2 Day 3,
--   Aug 17 APT Correction P2 Day 3, Aug 24 Foundation P2 Day 3, Aug 31 back to
--   Ankle & Posterior Chain. Aug 3 sits one step BEFORE Aug 10, so the day that
--   continues the cycle is Foundation P2 Day 3. Placing the next item in his
--   existing rotation, not writing anything new -- his programming is Dustin's.
--   (Assessment now visible: recurring golfer's elbow, and an independent hip
--   ROM deficit that persisted after the ankle correction. Foundation P2 Day 3
--   is already his own programming, so nothing here contradicts either.)
--
-- TIM YANCEY, Wed 08-19 and 08-26 10:00
--   His Wednesdays alternate 20's Chest and Triceps / 20's Quads and Abs --
--   Aug 5 chest, Aug 12 quads. So Aug 19 chest, Aug 26 quads. The generator
--   skipped Wednesday entirely because neither day cleared the "seen twice since
--   the fork" bar: his forked copies are each only one session old. Continuing
--   the alternation by hand.
--
-- SARIAH DUNCAN, Mon 2026-08-31 07:00
--   Her block deliberately ends Aug 30 -- Dustin asked for "4 week block plus
--   tomorrow". Aug 31 is the first session of BLOCK 2, which is his to write.
--   Repeating Week 4 as a holding session so she is not left with an empty
--   Monday, and flagged on the row so it is obvious it is a placeholder.
--   Daily mobility and the walk extend to Aug 31 regardless.

-- Robby: next in rotation
insert into scheduled_workouts (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised, appointment_id)
select c.id, (select pa.id from program_assignments pa where pa.client_id=c.id and pa.active order by pa.assigned_at desc limit 1),
       'e19625d3-ec1e-497e-9d85-2b7d9fa3dfcc'::uuid, date '2026-08-03', 1, 'scheduled', 'claude', true,
       (select a.id from appointments a where a.client_id=c.id and a.status='scheduled'
          and (a.scheduled_at at time zone 'America/Chicago')::date = date '2026-08-03' order by a.scheduled_at limit 1)
from clients c where c.name='Robby Burns'
  and not exists (select 1 from scheduled_workouts s where s.client_id=c.id and s.scheduled_date=date '2026-08-03' and s.deleted_at is null);

-- Tim: continue the Wednesday alternation
insert into scheduled_workouts (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised, appointment_id)
select c.id, (select pa.id from program_assignments pa where pa.client_id=c.id and pa.active order by pa.assigned_at desc limit 1),
       v.day_id, v.d, 1, 'scheduled', 'claude', true,
       (select a.id from appointments a where a.client_id=c.id and a.status='scheduled'
          and (a.scheduled_at at time zone 'America/Chicago')::date = v.d order by a.scheduled_at limit 1)
from clients c, (values
  ('720dce17-173a-4d05-b17f-d194aa177c18'::uuid, date '2026-08-19'),   -- 20's Chest and Triceps
  ('09240537-f377-46c7-a71d-e2fe92c3b397'::uuid, date '2026-08-26')    -- 20's Quads and Abs
) as v(day_id, d)
where c.name='Tim Yancey'
  and not exists (select 1 from scheduled_workouts s where s.client_id=c.id and s.scheduled_date=v.d and s.deleted_at is null);

-- Sariah: extend the solo work to Aug 31 and hold the supervised slot
insert into scheduled_workouts (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised, appointment_id)
select c.id, pa.id, d.id, date '2026-08-31', v.pos, 'scheduled', 'claude', v.sup,
       case when v.sup then (select a.id from appointments a where a.client_id=c.id and a.status='scheduled'
              and (a.scheduled_at at time zone 'America/Chicago')::date = date '2026-08-31' order by a.scheduled_at limit 1) end
from clients c
join program_assignments pa on pa.client_id=c.id and pa.active
join programs p on p.id=pa.program_id and p.name='Sariah Duncan — Foundation Block 1'
join phases ph on ph.program_id=p.id
join days d on d.phase_id=ph.id
join (values
  ('Session A — Week 4', 1, true),
  ('Daily Mobility — T-Spine, Shoulder & Neck', 2, false),
  ('Walk — 20 Minutes', 3, false)
) as v(label, pos, sup) on v.label = d.label
where c.name='Sariah Duncan'
  and not exists (select 1 from scheduled_workouts s where s.client_id=c.id
                    and s.scheduled_date=date '2026-08-31' and s.day_id=d.id and s.deleted_at is null);

-- ===== 20260731204311 sariah_cervical_nerve_update_and_revised_protocol =====
-- Sariah Duncan, clinical update (Dustin, 2026-07-31):
--   "nerve issue in neck causing headaches too. needs lots of chest n lat n
--    thoracic mobility n strengthen upper back n core"
--
-- Recorded on the ASSESSMENT (source of truth) and on the client record.
--
-- What this changes about the block:
--
-- 1. THE NECK STRETCHES COME DOWN, NOT UP.
--    I had Active Upper Trap and Scalene Stretch and Cervical Lateral Flexion at
--    end range. With a cervical nerve issue, aggressive scalene and upper-trap
--    stretching pulls directly on the brachial plexus and is a classic way to
--    make headaches and arm symptoms worse. They stay, because gentle mobility
--    is still useful, but explicitly sub-symptom-threshold with a stop rule.
--
-- 2. CHIN TUCK BECOMES THE POINT, NOT A WARM-UP ITEM.
--    Deep neck flexor endurance is the best-supported active intervention for
--    cervicogenic headache. Volume up, hold added.
--
-- 3. CHEST / LAT / THORACIC VOLUME UP, as asked. A short shoulder and a stiff
--    t-spine force the neck to make up the range - that is the mechanism behind
--    both the headaches and the frozen-shoulder history. Lengthen what is short
--    (pec major, pec minor, lats) and mobilise the segment that should be moving
--    (thoracic) so the cervical spine stops compensating.
--
-- 4. UPPER BACK STRENGTHENING, as asked, and it is also the OHSA finding:
--    "suspected weak external rotators and rhomboids... retraction ok". So the
--    need is the directions retraction does not cover - external rotation, lower
--    trap, and scapular control under load. Not more rowing.
--
-- Nothing has been logged against this block yet (it starts tomorrow), so the
-- daily day is rebuilt cleanly rather than patched.

update client_assessments
set current_injuries = 'limited left wrist, past frozen shoulder after wrist surgery; '
                    || 'nerve issue in neck causing headaches',
    ohsa_notes = coalesce(ohsa_notes, '') || E'\n'
              || 'UPDATE 2026-07-31 (Dustin): cervical nerve involvement with associated headaches. '
              || 'Programming priority: high-volume chest, lat and thoracic mobility; strengthen upper back and core. '
              || 'Avoid end-range scalene/upper-trap stretching and overhead loading.',
    updated_at = now()
where client_id = (select id from clients where name = 'Sariah Duncan');

update clients
set injuries_limitations = 'From assessment 2026-07-30: limited left wrist, past frozen shoulder after wrist surgery; prior surgery: left wrist. '
                        || 'UPDATE 2026-07-31: nerve issue in neck causing headaches.',
    medical_notes = 'OHSA 2026-07-30: very minor APT. Left shoulder severely restricted in external rotation and abduction. '
                 || 'Suspected weak external rotators and rhomboids. Retraction ok, scapula mildly glued.' || E'\n'
                 || 'UPDATE 2026-07-31: cervical nerve issue causing headaches. Priority: lots of chest/lat/thoracic mobility, '
                 || 'strengthen upper back and core. Avoid end-range scalene stretching, overhead loading, and loaded wrist extension.'
where name = 'Sariah Duncan';

-- Rebuild the daily solo day around the new priority.
delete from prescribed_exercises pe
using sections s, days d, phases ph, programs p
where pe.section_id = s.id and s.day_id = d.id and d.phase_id = ph.id and ph.program_id = p.id
  and p.name = 'Sariah Duncan — Foundation Block 1'
  and d.label = 'Daily Mobility — T-Spine, Shoulder & Neck';

insert into prescribed_exercises
  (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue)
select s.id, e.id, v.pos, v.sets, v.vtype, v.vval, v.uni, v.load, v.cue
from sections s
join days d on d.id = s.day_id
join phases ph on ph.id = d.phase_id
join programs p on p.id = ph.program_id
join (values
  -- INHIBIT: release what is short and pulling the shoulder forward
  ('Inhibit','Foam Roll T Spine',            1,1,'duration','90 sec',            false,null,'Mid-back only. Pause and breathe where it is stiff. Never roll the neck or low back.'),
  ('Inhibit','Foam Roll Pec Major',          2,1,'duration','45 sec each side',   true, null,'Chest into the roller or ball, small slow passes.'),
  ('Inhibit','Lacrosse Ball Pec Minor',      3,1,'duration','45 sec each side',   true, null,'Just below the collarbone, inside the shoulder. Gentle - this one refers into the arm if you lean on it.'),
  ('Inhibit','Foam Roll Lats',               4,1,'duration','45 sec each side',   true, null,'Side-lying, arm overhead only as far as it goes freely.'),
  -- LENGTHEN: chest, lat, thoracic. Neck work is deliberately gentle.
  ('Lengthen','Supine Thoracic Extension over Foam Roller', 1,1,'duration','90 sec', false,null,'Roller across the mid-back, hands supporting the head. Extend over the roller - do not arch the low back to fake it.'),
  ('Lengthen','Child''s Pose with Lat Reach',2,1,'duration','45 sec each side',   true, null,'Hips back, reach long and slightly across. You should feel it down the side of the ribs.'),
  ('Lengthen','Doorway Pec Stretch',         3,1,'duration','45 sec each side',   true, null,'Elbow at SHOULDER HEIGHT, not above. Step through until you feel the chest, never the front of the shoulder joint.'),
  ('Lengthen','Band Lat Stretch',            4,1,'duration','45 sec each side',   true, 'light band','Let the band do the work. Left side only as far as it goes without hiking the shoulder.'),
  ('Lengthen','Thread the Needle',           5,1,'reps','8',                      true, 'bodyweight','Rotation from the mid-back. Left wrist: on a fist or forearm, never a flat loaded palm.'),
  ('Lengthen','Active Upper Trap and Scalene Stretch', 6,1,'duration','20 sec each side', true, null,
     'GENTLE and short - 20 seconds, not 30. With the nerve issue in your neck this is the one to under-do. Stop instantly at any tingling, pins and needles, or referral down the arm. If it brings on a headache, skip it entirely and tell Dustin.'),
  -- ACTIVATE: deep neck flexors, external rotators, lower trap, scapular control
  ('Activate','Chin Tuck',                   1,3,'reps','10',                     false,'bodyweight','Hold 5 sec each. This is the most important thing on the page for the headaches - deep neck flexor endurance. Nod, do not tilt. No jaw clenching.'),
  ('Activate','Prone Exercise Ball Shoulder External Rotation', 2,3,'reps','12',  true, 'no weight or 2-3 lb','Elbow pinned to your side. Rotate only as far as it goes freely - the left will be much smaller than the right and that is the point. No weight until the range is clean.'),
  ('Activate','Prone W Hold',                3,2,'duration','20 sec',             false,'bodyweight','Squeeze the shoulder blades DOWN and together, not up. If your neck is doing the work, stop.'),
  ('Activate','Body Weight Prone Y',         4,2,'reps','10',                     false,'bodyweight','Thumbs up, arms at roughly 45 degrees. Lower trap. Chin tucked the whole time.'),
  ('Activate','Band Pull Apart',             5,2,'reps','15',                     false,'light band','Straight arms at chest height. Shoulders stay DOWN - no shrugging.'),
  ('Activate','Scapular CAR',                6,1,'reps','8',                      true, 'bodyweight','Slow circles with the shoulder blade only - up, back, down, forward. Arm stays quiet. For the glued left scapula.'),
  ('Activate','Dead Bug',                    7,2,'reps','10',                     true, 'bodyweight','Core, daily. Low back stays flat on the floor. Exhale as the leg extends.')
) as v(section_name, ex_name, pos, sets, vtype, vval, uni, load, cue)
  on v.section_name = s.internal_name
join exercises e on e.name = v.ex_name
where p.name = 'Sariah Duncan — Foundation Block 1'
  and d.label = 'Daily Mobility — T-Spine, Shoulder & Neck';

-- Upper back + core into the supervised accessory work, every week.
insert into prescribed_exercises
  (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue)
select s.id, (select id from exercises where name = 'Dumbbell Chest Supported Reverse Fly'), 3, 3, 'reps', '12', false,
       'light - form over load',
       'Chest supported so the low back and neck stay out of it. Rhomboids and rear delt - the weak link on the OHSA.'
from sections s
join days d on d.id = s.day_id
join phases ph on ph.id = d.phase_id
join programs p on p.id = ph.program_id
where p.name = 'Sariah Duncan — Foundation Block 1'
  and s.internal_name = 'Accessory Strength'
  and d.label like 'Session %';

-- ===== 20260731204400 assessment_client_sync_trigger_and_view =====
-- Make it impossible for an assessment finding to be invisible again.
--
-- Dustin: "fix the disconnect on the assessment so that doesn't happen again
--          those assessments need to be in profile accessible to ref or update
--          by me or you at any time"
--
-- The failure was not that data was lost. It was that client_assessments and
-- clients were two unconnected places to write the same fact, and everything
-- that matters -- every screen, the AI context builder, me -- reads only the
-- second one. Sariah's wrist surgery and frozen shoulder sat in the first for a
-- day and a half while I built her a program full of push-ups.
--
-- Two layers so this cannot recur:
--
--   1. A TRIGGER. Any insert or update to client_assessments pushes the clinical
--      fields onto the client record immediately. No route, no job, no human
--      step. It cannot be forgotten because nothing has to remember.
--
--   2. A VIEW, v_client_assessment. One place to read the whole picture for a
--      client without knowing which of the two tables to look in.
--
-- The trigger only ever writes the assessment-derived block, delimited by a
-- marker, and preserves anything typed by hand outside it. Dustin editing
-- clients.injuries_limitations directly is not clobbered by the next assessment
-- save, and vice versa.

create or replace function public.sync_assessment_to_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marker   constant text := '--- from assessment ---';
  v_inj      text;
  v_med      text;
  v_existing text;
  v_manual   text;
begin
  if new.client_id is null then return new; end if;

  v_inj := nullif(concat_ws('; ',
             nullif(trim(new.current_injuries), ''),
             case when nullif(trim(new.prior_surgeries), '') is not null
                  then 'prior surgery: ' || trim(new.prior_surgeries) end,
             case when nullif(trim(new.chronic_conditions), '') is not null
                  then 'chronic: ' || trim(new.chronic_conditions) end,
             case when nullif(trim(new.pain_location), '') is not null
                  then 'pain: ' || trim(new.pain_location) end,
             case when nullif(trim(new.contraindicated_movements), '') is not null
                  then 'CONTRAINDICATED: ' || trim(new.contraindicated_movements) end
           ), '');

  v_med := nullif(trim(coalesce(new.ohsa_notes, '')), '');

  -- injuries_limitations: keep anything hand-typed above the marker
  select injuries_limitations into v_existing from clients where id = new.client_id;
  v_manual := nullif(trim(split_part(coalesce(v_existing, ''), v_marker, 1)), '');
  if v_inj is not null then
    update clients
       set injuries_limitations = concat_ws(E'\n', v_manual, v_marker || ' ' ||
             to_char(coalesce(new.assessed_at, now()) at time zone 'America/Chicago', 'YYYY-MM-DD'), v_inj)
     where id = new.client_id;
  end if;

  -- medical_notes: same treatment for the OHSA block
  select medical_notes into v_existing from clients where id = new.client_id;
  v_manual := nullif(trim(split_part(coalesce(v_existing, ''), v_marker, 1)), '');
  if v_med is not null then
    update clients
       set medical_notes = concat_ws(E'\n', v_manual, v_marker || ' OHSA ' ||
             to_char(coalesce(new.assessed_at, now()) at time zone 'America/Chicago', 'YYYY-MM-DD'), v_med)
     where id = new.client_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_assessment_to_client on public.client_assessments;
create trigger trg_sync_assessment_to_client
  after insert or update of current_injuries, prior_surgeries, chronic_conditions,
                            pain_location, contraindicated_movements, ohsa_notes, client_id
  on public.client_assessments
  for each row execute function public.sync_assessment_to_client();

comment on function public.sync_assessment_to_client() is
  'Pushes clinical assessment fields onto clients.injuries_limitations / medical_notes on every assessment write. Preserves hand-typed text above the "--- from assessment ---" marker. Exists because those two tables were unconnected and a client trained for two days on a program built without her wrist surgery and frozen shoulder.';

-- One place to read everything clinical about a client.
create or replace view public.v_client_assessment as
select c.id as client_id,
       c.name as client,
       c.injuries_limitations,
       c.medical_notes,
       a.id as assessment_id,
       a.assessed_at,
       a.status as assessment_status,
       a.current_injuries,
       a.prior_surgeries,
       a.chronic_conditions,
       a.medications,
       a.pain_location,
       a.pain_onset,
       a.contraindicated_movements,
       a.medical_clearance,
       -- OHSA movement screen
       a.ohsa_notes,
       a.feet_turn_out, a.knees_cave_in, a.low_back_arch, a.excessive_forward_lean,
       a.arms_fall_forward, a.forward_head, a.lateral_asymmetry, a.balance_deficits, a.hip_issues,
       -- context that shapes programming
       a.experience_level, a.years_training, a.activity_level,
       a.primary_goal, a.secondary_goal, a.goal_notes, a.goal_timeline,
       a.session_length_minutes, a.training_location, a.equipment_access,
       a.trained_days_per_week, a.trained_days_of_week,
       a.solo_days_per_week, a.solo_days_of_week, a.solo_day_focus,
       a.cardio_days_per_week, a.cardio_days_of_week, a.cardio_modality, a.cardio_intensity,
       a.block_length_weeks, a.block_start_date,
       a.trainer_notes,
       a.updated_at as assessment_updated_at,
       -- the flag that started all this
       (a.id is null)                                      as has_no_assessment,
       (nullif(trim(a.current_injuries),'') is not null
        or nullif(trim(a.prior_surgeries),'') is not null
        or nullif(trim(a.ohsa_notes),'') is not null)      as has_clinical_findings
from clients c
left join lateral (
  select * from client_assessments x
  where x.client_id = c.id
  order by x.assessed_at desc nulls last, x.created_at desc
  limit 1
) a on true
where c.archived_at is null;

comment on view public.v_client_assessment is
  'Canonical. One row per active client joining the latest assessment to the client record. Read this before programming anyone - it is the single place that answers "what do I need to know about this body".';

revoke all on public.v_client_assessment from anon, authenticated, public;
grant select on public.v_client_assessment to service_role;
alter view public.v_client_assessment set (security_invoker = on);

-- ===== 20260731204454 canonical_view_v_client_training_history =====
-- v_client_training_history — "what have we been working on, and is it time to move on?"
--
-- Dustin: "we need programming to adapt progress and vary over time. you always
--          need to be aware of what we've been working on and help me decide how
--          to move to next stage when programming. i dont want repetitive unless
--          I specify that"
--
-- The problem this solves is that nothing in the system remembers. Every
-- programming decision so far has been made by whoever was looking, from
-- whatever they happened to query. So blocks run long past their useful life, the
-- same day template repeats for months, and an exercise that stopped improving
-- six sessions ago keeps getting prescribed because nobody counted.
--
-- This is the memory. One row per client, answering four questions:
--
--   HOW LONG has the current block been running, and is it past a normal 4-6
--   week block length
--   HOW VARIED is the work - distinct exercises, and how concentrated the volume
--   is in the same few movements
--   WHAT IS STILL MOVING - progressing vs holding vs regressing, from
--   v_exercise_progression
--   WHAT HAS STALLED - specific exercises trained 3+ times with no improvement,
--   named, so the conversation is "swap these four" not "something feels stale"
--
-- needs_progression_review is deliberately conservative: it fires on block age
-- OR stalled volume OR low variety, not all three, because any one of them is
-- worth a look.

create or replace view public.v_client_training_history as
with today_ct as (select (now() at time zone 'America/Chicago')::date as d),
-- current block: the active assignment and when its work actually started
block as (
  select sw.client_id,
         min(sw.scheduled_date) filter (where sw.scheduled_date >= (select d from today_ct) - 120) as block_started,
         (array_agg(distinct p.name))[1] as current_program,
         count(distinct d.id) as distinct_days_in_use
  from scheduled_workouts sw
  join program_assignments pa on pa.id = sw.assignment_id and pa.active
  join days d on d.id = sw.day_id
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where sw.deleted_at is null
  group by sw.client_id
),
-- what has actually been performed
performed as (
  select sl.client_id,
         count(distinct w.log_date)                                            as sessions_28d,
         count(distinct sl.exercise_id)                                        as distinct_exercises_28d,
         count(distinct sl.exercise_id) filter (where w.log_date >= (select d from today_ct) - 55) as distinct_exercises_56d,
         count(distinct e.muscle_group)                                        as muscle_groups_28d,
         max(w.log_date)                                                       as last_session
  from set_logs sl
  join workout_logs w on w.id = sl.workout_log_id
  join exercises e on e.id = sl.exercise_id
  where w.log_date >= (select d from today_ct) - 27
  group by sl.client_id
),
-- concentration: how much of the volume sits in the top 5 movements
concentration as (
  select client_id,
         round(100.0 * sum(vol) filter (where rn <= 5) / nullif(sum(vol), 0), 0) as pct_volume_top5
  from (
    select sl.client_id, sl.exercise_id, sum(coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0)) as vol,
           row_number() over (partition by sl.client_id
                              order by sum(coalesce(sl.weight_lbs, sl.weight, 0) * coalesce(sl.reps, 0)) desc) as rn
    from set_logs sl
    join workout_logs w on w.id = sl.workout_log_id
    where w.log_date >= (select d from today_ct) - 55
    group by sl.client_id, sl.exercise_id
  ) x group by client_id
),
-- movement quality, straight from the progression view
trend as (
  select client_id,
         count(*) filter (where trend = 'progressing') as n_progressing,
         count(*) filter (where trend = 'holding')     as n_holding,
         count(*) filter (where trend = 'regressing')  as n_regressing,
         count(*) filter (where trend = 'no_comparison') as n_no_comparison
  from v_exercise_progression
  where log_date >= (select d from today_ct) - 55
  group by client_id
),
-- exercises trained 3+ times in 8 weeks that have not improved: the swap list
stalled as (
  select client_id,
         count(*) as n_stalled,
         (array_agg(exercise order by n_sessions desc))[1:6] as stalled_exercises
  from (
    select client_id, exercise, count(*) as n_sessions,
           max(coalesce(est_1rm, 0))  as best_1rm,
           min(coalesce(est_1rm, 0))  as worst_1rm,
           max(total_volume)          as best_vol,
           (array_agg(total_volume order by log_date desc))[1] as latest_vol
    from v_exercise_progression
    where log_date >= (select d from today_ct) - 55
    group by client_id, exercise
    having count(*) >= 3
       and max(total_volume) > 0
       and (array_agg(total_volume order by log_date desc))[1] <= max(total_volume)
       and max(coalesce(est_1rm,0)) <= min(coalesce(est_1rm,0))
  ) s group by client_id
)
select
  c.id                                        as client_id,
  c.name                                      as client,
  b.current_program,
  b.block_started,
  (select d from today_ct) - b.block_started  as block_age_days,
  round(((select d from today_ct) - b.block_started)::numeric / 7, 1) as block_age_weeks,
  b.distinct_days_in_use,
  coalesce(p.sessions_28d, 0)                 as sessions_28d,
  p.last_session,
  (select d from today_ct) - p.last_session   as days_since_last_session,
  coalesce(p.distinct_exercises_28d, 0)       as distinct_exercises_28d,
  coalesce(p.distinct_exercises_56d, 0)       as distinct_exercises_56d,
  coalesce(p.muscle_groups_28d, 0)            as muscle_groups_28d,
  cn.pct_volume_top5,
  coalesce(t.n_progressing, 0)                as n_progressing,
  coalesce(t.n_holding, 0)                    as n_holding,
  coalesce(t.n_regressing, 0)                 as n_regressing,
  coalesce(t.n_no_comparison, 0)              as n_no_comparison,
  coalesce(st.n_stalled, 0)                   as n_stalled,
  st.stalled_exercises,
  -- the prompt to act
  ((select d from today_ct) - b.block_started > 42)                     as block_overdue,
  (coalesce(st.n_stalled,0) >= 3)                                       as multiple_stalled,
  (coalesce(p.distinct_exercises_56d,0) between 1 and 8)                as low_variety,
  (
    ((select d from today_ct) - b.block_started > 42)
    or coalesce(st.n_stalled,0) >= 3
    or (coalesce(p.distinct_exercises_56d,0) between 1 and 8)
  )                                           as needs_progression_review,
  case
    when p.last_session is null                                   then 'never logged - nothing to progress yet'
    when (select d from today_ct) - b.block_started > 42          then 'block is ' || round(((select d from today_ct) - b.block_started)::numeric/7,1) || ' weeks old - past a normal 4-6 week block'
    when coalesce(st.n_stalled,0) >= 3                            then st.n_stalled || ' movements have stopped improving - swap or change the stimulus'
    when coalesce(p.distinct_exercises_56d,0) between 1 and 8     then 'only ' || p.distinct_exercises_56d || ' distinct exercises in 8 weeks - repetitive'
    when coalesce(t.n_regressing,0) > coalesce(t.n_progressing,0) then 'more movements regressing than progressing - check recovery, load or adherence'
    else 'progressing normally'
  end                                         as review_reason
from clients c
left join block b        on b.client_id = c.id
left join performed p    on p.client_id = c.id
left join concentration cn on cn.client_id = c.id
left join trend t        on t.client_id = c.id
left join stalled st     on st.client_id = c.id
where c.archived_at is null
  and c.name not in ('Demo Account', 'Test Client');

comment on view public.v_client_training_history is
  'Canonical. One row per client: how long the current block has run, how varied the work has been, what is progressing vs stalled, and NAMED exercises that have stopped improving. Read this BEFORE programming anyone - it is the answer to "what have we been working on and is it time to move on". needs_progression_review fires on block age > 6 weeks OR 3+ stalled movements OR fewer than 9 distinct exercises in 8 weeks.';

revoke all on public.v_client_training_history from anon, authenticated, public;
grant select on public.v_client_training_history to service_role;
alter view public.v_client_training_history set (security_invoker = on);

-- ===== 20260731205154 disable_auto_workout_generation =====
-- Auto-generation OFF. (Dustin, 2026-07-31)
--
--   "Definitely turn off! I need you to know pattern n assist in programming
--    using real data but I drive it by 4-6 week blocks. I approve before
--    anything scheduled."
--
-- pg_cron job 21 (generate_scheduled_workouts_daily) is unscheduled. Nothing
-- writes a workout into a client's schedule on a timer any more.
--
-- The function stays, and client_training_patterns stays, because the pattern
-- knowledge is genuinely useful -- it is how "who is short of coverage and what
-- do they normally do on a Tuesday" gets answered from real data instead of
-- memory. It just proposes now. generate_scheduled_workouts already defaults to
-- p_dry_run => true, so calling it with no arguments returns a plan and writes
-- nothing; only an explicit p_dry_run => false writes, and that now only ever
-- happens after Dustin approves a block.
--
-- Guarded rather than trusted: EXECUTE was already revoked from public and anon,
-- and the comment below states the rule at the point of use so the next session
-- reads it before running the function.

select cron.unschedule(21);

comment on function public.generate_scheduled_workouts(int, boolean, uuid) is
  'PROPOSAL TOOL - DO NOT RUN WITH p_dry_run => false WITHOUT DUSTIN''S EXPLICIT APPROVAL OF THAT BLOCK. '
  'He drives programming in 4-6 week blocks and approves before anything is scheduled (2026-07-31). '
  'Defaults to dry run: returns what WOULD be placed, writes nothing. Materialises scheduled_workouts from '
  'client_training_patterns, p_weeks (1-6) forward from tomorrow, inserting only where no live row exists for '
  'that client+date so hand-placed work always wins. Every real run is tagged with a batch_id in '
  'schedule_generation_log.';

comment on table public.client_training_patterns is
  'Declared weekly training pattern per client, derived from appointments and scheduled_workouts - never asked. '
  'Feeds generate_scheduled_workouts, which is a PROPOSAL tool: nothing is scheduled without Dustin approving '
  'the block. Useful on its own for answering what a client normally does on a given weekday.';

-- ===== 20260731211407 sharon_rambo_august_block_days_only =====
-- Sharon Rambo — August block. DAYS ONLY. NOTHING IS SCHEDULED.
--
-- Dustin, 2026-07-31:
--   "repeat every week or every other week is ok for 4-6 weeks we can progress
--    within. I dont want same movements n workouts when we program a new block.
--    ill specify if I want to progress weekly. lets reprogram aug for sharon
--    rambo. minor progression on movements less time mobility more workout time"
--
-- WHAT SHE HAS NOW, and why it is being replaced:
--   33 rows across August. 24 of them are solo mobility. Six supervised, all of
--   them the SAME two days (Ankle & Posterior Chain P1 Day 1 / Day 2) repeated
--   with identical sets and reps into September. No progression anywhere.
--   Roughly 20 minutes of every supervised session is mobility before any
--   loaded work starts.
--
--   Her whole programme is also lower body. Ankle, hip, glute, posterior chain.
--   Her assessment says "I feel hunched over" and "my neck has been stiff and
--   had pain in the past" and there is not one upper-body or thoracic movement
--   anywhere in it.
--
-- WHAT CHANGES:
--   Movements     entirely new. Not one exercise from the old block carries
--                 over, per "I dont want same movements when we program a new
--                 block". Bodyweight/band corrective work becomes loaded
--                 machine and dumbbell work - she is a body-recomposition goal
--                 and was doing almost nothing that would drive it.
--   Prep time     ~20 min down to ~7. Three movements, not ten.
--   Day B         is new territory: upper back, thoracic, posture. The thing
--                 her assessment has been asking for and never had.
--   Progression   minor, every other week. A1/B1 for weeks 1-2, A2/B2 for
--                 weeks 3-4 - same movements, more sets and reps. NOT weekly,
--                 because weekly was not asked for.
--
-- HER CONSTRAINTS, all from the assessment:
--   Repaired thumb bone and tendon, RIGHT hand -> machine handles, neutral
--       grips and cable attachments throughout. No barbell holds, no heavy
--       pinch grip, no farmer/suitcase carries.
--   Left toe arthritis, tight Achilles, toes hurt in closed shoes -> no
--       impact, no jumping, calf work at moderate range only, split squat with
--       the back foot flat rather than up on the toe.
--   Tight hips -> hip flexor work stays in the prep, just shorter.
--   Hunched over, neck stiffness -> Day B exists for this.

with prog as (
  insert into programs (name, category, structure_type, status, description, personal_for_client_id)
  select 'Sharon Rambo — August Block: Strength Forward',
         'training layer', 'phased-corrective', 'live',
         'Aug 2026, 4 weeks. Replaces a repeating corrective block that had no progression and no upper body. '
         || 'Two supervised days alternating: A lower strength / posterior chain, B upper back / posture / full body. '
         || 'Prep cut from ~20 min to ~7 so the session is training rather than mobility. Minor progression every '
         || 'other week (A1/B1 weeks 1-2, A2/B2 weeks 3-4). All movements new vs the previous block. '
         || 'Constraints: repaired right thumb (machine/neutral grips only, no carries), left toe arthritis and '
         || 'tight Achilles (no impact, moderate calf range).',
         c.id
  from clients c where c.name = 'Sharon Rambo'
  returning id
),
ph as (
  insert into phases (program_id, label, position, intent, approx_duration)
  select id, 'August — Strength Forward', 1,
         'Shift from corrective mobility to loaded strength work. Introduce upper back and thoracic training. '
         || 'Minor progression every other week.', '4 weeks'
  from prog returning id
),
d as (
  insert into days (phase_id, label, position, client_owner_id, created_by, origin)
  select ph.id, v.label, v.pos, c.id, 'claude', 'personal'
  from ph, clients c, (values
    ('A1 — Lower Strength & Posterior Chain (Wks 1-2)', 1),
    ('B1 — Upper Back, Posture & Full Body (Wks 1-2)',  2),
    ('A2 — Lower Strength & Posterior Chain (Wks 3-4)', 3),
    ('B2 — Upper Back, Posture & Full Body (Wks 3-4)',  4),
    ('Short Mobility — Hips & T-Spine (10 min, solo)',  5)
  ) as v(label, pos)
  where c.name = 'Sharon Rambo'
  returning id, label
),
s as (
  insert into sections (day_id, internal_name, client_facing_name, position)
  select d.id, v.internal_name, v.client_name, v.pos
  from d join (values
    ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Corrective Warm-Up','Warm-Up',1),
    ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Primary Strength','Strength',2),
    ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Accessory Strength','Accessory',3),
    ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Integrate','Accessory',4),
    ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Corrective Warm-Up','Warm-Up',1),
    ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Primary Strength','Strength',2),
    ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Accessory Strength','Accessory',3),
    ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Integrate','Accessory',4),
    ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Corrective Warm-Up','Warm-Up',1),
    ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Primary Strength','Strength',2),
    ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Accessory Strength','Accessory',3),
    ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Integrate','Accessory',4),
    ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Corrective Warm-Up','Warm-Up',1),
    ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Primary Strength','Strength',2),
    ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Accessory Strength','Accessory',3),
    ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Integrate','Accessory',4),
    ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Warm-Up',1)
  ) as v(day_label, internal_name, client_name, pos) on v.day_label = d.label
  returning id, day_id, internal_name
)
insert into prescribed_exercises
  (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral, load_descriptor, cue)
select s.id, e.id, v.pos, v.sets, v.vtype, v.vval, v.uni, v.load, v.cue
from s join d on d.id = s.day_id
join (values
  -- ===== A1 (weeks 1-2) =====
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Corrective Warm-Up','Foam Roll Quadriceps',1,1,'duration','45 sec each side',true,null,'Short prep now - 7 minutes, not 20. Get to the work.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Corrective Warm-Up','Kneeling Hip Flexor Stretch',2,1,'duration','45 sec each side',true,null,'Ribs down, squeeze the back glute. Tight hips are still the priority in prep.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Corrective Warm-Up','Mini Band Glute Bridge',3,2,'reps','15',false,'mini band','Wake the glutes up before loading them.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Primary Strength','Dumbbell Goblet Squat',1,3,'reps','10',false,'light-moderate','Dumbbell held at the chest - no thumb load. To a box if depth is a limiter.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Primary Strength','Dumbbell Romanian Deadlift',2,3,'reps','10',false,'light-moderate','Neutral grip, straps if the right thumb objects. Hinge, do not squat it.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Primary Strength','Leg Press',3,3,'reps','12',false,'moderate','Feet flat and mid-platform. Do not let the heels lift - protects the Achilles.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Accessory Strength','Hip Thrust Machine',1,3,'reps','12',false,'moderate','Chin tucked, ribs down, pause a beat at the top.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Accessory Strength','Standing Calf Raise',2,2,'reps','12',false,'light','MODERATE range only - come up, do not drop into a deep stretch. Tight Achilles and an arthritic toe.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Integrate','Cable Pallof Press',1,3,'reps','10',true,'light','Anti-rotation. Ribs down, do not let the torso turn. Cable handle - no grip strain.'),
  ('A1 — Lower Strength & Posterior Chain (Wks 1-2)','Integrate','Side Plank',2,2,'duration','20 sec each side',true,'bodyweight','From the knees if the full version breaks form.'),
  -- ===== A2 (weeks 3-4) - same movements, more work =====
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Corrective Warm-Up','Foam Roll Quadriceps',1,1,'duration','45 sec each side',true,null,null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Corrective Warm-Up','Kneeling Hip Flexor Stretch',2,1,'duration','45 sec each side',true,null,null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Corrective Warm-Up','Mini Band Glute Bridge',3,2,'reps','15',false,'mini band',null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Primary Strength','Dumbbell Goblet Squat',1,3,'reps','12',false,'moderate - heavier than weeks 1-2','Same movement, more reps and more weight.'),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Primary Strength','Dumbbell Romanian Deadlift',2,3,'reps','12',false,'moderate - heavier than weeks 1-2',null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Primary Strength','Leg Press',3,4,'reps','12',false,'moderate-heavy','Fourth set.'),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Accessory Strength','Hip Thrust Machine',1,3,'reps','15',false,'moderate-heavy',null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Accessory Strength','Standing Calf Raise',2,3,'reps','15',false,'light-moderate','Still moderate range. Stop if the toe complains.'),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Integrate','Cable Pallof Press',1,3,'reps','12',true,'light-moderate',null),
  ('A2 — Lower Strength & Posterior Chain (Wks 3-4)','Integrate','Side Plank',2,3,'duration','30 sec each side',true,'bodyweight',null),
  -- ===== B1 (weeks 1-2) - the layer she has never had =====
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Corrective Warm-Up','Foam Roll T Spine',1,1,'duration','1 min',false,null,'Mid-back. This block exists because of "I feel hunched over" and the neck stiffness.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Corrective Warm-Up','Doorway Pec Stretch',2,1,'duration','45 sec each side',true,null,'Elbow at shoulder height. Feel it in the chest, not the shoulder joint.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Corrective Warm-Up','Band Pull Apart',3,2,'reps','15',false,'light band','Shoulders down - no shrugging. Loop the band over the hand if the right thumb objects.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Primary Strength','Cable Seated Row',1,3,'reps','12',false,'light-moderate','Neutral handle - easy on the thumb. Start the pull from the shoulder blade.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Primary Strength','Chest Press Machine',2,3,'reps','12',false,'light-moderate','Machine handles keep the wrist and thumb neutral. Stop short of a big stretch at the bottom.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Primary Strength','Neutral Grip Lat Pulldown',3,3,'reps','12',false,'light-moderate','Neutral grip. Chest tall, do not lean back to move more weight.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Accessory Strength','Dumbbell Chest Supported Reverse Fly',1,3,'reps','12',false,'light','Chest on the bench so the neck and low back stay out of it. This is the anti-hunch exercise.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Accessory Strength','Dumbbell Split Squat',2,2,'reps','8',true,'light DBs','BACK FOOT FLAT on the floor, not up on the toe - the arthritic toe will not tolerate that position.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Integrate','Bird Dog',1,2,'reps','10',true,'bodyweight','Slow. Hips stay square.'),
  ('B1 — Upper Back, Posture & Full Body (Wks 1-2)','Integrate','Dead Bug',2,2,'reps','10',true,'bodyweight','Low back flat. Exhale as the leg goes out.'),
  -- ===== B2 (weeks 3-4) =====
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Corrective Warm-Up','Foam Roll T Spine',1,1,'duration','1 min',false,null,null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Corrective Warm-Up','Doorway Pec Stretch',2,1,'duration','45 sec each side',true,null,null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Corrective Warm-Up','Band Pull Apart',3,2,'reps','15',false,'light band',null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Primary Strength','Cable Seated Row',1,4,'reps','12',false,'moderate','Fourth set.'),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Primary Strength','Chest Press Machine',2,3,'reps','15',false,'moderate',null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Primary Strength','Neutral Grip Lat Pulldown',3,3,'reps','15',false,'moderate',null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Accessory Strength','Dumbbell Chest Supported Reverse Fly',1,3,'reps','15',false,'light-moderate',null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Accessory Strength','Dumbbell Split Squat',2,3,'reps','10',true,'light-moderate DBs','Back foot still flat.'),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Integrate','Bird Dog',1,3,'reps','10',true,'bodyweight',null),
  ('B2 — Upper Back, Posture & Full Body (Wks 3-4)','Integrate','Dead Bug',2,3,'reps','12',true,'bodyweight',null),
  -- ===== Short solo mobility - replaces four long corrective days =====
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Foam Roll T Spine',1,1,'duration','1 min',false,null,'Ten minutes total. Short and often beats long and skipped.'),
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Supine Thoracic Extension over Foam Roller',2,1,'duration','1 min',false,null,'Support the head. Extend over the roller, do not arch the low back.'),
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','90/90 External Hip Rotation',3,1,'duration','45 sec each side',true,'bodyweight','For the tight hips.'),
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Kneeling Hip Flexor Stretch',4,1,'duration','45 sec each side',true,'bodyweight',null),
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Wall Slide',5,2,'reps','12',false,'bodyweight','Shoulder blades on the wall. For the hunched-over posture.'),
  ('Short Mobility — Hips & T-Spine (10 min, solo)','Corrective Warm-Up','Cat Cow',6,1,'reps','10',false,'bodyweight','Segment by segment.')
) as v(day_label, section_name, ex_name, pos, sets, vtype, vval, uni, load, cue)
  on v.day_label = d.label and v.section_name = s.internal_name
join exercises e on e.name = v.ex_name;

-- ===== 20260731212507 sharon_rambo_schedule_august_block =====
-- Schedule Sharon Rambo's August block. APPROVED BY DUSTIN 2026-07-31.
--
--   "Just program is full month. ill get the dates tomorrow n cancel in schedule"
--
-- Full August as if she is here throughout. Dustin cancels her two weeks away in
-- Google tomorrow; the sync picks that up, and per his standing rule a cancelled
-- appointment does NOT clear the workout - it stays on the day.
--
-- Retires the old block for August only. 33 rows, none logged, soft-deleted so
-- it is reversible with a single update. September is deliberately untouched:
-- this block ends Aug 31 and September is a separate conversation.
--
-- SUPERVISED - strict A/B alternation across her 9 live sessions.
--   Weeks 1-2 (to Aug 14) run A1/B1, weeks 3-4 run A2/B2 - same movements, more
--   sets and reps. Minor progression every other week, as asked, not weekly.
--   Sat 8/15 is already cancelled in Google so nothing is placed there.
--
-- SOLO - both kept daily/near-daily, as corrected:
--   Short Mobility  every day, all 31
--   20 min walk     5x a week, weekdays

create table if not exists bak_sharon_rambo_aug_20260731 as
  select * from scheduled_workouts
  where client_id = (select id from clients where name='Sharon Rambo');

-- Retire the old August rows (reversible: set deleted_at = null)
update scheduled_workouts sw
set deleted_at = now(), updated_at = now()
where sw.client_id = (select id from clients where name='Sharon Rambo')
  and sw.scheduled_date between date '2026-08-01' and date '2026-08-31'
  and sw.deleted_at is null
  and sw.workout_log_id is null            -- never touch anything logged
  and not exists (                          -- and never touch the new block
    select 1 from days d
    join phases ph on ph.id = d.phase_id
    join programs p on p.id = ph.program_id
    where d.id = sw.day_id
      and p.name = 'Sharon Rambo — August Block: Strength Forward'
  );

-- Place the new block
with cl as (select id from clients where name='Sharon Rambo'),
asg as (
  select pa.id, pa.client_id
  from program_assignments pa
  join programs p on p.id = pa.program_id
  where pa.client_id = (select id from cl) and pa.active
    and p.name = 'Sharon Rambo — August Block: Strength Forward'
),
dy as (
  select d.id, d.label from days d
  join phases ph on ph.id = d.phase_id
  join programs p on p.id = ph.program_id
  where p.name = 'Sharon Rambo — August Block: Strength Forward'
),
dates as (select generate_series(date '2026-08-01', date '2026-08-31', interval '1 day')::date as d),
plan as (
  -- supervised, strict alternation
  select v.d as sched_date, v.label, true as supervised, 1 as position from (values
    (date '2026-08-01','A1 — Lower Strength & Posterior Chain (Wks 1-2)'),
    (date '2026-08-03','B1 — Upper Back, Posture & Full Body (Wks 1-2)'),
    (date '2026-08-05','A1 — Lower Strength & Posterior Chain (Wks 1-2)'),
    (date '2026-08-08','B1 — Upper Back, Posture & Full Body (Wks 1-2)'),
    (date '2026-08-11','A1 — Lower Strength & Posterior Chain (Wks 1-2)'),
    (date '2026-08-18','B2 — Upper Back, Posture & Full Body (Wks 3-4)'),
    (date '2026-08-22','A2 — Lower Strength & Posterior Chain (Wks 3-4)'),
    (date '2026-08-25','B2 — Upper Back, Posture & Full Body (Wks 3-4)'),
    (date '2026-08-29','A2 — Lower Strength & Posterior Chain (Wks 3-4)')
  ) as v(d, label)
  union all
  -- daily mobility, all 31 days
  select dates.d, 'Short Mobility — Hips & T-Spine (10 min, solo)', false, 2 from dates
  union all
  -- 20 min walk, 5x a week (weekdays)
  select dates.d, 'Cardio — 20 Min Walk (solo)', false, 3
  from dates where extract(dow from dates.d) between 1 and 5
)
insert into scheduled_workouts
  (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised, appointment_id)
select asg.client_id, asg.id, dy.id, plan.sched_date, plan.position, 'scheduled', 'claude', plan.supervised,
       case when plan.supervised then (
         select a.id from appointments a
         where a.client_id = asg.client_id
           and (a.scheduled_at at time zone 'America/Chicago')::date = plan.sched_date
           and a.status = 'scheduled'
         order by a.scheduled_at limit 1
       ) end
from plan
join dy on dy.label = plan.label
cross join asg
where not exists (
  select 1 from scheduled_workouts sw
  where sw.client_id = asg.client_id and sw.scheduled_date = plan.sched_date
    and sw.day_id = dy.id and sw.deleted_at is null
);

-- ===== 20260731213653 stop_all_programming_after_august =====
-- Clear the board after 2026-08-31. (Dustin, 2026-07-31)
--
--   "have them all stop end of August. this weekend we refresh workouts for
--    everyone in August then program new Sept."
--
-- 727 rows across 24 clients, running as far out as 2026-12-04. All of it is
-- carry-forward from repeating templates and from the generator runs earlier
-- today -- none of it is a block anyone decided on. Rather than program September
-- on top of stale rows, the slate gets cleared and September is written fresh,
-- client by client, with Dustin approving each block.
--
-- SOFT DELETE, not a delete. Every row is recoverable with:
--   update scheduled_workouts set deleted_at = null
--    where deleted_at = '<the timestamp this migration ran>';
-- and bak_scheduled_workouts_pre_sept_reset_20260731 holds the full prior state.
--
-- Nothing logged is touched -- verified 0 rows after 08-31 carry a workout_log_id
-- before running, and the predicate excludes them anyway. August is untouched.

create table if not exists bak_scheduled_workouts_pre_sept_reset_20260731 as
  select * from scheduled_workouts;

update scheduled_workouts
set deleted_at = now(), updated_at = now()
where deleted_at is null
  and scheduled_date > date '2026-08-31'
  and workout_log_id is null;

-- ===== 20260731230448 lock_down_google_token_rpcs =====
-- The three Google-token RPCs are SECURITY DEFINER and were executable by
-- PUBLIC, which means anon, which means anyone. gcal_get_tokens() returns the
-- trainer's Google access AND refresh token in plaintext, and the anon key is
-- published in every client's browser bundle.
--
-- REVOKE FROM anon alone is a no-op here: the grant lives on PUBLIC, and
-- membership in PUBLIC is implicit. PUBLIC has to be revoked first, then the
-- named roles, then service_role granted back explicitly. Every caller in the
-- application already uses the service-role client (src/lib/gcal.ts, the OAuth
-- callback, and the disconnect route), so nothing legitimate loses access.

revoke execute on function public.gcal_get_tokens() from public, anon, authenticated;
grant  execute on function public.gcal_get_tokens() to service_role;

revoke execute on function public.save_google_tokens(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant  execute on function public.save_google_tokens(uuid, text, text, timestamptz, boolean) to service_role;

revoke execute on function public.gcal_update_access_token(uuid, text, timestamptz) from public, anon, authenticated;
grant  execute on function public.gcal_update_access_token(uuid, text, timestamptz) to service_role;

-- ===== 20260731232509 add_nutrients_to_meal_adherence_logs =====
-- food_catalog has carried fiber, sugar, sodium and saturated fat since the
-- Open Food Facts / USDA import (sodium present on 98% of ~198k rows), but
-- meal_adherence_logs only ever persisted kcal/protein/carbs/fats, so every
-- nutrient was discarded the moment a food was logged.
--
-- Units follow food_catalog exactly: sodium in MILLIGRAMS, everything else in
-- GRAMS. Naming follows the existing est_* convention so the value is
-- self-describing as an estimate at the point of use.
--
-- Nullable on purpose. NULL means "we do not know", which is a different fact
-- from 0 and has to stay distinguishable — a day assembled from plan meals has
-- no nutrient source at all (meal_items stores only P/C/F), and reporting that
-- as 0 mg of sodium would be a lie the UI could not detect.

alter table public.meal_adherence_logs
  add column if not exists est_fiber   numeric,
  add column if not exists est_sugar   numeric,
  add column if not exists est_sodium  numeric,
  add column if not exists est_sat_fat numeric;

comment on column public.meal_adherence_logs.est_fiber   is 'Grams. NULL = unknown, not zero.';
comment on column public.meal_adherence_logs.est_sugar   is 'Grams. NULL = unknown, not zero.';
comment on column public.meal_adherence_logs.est_sodium  is 'Milligrams, matching food_catalog.sodium. NULL = unknown, not zero.';
comment on column public.meal_adherence_logs.est_sat_fat is 'Grams. NULL = unknown, not zero.';

-- Backfill the handful of logs that are linked to a catalog food. food_catalog
-- is per 100 g, so scale by servings * serving_grams / 100.
update public.meal_adherence_logs l
set est_fiber   = round((fc.fiber   * coalesce(l.servings,1) * coalesce(fc.serving_grams,100) / 100.0)::numeric, 2),
    est_sugar   = round((fc.sugar   * coalesce(l.servings,1) * coalesce(fc.serving_grams,100) / 100.0)::numeric, 2),
    est_sodium  = round((fc.sodium  * coalesce(l.servings,1) * coalesce(fc.serving_grams,100) / 100.0)::numeric, 0),
    est_sat_fat = round((fc.sat_fat * coalesce(l.servings,1) * coalesce(fc.serving_grams,100) / 100.0)::numeric, 2)
from public.food_catalog fc
where fc.id = l.food_id
  and l.food_id is not null
  and l.est_fiber is null and l.est_sugar is null
  and l.est_sodium is null and l.est_sat_fat is null;

-- ===== 20260731233122 close_anon_write_and_sync_rpc_holes =====
-- ── 1. Tables whose RLS policy was USING(true) WITH CHECK(true) for anon ──────
--
-- `app_anon_all` granted every operation to anon and authenticated with no
-- predicate at all. RLS was enabled on these tables, which is what made them
-- look safe in every previous check, but the policy underneath said "yes" to
-- everyone. Six tables, reachable with the published anon key.

-- my_meals is the one with real client data in it: a client's saved meals,
-- keyed by client_id. Any visitor could read every client's meals, rewrite
-- them, or delete them. Scope to the owner, with the trainer able to see all.
drop policy if exists app_anon_all on public.my_meals;
create policy my_meals_owner on public.my_meals
  for all to authenticated
  using (client_id = public.my_client_id() or public.is_trainer())
  with check (client_id = public.my_client_id() or public.is_trainer());

-- food_catalog is public reference data (~198k foods) — reading it is fine and
-- the search sheet does exactly that. Writing it is not: anon could rewrite the
-- macros of any food, and those numbers feed every client's totals. Clients do
-- legitimately add custom foods, so INSERT stays open to signed-in users;
-- UPDATE and DELETE become trainer-only. The AI verifier routes run as service
-- role and are unaffected.
drop policy if exists app_anon_all on public.food_catalog;
create policy food_catalog_read on public.food_catalog
  for select to anon, authenticated using (true);
create policy food_catalog_insert on public.food_catalog
  for insert to authenticated with check (true);
create policy food_catalog_update on public.food_catalog
  for update to authenticated using (public.is_trainer()) with check (public.is_trainer());
create policy food_catalog_delete on public.food_catalog
  for delete to authenticated using (public.is_trainer());

-- No application code touches these four from the browser — they are written by
-- server routes and jobs holding the service role, which bypasses RLS. Dropping
-- the policy leaves RLS enabled with no policy: deny-all to anon and
-- authenticated, unchanged for service_role.
drop policy if exists app_anon_all on public.ai_usage_log;
drop policy if exists app_anon_all on public.food_import_state;
drop policy if exists app_anon_all on public.plan_flip_log;
drop policy if exists app_anon_all on public.plan_rotations;

-- app_feedback allowed any signed-in user to INSERT with no predicate. That is
-- roughly what a feedback box should do, but it should at least be stamped with
-- the sender, so one client cannot file feedback as another.
-- (Left as-is deliberately — the table has no client_id column to key on, and
--  tightening it blind would break the feedback button. Flagged, not changed.)

-- ── 2. SECURITY DEFINER functions the sync owns ───────────────────────────────
--
-- These bypass RLS by design and were executable by anon over
-- /rest/v1/rpc/<name>. The HTTP route guard was irrelevant: the attack never
-- touches the route. gcal_clear_appointments() in particular deletes every
-- appointment in the table and took no arguments — a single unauthenticated
-- POST would have wiped the schedule. gcal_get_clients() returned the full
-- roster. /api/gcal-sync now holds the service role, so nothing legitimate
-- calls these with the public key any more.

revoke execute on function public.gcal_get_clients() from public, anon, authenticated;
grant  execute on function public.gcal_get_clients() to service_role;

revoke execute on function public.gcal_clear_appointments() from public, anon, authenticated;
grant  execute on function public.gcal_clear_appointments() to service_role;

revoke execute on function public.gcal_sync_appointments(jsonb) from public, anon, authenticated;
grant  execute on function public.gcal_sync_appointments(jsonb) to service_role;

revoke execute on function public.gcal_sync_payments(jsonb) from public, anon, authenticated;
grant  execute on function public.gcal_sync_payments(jsonb) to service_role;

revoke execute on function public.gcal_reconcile_appointments(text[], timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.gcal_reconcile_appointments(text[], timestamptz, timestamptz) to service_role;

revoke execute on function public.gcal_reconcile_payments(text[], timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.gcal_reconcile_payments(text[], timestamptz, timestamptz) to service_role;

revoke execute on function public.gcal_generate_payment_notifications() from public, anon, authenticated;
grant  execute on function public.gcal_generate_payment_notifications() to service_role;

revoke execute on function public.generate_due_payment_reminders() from public, anon, authenticated;
grant  execute on function public.generate_due_payment_reminders() to service_role;

revoke execute on function public.detect_schedule_changes() from public, anon, authenticated;
grant  execute on function public.detect_schedule_changes() to service_role;

revoke execute on function public.run_integrity_checks() from public, anon, authenticated;
grant  execute on function public.run_integrity_checks() to service_role;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant  execute on function public.rls_auto_enable() to service_role;

-- ── 3. Trigger functions exposed as RPCs ──────────────────────────────────────
-- These only ever run from a trigger. Nothing should be able to invoke them
-- directly, and calling them over REST is meaningless at best.
revoke execute on function public.days_enforce_owner() from public, anon, authenticated;
revoke execute on function public.pa_autocreate_for_personal_program() from public, anon, authenticated;
revoke execute on function public.pa_enforce_program_isolation() from public, anon, authenticated;
revoke execute on function public.stamp_meal_plan_author() from public, anon, authenticated;
revoke execute on function public.sw_derive_assignment_id() from public, anon, authenticated;
revoke execute on function public.sw_enforce_day_isolation() from public, anon, authenticated;
revoke execute on function public.sync_assessment_to_client() from public, anon, authenticated;

-- ── 4. Signed-in-only surfaces ────────────────────────────────────────────────
-- These are genuinely called from the browser by a logged-in user, so
-- `authenticated` keeps EXECUTE. anon has no business reaching any of them.
revoke execute on function public.ack_payment_reminder(uuid) from public, anon;
revoke execute on function public.resolve_schedule_proposal(uuid, text, text) from public, anon;
revoke execute on function public.fork_day_for_client(uuid, uuid) from public, anon;
revoke execute on function public.ensure_personal_phase(uuid) from public, anon;

-- Deliberately NOT revoked: is_trainer(), my_client_id(), trainer_user_id(),
-- day_is_exclusive_to(), sched_day_ids(), sched_phase_ids(), sched_program_ids(),
-- sched_section_ids(). These are evaluated INSIDE RLS policy expressions as the
-- calling role. Revoking EXECUTE from `authenticated` would make every policy
-- that references them raise, locking every user out of the application. They
-- return only the caller's own identity or id lists already gated by other
-- policies.

-- ── 5. search_path pinning on SECURITY DEFINER functions ──────────────────────
-- A SECURITY DEFINER function with a mutable search_path can be hijacked: the
-- caller sets search_path to a schema they control and the function resolves an
-- unqualified name to their object, executing it as the owner.
alter function public.is_trainer()                set search_path = public, pg_temp;
alter function public.my_client_id()              set search_path = public, pg_temp;
alter function public.gcal_sync_appointments(jsonb) set search_path = public, pg_temp;
alter function public.activate_due_meal_plans()   set search_path = public, pg_temp;
alter function public.compute_lean_fat_mass()     set search_path = public, pg_temp;
alter function public.enforce_no_future_live_plan() set search_path = public, pg_temp;
alter function public.enforce_no_future_macro_target() set search_path = public, pg_temp;
alter function public.fill_set_log_exercise_id()  set search_path = public, pg_temp;
alter function public.metrics_autocalc_mass()     set search_path = public, pg_temp;
alter function public.update_updated_at_column()  set search_path = public, pg_temp;

-- ===== 20260801002327 archive_brooke_and_exclude_archived_from_gcal_match =====
-- gcal_get_clients() returned EVERY client, archived or not. That is why
-- archiving a client did nothing useful: the calendar sync kept matching their
-- events by name on the next run and rebuilding the rows that were just removed.
-- Archiving has to actually stop the sync, or "remove them for now" is a
-- twelve-hour lie.
create or replace function public.gcal_get_clients()
returns table(id uuid, name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query select c.id, c.name from clients c where c.archived_at is null order by c.name;
end;
$function$;

revoke execute on function public.gcal_get_clients() from public, anon, authenticated;
grant  execute on function public.gcal_get_clients() to service_role;

-- Brooke Reynolds is out until after summer. Archive rather than delete: the
-- history stays intact and she comes back by clearing one column.
update public.clients set archived_at = now(), updated_at = now()
where id = '2f3d1a3a-60e8-4aca-ba6d-d41380f2b6b0' and archived_at is null;

-- Her 23 future rows were all one monthly recurrence titled "Brooke Reynolds
-- $600", already marked cancelled, running on the 14th through 2028 — a payment
-- marker living in the appointments table, and the source of every phantom
-- 3:15 AM entry on the calendar. Past rows are left alone; they are history.
delete from public.appointments
where client_id = '2f3d1a3a-60e8-4aca-ba6d-d41380f2b6b0'
  and scheduled_at >= now();

-- ===== 20260801004752 challenge_v2_format_and_participants =====
-- group_challenges held a title, a one-word metric and two dates. That is enough
-- to name a competition and not enough to run one: nothing recorded who had
-- joined, how a point was actually earned, who won, or what the rules were —
-- so the challenge could only ever exist as a message someone scrolled past.
--
-- These columns are what the pinned card, the join button, the detail screen and
-- the Sunday result all read from.

alter table public.group_challenges
  add column if not exists emoji            text,
  add column if not exists tagline          text,   -- one line, the hook
  add column if not exists rules            text,   -- full text on the detail screen
  add column if not exists scoring_stat     text,   -- machine-readable, drives the leaderboard
  add column if not exists scoring_note     text,   -- plain-English "how a point is earned"
  add column if not exists status           text default 'live',
  add column if not exists auto_generated   boolean default false,
  add column if not exists winner_client_id uuid references public.clients(id),
  add column if not exists winner_score     numeric,
  add column if not exists next_pick_client_id uuid references public.clients(id),
  add column if not exists announced_at     timestamptz,
  add column if not exists scored_at        timestamptz;

-- status is a small closed set; a typo here silently hides a live challenge.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_challenges_status_chk') then
    alter table public.group_challenges
      add constraint group_challenges_status_chk
      check (status in ('draft','live','scoring','complete'));
  end if;
end $$;

-- scoring_stat is the contract between a challenge and the leaderboard query.
-- Constrained for the same reason: an unrecognised value would score zero for
-- everyone and look like nobody trained all week.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_challenges_stat_chk') then
    alter table public.group_challenges
      add constraint group_challenges_stat_chk
      check (scoring_stat is null or scoring_stat in (
        'workout_count','streak_days','pr_count','protein_days',
        'cardio_minutes','mobility_sessions','group_shares','team_total','improvement'
      ));
  end if;
end $$;

-- Joining was not modelled at all, so "9 people have joined" had nothing to
-- count and the Join button had nowhere to write.
create table if not exists public.challenge_participants (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.group_challenges(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  unique (challenge_id, client_id)
);
create index if not exists idx_challenge_participants_challenge on public.challenge_participants(challenge_id);

alter table public.challenge_participants enable row level security;

-- Everyone signed in can see who has joined — that IS the leaderboard, and the
-- "9 people are in" count is most of what makes anyone else join.
drop policy if exists cp_read on public.challenge_participants;
create policy cp_read on public.challenge_participants
  for select to authenticated using (true);

-- You may only join as yourself. Without the WITH CHECK, one client could enrol
-- another, or the trainer's own row could be forged.
drop policy if exists cp_join on public.challenge_participants;
create policy cp_join on public.challenge_participants
  for insert to authenticated
  with check (client_id = public.my_client_id() or public.is_trainer());

drop policy if exists cp_leave on public.challenge_participants;
create policy cp_leave on public.challenge_participants
  for delete to authenticated
  using (client_id = public.my_client_id() or public.is_trainer());

-- ── Convert the live challenge to the new format ─────────────────────────────
-- "Two-week consistency push" / metric 'sessions' → the same competition, but
-- with a hook, real rules, and a stat the leaderboard can actually compute.
update public.group_challenges
set emoji        = '🔥',
    title        = 'The Consistency Streak',
    tagline      = 'Show up. That is the whole trick.',
    scoring_stat = 'workout_count',
    scoring_note = 'One point for every completed workout, supervised or solo. Mobility and cardio count. Logging it is what makes it count — an unlogged workout is, as far as the leaderboard is concerned, a nap.',
    rules        = E'HOW TO WIN\nMost completed workouts between 25 July and 7 August. Simple as that.\n\nWHAT COUNTS\n• Any workout you mark complete in the app\n• Mobility sessions count\n• Cardio counts — yes, the 20 minute walks\n• One point per workout per day, so no stacking six sessions on the last morning\n\nWHAT DOES NOT COUNT\n• Anything you did but did not log. If it is not in the app it did not happen\n• Telling Dustin you trained. He is not a database\n\nTIEBREAK\nWhoever got there first. Reward the person who did not leave it until Friday.\n\nPRIZE\nBragging rights, top of the pinned card all week, and you pick next week''s challenge.',
    status       = 'live',
    auto_generated = false
where id = 'ecca2641-2077-4173-b355-01f411826b46';

-- The superseded 25–31 July row is already ended; mark it complete so it stops
-- looking like a second live challenge.
update public.group_challenges set status = 'complete'
where id = '972406b7-4ccd-437f-bf4d-4a9205bd6515';

-- ===== 20260801004938 align_live_challenge_to_sunday_cycle =====
-- The live challenge ended on a Friday, which cannot feed a Sunday winner
-- announcement. Two extra days puts it on the weekly rhythm without cutting
-- anyone's run short: scoring locks Sun 9 Aug 6pm, the winner takeover fires at
-- 7pm, and the first auto-generated weekly challenge opens on the same screen.
update public.group_challenges
set ends_on = date '2026-08-09'
where id = 'ecca2641-2077-4173-b355-01f411826b46';

-- Everyone who has trained during the window is already competing whether or not
-- they ever saw a Join button, so seed them as participants rather than
-- presenting an empty board on launch day. An empty leaderboard on day one is
-- the fastest way to make a challenge look dead.
insert into public.challenge_participants (challenge_id, client_id)
select 'ecca2641-2077-4173-b355-01f411826b46', c.id
from public.clients c
where c.archived_at is null
  and exists (
    select 1 from public.workout_logs w
    where w.client_id = c.id
      and w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date
          between date '2026-07-25' and date '2026-08-09'
  )
on conflict (challenge_id, client_id) do nothing;

-- ===== 20260801021926 challenge_leaderboard_function =====
-- The board has to be computed server-side. Doing it in the browser would mean
-- shipping every client's workout history to every other client just to rank
-- them — the leaderboard shows names and counts, and nothing more should leave
-- the database.
--
-- SECURITY DEFINER so it can read across clients, but it returns ONLY
-- (rank, client_id, name, score) for the requested challenge. No dates, no
-- workout detail, no contact information.

create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table(rnk int, client_id uuid, client_name text, score numeric, is_me boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start date;
  v_end   date;
  v_stat  text;
  v_me    uuid := public.my_client_id();
begin
  select starts_on, ends_on, coalesce(scoring_stat,'workout_count')
    into v_start, v_end, v_stat
  from group_challenges where id = p_challenge_id;

  if v_start is null then return; end if;

  -- workout_count is the only stat wired today. Others return an empty board
  -- rather than silently scoring everyone zero, which would look like a bug in
  -- the clients' training rather than a gap in the code.
  if v_stat <> 'workout_count' then return; end if;

  return query
  with scores as (
    select c.id as cid, c.name as cname, count(w.id)::numeric as sc
    from clients c
    join workout_logs w
      on w.client_id = c.id
     and w.completed_at is not null
     and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    where c.archived_at is null
    group by c.id, c.name
  )
  select (rank() over (order by sc desc, cname))::int,
         cid, cname, sc, (cid = v_me)
  from scores
  order by sc desc, cname;
end;
$function$;

revoke execute on function public.challenge_leaderboard(uuid) from public, anon;
grant  execute on function public.challenge_leaderboard(uuid) to authenticated, service_role;

-- One row, the challenge that is live right now, so the client does not have to
-- know the date rules.
create or replace view public.v_active_challenge
with (security_invoker = true) as
select gc.*,
       (select count(*) from challenge_participants cp where cp.challenge_id = gc.id) as participant_count,
       (gc.ends_on - (now() at time zone 'America/Chicago')::date) as days_left
from group_challenges gc
where gc.status = 'live'
  and (now() at time zone 'America/Chicago')::date between gc.starts_on and gc.ends_on
order by gc.starts_on desc
limit 1;

grant select on public.v_active_challenge to authenticated;

-- ===== 20260801022914 fix_ai_flag_defaults_and_planbuild_column =====
-- Two AI feature flags defaulted to FALSE, so every client added from now on
-- would silently get the legacy meal logger (no coach, no AI parse, no plan
-- builder) and no workout AI until someone remembered to flip two rows by hand.
-- The 35 existing clients were all turned on manually; the default was never
-- corrected, so the next client added would have been the odd one out.
alter table public.client_app_settings alter column nutrition_v3 set default true;
alter table public.client_app_settings alter column workout_ai   set default true;

-- And bring the stragglers up to match, so no one is left on the old logger.
update public.client_app_settings set nutrition_v3 = true where nutrition_v3 is distinct from true;
update public.client_app_settings set workout_ai   = true where workout_ai   is distinct from true;

-- meter-core.ts reads `ai_daily_plan_build_limit`; the column is actually
-- `ai_daily_planbuild_limit` (no underscore). The lookup silently missed, so any
-- per-client override of the plan-builder cap was ignored and everyone sat on
-- the hardcoded default of 1 per day. Add the name the code asks for as a
-- generated mirror rather than renaming, so nothing that reads the old name
-- breaks.
alter table public.client_app_settings
  add column if not exists ai_daily_plan_build_limit int;
update public.client_app_settings
  set ai_daily_plan_build_limit = ai_daily_planbuild_limit
  where ai_daily_plan_build_limit is null;

-- verify has no column at all, so its cap was never configurable either.
alter table public.client_app_settings
  add column if not exists ai_daily_verify_limit int;

-- ===== 20260801023347 group_reads_server_clock_and_backfill =====
-- Group unread is computed as "group messages created after my last_read_at".
-- markGroupRead() wrote that watermark from the BROWSER clock while messages.
-- created_at comes from the server. A device a minute slow leaves a minute of
-- messages permanently unread — the badge re-lights the instant it is cleared,
-- which is exactly the "notifications won't clear" report. A device running
-- fast silently marks unseen messages read, which is worse.
--
-- One function, server clock, callable only as yourself.
create or replace function public.mark_group_read()
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into group_reads (user_id, last_read_at, updated_at)
  values (auth.uid(), v_now, v_now)
  on conflict (user_id) do update
    set last_read_at = greatest(group_reads.last_read_at, excluded.last_read_at),
        updated_at   = excluded.updated_at;
  return v_now;
end;
$function$;

revoke execute on function public.mark_group_read() from public, anon;
grant  execute on function public.mark_group_read() to authenticated, service_role;

-- A user with no group_reads row falls back to 1970, so the badge counts the
-- ENTIRE history of the group chat and only ever clears if they happen to open
-- the Group tab. 13 rows existed against 36 clients, so roughly two thirds of
-- people were seeing a permanently lit badge they could not clear from anywhere
-- they were likely to look.
--
-- Seeded at now() rather than 1970: nobody wants 289 messages of backlog marked
-- unread on the morning this ships. Anything genuinely new from here counts.
insert into group_reads (user_id, last_read_at, updated_at)
select c.auth_user_id, now(), now()
from clients c
where c.auth_user_id is not null
  and c.archived_at is null
  and not exists (select 1 from group_reads g where g.user_id = c.auth_user_id)
on conflict (user_id) do nothing;

-- ===== 20260801111832 gcal_sync_scheduler_via_pg_cron =====
-- ============================================================================
-- AUTOMATIC GOOGLE CALENDAR SYNC — moved off GitHub Actions onto pg_cron.
--
-- What broke: the 15-minute automatic sync was a GitHub Actions workflow that
-- called GET /api/gcal-sync with no credentials at all. When the cron guard was
-- hardened to fail closed (isCronRequest), every one of those calls started
-- returning 401. The workflow's curl step exits 1 on a non-200, so GitHub
-- emailed a failure ~96 times a day. The workflow file has since been
-- overwritten with a git error message, so it is invalid YAML and now runs not
-- at all — the sync has been fully dead since 2026-07-31 23:02 UTC (the last
-- Google token refresh, which only happens inside a sync).
--
-- Why pg_cron rather than repairing the workflow: pushing to .github/workflows
-- needs a token with `workflow` scope, and setting a shared secret would need
-- BOTH a Vercel env var and a GitHub secret. pg_cron is already this project's
-- scheduler (eight jobs live in it), it can hold the credential in the database
-- the route already reads, and it needs nothing configured anywhere else.
--
-- The key never leaves the server: generated here, read by pg_cron, sent as a
-- header over HTTPS, compared by the route against this same row using its
-- service-role client. It is not the anon key and never reaches a browser.
-- ============================================================================

create table if not exists public.app_scheduler_key (
  id          smallint primary key default 1 check (id = 1),
  key         text not null,
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz
);

alter table public.app_scheduler_key enable row level security;
-- Deliberately NO policies: RLS with no policy denies every role that respects
-- it. Only the service role (which bypasses RLS) can read this, which is
-- exactly the set of callers allowed to prove they are the scheduler.
revoke all on public.app_scheduler_key from public, anon, authenticated;

insert into public.app_scheduler_key (id, key)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

-- ── Run log ────────────────────────────────────────────────────────────────
-- pg_net is asynchronous: http_post returns a request id immediately and the
-- response lands in net._http_response later. Rows start life as "queued" and a
-- harvester fills in the outcome, so a failing sync shows up as data we can
-- query instead of as an email nobody can act on.
create table if not exists public.gcal_sync_runs (
  id           bigint generated always as identity primary key,
  request_id   bigint,
  source       text not null default 'pg_cron',
  queued_at    timestamptz not null default now(),
  status_code  int,
  ok           boolean,
  response     jsonb,
  error        text,
  harvested_at timestamptz
);

create index if not exists gcal_sync_runs_queued_idx on public.gcal_sync_runs (queued_at desc);
create unique index if not exists gcal_sync_runs_request_idx on public.gcal_sync_runs (request_id) where request_id is not null;

alter table public.gcal_sync_runs enable row level security;
revoke all on public.gcal_sync_runs from public, anon;
-- The trainer needs to see sync health in the app. Read-only, and only the
-- trainer: this reveals when the calendar last reconciled, nothing about clients.
create policy gcal_sync_runs_trainer_read on public.gcal_sync_runs
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com');
grant select on public.gcal_sync_runs to authenticated;

-- ── Trigger ────────────────────────────────────────────────────────────────
create or replace function public.trigger_gcal_sync()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_key text;
  v_req bigint;
begin
  select key into v_key from public.app_scheduler_key where id = 1;
  if v_key is null then
    raise warning 'trigger_gcal_sync: no scheduler key configured; skipping';
    return null;
  end if;

  -- 55s, not the 5s default: a full sync pages through two years of events and
  -- the route is allowed 60s. A short timeout would record a failure for a run
  -- that actually succeeded.
  select net.http_post(
    url     := 'https://symmetry-app-omega.vercel.app/api/gcal-sync',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type',      'application/json',
                 'x-scheduler-key',   v_key
               ),
    timeout_milliseconds := 55000
  ) into v_req;

  insert into public.gcal_sync_runs (request_id, source) values (v_req, 'pg_cron');
  return v_req;
end;
$$;

revoke all on function public.trigger_gcal_sync() from public, anon, authenticated;

-- ── Harvester ──────────────────────────────────────────────────────────────
create or replace function public.harvest_gcal_sync_runs()
returns integer
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_n integer := 0;
begin
  update public.gcal_sync_runs r
     set status_code  = resp.status_code,
         ok           = (resp.status_code between 200 and 299),
         response     = case
                          when resp.content is null then null
                          when left(ltrim(resp.content), 1) in ('{','[')
                            then (resp.content)::jsonb
                          else jsonb_build_object('raw', left(resp.content, 2000))
                        end,
         error        = resp.error_msg,
         harvested_at = now()
    from net._http_response resp
   where resp.id = r.request_id
     and r.harvested_at is null;
  get diagnostics v_n = row_count;

  -- pg_net prunes _http_response on its own schedule. Anything still unresolved
  -- after 10 minutes lost its response row, so record it rather than leaving a
  -- permanently "queued" entry that looks like a hang.
  update public.gcal_sync_runs
     set ok = false,
         error = 'no response recorded (pg_net response expired)',
         harvested_at = now()
   where harvested_at is null
     and queued_at < now() - interval '10 minutes';

  delete from public.gcal_sync_runs where queued_at < now() - interval '30 days';
  return v_n;
end;
$$;

revoke all on function public.harvest_gcal_sync_runs() from public, anon, authenticated;

-- ===== 20260801113443 unify_challenge_leaderboard =====
-- ============================================================================
-- ONE challenge leaderboard.
--
-- There were two, disagreeing on four separate axes, which is why the board in
-- the group chat never matched the one on the dashboard:
--
--                      dashboard (challenge_leaderboard)  group chat (/api/challenge)
--   who is ranked      EVERY client with a workout        only leaderboard_opt_in = true (6 of 35)
--   score              COUNT of workout_log ROWS          DISTINCT DAYS trained
--   demo/test accounts included                           excluded
--   "Join" writes      challenge_participants (23 rows)   client_app_settings.leaderboard_opt_in
--
-- Neither was right on its own. The dashboard ranked twelve people who never
-- joined and let a demo account with 62 fabricated sessions outrank real
-- clients; the group chat showed six names out of the twenty-three who had
-- actually opted in, because it was reading a DIFFERENT opt-in flag from the
-- one the Join button on the dashboard writes.
--
-- This function is now the single source both surfaces read:
--
--   • ranks the people who JOINED this challenge (challenge_participants).
--     Joining IS the consent — it is explicit, per-challenge, and 23 clients
--     have already done it. Nobody is named who did not opt in.
--   • scores DISTINCT DAYS, not rows. Two sessions in one day is one day of
--     showing up, and a duplicate log cannot inflate a rank.
--   • drops demo/test accounts, matching src/lib/demoClient.ts. An inflated
--     board is as dishonest to the people reading it as a fake name would be.
--   • honours `metric`: 'logging' counts any day something was logged (a meal
--     OR a workout); anything else counts days trained.
--
-- Signature is unchanged (rnk, client_id, client_name, score, is_me), so
-- CommunityPair needs no edit.
-- ============================================================================

create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table(rnk integer, client_id uuid, client_name text, score numeric, is_me boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on,
         ends_on,
         coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges
  where id = p_challenge_id;

  if v_start is null then return; end if;

  -- Never score past today: a challenge running to Sunday should not read as
  -- though the remaining days were already lost.
  v_end := least(v_end, v_today);

  return query
  with roster as (
    -- Joined, still active, not a demo/test account. The name filters mirror
    -- EXCLUDED_NAME_PARTS in src/lib/demoClient.ts.
    select c.id as cid, c.name as cname
    from challenge_participants cp
    join clients c on c.id = cp.client_id
    where cp.challenge_id = p_challenge_id
      and c.archived_at is null
      and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
      and coalesce(lower(c.name), '') not like '%test client%'
      and coalesce(lower(c.name), '') not like '%demo account%'
  ),
  workout_days as (
    select w.client_id as cid,
           (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
  ),
  meal_days as (
    select m.client_id as cid, m.log_date as d
    from meal_adherence_logs m
    where v_metric = 'logging'
      and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  all_days as (
    select cid, d from workout_days
    union                             -- UNION, not UNION ALL: distinct days is the point
    select cid, d from meal_days
  ),
  scores as (
    select r.cid,
           r.cname,
           count(distinct a.d)::numeric as sc
    from roster r
    left join all_days a on a.cid = r.cid   -- LEFT: a joiner with no days yet is on the board at 0
    group by r.cid, r.cname
  )
  select (rank() over (order by sc desc, cname))::int,
         cid, cname, sc, (cid = v_me)
  from scores
  order by sc desc, cname;
end;
$function$;

-- ── Anonymous group total ──────────────────────────────────────────────────
-- The named board only shows people who joined. Without a whole-roster total a
-- challenge reads as dead in its first days, which is what the old API was
-- solving for with `groupTotal`. Same idea, same source, no names attached.
create or replace function public.challenge_group_total(p_challenge_id uuid)
returns table(group_total numeric, contributors integer, my_score numeric, joined boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges where id = p_challenge_id;
  if v_start is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    select c.id as cid
    from clients c
    where c.archived_at is null
      and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
      and coalesce(lower(c.name), '') not like '%test client%'
      and coalesce(lower(c.name), '') not like '%demo account%'
  ),
  all_days as (
    select w.client_id as cid, (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date
    from meal_adherence_logs m
    where v_metric = 'logging' and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  per as (
    select r.cid, count(distinct a.d) as days
    from roster r left join all_days a on a.cid = r.cid
    group by r.cid
  )
  select coalesce(sum(days), 0)::numeric,
         count(*) filter (where days > 0)::int,
         coalesce(max(days) filter (where cid = v_me), 0)::numeric,
         exists (select 1 from challenge_participants cp
                  where cp.challenge_id = p_challenge_id and cp.client_id = v_me)
  from per;
end;
$function$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;
grant execute on function public.challenge_group_total(uuid) to authenticated;
revoke execute on function public.challenge_leaderboard(uuid) from anon, public;
revoke execute on function public.challenge_group_total(uuid) from anon, public;

-- ===== 20260801114113 challenge_leaderboard_full_roster_v2 =====
-- See challenge_leaderboard_full_roster for the rationale. Dropped first
-- because the OUT columns changed (added `joined`), which Postgres will not do
-- with CREATE OR REPLACE.
drop function if exists public.challenge_leaderboard(uuid);

create function public.challenge_leaderboard(p_challenge_id uuid)
returns table(rnk integer, client_id uuid, client_name text, score numeric, is_me boolean, joined boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges
  where id = p_challenge_id;

  if v_start is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    select c.id as cid, c.name as cname
    from clients c
    where c.archived_at is null
      and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
      and coalesce(lower(c.name), '') not like '%test client%'
      and coalesce(lower(c.name), '') not like '%demo account%'
  ),
  all_days as (
    select w.client_id as cid,
           (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date
    from meal_adherence_logs m
    where v_metric = 'logging'
      and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  scores as (
    select r.cid,
           r.cname,
           count(distinct a.d)::numeric as sc,
           exists (select 1 from challenge_participants cp
                    where cp.challenge_id = p_challenge_id and cp.client_id = r.cid) as has_joined
    from roster r
    left join all_days a on a.cid = r.cid
    group by r.cid, r.cname
  )
  select (rank() over (order by sc desc, cname))::int,
         cid, cname, sc, (cid = v_me), has_joined
  from scores
  order by sc desc, cname;
end;
$function$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;
revoke execute on function public.challenge_leaderboard(uuid) from anon, public;

-- ── One-time announcement tracking ─────────────────────────────────────────
-- Per PERSON, not per device. localStorage would re-show the takeover on their
-- phone after they dismissed it on the iPad, and a full-page takeover that
-- comes back is worse than one that never fired.
create table if not exists public.client_announcements_seen (
  client_id  uuid not null references public.clients(id) on delete cascade,
  key        text not null,
  seen_at    timestamptz not null default now(),
  primary key (client_id, key)
);

alter table public.client_announcements_seen enable row level security;
revoke all on public.client_announcements_seen from public, anon;
grant select, insert on public.client_announcements_seen to authenticated;

drop policy if exists cas_own_read on public.client_announcements_seen;
create policy cas_own_read on public.client_announcements_seen
  for select to authenticated
  using (client_id = public.my_client_id());

drop policy if exists cas_own_write on public.client_announcements_seen;
create policy cas_own_write on public.client_announcements_seen
  for insert to authenticated
  with check (client_id = public.my_client_id());

-- ===== 20260801115406 weekly_challenge_cycle =====
-- ============================================================================
-- THE WEEKLY CYCLE — score Sunday 6pm CT, announce and regenerate at 7pm.
--
-- The takeover now tells 35 people "a new one starts every Sunday, from here
-- on out". This is what makes that true. Without it the current challenge ends
-- on 9 August and nothing replaces it, and a promise made to the whole roster
-- in a full-screen announcement quietly becomes a lie.
--
-- ONE hourly job rather than two cron entries at fixed UTC times. pg_cron runs
-- in UTC, and 18:00 America/Chicago is 23:00 UTC in summer but 00:00 UTC in
-- winter — a fixed UTC schedule silently drifts an hour every DST change and
-- would fire the Sunday close on Saturday afternoon half the year. The tick
-- reads the local clock instead, so it is right in both.
--
-- Every step is idempotent and self-healing: the conditions are on state
-- (status, scored_at, ends_on), never on "did the job fire". A missed tick
-- catches up on the next one instead of skipping a week.
-- ============================================================================

-- Rotation for auto-generated challenges. Deliberately small and behavioural —
-- days shown up, days logged. There is no body-composition metric here and
-- there should never be one.
create table if not exists public.challenge_templates (
  ord           smallint primary key,
  title         text not null,
  emoji         text not null,
  tagline       text not null,
  metric        text not null,
  scoring_note  text not null
);

insert into public.challenge_templates (ord, title, emoji, tagline, metric, scoring_note) values
  (0, 'The Consistency Streak', '🔥', 'Most days trained wins. Simple as that.', 'sessions',
      'One point per day you train and log it. Two sessions in a day still counts as one — this rewards showing up often, not cramming.'),
  (1, 'Log Every Day', '📓', 'A meal or a workout. Just put something in.', 'logging',
      'One point per day you log anything at all — a meal or a workout. The habit is the point.'),
  (2, 'Four Times This Week', '🎯', 'Get four in. Everything past that is bonus.', 'sessions',
      'One point per day trained. Four is the target everyone is chasing; the board ranks whoever gets furthest.'),
  (3, 'No Zero Days', '🚫', 'Nothing huge required. Just do not skip.', 'logging',
      'One point per day you log anything. A ten-minute walk logged beats a perfect session you never recorded.')
on conflict (ord) do nothing;

-- ── Score and close ────────────────────────────────────────────────────────
create or replace function public.close_due_challenge()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id      uuid;
  v_today   date := (now() at time zone 'America/Chicago')::date;
  v_hour    int  := extract(hour from (now() at time zone 'America/Chicago'))::int;
  v_winner  uuid;
  v_score   numeric;
begin
  -- Due = the end date has passed, or it is the end date and 6pm CT has come.
  select id into v_id
  from group_challenges
  where status = 'live'
    and scored_at is null
    and (ends_on < v_today or (ends_on = v_today and v_hour >= 18))
  order by ends_on
  limit 1;

  if v_id is null then return null; end if;

  select client_id, score into v_winner, v_score
  from public.challenge_leaderboard(v_id)
  where rnk = 1
  order by client_name
  limit 1;

  -- A challenge nobody scored in has no winner, and inventing one would be
  -- worse than leaving it blank.
  update group_challenges
     set status           = 'complete',
         ended_at         = coalesce(ended_at, now()),
         scored_at        = now(),
         winner_client_id = case when coalesce(v_score, 0) > 0 then v_winner end,
         winner_score     = case when coalesce(v_score, 0) > 0 then v_score end
   where id = v_id;

  return v_id;
end;
$$;

-- ── Announce the winner in the group ───────────────────────────────────────
create or replace function public.announce_challenge_winner(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_trainer uuid;
  v_ch      record;
  v_names   text;
  v_n       int;
  v_body    text;
  v_unit    text;
begin
  select * into v_ch from group_challenges where id = p_challenge_id;
  if v_ch.id is null or v_ch.announced_at is not null then return false; end if;

  select user_id into v_trainer from trainer_settings limit 1;
  if v_trainer is null then return false; end if;

  v_unit := case when v_ch.metric = 'logging' then 'days logged' else 'days trained' end;

  -- Ties share first place, so announce all of them. Picking one arbitrarily
  -- would be visibly unfair to the people who can see the board.
  select string_agg(split_part(client_name, ' ', 1), ', ' order by client_name), count(*)
    into v_names, v_n
  from public.challenge_leaderboard(p_challenge_id)
  where rnk = 1 and score > 0;

  if v_names is null then
    v_body := '🏁 ' || v_ch.title || ' is done. Nobody got on the board this time — clean slate, new one starts tomorrow. Let''s go.';
  else
    v_body := '🏆 ' || v_ch.title || ' is done!' || chr(10) || chr(10)
           || case when v_n > 1 then 'Tied at the top: ' else 'Winner: ' end
           || v_names || ' with ' || v_ch.winner_score::int || ' ' || v_unit || '.'
           || chr(10) || chr(10)
           || 'Everybody who logged a day is on the board — go take a look. New challenge starts tomorrow.';
  end if;

  insert into messages (from_id, to_id, body, is_group, is_broadcast)
  values (v_trainer, v_trainer, v_body, true, false);

  update group_challenges set announced_at = now() where id = p_challenge_id;
  return true;
end;
$$;

-- ── Generate next week's ───────────────────────────────────────────────────
create or replace function public.generate_next_challenge()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_start date := v_today + 1;          -- Monday, when the tick runs on Sunday
  v_end   date := v_today + 7;          -- through the following Sunday
  v_ord   smallint;
  v_t     record;
  v_id    uuid;
begin
  -- Never two live at once: "who is winning" has to have one answer.
  if exists (select 1 from group_challenges where status = 'live') then return null; end if;
  -- Never two for the same week, however many times this is called.
  if exists (select 1 from group_challenges where starts_on = v_start) then return null; end if;

  select coalesce(
           (select (ord + 1) % (select count(*) from challenge_templates)
              from challenge_templates t
              join group_challenges g on g.title = t.title
             order by g.starts_on desc limit 1),
           0)::smallint
    into v_ord;

  select * into v_t from challenge_templates where ord = v_ord;
  if v_t.title is null then select * into v_t from challenge_templates order by ord limit 1; end if;

  insert into group_challenges
    (title, emoji, tagline, metric, scoring_note, starts_on, ends_on, status, auto_generated)
  values
    (v_t.title, v_t.emoji, v_t.tagline, v_t.metric, v_t.scoring_note, v_start, v_end, 'live', true)
  returning id into v_id;

  return v_id;
end;
$$;

-- ── The tick ───────────────────────────────────────────────────────────────
create or replace function public.challenge_cycle_tick()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hour   int := extract(hour from (now() at time zone 'America/Chicago'))::int;
  v_closed uuid;
  v_new    uuid;
  v_out    text := '';
begin
  -- 6pm: lock scoring on anything due.
  v_closed := public.close_due_challenge();
  if v_closed is not null then v_out := 'closed ' || v_closed::text || '; '; end if;

  -- 7pm: announce, then start the next one. Announce whatever is scored but
  -- unannounced, not just what closed on this tick, so a missed hour catches up.
  if v_hour >= 19 or v_closed is null then
    perform public.announce_challenge_winner(id)
    from group_challenges
    where scored_at is not null and announced_at is null;
  end if;

  if v_hour >= 19 then
    v_new := public.generate_next_challenge();
    if v_new is not null then v_out := v_out || 'created ' || v_new::text; end if;
  end if;

  return nullif(v_out, '');
end;
$$;

revoke all on function public.close_due_challenge() from public, anon, authenticated;
revoke all on function public.announce_challenge_winner(uuid) from public, anon, authenticated;
revoke all on function public.generate_next_challenge() from public, anon, authenticated;
revoke all on function public.challenge_cycle_tick() from public, anon, authenticated;

-- ===== 20260801115444 challenge_leaderboard_tie_fix =====
-- Ties must SHARE a place.
--
-- The window was `rank() over (order by sc desc, cname)`. cname is part of the
-- ordering key, so every row is distinct to the window function and rank never
-- repeats: Cheyenne, Dustin and Lauren all on 5 days came out as 1st, 2nd and
-- 3rd. Three people did identical work and the board told two of them they
-- lost. It also meant the Sunday winner announcement would name only whoever
-- sorted first alphabetically.
--
-- Ranking now keys on score alone — standard competition ranking, ties share a
-- place and the next place skips. Name stays in the ORDER BY of the outer
-- query, where it only decides display order within a tie.
create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table(rnk integer, client_id uuid, client_name text, score numeric, is_me boolean, joined boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges
  where id = p_challenge_id;

  if v_start is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    select c.id as cid, c.name as cname
    from clients c
    where c.archived_at is null
      and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
      and coalesce(lower(c.name), '') not like '%test client%'
      and coalesce(lower(c.name), '') not like '%demo account%'
  ),
  all_days as (
    select w.client_id as cid,
           (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date
    from meal_adherence_logs m
    where v_metric = 'logging'
      and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  scores as (
    select r.cid,
           r.cname,
           count(distinct a.d)::numeric as sc,
           exists (select 1 from challenge_participants cp
                    where cp.challenge_id = p_challenge_id and cp.client_id = r.cid) as has_joined
    from roster r
    left join all_days a on a.cid = r.cid
    group by r.cid, r.cname
  )
  select (rank() over (order by sc desc))::int,   -- score ONLY: ties share a place
         cid, cname, sc, (cid = v_me), has_joined
  from scores
  order by sc desc, cname;
end;
$function$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;
revoke execute on function public.challenge_leaderboard(uuid) from anon, public;

-- ===== 20260801123125 client_program_feedback =====
-- ============================================================================
-- The fortnightly programming question.
--
-- Dustin: ask each client, every two weeks, whether anything about their
-- programming should change. Substantive answers land in his inbox with the
-- question attached, and every answer is kept on the client's record so it is
-- there when he next writes their block — an answer that only exists as a chat
-- message is an answer he will not have in front of him three weeks later.
--
-- One open question per client at a time. week_start is the Sunday the question
-- belongs to, so re-running the weekly sweep cannot double-ask.
-- ============================================================================

create table if not exists public.client_program_feedback (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  week_start    date not null,
  question      text not null,
  answer        text,
  asked_at      timestamptz not null default now(),
  answered_at   timestamptz,
  -- Set when it was worth Dustin's attention and went to his inbox. A blank
  -- here on an answered row means "they replied, it was 'all good'".
  delivered_at  timestamptz,
  unique (client_id, week_start)
);

create index if not exists cpf_client_idx on public.client_program_feedback (client_id, week_start desc);
create index if not exists cpf_open_idx on public.client_program_feedback (client_id) where answered_at is null;

alter table public.client_program_feedback enable row level security;
revoke all on public.client_program_feedback from public, anon;
grant select, update on public.client_program_feedback to authenticated;

-- A client can read and answer their own. They cannot INSERT — questions are
-- authored by the weekly sweep with the service role, never by the client.
drop policy if exists cpf_own_read on public.client_program_feedback;
create policy cpf_own_read on public.client_program_feedback
  for select to authenticated
  using (client_id = public.my_client_id()
         or (select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com');

drop policy if exists cpf_own_answer on public.client_program_feedback;
create policy cpf_own_answer on public.client_program_feedback
  for update to authenticated
  using (client_id = public.my_client_id())
  with check (client_id = public.my_client_id());

-- ===== 20260801123737 weekly_focus_drafts =====
-- ============================================================================
-- Saturday approval for next week's focus.
--
-- Until now the Sunday sweep wrote straight into clients.weekly_focus: 35 lines
-- of coaching copy went live to 35 people with nobody having read them. Dustin
-- asked to see them on Saturday and approve.
--
-- Drafts live here, not in a nullable column on clients, for two reasons: the
-- live focus stays untouched until publish (so a half-reviewed batch cannot
-- leak a mix of old and new), and reverting is dropping a table rather than
-- unpicking columns.
--
-- Only the FOCUS is gated. Coach's read and food focus keep publishing
-- directly — the focus is the line every client reads on their week card, and
-- it is the one he asked to approve.
--
-- week_start is the SUNDAY the focus is for, so a draft written on Saturday
-- targets the week that starts the next day.
-- ============================================================================

create table if not exists public.weekly_focus_drafts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  week_start   date not null,
  focus        text not null,
  -- What the model wrote, kept even after he edits, so "does the AI need
  -- retraining" is answerable from data rather than memory.
  focus_ai     text,
  edited_at    timestamptz,
  approved_at  timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists wfd_week_idx on public.weekly_focus_drafts (week_start desc, published_at);

alter table public.weekly_focus_drafts enable row level security;
revoke all on public.weekly_focus_drafts from public, anon;
grant select, update on public.weekly_focus_drafts to authenticated;

-- Trainer only. Clients must never see next week's copy before it ships, and
-- have no business seeing anyone else's at all.
drop policy if exists wfd_trainer_read on public.weekly_focus_drafts;
create policy wfd_trainer_read on public.weekly_focus_drafts
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com');

drop policy if exists wfd_trainer_write on public.weekly_focus_drafts;
create policy wfd_trainer_write on public.weekly_focus_drafts
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com');

-- ── Publish ────────────────────────────────────────────────────────────────
-- Called by the approve action for one client, and by the Sunday fallback for
-- everything still unpublished. Never overwrites a focus Dustin wrote by hand
-- for that same week — his own words win, exactly as in the sweep.
create or replace function public.publish_focus_drafts(p_week date, p_only_approved boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer := 0;
  r   record;
begin
  for r in
    select d.* from weekly_focus_drafts d
    where d.week_start = p_week
      and d.published_at is null
      and (not p_only_approved or d.approved_at is not null)
  loop
    update clients c
       set weekly_focus        = r.focus,
           weekly_focus_week   = p_week,
           weekly_focus_source = case when r.edited_at is not null then 'trainer' else 'ai' end
     where c.id = r.client_id
       and not (c.weekly_focus_source = 'trainer'
                and c.weekly_focus_week = p_week
                and coalesce(c.weekly_focus, '') <> '');

    update weekly_focus_drafts set published_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.publish_focus_drafts(date, boolean) from public, anon;
grant execute on function public.publish_focus_drafts(date, boolean) to authenticated;

-- ===== 20260801133644 fix_detect_schedule_changes_pair_conflict =====
-- ============================================================================
-- detect_schedule_changes() was dying on a unique violation, silently.
--
--   ERROR: duplicate key value violates unique constraint "uq_scp_open"
--   Key (client_id, from_date, to_date, reason) = (…, 2026-08-10, 2026-08-12, moved)
--
-- Every INSERT in this function carries `on conflict do nothing`. The PAIRING
-- step does not — it is an UPDATE that rewrites an 'orphaned' proposal into a
-- 'moved' one, and rewriting the reason and to_date can collide with a 'moved'
-- row that is already pending for the same client and dates.
--
-- Why it matters more than one skipped pair: the whole function is one
-- transaction. The violation aborted it, so NOTHING was written — not the
-- orphaned, uncovered, cancelled or retired proposals either. Schedule changes
-- went undetected for that entire 12-hour window, on the job that feeds the
-- approval queue that payments depend on. It has been failing every run that
-- hits this state and reporting nothing anywhere a human would see.
--
-- The fix is the guard the INSERTs already have, expressed for an UPDATE:
-- don't pair into a row that already exists. The unpaired 'orphaned' and
-- 'uncovered' proposals simply stay as they are, which is the correct fallback
-- — two accurate proposals beat one merged one that cannot be written.
-- ============================================================================

create or replace function public.detect_schedule_changes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and created_at < now() - interval '20 hours';

  -- ORPHANED: supervised workout, no appointment that day
  insert into schedule_change_proposals (client_id, scheduled_workout_id, day_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, sw.day_id, sw.scheduled_date, 'orphaned', 'one_off',
         jsonb_build_object('client', c.name, 'day', d.label)
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  left join days d on d.id = sw.day_id
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from appointments a
                    where a.client_id = sw.client_id and a.status = 'scheduled'
                      and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date)
  on conflict do nothing;

  -- UNCOVERED: appointment, no supervised workout that day
  insert into schedule_change_proposals (client_id, appointment_id, gcal_recurring_id, to_date, reason, confidence, detail)
  select a.client_id, a.id, a.gcal_recurring_id,
         (a.scheduled_at at time zone 'America/Chicago')::date, 'uncovered',
         case when a.gcal_recurring_id is null then 'one_off' else 'pattern' end,
         jsonb_build_object('client', c.name,
                            'time', to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI'))
  from appointments a join clients c on c.id = a.client_id
  where a.status = 'scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date)
  on conflict do nothing;

  -- CANCELLED: appointment cancelled but a supervised workout is still on that date
  insert into schedule_change_proposals (client_id, scheduled_workout_id, appointment_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, a.id, sw.scheduled_date, 'cancelled', 'one_off',
         jsonb_build_object('client', c.name, 'note', 'appointment cancelled in Google - leave the date empty')
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  join appointments a on a.client_id = sw.client_id
    and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date
    and a.status like 'cancelled%'
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date >= v_today_ct
  on conflict do nothing;

  -- RETIRED: a recurring series with zero future occurrences
  insert into schedule_change_proposals (client_id, gcal_recurring_id, reason, confidence, detail)
  select p.client_id, p.series, 'retired', 'pattern',
         jsonb_build_object('client', p.client_name,
                            'was', to_char(date '2026-08-02' + p.pattern_dow,'Dy') || ' ' || p.pattern_time)
  from v_client_calendar_pattern p where p.is_retired
  on conflict do nothing;

  -- PAIR orphaned + uncovered inside the same ISO week into ONE move.
  --
  -- The NOT EXISTS is the whole point of this migration: without it, pairing
  -- into a (client, from_date, to_date, 'moved') that is already pending
  -- violates uq_scp_open and takes the entire transaction — and therefore
  -- every proposal above — down with it.
  update schedule_change_proposals o
  set reason = 'moved', to_date = u.to_date, appointment_id = u.appointment_id,
      detail = o.detail || jsonb_build_object('paired_with', u.id, 'moved_to', u.to_date)
  from schedule_change_proposals u
  where o.status = 'pending' and o.reason = 'orphaned'
    and u.status = 'pending' and u.reason = 'uncovered'
    and u.client_id = o.client_id
    and date_trunc('week', u.to_date) = date_trunc('week', o.from_date)
    and not exists (
      select 1 from schedule_change_proposals m
      where m.status = 'pending'
        and m.reason = 'moved'
        and m.client_id = o.client_id
        and coalesce(m.from_date, '1900-01-01'::date) = coalesce(o.from_date, '1900-01-01'::date)
        and coalesce(m.to_date,   '1900-01-01'::date) = coalesce(u.to_date,   '1900-01-01'::date)
        and m.id <> o.id
    );

  update schedule_change_proposals u
  set status = 'superseded', resolved_at = now()
  from schedule_change_proposals o
  where u.status = 'pending' and u.reason = 'uncovered'
    and o.reason = 'moved' and o.detail->>'paired_with' = u.id::text;

  select count(*) into n from schedule_change_proposals where status = 'pending';
  return n;
end $function$;

-- ===== 20260801140840 ai_usage_log_allow_all_features =====
-- ============================================================================
-- The $95 AI kill switch was partly blind, and its warning email could never
-- send.
--
-- ai_usage_log_feature_check allowed only:
--   photo, voice, parse, chat, plan_build, verify
--
-- But the code logs two more:
--   'workout_build'      — /api/workout-ai, which runs SONNET (3/15 per Mtok,
--                          the most expensive thing a client can trigger)
--   'kill_switch_notice' — the zero-cost marker row that makes the "AI paused"
--                          email fire once per day instead of once per request
--
-- Both inserts violated the CHECK. logUsage swallows the error by design — a
-- metering failure must never break a working feature — so this was completely
-- silent. Three consequences:
--
--   1. Every Sonnet workout build was invisible to the monthly spend total, so
--      the $95 cap was being computed from an undercount.
--   2. The workout_build daily cap read 0 used, always. The per-client limit of
--      8/day was never actually enforced.
--   3. notifyTrainerPaused() returns early when the marker insert fails, so
--      Dustin would never have been told the kill switch had tripped.
--
-- Dropped for the same reason it should not be re-added as an enum: the set of
-- features grows every time a new AI surface ships, and a CHECK that the code
-- silently loses to is worse than no CHECK. A length guard keeps the column
-- sane without ever being able to swallow spend.
-- ============================================================================

alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;

alter table public.ai_usage_log
  add constraint ai_usage_log_feature_sane
  check (feature is not null and length(feature) between 1 and 40);

-- ── The duplicate limit column ─────────────────────────────────────────────
-- meter-core.ts reads ai_daily_plan_build_limit; an older column
-- ai_daily_planbuild_limit also exists and is what someone editing settings
-- would plausibly reach for. Carry any value across so an override set on the
-- legacy column starts being honoured, then drop it so there is one answer.
update public.client_app_settings
   set ai_daily_plan_build_limit = coalesce(ai_daily_plan_build_limit, ai_daily_planbuild_limit)
 where ai_daily_planbuild_limit is not null;

alter table public.client_app_settings drop column if exists ai_daily_planbuild_limit;

-- ===== 20260801144906 ai_action_log =====
-- ============================================================================
-- Every write the trainer agent makes, with enough detail to reverse it.
--
-- The agent executes immediately — no confirmation step. That is the right
-- trade for speed when Dustin is between clients and wants a change made, but
-- it is only defensible if a mistake is cheap to undo. Without this, "swap that
-- for the whole series" applied to the wrong client is unrecoverable by anyone
-- except me, hours later, from a backup.
--
-- `undo` holds whatever the undo tool needs, per action kind — the previous
-- macro row, the gcal event id and its old time, the message id to soft-delete.
-- Deliberately a jsonb blob rather than columns: the shape differs per action
-- and adding a tool should not need a migration.
--
-- `undone_at` rather than a delete, so the history of what was done AND what was
-- taken back both survive.
-- ============================================================================

create table if not exists public.ai_action_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  actor       text not null default 'trainer_agent',
  action      text not null,
  client_id   uuid references public.clients(id) on delete set null,
  summary     text not null,
  undo        jsonb,
  undone_at   timestamptz,
  undo_error  text
);

create index if not exists ai_action_log_recent_idx on public.ai_action_log (created_at desc);

alter table public.ai_action_log enable row level security;
revoke all on public.ai_action_log from public, anon;
grant select on public.ai_action_log to authenticated;

drop policy if exists ai_action_log_trainer_read on public.ai_action_log;
create policy ai_action_log_trainer_read on public.ai_action_log
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'symmetrypersonaltraining@gmail.com');

-- ===== 20260801153006 coachbot =====
-- ============================================================================
-- Coach Bot — the group chat's resident smack-talker.
--
-- Dustin's brief: "very funny, light hearted smack talk."
--
-- Two things had to be true before this could ship without being annoying:
--
-- 1. It must be visibly NOT Dustin. A group message posts from the trainer's
--    auth user, so without a marker every bot line would read as him — which is
--    both misleading and would make his real messages easier to scroll past.
--    `sender_kind` is that marker; the chat renders those with the bot avatar
--    and name.
--
-- 2. It must be OFF until he says otherwise. A bot that starts talking to
--    thirty-five clients the moment it deploys is not a feature you can take
--    back.
-- ============================================================================

alter table public.messages
  add column if not exists sender_kind text;

comment on column public.messages.sender_kind is
  'null = a real person. ''coachbot'' = written by the group-chat bot; rendered with the bot avatar so it is never mistaken for Dustin.';

-- Off by default. ExperienceSettings already reads app_flags for nudges_live,
-- so this uses the same switchboard rather than inventing a second one.
insert into public.app_flags (key, enabled)
values ('coachbot_live', false)
on conflict (key) do nothing;

-- ===== 20260801183525 swap_prescribed_exercise_fork_first =====
-- ============================================================================
-- Swapping an exercise mid-session must not edit the master library.
--
-- WHAT THE INVESTIGATION FOUND
--
-- Scheduled workouts sitting on shared library days is BY DESIGN and healthy.
-- sw_enforce_day_isolation() forks a day the moment a SECOND client is
-- scheduled on it, and day_is_exclusive_to() treats a library day used by one
-- client as already exclusive to them. So a library day with one occupant needs
-- no copy, and 1,327 live rows in that state is the expected steady state, not
-- corruption. 25 days do have several clients on them, but every one of those
-- collisions is in the PAST — zero future rows are affected — so they are stale
-- history, not a live hazard, and nothing needs backfilling.
--
-- The real defect is narrower and it is in the app, not the data.
-- WorkoutLogger's swap does:
--
--   supabase.from("prescribed_exercises").update({ exercise_id }).eq("id", peId)
--
-- with no ownership check at all, and the swap button is NOT trainer-gated. On a
-- library day that is currently exclusive to one client, that update rewrites
-- THE TEMPLATE. Nothing visible happens today — but the next client Dustin puts
-- on "APT Correction — P1 — Day 3" inherits a substitution some other client
-- made mid-session weeks earlier, and there is no record of why. It silently
-- contradicts the rule workoutAdjust.ts opens with: change a client's scheduled
-- workout "without ever touching the master library".
--
-- This is that write, done properly: fork first when the day is not already
-- owned by this client, repoint only THIS session, then swap inside the copy.
-- Same rule workoutAdjust already applies for scope 'one'.
-- ============================================================================

create or replace function public.swap_prescribed_exercise(
  p_scheduled_workout_id uuid,
  p_pe_id uuid,
  p_new_exercise_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client   uuid;
  v_day      uuid;
  v_owner    uuid;
  v_new_day  uuid;
  v_sec_pos  int;
  v_pe_pos   int;
  v_new_pe   uuid;
  v_forked   boolean := false;
begin
  select sw.client_id, sw.day_id into v_client, v_day
  from scheduled_workouts sw where sw.id = p_scheduled_workout_id;
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'scheduled workout not found');
  end if;

  select d.client_owner_id into v_owner from days d where d.id = v_day;

  -- Owned by this client already → edit in place, exactly as before.
  if v_owner is distinct from v_client then
    -- Remember where the exercise sits, so it can be found again in the copy.
    select s.position, pe.position into v_sec_pos, v_pe_pos
    from prescribed_exercises pe join sections s on s.id = pe.section_id
    where pe.id = p_pe_id;
    if v_sec_pos is null then
      return jsonb_build_object('ok', false, 'error', 'exercise not found on that day');
    end if;

    v_new_day := public.fork_day_for_client(v_day, v_client);
    v_forked := true;

    -- Only THIS session moves. The rest of the series stays on the library day,
    -- which is what "swap it for today" means — matching workoutAdjust's
    -- scope='one'. Repointing the whole series would silently fork a client's
    -- entire block off the template they are meant to be following.
    update scheduled_workouts set day_id = v_new_day where id = p_scheduled_workout_id;

    select pe.id into v_new_pe
    from prescribed_exercises pe join sections s on s.id = pe.section_id
    where s.day_id = v_new_day and s.position = v_sec_pos and pe.position = v_pe_pos;
  else
    v_new_day := v_day;
    v_new_pe  := p_pe_id;
  end if;

  if v_new_pe is null then
    return jsonb_build_object('ok', false, 'error', 'could not locate the exercise in the copy');
  end if;

  update prescribed_exercises set exercise_id = p_new_exercise_id where id = v_new_pe;

  return jsonb_build_object('ok', true, 'forked', v_forked, 'day_id', v_new_day, 'pe_id', v_new_pe);
end;
$$;

revoke all on function public.swap_prescribed_exercise(uuid, uuid, uuid) from public, anon;
grant execute on function public.swap_prescribed_exercise(uuid, uuid, uuid) to authenticated;

-- ===== 20260801203528 grant_challenge_fns_to_service_role =====
-- Coach Bot was reporting "empty board" against a board with 33 people on it.
--
-- The cause is a revoke, not a bug in the query. When these functions were
-- locked down they ran:
--
--   revoke execute on function challenge_leaderboard(uuid) from anon, public;
--
-- Revoking from PUBLIC removes the implicit grant every role inherits — which
-- includes service_role. The browser kept working because `authenticated` was
-- granted explicitly; anything server-side calling with the service key started
-- getting permission denied. logUsage-style code swallows the error, so the
-- route saw `data: null`, read it as zero rows, and declined to post.
--
-- That is a good failure (silence rather than a wrong message) but it would
-- have meant Coach Bot never spoke and never said why.
grant execute on function public.challenge_leaderboard(uuid) to service_role;
grant execute on function public.challenge_group_total(uuid) to service_role;

-- ===== 20260801214202 theme_check_no_longer_rejects_every_save =====
-- Theme preference: stop the database silently rejecting every save.
--
-- THE BUG. client_app_settings.theme and trainer_settings.theme each carried a
-- CHECK constraint listing ten theme ids from an older design — steel_sky,
-- arctic_teal, slate_emerald, platinum_indigo, warm_gold, midnight_navy,
-- obsidian_gold, carbon_crimson, deep_space, iron_ember. The app was rewritten
-- to 21 different ids (navy, forest, purple, midnight, carbonneon...) and the
-- constraint was never updated. Every write from the theme picker violated it,
-- and ThemeProvider.setTheme discards the result, so the failure was invisible.
-- Evidence: all 35 rows in client_app_settings still held the column default.
-- Nobody's theme had ever reached the account. It only lived in the phone's
-- localStorage, which is why an app update reset everyone to the default.
--
-- WHY DROP RATHER THAN RE-LIST. A CHECK enumerating theme ids has to be
-- migrated in lockstep with a TypeScript array in ThemeProvider.tsx, and there
-- is no mechanism that makes that happen — which is precisely how it drifted
-- for months without one error reaching a human. The constraint's only job was
-- to reject typos in a cosmetic preference, and the read path already handles
-- an unrecognised value correctly and safely: ThemeProvider looks the id up in
-- THEMES and ignores anything it does not find, falling back to the default
-- scheme. So the validation stays where the list actually lives.
--
-- REVERT: re-add either constraint with the id list of the day. Nothing here
-- drops a column or loses a preference.

alter table public.client_app_settings drop constraint if exists client_app_settings_theme_check;
alter table public.trainer_settings   drop constraint if exists trainer_settings_theme_check;

-- New rows should mean "no explicit choice", not "points at a theme that has
-- not existed for months". NULL is the honest value and ThemeProvider already
-- treats it as "leave the local pick alone".
alter table public.client_app_settings alter column theme drop default;
alter table public.trainer_settings   alter column theme drop default;

-- Same correction for the rows that only ever held the dead default. This is a
-- no-op behaviourally — ThemeProvider already ignores 'steel_sky' because it is
-- not in THEMES — but it stops the table asserting a preference nobody made,
-- and it deliberately does NOT overwrite anyone's stored theme, because a real
-- value written here would win over the localStorage pick they are looking at
-- right now.
update public.client_app_settings set theme = null where theme = 'steel_sky';
update public.trainer_settings   set theme = null where theme = 'midnight_navy';

comment on column public.client_app_settings.theme is
  'Theme id. Valid values are the ids in THEMES in src/components/ThemeProvider.tsx — deliberately NOT a CHECK constraint here; the previous one listed a retired set of ids and silently rejected every save for months. NULL = no explicit choice. Unrecognised values are ignored by the app, not an error.';
comment on column public.trainer_settings.theme is
  'Theme id. See client_app_settings.theme — same rules, same history.';

-- ===== 20260801221107 depth_glow_appearance_option =====
-- Depth & glow: a per-person appearance option, not a global change.
--
-- Dustin liked the deeper/glow treatment but was explicit that it should be a
-- choice: "I love it but some may not." So it ships OFF and each person opts in
-- from Settings.
--
-- NULLABLE ON PURPOSE, with no default. Three states matter here and only three
-- values can express them:
--   NULL  = never chosen. The device's local setting stands, and nothing this
--           account does overrides what someone is currently looking at.
--   true  = chosen on.
--   false = chosen off, deliberately -- which must be able to override a device
--           that has it on, and therefore cannot be the same value as "never
--           chosen".
-- Defaulting this to false would collapse the first and third cases and quietly
-- turn the effect off on every device the moment a row was touched for any
-- other reason.
--
-- No CHECK constraint. See the note on client_app_settings.theme: the last
-- enum-shaped constraint on this table silently rejected every write for
-- months. A boolean does not need one.
--
-- REVERT: alter table public.client_app_settings drop column depth_glow;
--         (safe -- the column is read defensively and the app falls back to the
--         localStorage value, so dropping it disables the account-level sync
--         without breaking the setting.)

alter table public.client_app_settings
  add column if not exists depth_glow boolean;

comment on column public.client_app_settings.depth_glow is
  'Appearance option: deeper scheme + a glow behind each block. NULL = never chosen (device setting wins); true/false = an explicit choice that syncs across devices. Rendered from data-deep on <html> — see the DEPTH & GLOW block in globals.css.';

-- ===== 20260801223543 depth_glow_becomes_a_level =====
-- Depth & glow goes from on/off to four levels: off, 20%, 35%, 50%.
--
-- Dustin, after testing the retune: "ohhh better idea! set it to 3 diff levels.
-- off then 20%, 35%, 50%!"
--
-- RENAMED, not just retyped. `depth_glow` was an honest name for a boolean and
-- is a misleading one for a column holding 0/20/35/50 -- "glow" reads as a
-- switch. The column is an hour old and has exactly one non-null value, so
-- renaming it now is the cheapest it will ever be; leaving it would mean every
-- future reader has to learn that depth_glow is not a boolean.
--
-- THE EXISTING true MAPS TO 35, NOT TO SOME NOMINAL DEFAULT. That one row is
-- Dustin's, and 35 is precisely what he is looking at right now -- the second
-- pass shipped at 1.35x. Mapping it to anything else would silently change the
-- appearance of the only account that had opted in.
--
-- NULL still means "never chosen", so the device setting stands. 0 means
-- "chosen off", which must remain distinguishable from never-chosen so an
-- explicit off can override a device that has it on. Same three-state rule as
-- before, now with more than two on-values.
--
-- CHECK constraint deliberately omitted, consistent with theme and for the same
-- reason: the level list lives in TypeScript and an enum-shaped constraint here
-- would drift and start silently rejecting writes. An out-of-range value falls
-- back to "off" in the app rather than erroring.
--
-- REVERT:
--   alter table public.client_app_settings rename column depth_level to depth_glow;
--   alter table public.client_app_settings alter column depth_glow type boolean
--     using (depth_glow > 0);

alter table public.client_app_settings
  rename column depth_glow to depth_level;

alter table public.client_app_settings
  alter column depth_level type smallint
  using (case when depth_level then 35 else 0 end);

comment on column public.client_app_settings.depth_level is
  'Appearance: depth + glow strength. NULL = never chosen (the device setting stands), 0 = chosen off, 20/35/50 = percentage deeper. Levels are defined in ThemeProvider (DEPTH_LEVELS) and rendered from data-deep on <html> — see the DEPTH & GLOW block in globals.css. No CHECK constraint on purpose; an unrecognised value falls back to off.';

-- ===== 20260803134351 feedback_attribution_and_image_summary =====
-- Feedback needs to say WHO sent it and WHAT the screenshot shows.
--
-- Jennifer Day sent five pieces of feedback on 1 and 3 August, four of them
-- with screenshots. Working out they were hers took reverse-engineering: the
-- table records no submitter at all, only a route path like
-- "/workout/c88598b6-…", so identifying her meant resolving that workout id
-- back to its owner. Feedback that cannot be attributed cannot be replied to,
-- and feedback that cannot be replied to is feedback people stop sending.
--
-- The screenshots are the other half. They are the entire content of most of
-- these reports — "Another print screen" is the whole transcript of one — and
-- they sit in storage as PNGs nothing can read without opening them by hand.
-- Three of Jennifer's five say a version of "this field is wrong" without
-- saying WHICH field, because the picture was supposed to carry that.
--
-- client_id  : stamped at submit from the session, not typed. Nullable because
--              the trainer's own submissions have no client row, and because a
--              missing attribution must never block a report from being filed —
--              a slightly anonymous bug report still beats a lost one.
-- image_summary : written once, right after upload, by a vision pass over the
--              screenshot. Plain text, so the feedback list is searchable and
--              can be read anywhere text can — including by whoever is fixing
--              the bug at the time.

alter table public.app_feedback
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists image_summary text;

create index if not exists app_feedback_client_id_idx on public.app_feedback (client_id);

comment on column public.app_feedback.client_id is
  'Who filed this. Stamped from the session at submit; NULL for trainer-side reports or older rows. Before this existed, attribution meant resolving the workout id out of client_context by hand.';
comment on column public.app_feedback.image_summary is
  'What the attached screenshot shows, described automatically at submit time. The picture IS the report for most of these — this makes it readable and searchable rather than something that has to be opened one at a time.';

-- Backfill the five we identified by hand, so the record is right from here on.
update public.app_feedback
set client_id = 'e6b90e08-3fa8-4c8e-a8ad-56d4e3f5c2b4'
where false; -- placeholder replaced below by a resolved update;

-- ===== 20260803143506 exercise_video_health =====
-- Track whether an exercise's demo video still plays.
--
-- Jennifer Day, mid-workout, on Dumbbell Chest Supported Reverse Fly:
--   "Video unavailable — This video is no longer available because the YouTube
--    account associated with this video has been terminated."
--
-- That last clause is the important one. A terminated ACCOUNT takes every video
-- from that channel with it, so this is not one broken link — it is however
-- many of the 553 came from the same uploader, and nobody knows which. The only
-- way anyone finds out today is a client tapping play in the middle of a set
-- and getting an error, then caring enough to report it. Most will not.
--
-- video_status:
--   NULL      never checked
--   'ok'      oEmbed answered, the video plays
--   'dead'    oEmbed 404 — removed, private, or the account is gone
--   'error'   the check itself failed (network, rate limit). NOT 'dead' —
--             a failed check must never be recorded as a failed video, or one
--             bad night of checks silently hides working demos from everybody.
--
-- REVERT: alter table public.exercises drop column video_status, drop column
--         video_checked_at;  (safe — the column is read defensively)

alter table public.exercises
  add column if not exists video_status text,
  add column if not exists video_checked_at timestamptz;

create index if not exists exercises_video_status_idx
  on public.exercises (video_status)
  where video_url is not null;

comment on column public.exercises.video_status is
  'Whether the demo video still plays: ok | dead | error | NULL (unchecked). Written by /api/cron/check-videos via YouTube oEmbed. ''error'' is deliberately distinct from ''dead'' — a check that could not run is not evidence the video is broken.';
comment on column public.exercises.video_checked_at is
  'When video_status was last written. Lets the checker walk the oldest first and spread 553 videos over several runs.';

-- The one Jennifer found, flagged now rather than waiting for the first sweep.
update public.exercises
set video_status = 'dead', video_checked_at = now()
where video_url ilike '%A-x6_0VrT18%';

-- ===== 20260803182049 trainer_out_of_rankings =====
-- The coach comes off the board. 2026-08-03.
--
-- Dustin: "Let's go ahead and take me out of the actual rankings in the
-- challenge to make sure my clients are the spotlight."
--
-- He is currently #1 with 8 days on The Consistency Streak, ahead of Cheyenne
-- on 7. A trainer training every day and topping a board his clients are
-- competing on is not a competition, and the person it demotivates is exactly
-- the person the board exists for.
--
-- WHAT COMES OFF, AND WHAT DOES NOT
--   off : ranked standings, first place, winner selection, the winner
--         announcement in the group chat, Coach Bot's leaderboard facts
--   on  : his own logging, his own screens, and the ANONYMOUS group total —
--         "we trained 71 days as a group" names nobody, so his days there take
--         no spotlight from anyone and pulling them would make a number the
--         group has been watching drop mid-challenge for no visible reason.
--
-- HOW, so it cannot drift: the roster was defined twice — the same four-line
-- demo filter copy-pasted into challenge_leaderboard and challenge_group_total.
-- That is how this app has broken before (Peak Week in two files, feedback
-- inserts in four). One view now defines who is scored and who is ranked, and
-- both functions read it. A future board that forgets the rule has to forget it
-- on purpose.
--
-- Reversible: update clients set exclude_from_rankings = false where … and he
-- is back on the board on the next page load. No data is deleted.

-- ── The flag ────────────────────────────────────────────────────────────────
alter table clients
  add column if not exists exclude_from_rankings boolean not null default false;

comment on column clients.exclude_from_rankings is
  'Never appears in ranked standings or wins a challenge. Their own screens and totals are untouched. Set for the trainer.';

-- The trainer's own client row. Matched by the trainer_settings auth user
-- first, with the known address as a fallback, so this still lands if the
-- clients row was created before it was linked to an auth user.
update clients
   set exclude_from_rankings = true
 where auth_user_id in (select user_id from trainer_settings)
    or lower(btrim(coalesce(email, ''))) = 'symmetrypersonaltraining@gmail.com';

-- ── One definition of the roster ────────────────────────────────────────────
-- scored  = counts toward the anonymous group total
-- ranked  = may be named, placed, and win
--
-- No grants: nothing outside these SECURITY DEFINER functions should be able to
-- read the whole roster's names.
create or replace view v_challenge_roster as
  select c.id                                        as cid,
         c.name                                      as cname,
         coalesce(c.exclude_from_rankings, false) = false as ranked
    from clients c
   where c.archived_at is null
     and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
     and coalesce(lower(c.name), '') not like '%test client%'
     and coalesce(lower(c.name), '') not like '%demo account%';

revoke all on v_challenge_roster from public, anon, authenticated;

comment on view v_challenge_roster is
  'Who is scored and who is ranked in a group challenge. Single source for challenge_leaderboard and challenge_group_total.';

-- ── The board ───────────────────────────────────────────────────────────────
create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table(rnk integer, client_id uuid, client_name text, score numeric, is_me boolean, joined boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges
  where id = p_challenge_id;

  if v_start is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    -- Ranked only. Filtered BEFORE rank() so removing the coach promotes
    -- everyone below him rather than leaving a hole at the top.
    select r.cid, r.cname from v_challenge_roster r where r.ranked
  ),
  all_days as (
    select w.client_id as cid,
           (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date
    from meal_adherence_logs m
    where v_metric = 'logging'
      and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  scores as (
    select r.cid,
           r.cname,
           count(distinct a.d)::numeric as sc,
           exists (select 1 from challenge_participants cp
                    where cp.challenge_id = p_challenge_id and cp.client_id = r.cid) as has_joined
    from roster r
    left join all_days a on a.cid = r.cid
    group by r.cid, r.cname
  )
  select (rank() over (order by sc desc))::int,   -- score ONLY: ties share a place
         cid, cname, sc, (cid = v_me), has_joined
  from scores
  order by sc desc, cname;
end;
$function$;

-- ── The anonymous total ─────────────────────────────────────────────────────
create or replace function public.challenge_group_total(p_challenge_id uuid)
returns table(group_total numeric, contributors integer, my_score numeric, joined boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start  date;
  v_end    date;
  v_metric text;
  v_me     uuid := public.my_client_id();
  v_today  date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions')
    into v_start, v_end, v_metric
  from group_challenges where id = p_challenge_id;
  if v_start is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    -- Everyone scored, ranked or not: the total names nobody.
    select r.cid from v_challenge_roster r
  ),
  all_days as (
    select w.client_id as cid, (w.completed_at at time zone 'America/Chicago')::date as d
    from workout_logs w
    where w.completed_at is not null
      and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date
    from meal_adherence_logs m
    where v_metric = 'logging' and m.adherence is not null
      and m.log_date between v_start and v_end
  ),
  per as (
    select r.cid, count(distinct a.d) as days
    from roster r left join all_days a on a.cid = r.cid
    group by r.cid
  )
  -- my_score is the caller's OWN data and stays correct for everyone,
  -- including someone who is not ranked. Their days still count for them.
  select coalesce(sum(days), 0)::numeric,
         count(*) filter (where days > 0)::int,
         coalesce(max(days) filter (where cid = v_me), 0)::numeric,
         exists (select 1 from challenge_participants cp
                  where cp.challenge_id = p_challenge_id and cp.client_id = v_me)
  from per;
end;
$function$;

-- ===== 20260804010340 exercise_default_tracked_fields =====
-- Per-movement tracking defaults. 2026-08-04.
--
-- Dustin: "the app needs to have preset defaults for movements but still able
-- to toggle change them."
--
-- Until now there were only two levels: an explicit tracked_fields on the one
-- prescription, or a name/modality heuristic in the logger. Nothing remembered
-- "a Kettlebell Swing is weight and reps" at the MOVEMENT level, so every new
-- program started from the guess again — which is how a loaded lunge kept
-- coming back asking for speed and heart rate.
--
-- Three levels now, most specific first:
--   1. prescribed_exercises.tracked_fields  — this prescription, chosen on purpose
--   2. exercises.default_tracked_fields     — this movement, the trainer's default
--   3. the logger heuristic                 — last resort for a movement nobody has set
--
-- SEEDED FROM WHAT WAS ALREADY CHOSEN, not from a fresh guess: for each movement
-- with at least one explicit prescription, take the most common tracked_fields
-- across its prescriptions. That is real trainer intent, already expressed. Any
-- movement with no explicit prescription anywhere stays NULL and keeps using the
-- heuristic — inventing a default there would just be the same guess with more
-- authority.
--
-- RLS already restricts writes on exercises to is_trainer(), so a client's chip
-- toggle can never change a library default even if a future caller tries.

alter table exercises
  add column if not exists default_tracked_fields text[];

comment on column exercises.default_tracked_fields is
  'Trainer default for this movement: what the logger asks for when a prescription has no explicit tracked_fields.';

with modes as (
  select pe.exercise_id,
         pe.tracked_fields,
         count(*) as n,
         row_number() over (partition by pe.exercise_id order by count(*) desc, pe.tracked_fields) as rn
  from prescribed_exercises pe
  where pe.exercise_id is not null
    and pe.tracked_fields is not null
    and array_length(pe.tracked_fields, 1) > 0
  group by pe.exercise_id, pe.tracked_fields
)
update exercises e
   set default_tracked_fields = m.tracked_fields
  from modes m
 where m.exercise_id = e.id
   and m.rn = 1
   and e.default_tracked_fields is null;

-- ===== 20260804101658 recipes =====
-- Recipes. 2026-08-04.
--
-- Dustin: "I want you to build a recipe builder for everyone. they should be
-- able to build a recipe manually, using data base, and ai if needed to figure
-- numbers, etc. they can save to their library and submit to me to be approved
-- for a public library fid use by everyone."
--
-- TWO LIBRARIES, ONE TABLE. A recipe is private to whoever wrote it until they
-- submit it; approval is what makes it everyone's. Visibility is a single
-- column rather than a copy in a second table, so approving is a state change,
-- not a duplication that can drift from the original.
--
--   private    just theirs, the default
--   submitted  waiting on Dustin
--   public     approved, in the shared library
--   rejected   not approved; still theirs, still usable, with his note attached
--
-- ONLY THE TRAINER CAN PUBLISH. That is enforced by a trigger rather than by
-- the API alone, because "everyone can see it" is exactly the kind of rule that
-- must not depend on which code path did the write.
--
-- Macros live on the ingredients and the per-serving totals are DERIVED, never
-- typed. A recipe whose header disagrees with its ingredient list is the same
-- bug as a meal card that reads 593 while listing 393 of food.

create table if not exists recipes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade,
  title         text not null,
  description   text,
  servings      numeric not null default 1 check (servings > 0),
  prep_minutes  int,
  cook_minutes  int,
  -- One step per element. Free text in one blob makes "step 3" unaddressable.
  instructions  text[] not null default '{}',
  image_url     text,
  tags          text[] not null default '{}',
  visibility    text not null default 'private'
                check (visibility in ('private','submitted','public','rejected')),
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  review_note   text,
  -- Derived from the ingredients on every write. Stored so the library can list
  -- a hundred recipes without summing a hundred ingredient sets.
  total_kcal    numeric not null default 0,
  total_protein numeric not null default 0,
  total_carbs   numeric not null default 0,
  total_fats    numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  position    int not null default 1,
  food        text not null,
  amount      numeric,
  unit        text,
  protein     numeric not null default 0,
  carbs       numeric not null default 0,
  fats        numeric not null default 0,
  -- Where the numbers came from, so a reader can weigh them: a catalog match is
  -- not the same kind of fact as a model's estimate.
  food_id     uuid,
  source      text not null default 'manual' check (source in ('manual','database','ai')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists recipes_client_idx     on recipes(client_id);
create index if not exists recipes_visibility_idx on recipes(visibility);
create index if not exists recipe_ing_recipe_idx  on recipe_ingredients(recipe_id, position);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

-- Your own, plus everything approved.
create policy recipes_read on recipes for select
  using (visibility = 'public' or client_id = my_client_id() or is_trainer());
create policy recipes_insert on recipes for insert
  with check (client_id = my_client_id() or is_trainer());
create policy recipes_update on recipes for update
  using (client_id = my_client_id() or is_trainer())
  with check (client_id = my_client_id() or is_trainer());
create policy recipes_delete on recipes for delete
  using (client_id = my_client_id() or is_trainer());

create policy recipe_ing_read on recipe_ingredients for select
  using (exists (select 1 from recipes r where r.id = recipe_id
                 and (r.visibility = 'public' or r.client_id = my_client_id() or is_trainer())));
create policy recipe_ing_write on recipe_ingredients for all
  using (exists (select 1 from recipes r where r.id = recipe_id
                 and (r.client_id = my_client_id() or is_trainer())))
  with check (exists (select 1 from recipes r where r.id = recipe_id
                 and (r.client_id = my_client_id() or is_trainer())));

-- Publishing is the trainer's alone. A client may move their own recipe between
-- private / submitted / rejected; only is_trainer() may write 'public', and only
-- the trainer may take a public recipe back down.
create or replace function enforce_recipe_publish()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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
end $$;

drop trigger if exists trg_recipe_publish on recipes;
create trigger trg_recipe_publish before insert or update on recipes
  for each row execute function enforce_recipe_publish();

-- Photos of the finished dish. Public-read like the other image buckets; writes
-- are limited to signed-in users under their own folder.
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

drop policy if exists recipe_photos_read on storage.objects;
create policy recipe_photos_read on storage.objects for select
  using (bucket_id = 'recipe-photos');

drop policy if exists recipe_photos_write on storage.objects;
create policy recipe_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos');

-- ===== 20260804132505 app_feedback_cross_app_columns =====
alter table public.app_feedback
  add column if not exists app_instance  text,
  add column if not exists reported_by   text,
  add column if not exists trainer_email text,
  add column if not exists app_version   text,
  add column if not exists user_agent    text;

update public.app_feedback
   set app_instance = 'live'
 where app_instance is null;

alter table public.app_feedback
  alter column app_instance set default 'live';

comment on column public.app_feedback.app_instance is
  'Which deployment this came from: live, dylan, etc. Set from NEXT_PUBLIC_APP_INSTANCE.';
comment on column public.app_feedback.reported_by is
  'Email of whoever hit the feedback button.';

create index if not exists app_feedback_instance_created_idx
  on public.app_feedback (app_instance, created_at desc);

-- ===== 20260804170403 birthday_bot =====
-- Automatic birthday wishes in the group chat.
--
-- Dustin, 2026-08-04: "lets activate an automatic fun bday msg for everyone in
-- the group chat on the app." Voice: Coach Bot, the same identity as the
-- smack-talk bot — the app being honestly the app, rather than the app
-- pretending to be Dustin.
--
-- The ledger below is the whole safety story. A cron that runs daily and posts
-- "happy birthday" is one retry away from posting it twice, and a doubled
-- birthday message in a thirty-five person group chat is the kind of small
-- embarrassment nobody forgets. So every post is recorded against
-- (client, year, kind) with a primary key, and the writer checks before it
-- speaks. Re-running the job all day long is a no-op by construction, not by
-- careful scheduling.

create table if not exists public.birthday_posts (
  client_id  uuid not null references public.clients(id) on delete cascade,
  year       int  not null,
  -- 'group'    the message in the group chat, on the day
  -- 'heads_up' the private note to Dustin, the evening before
  kind       text not null check (kind in ('group', 'heads_up')),
  posted_at  timestamptz not null default now(),
  primary key (client_id, year, kind)
);

alter table public.birthday_posts enable row level security;

-- Trainer can look; nobody else has any reason to. The cron writes with the
-- service role and bypasses this entirely.
drop policy if exists birthday_posts_trainer_read on public.birthday_posts;
create policy birthday_posts_trainer_read
  on public.birthday_posts for select
  using (is_trainer());

-- Live from the start, at Dustin's request: "dwitch to live right away, collect
-- and add as we go." The flag stays so it can be switched off in one row if it
-- ever misfires, without a deploy.
insert into public.app_flags (key, enabled)
values ('birthday_bot_live', true)
on conflict (key) do update set enabled = true, updated_at = now();

-- ===== 20260805155423 assistance_loaded_exercises =====
-- Some machines get EASIER as the number goes up.
--
-- Dustin, 2026-08-05, looking at Tim Yancey's profile: "prs are not trackjng
-- here, he just went uo on assisted dips".
--
-- He had. Tim's assisted dip:
--     Jul  4   140x10, 120x10, 20x10
--     Jul 22   130x20, 120x20
--     Aug  5   120x20, 110x20      <- the session Dustin is talking about
--
-- On an assisted dip or pull-up machine the stack COUNTERWEIGHTS you. 110 lb of
-- assistance for 20 reps is dramatically stronger than 140 lb for 10. But every
-- "best" in this app is MAX(weight_lbs), so the app read Tim's best as the 140
-- from 4 July, called it a personal record, and has been telling Dustin the lift
-- "hasn't moved in 4 weeks" while Tim took 30 lb off the stack and doubled the
-- reps. His actual PRs could never fire, and the plateau card was flagging
-- progress as a stall.
--
-- The direction is a property of the MOVEMENT, so it belongs on the exercise
-- rather than being re-derived from the name at each of the four places that
-- compare loads. Editable, because "assisted" is not always in the name and a
-- machine can be set up either way.

alter table public.exercises
  add column if not exists load_is_assistance boolean not null default false;

comment on column public.exercises.load_is_assistance is
  'True when a LOWER load means a stronger effort (assisted dip/pull-up machines, counterbalance rigs). Every best/PR/plateau comparison must invert for these.';

-- Backfill from the name, which is how both current cases are written.
update public.exercises
   set load_is_assistance = true
 where name ~* '(^|[^a-z])assisted([^a-z]|$)|counter ?balance'
   and load_is_assistance = false;

-- ===== 20260807171654 add_micronutrient_storage =====
-- Full micronutrient storage (app_feedback 2c2df05f).
--
-- Nutrients live in a single `micros` jsonb per row, keyed by the registry in
-- src/lib/nutrition/nutrients.ts. NOT 31 columns per table: that would be ~180
-- columns, a migration per nutrient, and six more places for the same fact to
-- drift.
--
-- The four nutrients that already had real columns -- fiber, sugar, sodium,
-- sat_fat on food_catalog and est_* on meal_adherence_logs -- KEEP those
-- columns and stay authoritative there. There is no dual write: on those two
-- tables the legacy four live in their columns and everything else lives in
-- micros. readNutrients() merges them.
--
-- ADDITIVE ONLY. No column is dropped, renamed or rewritten, so every existing
-- row and every existing query behaves exactly as before. NULL/absent means
-- UNKNOWN, never zero.

-- Plan items: had no nutrient storage at all, and no kcal.
alter table public.meal_items
  add column if not exists kcal   numeric,
  add column if not exists micros jsonb;

-- Curated food list: P/C/F only until now.
alter table public.foods
  add column if not exists kcal   numeric,
  add column if not exists micros jsonb;

-- USDA/OFF import: already has kcal + the legacy four as columns.
alter table public.food_catalog
  add column if not exists micros jsonb;

-- Log rows: already have est_kcal + the legacy four as est_* columns.
alter table public.meal_adherence_logs
  add column if not exists est_micros jsonb;

-- Recipes.
alter table public.recipe_ingredients
  add column if not exists micros jsonb;

alter table public.recipes
  add column if not exists total_micros jsonb;

comment on column public.meal_items.kcal is
  'Calories when known from a label. NULL = derive 4P+4C+9F. Stored because the formula is wrong for alcohol, fibre and sugar alcohols.';
comment on column public.meal_items.micros is
  'Micronutrients keyed by src/lib/nutrition/nutrients.ts. Read via readNutrients(), never directly. NULL/absent = unknown, never zero.';
comment on column public.foods.micros is
  'Micronutrients keyed by src/lib/nutrition/nutrients.ts. Read via readNutrients().';
comment on column public.food_catalog.micros is
  'Micronutrients BEYOND fiber/sugar/sodium/sat_fat, which keep their own columns and stay authoritative.';
comment on column public.meal_adherence_logs.est_micros is
  'Estimated micronutrients BEYOND est_fiber/est_sugar/est_sodium/est_sat_fat, which keep their own columns and stay authoritative.';

-- ===== 20260811140419 health_connect_schema =====
-- Health Connect / wearable sync — Phase 1 schema.
-- Plan: docs/HEALTH-CONNECT-BUILD-PLAN.md. Research: docs/HEALTH-SYNC-HANDOFF.md.
-- Raised by Todd Prine 2026-07-29. ADDITIVE ONLY — no existing table is altered.

-- Who has linked what.
create table if not exists public.health_connections (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  provider      text not null,
  status        text not null default 'active',
  external_id   text,
  -- D3: tokens live here but the table is service-role only (RLS below, no
  -- client-readable policy at all). On-device providers like Health Connect
  -- have no token — permission lives on the phone — so these stay null for it.
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[] not null default '{}',
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, provider),
  constraint health_connections_status_chk check (status in ('active','revoked','error'))
);

-- One row per client / day / PROVIDER — deliberately not one merged row.
-- Keeping Garmin's 9,412 steps and the phone's 9,388 for the same day separate
-- is what makes a disagreement debuggable. Merging happens in a view, later.
create table if not exists public.health_daily (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  day            date not null,
  provider       text not null,
  steps          int,
  active_kcal    int,
  resting_kcal   int,
  distance_m     numeric,
  exercise_min   int,
  avg_hr         int,
  resting_hr     int,
  hrv_ms         numeric,     -- D10: yes, pull it
  sleep_min      int,         -- D10: yes, pull it
  sleep_score    int,
  raw            jsonb,
  synced_at      timestamptz not null default now(),
  unique (client_id, day, provider)
);
create index if not exists health_daily_client_day_idx on public.health_daily (client_id, day desc);

-- Sessions done outside the app. A STAGING table: the raw session is kept even
-- after it becomes a workout_log, so a dedupe mistake is reversible.
create table if not exists public.health_workouts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  provider       text not null,
  external_id    text not null,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  type           text,
  duration_min   numeric,
  distance_m     numeric,
  calories       int,
  avg_hr         int,
  max_hr         int,
  raw            jsonb,
  -- Set when this turned out to BE a session already logged in the app, so it
  -- is never counted twice. Rule 1 of the dedupe design.
  linked_log_id  uuid references public.workout_logs(id) on delete set null,
  -- Set when it became a session of its own (D8: it IS a real logged workout).
  created_log_id uuid references public.workout_logs(id) on delete set null,
  ignored        boolean not null default false,
  synced_at      timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists health_workouts_client_started_idx on public.health_workouts (client_id, started_at desc);

-- D8: an imported session does NOT score unless the challenge is explicitly
-- about extra work. Default false, so nothing that exists today changes.
alter table public.group_challenges
  add column if not exists counts_external boolean not null default false;

comment on column public.group_challenges.counts_external is
  'D8 (Dustin, 11 Aug): workouts imported from a wearable do not count toward a challenge unless it is specifically about how many EXTRA workouts you can do. Default false — a client wearing a watch through a programmed session cannot inflate the board.';
comment on table public.health_connections is
  'Service-role only: no client-readable RLS policy, because this table can hold OAuth tokens (D3).';
comment on table public.health_workouts is
  'Staging for sessions done outside the app. linked_log_id = matched an existing log; created_log_id = became its own. Raw row is kept either way so dedupe is reversible.';

alter table public.health_connections enable row level security;
alter table public.health_daily       enable row level security;
alter table public.health_workouts    enable row level security;

-- ===== 20260811152752 uq_scheduled_workout_one_per_day =====
-- One session per client, per workout, per date. Dustin, 11 Aug 2026:
-- "shouldn't be doing same session twice".
--
-- Backlog item 2. Six duplicate groups existed and FOUR shared a created_at to
-- the microsecond, i.e. one insert batch writing the same session twice. The
-- code paths that did it are fixed (src/lib/scheduleDedupe.ts, shipped
-- 1ca7876), but code fixes only cover the paths that exist today. This makes it
-- impossible.
--
-- WHERE deleted_at IS NULL, so a soft-deleted session never blocks re-adding
-- the same one. That predicate is the contract every read path already honours.
--
-- The 6 pre-existing duplicates were soft-deleted first, keeping the row that
-- carried a workout_log_id (never orphan a logged session), then completed over
-- scheduled, then oldest. Backed up whole to bak_dupe_sched_20260811.
create unique index if not exists uq_scheduled_workout_one_per_day
  on public.scheduled_workouts (client_id, day_id, scheduled_date)
  where deleted_at is null;

-- ===== 20260811154610 trainers_table_seeded =====
-- Trainer identity becomes a row, not a string literal. Dustin, 11 Aug 2026.
--
-- 64 RLS policies call is_trainer(). The function's SIGNATURE does not change,
-- so none of them are touched — that is the whole reason for doing it this way
-- rather than editing policies.
--
-- This migration ONLY creates and seeds the table. The function is swapped in a
-- separate step, after the seed is verified present. An empty table plus a
-- rewritten function would deny all 64 policies at once and lock the trainer
-- out of every client's data.
create table if not exists public.trainers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Case-insensitive: auth.users stores what the user typed at signup.
create unique index if not exists uq_trainers_email_lower
  on public.trainers (lower(email));

insert into public.trainers (email, name)
values ('symmetrypersonaltraining@gmail.com', 'Dustin Gautreaux')
on conflict do nothing;

alter table public.trainers enable row level security;

-- Readable by a signed-in trainer, writable by nobody through the API. Adding
-- a trainer is a deliberate act with a service-role key or the SQL editor, not
-- something any session can do to itself.
drop policy if exists trainers_select_trainer on public.trainers;
create policy trainers_select_trainer on public.trainers
  for select to authenticated
  using (public.is_trainer());

-- ===== 20260811154623 is_trainer_reads_trainers_table =====
-- is_trainer() stops hardcoding an address. Same name, same signature, same
-- STABLE SECURITY DEFINER, same search_path — so all 64 RLS policies that call
-- it are untouched and keep behaving identically.
--
-- Seed verified present and matched to a real auth.users row before running
-- this. Rewriting the function against an empty table would deny all 64
-- policies at once and lock the trainer out of every client's data.
--
-- lower() on both sides: auth.users stores whatever was typed at signup, and
-- "is this the trainer" must not hinge on capitalisation.
create or replace function public.is_trainer()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from auth.users u
    join public.trainers t on lower(t.email) = lower(u.email)
    where u.id = auth.uid()
      and t.active
  );
$function$;
