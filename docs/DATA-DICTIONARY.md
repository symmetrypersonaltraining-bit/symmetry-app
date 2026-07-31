# Symmetry Personal Training — Data Dictionary

| | |
|---|---|
| **Generated** | 2026-07-31 |
| **Supabase project** | `mkfiginpiesospsnktea` |
| **Schema documented** | `public` |
| **Source** | The **live database**, read directly from `information_schema` / `pg_catalog` |

> ### ⚠️ Read this first
> **This document is generated from the live schema, not from migrations.**
> The git repository contains **5 of the ~108 migrations** that produced this database (`supabase/migrations/` holds only `20260718_movement_assessments`, `20260724_meals_rotation`, `20260725_group_reads`, `20260731_my_meals`, `20260731_week_brief_seen`). Everything else was applied by hand or through the Supabase SQL editor and exists nowhere in version control.
>
> That means: **the database is the source of truth, and this file is the only written record of it.** If you change the schema, change this file in the same commit. If this file and the database disagree, the database is right and this file is stale.

**At a glance**

| | Count |
|---|---|
| Base tables | 108 (**62 live**, 46 backup/legacy) |
| Views | 13 (5 canonical `v_*`) |
| Functions in `public` | 48 |
| Row triggers | 11 (+1 event trigger) |
| pg_cron jobs | 9 |
| CHECK constraints | 50 |
| RLS policies | 141 |
| Tables with RLS enabled | 108 of 108 |
| Tables with RLS enabled but **no policy** | 41 |
| Largest tables | `food_catalog` 197,826 · `prescribed_exercises` 9,167 · `set_logs` 7,303 · `appointments` 4,874 · `scheduled_workouts` 3,178 · `sections` 2,975 |

Row counts throughout this document are **exact** (`select count(*)` per table, run 2026-07-31), not `pg_class.reltuples` estimates.

---

## Start here — the 21 tables that actually matter

Everything hangs off `clients`. There are four independent spines:

```
                                   ┌──────────────────────────────────────┐
                                   │             clients                  │
                                   └──┬────────┬──────────┬───────────┬───┘
      PROGRAMMING (the plan)          │        │          │           │        BILLING
  programs → phases → days →          │        │          │           └──► payment_reminders
    sections → prescribed_exercises   │        │          │
            ▲                         │        │          │           NUTRITION
    program_assignments ──────────────┘        │          └──► meal_plans → meals → meal_items
                                               │                macro_targets
      CALENDAR (what happens when)             │                meal_adherence_logs
  client_training_patterns                     │
        ↓ generates                            │           BODY
  scheduled_workouts ◄── appointments (gcal)   └──────────► metrics
        ↓ completed by
  workout_logs → set_logs
        ↑ drift detected by
  schedule_change_proposals
```

### The programming spine — the *plan*

| Table | Rows | What it holds |
|---|---:|---|
| **`programs`** | 92 | A named training programme ("Lower-Crossed Corrective Track", "Upper/Lower Split"). Top of the tree. `personal_for_client_id` marks a copy forked for one client. |
| **`phases`** | 122 | A block inside a programme ("Phase 2 – Strength"), ordered by `position`. Child of `programs`. |
| **`days`** | 994 | One training day inside a phase ("Day A – Push"). Child of `phases`, parent of `sections`. `client_owner_id` set = this day has been forked for one client and must never be shown to another. |
| **`sections`** | 2,975 | A block inside a day. Carries the coach-facing NASM name (`Inhibit`/`Lengthen`/`Activate`/`Integrate`/`Primary Strength`/…) and the client-facing name (`Warm-Up`/`Strength`/`Accessory`/`Cardio`). |
| **`prescribed_exercises`** | 9,167 | The actual prescription: which `exercise`, how many sets, what volume (`reps`/`rep_range`/`duration`/`distance`/`hold_pattern`), tempo, load, cue, rest, superset group. The biggest programming table. |
| **`exercises`** | 821 | The movement library — name (globally unique), muscle group, modality, equipment, video. Referenced by both `prescribed_exercises` (planned) and `set_logs` (performed). |
| **`program_assignments`** | 67 | Which client is on which programme, and where they are in it. **A client can be on several at once** — that is why `v_client_now.active_programs` is an array, not a value. |

### The calendar spine — *when it happens*

| Table | Rows | What it holds |
|---|---:|---|
| **`client_training_patterns`** | 15 | The recurring weekly template: "this client trains weekday 2, `day_id` X, supervised, from this date". `generate_scheduled_workouts()` materialises the calendar from it. |
| **`scheduled_workouts`** | 3,178 | **The training calendar.** One planned session for one client on one date, pointing at a `day` (or a `published_workout`). Soft-deleted via `deleted_at` — always filter it. `status` ∈ `scheduled`/`completed`/`skipped`/`moved`. |
| **`appointments`** | 4,874 | The Google Calendar mirror — the *real-world* booking (`scheduled_at`, `gcal_event_id`, `gcal_recurring_id`). Independent of `scheduled_workouts`: the appointment says the client is coming in, the scheduled workout says what they will do. Keeping the two aligned is the job of `detect_schedule_changes()`. |
| **`schedule_change_proposals`** | 86 | The human-in-the-loop queue. When calendar and plan disagree, a proposal is filed (`moved`/`cancelled`/`uncovered`/`orphaned`/`pattern_shift`/`retired`) rather than the data being changed. The trainer approves or rejects via `resolve_schedule_proposal()`. |

### The logging spine — *what actually happened*

| Table | Rows | What it holds |
|---|---:|---|
| **`workout_logs`** | 836 | One logged session per client per date. `completed` + `completed_at` are the real signal; `status` is descriptive English (`Done as planned`, `Modified`, `Partial`, `Skipped`, `Rest day`). |
| **`set_logs`** | 7,303 | **The workout fact table.** One set: reps, weight (`COALESCE(weight_lbs, weight)` — always both), RPE, duration, distance, speed, heart rate. Child of `workout_logs`, linked back to the prescription and the exercise. |

### The nutrition spine

| Table | Rows | What it holds |
|---|---:|---|
| **`meal_plans`** | 54 | A versioned nutrition plan for one client. `status` ∈ `draft`/`pending`/`live`/`archived`; one `live` per client is the intent (not enforced). |
| **`meals`** | 409 | A meal slot inside a plan ("Meal 3 – dinner"), ordered by `position`. `rotation` holds multi-week variants. |
| **`meal_items`** | 1,316 | The foods inside a meal with per-item protein/carbs/fats. Calories are always derived (`4P + 4C + 9F`), never stored. |
| **`meal_adherence_logs`** | 1,446 | **The nutrition fact table.** One row per client / date / meal slot: how closely the plan was followed (`Full`, `3/4`, `1/2`, `1/4`, `Partial`, `Off-plan`, `Skipped`) plus optional estimated macros and a photo. |
| **`macro_targets`** | 41 | Effective-dated calorie and macro targets per client. The current target is the newest row with `effective_date <= today`. |

### Body, money, and the rest

| Table | Rows | What it holds |
|---|---:|---|
| **`clients`** | 36 | The root entity. `auth_user_id` → `auth.users`; `archived_at` is the soft delete every canonical view filters on. **Its `current_weight` column is stale — use `metrics`.** |
| **`metrics`** | 96 | **The body-composition source of truth**: weight, body-fat %, lean/fat mass (trigger-computed), one row per client per date. |
| **`payment_reminders`** | 40 | One billing reminder per client per due date, with the amount, credits, approval state and every send timestamp. Generated nightly; recalculated after each calendar sync. |

### The five rules a new engineer needs on day one

1. **Start every client question at `v_client_now`.** One row per client, everything joined.
2. **Always filter `scheduled_workouts.deleted_at IS NULL`.** Soft deletes are how cancellations are recorded.
3. **Never read `clients.current_weight`.** Read the newest `metrics` row.
4. **Always read set weight as `COALESCE(weight_lbs, weight)`.** Two columns, one meaning.
5. **`workout_logs.status` and `scheduled_workouts.status` are different vocabularies** — sentence-case English vs lowercase tokens. Mixing them raises a CHECK violation.

---

## Canonical views

Five views are marked *canonical* by their own `COMMENT ON VIEW`. Prefer them over hand-rolled joins; they encode decisions (timezone, exclusions, fallbacks) that are easy to get wrong.

All views below run in the `America/Chicago` timezone and exclude archived clients and the `Demo Account` / `Test Client` rows unless noted.

### `v_client_now` — one row per client, "what is this client doing right now"

> ONE ROW PER CLIENT — the answer to "what is this client doing right now". Start every client question here. active_programs is an ARRAY: clients legitimately run several at once. latest_weight comes from metrics, NEVER from clients.current_weight (that column never syncs and drifts up to 25 lb). coverage_days_left going negative means their programming has run out.

Joins `clients` to: live scheduled workouts (coverage, 7-day and 28-day completion %), the next session, active programmes, the latest `metrics` row, the current `macro_targets`, 7/28-day food-logging counts, upcoming appointments, and the count of open schedule proposals. Also derives `nutrition_state` ∈ `no_plan` / `not_logging` / `mostly_off_plan` / `on_plan` and `macros_are_placeholder`.

Does **not** exclude archived or test clients (it exposes `is_archived` and `is_test` flags instead — filter yourself).

### `v_integrity_flags` — "what is wrong right now"

> Latest value of every integrity check. Every count SHOULD be zero. Start here to answer "what is wrong right now".

The newest row per `check_name` from `integrity_checks`, ordered `critical` → `warn` → `info` then by count. Populated twice a day by the `integrity_checks_12h` cron job.

### `v_plan_vs_actual` — one row per client per date: planned vs logged vs booked

> Canonical. One row per client per date: what was planned, what was logged, what appointment existed, and gap_reason in {completed, moved, missed, no_plan, unsupervised_extra}. NULL = future, or a past date whose only appointment was cancelled. no_plan is past-tense only. Dates are America/Chicago. Filters scheduled_workouts.deleted_at is null; excludes archived + Demo/Test clients.

`gap_reason` resolution order: `unsupervised_extra` (logged with nothing planned) → `moved` → `completed` → `no_plan` → `missed` → NULL.

### `v_exercise_progression` — per client, per exercise, per date, with the delta

> Canonical. One row per client per exercise per date: names not ids, the prescription, what was done, estimated 1RM (Epley, best set, NULL for time/distance work), and the delta against that client's previous session on the same movement. trend in {first_session, no_comparison, progressing, regressing, holding} — no_comparison when the previous session recorded nothing measurable, rather than defaulting to progress. Excludes archived + Demo/Test clients.

Estimated 1RM is Epley (`w × (1 + reps/30)`), best set only, and only for weight > 0 with 1–15 reps. Volume is `COALESCE(weight_lbs, weight, 0) × COALESCE(reps, 0)`.

### `v_nutrition_now` — one row per client, nutrition state

> Canonical. One row per client. Calories resolve from est_kcal, falling back to the planned meal's items scaled by the adherence fraction (Full=1, 3/4=.75, 1/2=.5, 1/4=.25, Skipped=0) -- 34% of logs carry no est_kcal and counting those as zero understated everyone. n_kcal_unknown_28d says how much is still unresolvable. on_plan_pct_28d / off_plan_pct_28d / has_no_plan are THREE SEPARATE FIELDS: folding them conflates "no plan to follow" with "has a plan and eats differently". Excludes archived + Demo/Test clients.

`nutrition_state` ∈ `no_plan_no_logs` / `logging_without_a_plan` / `plan_never_logged` / `logging_sporadically` / `active`.

> ⚠️ In the adherence→fraction `CASE`, `Off-plan` and **NULL** both fall through to `ELSE 1.0`. An `Off-plan` meal with no `est_kcal` is therefore costed as if the client ate 100% of the *planned* meal.

### Supporting (non-canonical) views

| View | Comment | What it is |
|---|---|---|
| `v_client_calendar` | — | Flat calendar rows: `scheduled_workouts` joined to day/phase/program/published-workout labels. **Does not filter `deleted_at`.** |
| `v_client_calendar_pattern` | *"Each Google recurring series reduced to its modal weekday + time over -28/+28 days. future_n = 0 means the series is RETIRED (this is how Sarah Prince's dead Mon 07:00 series was caught). Deviations from the modal pair are one-off moves."* | The input to `detect_schedule_changes()`'s `retired` and `pattern_shift` reasons. |
| `v_client_profile` | — | `clients` plus derived `age`, `lean_mass`, `fat_mass`. ⚠️ Derives lean/fat mass from the **stale** `clients.current_weight`, not from `metrics`. |
| `v_exercise_history` | — | Raw per-set history (client, exercise, date, set, reps, weight, notes). Older/simpler than `v_exercise_progression`; uses `weight` only, **not** `COALESCE(weight_lbs, weight)`. |
| `v_metrics_trend` | — | `metrics` ordered by client and date. |
| `v_schedule_proposals` | — | Pending `schedule_change_proposals` with the client name, ordered by urgency of `reason`. |
| `ai_usage_daily` / `ai_usage_monthly` | — | Token and cost rollups over `ai_usage_log`. The only two views with `security_invoker = on`. |

---

## Full table reference (live schema, alphabetical)

Backup / legacy tables are **excluded** from this section and listed separately further down.

### `ai_chat_sessions`

Rows: **0**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `context_type` | text | yes | `'general'::text` |
| `messages` | jsonb | yes | `'[]'::jsonb` |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `ai_chat_sessions_context_type_check` CHECK ((context_type = ANY (ARRAY['general', 'programming', 'intake', 'billing', 'scheduling', 'notes'])))

**Indexes:** `ai_chat_sessions_pkey` UNIQUE (id)

### `ai_nudge_log`

Rows: **33**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `segment` | text | NO |  |
| `tone` | text | yes |  |
| `body` | text | yes |  |
| `sent` | boolean | NO | `false` |
| `suppressed` | text | yes |  |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**Indexes:** `ai_nudge_log_pkey` UNIQUE (id); `idx_ai_nudge_log_client_created` (client_id, created_at DESC)

### `ai_program_drafts`

Rows: **0**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `program_name` | text | NO |  |
| `phase` | text | NO |  |
| `block_start_date` | date | yes |  |
| `block_end_date` | date | yes |  |
| `week_a_sessions` | text[] | yes |  |
| `week_b_sessions` | text[] | yes |  |
| `cardio_sessions` | text[] | yes |  |
| `ai_reasoning` | text | yes |  |
| `trainer_notes` | text | yes |  |
| `status` | text | yes | `'draft'::text` |
| `approved_at` | timestamptz | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `ai_program_drafts_status_check` CHECK ((status = ANY (ARRAY['draft', 'pending_review', 'approved', 'rejected'])))

**Indexes:** `ai_program_drafts_pkey` UNIQUE (id); `idx_ai_program_drafts_client` (client_id)

### `ai_usage_log`

Rows: **14**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `used_on` | date | yes | `((now() AT TIME ZONE 'America/Chicago'))::date` |
| `feature` | text | yes |  |
| `tokens_in` | integer | yes |  |
| `tokens_out` | integer | yes |  |
| `cost_usd` | numeric(8,5) | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `model` | text | yes |  |

**Keys:** PRIMARY KEY (id)

**CHECK constraints:**
- `ai_usage_log_feature_check` CHECK ((feature = ANY (ARRAY['photo', 'voice', 'parse', 'chat', 'plan_build', 'verify'])))

**Indexes:** `ai_usage_log_pkey` UNIQUE (id); `ai_usage_log_client_day_idx` (client_id, used_on); `ai_usage_log_client_feature_created_idx` (client_id, feature, created_at DESC); `ai_usage_log_created_idx` (created_at DESC)

> ⚠️ Writable by the `anon` role — policy `app_anon_all` grants `ALL` to `{anon,authenticated}` with `USING true / WITH CHECK true`.

### `app_feedback`

Rows: **88**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `created_at` | timestamptz | NO | `now()` |
| `source` | text | yes | `'logger'::text` |
| `client_context` | text | yes |  |
| `transcript` | text | NO |  |
| `screenshot_url` | text | yes |  |
| `status` | text | NO | `'new'::text` |
| `preview_url` | text | yes |  |
| `change_summary` | text | yes |  |
| `commit_sha` | text | yes |  |
| `resolved_at` | timestamptz | yes |  |
| `photo_url` | text | yes |  |

**Keys:** PRIMARY KEY (id)

**Indexes:** `app_feedback_pkey` UNIQUE (id)

> ⚠️ `status` has **no CHECK constraint** — the vocabulary (`new`, …) is enforced only in application code.

### `app_flags`

Rows: **1**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `key` | text | NO |  |
| `enabled` | boolean | NO | `false` |
| `updated_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (key)

**Indexes:** `app_flags_pkey` UNIQUE (key)

### `app_users`

Rows: **0**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `auth_user_id` | uuid | yes |  |
| `role` | text | NO | `'client'::text` |
| `client_id` | uuid | yes |  |
| `display_name` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** UNIQUE (auth_user_id); PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL

**CHECK constraints:**
- `app_users_role_check` CHECK ((role = ANY (ARRAY['trainer', 'client'])))

**Indexes:** `app_users_pkey` UNIQUE (id); `app_users_auth_user_id_key` UNIQUE (auth_user_id)

> ⚠️ Empty (0 rows) despite being the apparent role table. Identity is actually resolved through `clients.auth_user_id`, `trainer_settings.user_id` and `is_trainer()`. Treat `app_users` as dead until proven otherwise.

### `appointments`

Rows: **4874**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `scheduled_at` | timestamptz | NO |  |
| `ends_at` | timestamptz | yes |  |
| `status` | text | NO | `'scheduled'::text` |
| `cancellation_notice_hours` | numeric | yes |  |
| `google_event_id` | text | yes |  |
| `notes` | text | yes |  |
| `source` | text | NO | `'trainer'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |
| `gcal_event_id` | text | yes |  |
| `gcal_cancelled_at` | timestamptz | yes |  |
| `title` | text | yes |  |
| `assessment_name` | text | yes |  |
| `gcal_recurring_id` | text | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `appointments_source_check` CHECK ((source = ANY (ARRAY['trainer', 'client', 'gcal_import', 'gcal'])))
- `appointments_status_check` CHECK ((status = ANY (ARRAY['scheduled', 'completed', 'cancelled_client', 'cancelled_trainer', 'no_show'])))

**Indexes:** `appointments_pkey` UNIQUE (id); `appointments_gcal_event_id_unique` UNIQUE (gcal_event_id) WHERE gcal_event_id IS NOT NULL; `idx_appointments_gcal_event_id` UNIQUE (gcal_event_id) WHERE gcal_event_id IS NOT NULL; `idx_appointments_client_id` (client_id); `idx_appointments_scheduled_at` (scheduled_at); `idx_appointments_source` (source); `idx_appointments_status` (status); `idx_appt_recurring` (gcal_recurring_id)

> ⚠️ Two identical partial unique indexes on `gcal_event_id` (`appointments_gcal_event_id_unique` and `idx_appointments_gcal_event_id`). One is redundant write cost.
> ⚠️ Both `google_event_id` and `gcal_event_id` exist. Only `gcal_event_id` is indexed/used by the sync functions; `google_event_id` is a legacy column.
> ⚠️ `client_id` is nullable — appointments imported from Google Calendar that could not be matched to a client sit with `client_id IS NULL` and are invisible to every client-scoped view.

### `billing_adjustments`

Rows: **6**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `appointment_id` | uuid | yes |  |
| `amount` | numeric | NO |  |
| `reason` | text | yes |  |
| `apply_to_month` | date | yes |  |
| `applied` | boolean | yes | `false` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**Indexes:** `billing_adjustments_pkey` UNIQUE (id); `idx_billing_adjustments_client_id` (client_id)

### `calendar_payments`

Rows: **798**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `title` | text | yes |  |
| `amount` | numeric | yes |  |
| `payment_date` | date | yes |  |
| `cadence` | text | yes |  |
| `google_event_id` | text | yes |  |
| `has_reminder` | boolean | yes | `false` |
| `source` | text | yes | `'gcal_sync'::text` |
| `synced_at` | timestamptz | yes | `now()` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id)

**Indexes:** `calendar_payments_pkey` UNIQUE (id); `calendar_payments_google_event_id_key` UNIQUE (google_event_id); `idx_calendar_payments_date` (payment_date)

### `cardio_logs`

Rows: **40**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `log_date` | date | NO |  |
| `type` | text | yes |  |
| `duration_minutes` | numeric | yes |  |
| `distance` | numeric | yes |  |
| `calories` | numeric | yes |  |
| `avg_hr` | integer | yes |  |
| `source` | text | yes | `'client'::text` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `cardio_logs_source_check` CHECK ((source = ANY (ARRAY['client', 'trainer_backfill', 'claude', 'migration'])))

**Indexes:** `cardio_logs_pkey` UNIQUE (id)

### `client_app_settings`

Rows: **36** — one row per client; per-client feature switches, AI rate limits and theme.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `client_id` | uuid | NO |  |
| `can_reschedule` | boolean | yes | `false` |
| `reschedule_window_days` | integer | yes | `14` |
| `calendar_visibility_days` | integer | yes | `14` |
| `can_self_assign` | boolean | yes | `false` |
| `updated_at` | timestamptz | yes | `now()` |
| `theme` | text | yes | `'steel_sky'::text` |
| `password_is_temporary` | boolean | yes | `false` |
| `first_login_completed` | boolean | yes | `false` |
| `pwa_prompt_dismissed` | boolean | yes | `false` |
| `nutrition_v3` | boolean | yes | `false` |
| `coach_enabled` | boolean | yes | `true` |
| `ai_daily_chat_limit` | integer | yes | `15` |
| `ai_daily_photo_limit` | integer | yes | `15` |
| `ai_daily_parse_limit` | integer | yes | `20` |
| `ai_daily_planbuild_limit` | integer | yes | `1` |
| `workout_ai` | boolean | yes | `false` |
| `workout_build_daily_limit` | integer | yes |  |
| `seen_ai_workout_notice` | boolean | yes | `false` |
| `leaderboard_opt_in` | boolean | NO | `false` |
| `nudges_enabled` | boolean | NO | `true` |

**Keys:** PRIMARY KEY (client_id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `client_app_settings_theme_check` CHECK ((theme = ANY (ARRAY['steel_sky', 'arctic_teal', 'slate_emerald', 'platinum_indigo', 'warm_gold', 'midnight_navy', 'obsidian_gold', 'carbon_crimson', 'deep_space', 'iron_ember'])))

**Indexes:** `client_app_settings_pkey` UNIQUE (client_id)

### `client_assessments`

Rows: **6** — the intake / OHSA (overhead squat assessment) form. Feeds `clients` via `clients.assessment_id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `assessed_at` | timestamptz | yes | `now()` |
| `status` | text | yes | `'pending_signup'::text` |
| `first_name` | text | yes |  |
| `last_name` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `date_of_birth` | date | yes |  |
| `emergency_contact_name` | text | yes |  |
| `emergency_contact_phone` | text | yes |  |
| `medical_clearance` | boolean | yes | `false` |
| `current_injuries` | text | yes |  |
| `chronic_conditions` | text | yes |  |
| `medications` | text | yes |  |
| `pain_location` | text | yes |  |
| `pain_onset` | text | yes |  |
| `hip_issues` | boolean | yes | `false` |
| `prior_surgeries` | text | yes |  |
| `feet_turn_out` | boolean | yes | `false` |
| `excessive_forward_lean` | boolean | yes | `false` |
| `knees_cave_in` | boolean | yes | `false` |
| `low_back_arch` | boolean | yes | `false` |
| `arms_fall_forward` | boolean | yes | `false` |
| `forward_head` | boolean | yes | `false` |
| `lateral_asymmetry` | boolean | yes | `false` |
| `balance_deficits` | boolean | yes | `false` |
| `ohsa_notes` | text | yes |  |
| `experience_level` | text | yes |  |
| `years_training` | integer | yes |  |
| `activity_level` | text | yes |  |
| `days_per_week` | integer | yes |  |
| `preferred_time` | text | yes |  |
| `primary_goal` | text | yes |  |
| `secondary_goal` | text | yes |  |
| `goal_timeline` | text | yes |  |
| `target_weight` | numeric | yes |  |
| `goal_notes` | text | yes |  |
| `occupation_type` | text | yes |  |
| `stress_level` | integer | yes |  |
| `sleep_hours` | numeric | yes |  |
| `nutrition_notes` | text | yes |  |
| `ai_program_recommendation` | text | yes |  |
| `ai_assessment_summary` | text | yes |  |
| `trainer_notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |
| `trained_days_per_week` | integer | yes |  |
| `trained_days_of_week` | text[] | yes |  |
| `cardio_days_per_week` | integer | yes |  |
| `cardio_days_of_week` | text[] | yes |  |
| `solo_days_per_week` | integer | yes |  |
| `solo_days_of_week` | text[] | yes |  |
| `solo_day_focus` | text | yes |  |
| `session_length_minutes` | integer | yes |  |
| `training_location` | text | yes |  |
| `equipment_access` | text | yes |  |
| `cardio_modality` | text | yes |  |
| `cardio_intensity` | text | yes |  |
| `contraindicated_movements` | text | yes |  |
| `block_length_weeks` | integer | yes |  |
| `block_start_date` | date | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `client_assessments_status_check` CHECK ((status = ANY (ARRAY['pending_signup', 'active', 'declined'])))
- `client_assessments_stress_level_check` CHECK (((stress_level >= 1) AND (stress_level <= 10)))

**Indexes:** `client_assessments_pkey` UNIQUE (id)

### `client_notifications`

Rows: **12** — in-app notification inbox for the client PWA (currently only payment-due notices).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `type` | text | NO | `'payment_due'::text` |
| `title` | text | NO |  |
| `body` | text | yes |  |
| `amount_due` | numeric | yes |  |
| `due_date` | date | yes |  |
| `payment_reminder_id` | uuid | yes |  |
| `is_read` | boolean | NO | `false` |
| `dismissed_at` | timestamptz | yes |  |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (payment_reminder_id) REFERENCES payment_reminders(id) ON DELETE CASCADE

**Indexes:** `client_notifications_pkey` UNIQUE (id); `idx_client_notif_client` (client_id); `idx_client_notif_unread` (client_id, is_read) WHERE (dismissed_at IS NULL)

> ⚠️ `type` has no CHECK constraint.

### `client_private_profiles`

Rows: **27** — trainer-only free-text/JSON dossier per client (coach notes, synced Notion content). Never exposed to the client.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `is_self` | boolean | yes | `false` |
| `profile` | jsonb | NO | `'{}'::jsonb` |
| `updated_at` | timestamptz | yes | `now()` |
| `coach_notes` | text | yes |  |
| `notion_synced_at` | timestamptz | yes |  |
| `content` | text | yes |  |
| `source_url` | text | yes |  |
| `source_title` | text | yes |  |

**Keys:** PRIMARY KEY (id); UNIQUE (client_id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**Indexes:** `client_private_profiles_pkey` UNIQUE (id); `client_private_profiles_client_id_key` UNIQUE (client_id)

### `client_training_patterns`

Rows: **15** — the recurring weekly template ("Kate trains Tue + Thu, Day A then Day B"). Read by `generate_scheduled_workouts()` to materialise `scheduled_workouts`, and by `detect_schedule_changes()` to spot drift against Google Calendar.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `weekday` | smallint | NO |  |
| `day_id` | uuid | NO |  |
| `supervised` | boolean | NO | `false` |
| `position` | smallint | NO | `1` |
| `effective_from` | date | NO |  |
| `effective_to` | date | yes |  |
| `gcal_recurring_id` | text | yes |  |
| `note` | text | yes |  |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (day_id) REFERENCES days(id)

**CHECK constraints:**
- `client_training_patterns_weekday_check` CHECK (((weekday >= 0) AND (weekday <= 6)))  — 0 = Sunday (Postgres `dow`)

**Indexes:** `client_training_patterns_pkey` UNIQUE (id); `ix_ctp_client_active` (client_id) WHERE is_active; `uq_ctp_client_weekday_position` UNIQUE (client_id, weekday, "position", effective_from)

> ⚠️ **RLS is enabled but this table has ZERO policies.** Neither `anon` nor `authenticated` (including the trainer's own logged-in session) can read or write it. Only `service_role` / `postgres` / `SECURITY DEFINER` functions can touch it. Any client-side query against this table silently returns 0 rows.

### `clients`

Rows: **36** — the root entity. Everything else hangs off `clients.id`. `auth_user_id` links to `auth.users`; `archived_at` is the soft-delete used by every canonical view.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `slug` | text | yes |  |
| `email` | text | yes |  |
| `date_of_birth` | date | yes |  |
| `start_date` | date | yes |  |
| `experience_level` | text | yes |  |
| `primary_goal` | text | yes |  |
| `secondary_goals` | text | yes |  |
| `training_frequency` | integer | yes |  |
| `injuries_limitations` | text | yes |  |
| `current_weight` | numeric | yes |  |
| `current_body_fat_pct` | numeric | yes |  |
| `current_fees` | numeric | yes |  |
| `is_self_coached` | boolean | yes | `false` |
| `notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |
| `auth_user_id` | uuid | yes |  |
| `phone` | text | yes |  |
| `payment_reminders_enabled` | boolean | yes | `true` |
| `onboarding_complete` | boolean | yes | `false` |
| `assessment_id` | uuid | yes |  |
| `emergency_contact_name` | text | yes |  |
| `emergency_contact_phone` | text | yes |  |
| `days_per_week` | integer | yes |  |
| `injuries` | text | yes |  |
| `medical_notes` | text | yes |  |
| `session_rate` | numeric | yes |  |
| `avatar_url` | text | yes |  |
| `weekly_focus` | text | yes |  |
| `digest_snoozed_until` | date | yes |  |
| `flat_billing` | boolean | NO | `false` |
| `movement_screen_enabled` | boolean | NO | `false` |
| `billing_cadence` | text | yes | `'monthly'::text` |
| `training_days` | text | yes |  |
| `ai_focus` | text | yes |  |
| `ai_focus_question` | text | yes |  |
| `ai_focus_date` | date | yes |  |
| `ai_focus_question_date` | date | yes |  |
| `week_brief_seen_week` | text | yes |  |
| `archived_at` | timestamptz | yes |  |
| `weekly_focus_week` | text | yes |  |
| `weekly_focus_source` | text | yes |  |
| `ai_food_focus` | text | yes |  |
| `ai_food_focus_week` | text | yes |  |
| `billing_type` | text | yes |  |

**Keys:** PRIMARY KEY (id); UNIQUE (email); UNIQUE (slug)

**Foreign keys:**
- FOREIGN KEY (assessment_id) REFERENCES client_assessments(id)
- FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL

**CHECK constraints:**
- `clients_billing_type_check` CHECK ((billing_type = ANY (ARRAY['per_session', 'flat', 'none'])))
- `clients_training_frequency_check` CHECK (((training_frequency >= 1) AND (training_frequency <= 6)))

**Indexes:** `clients_pkey` UNIQUE (id); `clients_email_key` UNIQUE (email); `clients_slug_key` UNIQUE (slug); `clients_archived_at_idx` (archived_at); `idx_clients_auth_user_id` (auth_user_id)

> ⚠️ **Do not read `clients.current_weight` / `current_body_fat_pct`.** They are a snapshot that never syncs; the `v_client_now` comment records drift of up to 25 lb. The truth is the newest `metrics` row.
> ⚠️ Two overlapping billing flags: `billing_type` (`per_session` / `flat` / `none`, CHECK-constrained, nullable with no default) and the older boolean `flat_billing`. They can disagree.
> ⚠️ `training_frequency` is CHECK-limited to 1–6, but `days_per_week` (a second, unconstrained column with the same meaning) also exists.

### `daily_logs`

Rows: **319** — free-text daily check-in ("how did today go") per client per date.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `log_date` | date | NO |  |
| `summary` | text | yes |  |
| `source` | text | yes | `'client'::text` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `daily_logs_source_check` CHECK ((source = ANY (ARRAY['client', 'trainer_backfill', 'claude', 'migration'])))

**Indexes:** `daily_logs_pkey` UNIQUE (id)

### `days`

Rows: **994** — one training day inside a phase ("Day A – Lower"). Parent of `sections`. `client_owner_id` non-null means the day has been *forked* for one client and must not be shared.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `phase_id` | uuid | NO |  |
| `label` | text | yes |  |
| `position` | integer | NO |  |
| `created_at` | timestamptz | yes | `now()` |
| `day_of_week` | integer | yes |  |
| `swappable` | boolean | yes | `false` |
| `client_owner_id` | uuid | yes |  |
| `created_by` | text | yes | `'trainer'::text` |
| `origin` | text | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_owner_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE CASCADE

**Indexes:** `days_pkey` UNIQUE (id); `idx_days_client_owner` (client_owner_id)

**Triggers:** `trg_days_enforce_owner` BEFORE INSERT OR UPDATE OF phase_id → `days_enforce_owner()` (keeps `client_owner_id` consistent with the owning phase/program).

### `device_tokens`

Rows: **2** — FCM / APNs push tokens, keyed by `auth.users` id (not client id).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `user_id` | uuid | NO |  |
| `token` | text | NO |  |
| `platform` | text | yes | `'android'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id); UNIQUE (token)

**Indexes:** `device_tokens_pkey` UNIQUE (id); `device_tokens_token_key` UNIQUE (token)

### `equipment`

Rows: **22** — gym equipment inventory; referenced by name from `exercises.equipment_required` (text array, no FK).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `available` | boolean | yes | `true` |
| `notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id); UNIQUE (name)

**Indexes:** `equipment_pkey` UNIQUE (id); `equipment_name_key` UNIQUE (name)

### `exercise_notes`

Rows: **27** — per-client notes attached to a movement ("left knee pinched on set 3"). Can hang off an exercise, a prescription, a workout log or a day.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `exercise_id` | uuid | yes |  |
| `prescribed_exercise_id` | uuid | yes |  |
| `workout_log_id` | uuid | yes |  |
| `day_id` | uuid | yes |  |
| `log_date` | date | NO | `((now() AT TIME ZONE 'America/Chicago'::text))::date` |
| `note` | text | NO |  |
| `author` | text | NO | `'client'::text` |
| `resolved` | boolean | NO | `false` |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (exercise_id) REFERENCES exercises(id)
- FOREIGN KEY (prescribed_exercise_id) REFERENCES prescribed_exercises(id)
- FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE SET NULL

**Indexes:** `exercise_notes_pkey` UNIQUE (id); `exercise_notes_client_date_idx` (client_id, log_date DESC); `exercise_notes_client_ex_idx` (client_id, exercise_id)

> ⚠️ `day_id` has no foreign key to `days` even though `exercise_id`, `prescribed_exercise_id` and `workout_log_id` all have one.
> ⚠️ `author` has no CHECK constraint (values seen: `client`, `trainer`).

### `exercises`

Rows: **821** — the movement library. Names are UNIQUE, which is why de-duplication passes (see the `*_dedupe_bak_*` tables) were needed. `client_owner_id` marks a movement created for one client only.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `everfit_name` | text | yes |  |
| `aliases` | text[] | yes |  |
| `modality` | text | yes |  |
| `muscle_group` | text | yes |  |
| `equipment_required` | text[] | yes |  |
| `corrective_phase_tags` | text[] | yes |  |
| `video_url` | text | yes |  |
| `availability_status` | text | yes | `'available'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `client_owner_id` | uuid | yes |  |
| `created_by` | text | yes | `'trainer'::text` |

**Keys:** PRIMARY KEY (id); UNIQUE (name)

**Foreign keys:**
- FOREIGN KEY (client_owner_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `exercises_availability_status_check` CHECK ((availability_status = ANY (ARRAY['available', 'confirm_equipment', 'excluded'])))
- `exercises_modality_check` CHECK ((modality = ANY (ARRAY['powerlifting', 'bodybuilding', 'functional/athletic', 'conditioning', 'mobility'])))

**Indexes:** `exercises_pkey` UNIQUE (id); `exercises_name_key` UNIQUE (name); `idx_exercises_client_owner` (client_owner_id)

> ⚠️ `exercises.name` is globally UNIQUE *including* client-owned rows, so two clients cannot each have a personal movement with the same name.

### `food_catalog`

Rows: **197826** — the big searchable food database (USDA + Open Food Facts bulk import + barcodes). Not the same thing as `foods`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `brand` | text | yes |  |
| `barcode` | text | yes |  |
| `source` | text | yes |  |
| `kcal` | numeric | yes |  |
| `protein` | numeric | yes |  |
| `carbs` | numeric | yes |  |
| `fats` | numeric | yes |  |
| `fiber` | numeric | yes |  |
| `sugar` | numeric | yes |  |
| `sodium` | numeric | yes |  |
| `sat_fat` | numeric | yes |  |
| `serving_desc` | text | yes |  |
| `serving_grams` | numeric | yes |  |
| `serving_options` | jsonb | yes | `'[]'::jsonb` |
| `verified` | boolean | yes | `false` |
| `ai_verified_at` | timestamptz | yes |  |
| `created_by_client_id` | uuid | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (created_by_client_id) REFERENCES clients(id)

**CHECK constraints:**
- `food_catalog_source_check` CHECK ((source = ANY (ARRAY['usda', 'off', 'brand', 'restaurant', 'community', 'client'])))

**Indexes:** `food_catalog_pkey` UNIQUE (id); `food_catalog_barcode_unique_idx` UNIQUE (barcode) WHERE (barcode IS NOT NULL); `food_catalog_name_trgm_idx` GIN (name gin_trgm_ops); `food_catalog_source_idx` (source)

> ⚠️ **Writable by the `anon` role** — policy `app_anon_all` grants `ALL` to `{anon,authenticated}` with `USING true / WITH CHECK true`. Anyone holding the public anon key can insert, update or delete all 197k rows.

### `food_import_state`

Rows: **2** — cursor/bookkeeping for the Open Food Facts bulk importer, driven by the per-minute `off-bulk-import` cron job.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `source` | text | NO |  |
| `cursor` | integer | NO | `0` |
| `imported_count` | integer | NO | `0` |
| `status` | text | NO | `'pending'::text` |
| `updated_at` | timestamptz | NO | `now()` |
| `total_available` | bigint | yes |  |
| `last_error` | text | yes |  |
| `fail_count` | integer | NO | `0` |

**Keys:** PRIMARY KEY (source)

**Indexes:** `food_import_state_pkey` UNIQUE (source)

> ⚠️ **Writable by the `anon` role** (`app_anon_all`). An anon user can flip `status` and either stall the importer or make the every-minute cron job run forever.
> ⚠️ `status` has no CHECK constraint although the cron job's `where` clause depends on the exact literal `'done'`.

### `foods`

Rows: **1312** — the small curated food list used when building meal plans (macros per stated serving). Distinct from `food_catalog`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `serving` | text | NO | `'1 serving'::text` |
| `protein` | numeric | NO | `0` |
| `carbs` | numeric | NO | `0` |
| `fats` | numeric | NO | `0` |
| `source` | text | NO | `'seed'::text` |
| `created_by_client_id` | uuid | yes |  |
| `verified` | boolean | NO | `false` |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (created_by_client_id) REFERENCES clients(id)

**CHECK constraints:**
- `foods_source_check` CHECK ((source = ANY (ARRAY['seed', 'ai', 'trainer', 'client', 'claude'])))

**Indexes:** `foods_pkey` UNIQUE (id); `foods_name_idx` GIN (to_tsvector('english', name))

> ⚠️ `foods` stores no calorie column — kcal is always derived as `4·protein + 4·carbs + 9·fats` (this is exactly what `v_nutrition_now` does).

### `group_challenges`

Rows: **2** — trainer-run group challenges (sessions completed / days logged) over a date window.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `title` | text | NO |  |
| `metric` | text | NO | `'sessions'::text` |
| `starts_on` | date | NO |  |
| `ends_on` | date | NO |  |
| `created_by` | uuid | yes |  |
| `created_at` | timestamptz | NO | `now()` |
| `ended_at` | timestamptz | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL

**CHECK constraints:**
- `group_challenges_dates_check` CHECK ((ends_on >= starts_on))
- `group_challenges_metric_check` CHECK ((metric = ANY (ARRAY['sessions', 'logging'])))

**Indexes:** `group_challenges_pkey` UNIQUE (id); `group_challenges_window_idx` (starts_on, ends_on)

### `group_reads`

Rows: **13** — per-auth-user "last read" watermark for the group message feed (unread badge).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `user_id` | uuid | NO |  |
| `last_read_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (user_id)

**Foreign keys:**
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

**Indexes:** `group_reads_pkey` UNIQUE (user_id)

### `integrity_checks`

Rows: **28** — append-only results of `run_integrity_checks()` (cron, twice daily). Read through `v_integrity_flags`, which keeps only the newest row per `check_name`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | bigint | NO | `nextval('integrity_checks_id_seq'::regclass)` |
| `check_name` | text | NO |  |
| `severity` | text | NO |  |
| `count` | integer | NO |  |
| `detail` | jsonb | yes |  |
| `ran_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**CHECK constraints:**
- `integrity_checks_severity_check` CHECK ((severity = ANY (ARRAY['critical', 'warn', 'info'])))

**Indexes:** `integrity_checks_pkey` UNIQUE (id); `idx_integrity_checks_recent` (check_name, ran_at DESC)

### `macro_targets`

Rows: **41** — dated calorie/macro targets per client. Effective-dated: the current target is the newest row with `effective_date <= today`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `effective_date` | date | NO |  |
| `calories` | numeric | yes |  |
| `protein` | numeric | yes |  |
| `carbs` | numeric | yes |  |
| `fats` | numeric | yes |  |
| `rationale` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**Indexes:** `macro_targets_pkey` UNIQUE (id)

**Triggers:** `trg_no_future_macro_target` BEFORE INSERT OR UPDATE → `enforce_no_future_macro_target()` — rejects rows with an `effective_date` in the future.

> ⚠️ No unique constraint on `(client_id, effective_date)` — two targets for the same client on the same day are possible and the views resolve the tie arbitrarily (`v_client_now` orders by `effective_date DESC` only; `v_nutrition_now` breaks the tie on `created_at`, so the two views can disagree).
> ⚠️ `1800 / 150 / 165 / 60` is a magic "placeholder" macro set that both `v_client_now` and `v_nutrition_now` hard-code and flag as `macros_are_placeholder`.
> ⚠️ No index on `client_id` despite every read being client-scoped.

### `meal_adherence_logs`

Rows: **1446** — **the nutrition fact table.** One row per client per date per meal slot, recording how closely the planned meal was followed and (optionally) estimated macros. Drives `v_nutrition_now`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `log_date` | date | NO |  |
| `meal_position` | integer | NO |  |
| `meal_id` | uuid | yes |  |
| `adherence` | text | yes |  |
| `off_plan_details` | text | yes |  |
| `est_kcal` | numeric | yes |  |
| `est_protein` | numeric | yes |  |
| `est_carbs` | numeric | yes |  |
| `est_fats` | numeric | yes |  |
| `photo_url` | text | yes |  |
| `source` | text | yes | `'client'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `notes` | text | yes |  |
| `off_plan_notes` | text | yes |  |
| `off_plan_macros` | jsonb | yes |  |
| `trainer_macro_override` | jsonb | yes |  |
| `analysis_status` | text | yes |  |
| `food_id` | uuid | yes |  |
| `servings` | numeric | yes |  |
| `macros_pending` | boolean | NO | `false` |
| `item_overrides` | jsonb | yes |  |

**Keys:** PRIMARY KEY (id); UNIQUE (client_id, log_date, meal_position)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (food_id) REFERENCES foods(id)
- FOREIGN KEY (meal_id) REFERENCES meals(id)

**CHECK constraints:**
- `meal_adherence_logs_adherence_check` CHECK ((adherence = ANY (ARRAY['Full', '3/4', '1/2', '1/4', 'Partial', 'Off-plan', 'Skipped'])))
- `meal_adherence_logs_source_check` CHECK ((source = ANY (ARRAY['client', 'trainer_backfill', 'claude', 'migration'])))

**Indexes:** `meal_adherence_logs_pkey` UNIQUE (id); `meal_adherence_logs_client_id_log_date_meal_position_key` UNIQUE (client_id, log_date, meal_position)

**Adherence vocabulary and what the views do with it**

| `adherence` | eaten fraction used by `v_nutrition_now` | counted as |
|---|---|---|
| `Full` | 1.00 | on-plan |
| `3/4` | 0.75 | on-plan |
| `1/2` | 0.50 | partial |
| `1/4` | 0.25 | partial |
| `Partial` | 0.50 | partial |
| `Off-plan` | 1.00 (falls through the `ELSE`) | off-plan |
| `Skipped` | 0.00 | skipped (excluded from on/off-plan %) |

> ⚠️ `adherence` is **nullable** with no default, so a row can exist with no adherence value at all; `v_nutrition_now` treats NULL as `ELSE 1.0` (i.e. "ate the whole planned meal"), which silently inflates calories.
> ⚠️ `Partial` and `1/2` are two spellings of the same 0.5 — legacy duplication in the vocabulary.
> ⚠️ `analysis_status` has no CHECK constraint.
> ⚠️ ~34% of rows carry no `est_kcal`; the view back-fills from the planned meal's items. `n_kcal_unknown_28d` in `v_nutrition_now` reports what is still unresolvable.

### `meal_items`

Rows: **1316** — the individual foods inside a planned meal, with per-item macros. Kcal is always derived (`4P + 4C + 9F`).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `meal_id` | uuid | NO |  |
| `food` | text | NO |  |
| `amount` | numeric | yes |  |
| `unit` | text | yes |  |
| `is_unlimited` | boolean | yes | `false` |
| `basis` | text | yes |  |
| `protein` | numeric | yes |  |
| `carbs` | numeric | yes |  |
| `fats` | numeric | yes |  |
| `position` | integer | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE

**CHECK constraints:**
- `meal_items_basis_check` CHECK ((basis = ANY (ARRAY['cooked', 'raw'])))

**Indexes:** `meal_items_pkey` UNIQUE (id)

> ⚠️ `food` is free text with no FK to `foods` / `food_catalog` — the plan builder and the food database are not joined.
> ⚠️ No index on `meal_id` even though every read is `where meal_id = …` (and `v_nutrition_now` aggregates the whole table).

### `meal_plans`

Rows: **54** — a versioned nutrition plan for one client. Exactly one should be `live` at a time; older ones become `archived`. Parent of `meals` → `meal_items`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `version_number` | integer | NO | `1` |
| `effective_date` | date | yes |  |
| `status` | text | yes | `'live'::text` |
| `change_reason` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `created_by_client` | boolean | NO | `false` |
| `title` | text | yes |  |
| `day_group` | smallint[] | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `meal_plans_status_check` CHECK ((status = ANY (ARRAY['draft', 'pending', 'live', 'archived'])))

**Indexes:** `meal_plans_pkey` UNIQUE (id)

**Triggers:**
- `trg_no_future_live_plan` BEFORE INSERT OR UPDATE → `enforce_no_future_live_plan()` — a plan with a future `effective_date` may not be `live`.
- `trg_stamp_meal_plan_author` BEFORE INSERT → `stamp_meal_plan_author()` — sets `created_by_client`.

> ⚠️ The **default status is `'live'`**. Any insert that forgets to set `status` immediately becomes the client's live plan and silently displaces the previous one in `v_nutrition_now`.
> ⚠️ There is **no unique constraint** guaranteeing one live plan per client. `v_nutrition_now` copes with `DISTINCT ON (client_id) … ORDER BY effective_date DESC, version_number DESC`, but `v_client_now.has_live_meal_plan` just does `EXISTS`.
> ⚠️ Three separate daily cron jobs flip plan status (`activate_due_meal_plans`, and `flip_due_meal_plans` **twice**) — see the pg_cron section.
> ⚠️ No index on `client_id`.

### `meals`

Rows: **409** — a named meal slot within a plan ("Meal 2 – post-workout"), ordered by `position`. `rotation` holds the multi-day rotation variants used by `generate_rotation_plans()`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `meal_plan_id` | uuid | NO |  |
| `name` | text | yes |  |
| `timing` | text | yes |  |
| `position` | integer | NO |  |
| `swaps` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `rotation` | jsonb | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE

**Indexes:** `meals_pkey` UNIQUE (id)

> ⚠️ `meal_adherence_logs` joins to a meal by `meal_id`, but the *log* is keyed on `meal_position`; these two orderings are maintained independently and can drift when a plan is edited.
> ⚠️ No index on `meal_plan_id`.

### `message_reactions`

Rows: **9** — emoji reactions on `messages`, one per (message, user, emoji).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `message_id` | uuid | NO |  |
| `user_id` | uuid | NO |  |
| `emoji` | text | NO |  |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id); UNIQUE (message_id, user_id, emoji)

**Foreign keys:**
- FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

**CHECK constraints:**
- `message_reactions_allowed` CHECK ((emoji = ANY (ARRAY['👊', '💪', '🔥', '👏', '❤️', '😂'])))

**Indexes:** `message_reactions_pkey` UNIQUE (id); `message_reactions_unique` UNIQUE (message_id, user_id, emoji); `message_reactions_message_idx` (message_id)

> ⚠️ Only these six emoji are permitted at the database level. Adding a reaction in the UI without adding it here throws a constraint violation.

### `messages`

Rows: **289** — direct and group chat between trainer and clients. Keyed on `auth.users` ids, not client ids; `client_id` is a convenience denormalisation.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `from_id` | uuid | NO |  |
| `to_id` | uuid | NO |  |
| `client_id` | uuid | yes |  |
| `body` | text | NO |  |
| `read_at` | timestamptz | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `is_broadcast` | boolean | NO | `false` |
| `is_group` | boolean | NO | `false` |
| `deleted_at` | timestamptz | yes |  |
| `image_url` | text | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (from_id) REFERENCES auth.users(id)
- FOREIGN KEY (to_id) REFERENCES auth.users(id)

**Indexes:** `messages_pkey` UNIQUE (id); `idx_messages_client_id` (client_id); `idx_messages_from_id` (from_id); `idx_messages_to_id` (to_id)

> ⚠️ `to_id` is NOT NULL, so a group message still needs some recipient uuid stuffed into it. The "is this mine" RLS policies are `from_id = auth.uid() OR to_id = auth.uid()`, plus a separate blanket `is_group = true` read policy — **every authenticated user can read every group message**, which is intended but worth knowing.
> ⚠️ The `Participants can soft-delete` UPDATE policy grants a full row UPDATE (not just `deleted_at`), so either participant can rewrite a message's `body`.

### `metrics`

Rows: **96** — **the weight/body-composition source of truth.** One row per client per date. `lean_mass` / `fat_mass` are computed by triggers.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `metric_date` | date | NO |  |
| `weight` | numeric | yes |  |
| `body_fat_pct` | numeric | yes |  |
| `lean_mass` | numeric | yes |  |
| `fat_mass` | numeric | yes |  |
| `source` | text | yes | `'client'::text` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id); UNIQUE (client_id, metric_date)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `metrics_source_check` CHECK ((source = ANY (ARRAY['client', 'trainer_backfill', 'claude', 'migration', 'smart_scale', 'InBody', 'caliper'])))

**Indexes:** `metrics_pkey` UNIQUE (id); `metrics_client_date_key` UNIQUE (client_id, metric_date)

**Triggers:** `trg_compute_lean_fat` and `trg_metrics_autocalc_mass`, both BEFORE INSERT OR UPDATE, both deriving `lean_mass` / `fat_mass` from `weight` and `body_fat_pct`.

> ⚠️ **Two triggers compute the same two columns** on the same event. They fire in name order (`trg_compute_lean_fat` then `trg_metrics_autocalc_mass`), so the second one wins. If they ever disagree the first is dead code.

### `my_meals`

Rows: **2** — client-saved "favourite meal" shortcuts for fast logging. Items and totals are denormalised JSON, not rows.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `name` | text | yes |  |
| `items` | jsonb | yes | `'[]'::jsonb` |
| `totals` | jsonb | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id)

**Indexes:** `my_meals_pkey` UNIQUE (id); `my_meals_client_idx` (client_id)

> ⚠️ **Writable by the `anon` role** (`app_anon_all`, `USING true`). It also carries `client_id`, so an anon caller can read every client's saved meals and write rows attributed to any client.

### `offplan_workout_logs`

Rows: **13** — a client's free-text record of a workout done outside the plan, pending the trainer rolling it into a real `day`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `log_date` | date | NO |  |
| `description` | text | NO |  |
| `details` | text | yes |  |
| `status` | text | NO | `'pending'::text` |
| `rolled_day_id` | uuid | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id)

**CHECK constraints:**
- `offplan_workout_logs_status_check` CHECK ((status = ANY (ARRAY['pending', 'rolled_up'])))

**Indexes:** `offplan_workout_logs_pkey` UNIQUE (id)

> ⚠️ `rolled_day_id` has no FK to `days`.

### `payment_reminders`

Rows: **40** — one billing reminder per client per due date: amount, credits, approval state and every send timestamp. Generated nightly by `generate_due_payment_reminders()`; amounts recalculated by `recalc_pending_payment_reminders()` after each Google Calendar sync.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `due_date` | date | NO |  |
| `amount_due` | numeric | NO |  |
| `billing_credits` | numeric | yes | `0` |
| `google_event_id` | text | yes |  |
| `reminder_sent_at` | timestamptz | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `notification_status` | text | NO | `'pending'::text` |
| `approved_at` | timestamptz | yes |  |
| `sms_sent_at` | timestamptz | yes |  |
| `sms_message` | text | yes |  |
| `email_sent_at` | timestamptz | yes |  |
| `client_ack_at` | timestamptz | yes |  |
| `paid_confirmed_at` | timestamptz | yes |  |
| `credit_details` | jsonb | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `payment_reminders_notification_status_check` CHECK ((notification_status = ANY (ARRAY['pending', 'awaiting_approval', 'approved', 'sent', 'skipped', 'paused', 'paid'])))

**Indexes:** `payment_reminders_pkey` UNIQUE (id); `idx_payment_reminders_due_date` (due_date); `idx_payment_reminders_status` (notification_status, due_date); `uq_one_open_reminder_per_client` UNIQUE (client_id) WHERE (notification_status IN ('pending','sent'))

> ⚠️ The partial unique index `uq_one_open_reminder_per_client` allows **only one** reminder per client in state `pending` or `sent`. Inserting a second due date for a client whose previous reminder was never marked `paid`/`skipped` fails outright — this is the constraint most likely to break the nightly `generate-payment-reminders` cron job.
> ⚠️ `recalc_pending_payment_reminders()` deliberately refuses to touch a reminder that already has `email_sent_at` or `sms_sent_at` set. Anything already sent to a client is frozen, even if the amount was wrong.

### `phases`

Rows: **122** — a block within a program ("Phase 1 – Stabilisation"). Parent of `days`, child of `programs`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `program_id` | uuid | NO |  |
| `label` | text | yes |  |
| `position` | integer | NO |  |
| `intent` | text | yes |  |
| `approx_duration` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE

**Indexes:** `phases_pkey` UNIQUE (id)

> ⚠️ No index on `program_id`.
> ⚠️ `approx_duration` is free text, not an interval.

### `plan_flip_log`

Rows: **3** — audit trail of the nightly meal-plan status flips.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `ran_at` | timestamptz | yes | `now()` |
| `client_id` | uuid | yes |  |
| `plan_id` | uuid | yes |  |
| `action` | text | yes |  |
| `effective_date` | date | yes |  |
| `details` | jsonb | yes |  |

**Keys:** PRIMARY KEY (id)

**Indexes:** `plan_flip_log_pkey` UNIQUE (id)

> ⚠️ **Writable by the `anon` role** (`app_anon_all`).
> ⚠️ No FKs at all — `client_id` and `plan_id` are unenforced.
> ⚠️ Only 3 rows despite three cron jobs flipping plans daily since July; the log is not reliably written.

### `plan_rotations`

Rows: **2** — configuration for rotating a client through a set of template meal plans on an N-week cycle from `anchor_monday`. Consumed by `generate_rotation_plans()` (daily cron).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | yes |  |
| `template_plan_ids` | uuid[] | NO |  |
| `anchor_monday` | date | NO |  |
| `weeks` | integer | NO |  |
| `active` | boolean | NO | `true` |
| `note` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id)

**Indexes:** `plan_rotations_pkey` UNIQUE (id); `plan_rotations_client_idx` (client_id)

> ⚠️ **Writable by the `anon` role** (`app_anon_all`). An anon caller can point a rotation at another client's meal plans and the daily cron will clone them.
> ⚠️ `template_plan_ids` is a uuid array with no referential integrity to `meal_plans`.

### `prescribed_exercises`

Rows: **9167** — **the largest programming table.** One prescribed movement inside a section: sets, volume, tempo, load, cue, superset grouping, and which fields the client is asked to track.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `section_id` | uuid | NO |  |
| `exercise_id` | uuid | NO |  |
| `position` | integer | NO |  |
| `sets` | integer | yes |  |
| `volume_type` | text | yes |  |
| `volume_value` | text | yes |  |
| `unilateral` | boolean | yes | `false` |
| `tempo` | text | yes |  |
| `load_descriptor` | text | yes |  |
| `cue` | text | yes |  |
| `rest` | text | yes |  |
| `superset_group` | text | yes |  |
| `intensity_type` | text | yes |  |
| `use_drop_sets` | boolean | yes | `false` |
| `use_rest_pause` | boolean | yes | `false` |
| `use_partials` | boolean | yes | `false` |
| `alternate_of` | uuid | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `tracked_fields` | text[] | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (alternate_of) REFERENCES prescribed_exercises(id) — self-reference: an "or do this instead" swap
- FOREIGN KEY (exercise_id) REFERENCES exercises(id)
- FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE

**CHECK constraints:**
- `prescribed_exercises_volume_type_check` CHECK ((volume_type = ANY (ARRAY['reps', 'rep_range', 'duration', 'distance', 'hold_pattern'])))

**Indexes:** `prescribed_exercises_pkey` UNIQUE (id) — **and nothing else**

> ⚠️ **9,167 rows and no index on `section_id` or `exercise_id`.** Rendering any workout, and the client-side RLS policies (which join `sections → days → phases → program_assignments`), do a sequential scan. This is the single highest-value missing index in the schema.
> ⚠️ `volume_value` is text, so `"8-12"`, `"30s"` and `"12"` all live in one column; interpretation depends on `volume_type`.
> ⚠️ `intensity_type` has no CHECK constraint.
> ⚠️ Nine `prescribed_exercises_*_bak_*` snapshot tables exist — this table has been mass-rewritten by hand at least nine times in July 2026.

### `program_assignments`

Rows: **67** — the join between a client and a program, plus where they are in it. A client legitimately runs several programs at once (e.g. a corrective track *and* a split), which is why `v_client_now.active_programs` is an array.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `program_id` | uuid | NO |  |
| `current_phase_id` | uuid | yes |  |
| `current_day_in_rotation` | integer | yes | `1` |
| `combination_group` | text | yes |  |
| `active` | boolean | yes | `true` |
| `assigned_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (current_phase_id) REFERENCES phases(id)
- FOREIGN KEY (program_id) REFERENCES programs(id)

**Indexes:** `program_assignments_pkey` UNIQUE (id); `uq_pa_active_client_program` UNIQUE (client_id, program_id) WHERE active

**Triggers:** `trg_pa_enforce_program_isolation` BEFORE INSERT OR UPDATE OF program_id, client_id → `pa_enforce_program_isolation()` — stops a program that has been personalised for one client from being assigned to another.

### `program_versions`

Rows: **0** — intended JSON snapshot history for programs. **Never written.**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `program_id` | uuid | NO |  |
| `version_number` | integer | NO |  |
| `change_reason` | text | yes |  |
| `created_by` | text | yes |  |
| `snapshot` | jsonb | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE

**Indexes:** `program_versions_pkey` UNIQUE (id)

> ⚠️ Empty. Program edits are destructive — the `bak_*` / `fork_*` tables are the de facto version history.

### `programs`

Rows: **92** — the top of the programming tree: `programs → phases → days → sections → prescribed_exercises`. `personal_for_client_id` marks a program forked for a single client.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `category` | text | yes |  |
| `structure_type` | text | yes |  |
| `status` | text | NO | `'draft'::text` |
| `description` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |
| `personal_for_client_id` | uuid | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (personal_for_client_id) REFERENCES clients(id)

**CHECK constraints:**
- `programs_category_check` CHECK ((category = ANY (ARRAY['corrective track', 'training layer', 'split', 'maintenance'])))
- `programs_status_check` CHECK ((status = ANY (ARRAY['draft', 'pending', 'live', 'archived'])))
- `programs_structure_type_check` CHECK ((structure_type = ANY (ARRAY['phased-corrective', 'phased-split', 'level-based', 'single-session'])))

**Indexes:** `programs_pkey` UNIQUE (id); `idx_programs_personal_for_client` (personal_for_client_id) WHERE (personal_for_client_id IS NOT NULL)

**Triggers:** `trg_personal_program_needs_assignment` AFTER INSERT OR UPDATE OF personal_for_client_id → `pa_autocreate_for_personal_program()` — auto-creates the matching `program_assignments` row.

> ⚠️ `category` values contain spaces (`'corrective track'`, `'training layer'`) — easy to mistype as snake_case and hit a constraint violation.
> ⚠️ `programs.status` and `meal_plans.status` share the same vocabulary (`draft`/`pending`/`live`/`archived`) but `programs` defaults to `draft` while `meal_plans` defaults to `live`.

### `progress_photos`

Rows: **0** — native progress photo store. Currently empty; the three historical photos live in `everfit_progress_photos` (legacy).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `photo_url` | text | NO |  |
| `taken_date` | date | NO |  |
| `pose` | text | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**Indexes:** `progress_photos_pkey` UNIQUE (id); `idx_progress_photos_client_date` (client_id, taken_date)

> ⚠️ Both RLS policies are granted to role `public` rather than `authenticated`, so they also apply to `anon`. `client_rw_progress_photos` is `client_id = my_client_id()` — harmless for anon (`my_client_id()` returns NULL) but inconsistent with every other table.

### `progression_events`

Rows: **0** — intended audit of "phase up / regression / swap / hold / refer out" decisions per assignment. **Never written.**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `assignment_id` | uuid | NO |  |
| `event_date` | date | NO |  |
| `event_type` | text | yes |  |
| `trigger` | text | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (assignment_id) REFERENCES program_assignments(id) ON DELETE CASCADE

**CHECK constraints:**
- `progression_events_event_type_check` CHECK ((event_type = ANY (ARRAY['phase up', 'regression', 'swap', 'hold', 'refer out'])))

**Indexes:** `progression_events_pkey` UNIQUE (id)

### `published_workout_access`

Rows: **0** — which clients can see a `visibility = 'assigned'` published workout.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `published_workout_id` | uuid | NO |  |
| `client_id` | uuid | NO |  |

**Keys:** PRIMARY KEY (published_workout_id, client_id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (published_workout_id) REFERENCES published_workouts(id) ON DELETE CASCADE

**Indexes:** `published_workout_access_pkey` UNIQUE (published_workout_id, client_id)

> ⚠️ Empty, but `published_workouts` has 139 rows and the client read policy on `published_workouts` requires a matching row here. **No client can currently see any published workout**, regardless of `visibility = 'all_clients'` — the policy ignores the `visibility` column entirely.

### `published_workouts`

Rows: **139** — a standalone, on-demand workout ("drop-in session") not tied to a program phase. `scheduled_workouts.published_workout_id` points here as an alternative to `day_id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `name` | text | NO |  |
| `description` | text | yes |  |
| `day_id` | uuid | yes |  |
| `status` | text | yes | `'published'::text` |
| `visibility` | text | yes | `'all_clients'::text` |
| `created_by` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (day_id) REFERENCES days(id)

**CHECK constraints:**
- `published_workouts_status_check` CHECK ((status = ANY (ARRAY['draft', 'published', 'archived'])))
- `published_workouts_visibility_check` CHECK ((visibility = ANY (ARRAY['all_clients', 'assigned'])))

**Indexes:** `published_workouts_pkey` UNIQUE (id)

### `reminders`

Rows: **0** — intended weigh-in / body-fat reminder scheduler. **Never written.**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `type` | text | yes |  |
| `day_of_week` | integer | yes |  |
| `day_of_month` | integer | yes |  |
| `time_of_day` | time | yes |  |
| `active` | boolean | yes | `true` |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `reminders_type_check` CHECK ((type = ANY (ARRAY['weigh_in_weekly', 'body_fat_monthly', 'custom'])))

**Indexes:** `reminders_pkey` UNIQUE (id)

> ⚠️ Not to be confused with `payment_reminders`, which is the live billing table.

### `schedule_change_proposals`

Rows: **86** — **the human-in-the-loop queue.** `detect_schedule_changes()` (cron, twice daily) compares Google Calendar appointments against `scheduled_workouts` / `client_training_patterns` and files a proposal rather than changing anything. The trainer resolves each one via `resolve_schedule_proposal(id, decision, note)`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `scheduled_workout_id` | uuid | yes |  |
| `day_id` | uuid | yes |  |
| `appointment_id` | uuid | yes |  |
| `gcal_recurring_id` | text | yes |  |
| `from_date` | date | yes |  |
| `to_date` | date | yes |  |
| `reason` | text | NO |  |
| `confidence` | text | NO |  |
| `status` | text | NO | `'pending'::text` |
| `detail` | jsonb | yes |  |
| `created_at` | timestamptz | NO | `now()` |
| `resolved_at` | timestamptz | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (day_id) REFERENCES days(id)
- FOREIGN KEY (scheduled_workout_id) REFERENCES scheduled_workouts(id) ON DELETE CASCADE

**CHECK constraints:**
- `schedule_change_proposals_confidence_check` CHECK ((confidence = ANY (ARRAY['one_off', 'pattern'])))
- `schedule_change_proposals_reason_check` CHECK ((reason = ANY (ARRAY['moved', 'cancelled', 'uncovered', 'orphaned', 'pattern_shift', 'retired'])))
- `schedule_change_proposals_status_check` CHECK ((status = ANY (ARRAY['pending', 'approved', 'rejected', 'superseded'])))

**Indexes:** `schedule_change_proposals_pkey` UNIQUE (id); `uq_scp_open` UNIQUE (client_id, COALESCE(from_date,'1900-01-01'), COALESCE(to_date,'1900-01-01'), reason) WHERE (status = 'pending')

**What each `reason` means, and what `resolve_schedule_proposal` does with an approval**

| `reason` | Detected situation | Effect of "approve" |
|---|---|---|
| `moved` | Appointment exists on a different date to the planned workout | Updates `scheduled_date` **and** sets `moved_from_date`; never delete-and-reinsert |
| `cancelled` | Appointment cancelled, workout still planned | Soft-deletes the `scheduled_workout` (sets `deleted_at`), leaving the date empty |
| `uncovered` | Appointment exists with no workout planned | Acknowledged only — needs a programming decision |
| `orphaned` | Workout planned with no appointment behind it | Acknowledged only |
| `pattern_shift` | The client's modal weekday/time has moved | Acknowledged only |
| `retired` | A Google recurring series has no future instances | Acknowledged only |

`confidence` is `one_off` (a single date) or `pattern` (the whole recurring series). `resolve_schedule_proposal` refuses to act on a proposal that is not `pending`.

### `schedule_generation_log`

Rows: **0** — per-row audit of `generate_scheduled_workouts()` runs, tagged with a `generated_batch_id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `generated_batch_id` | uuid | NO |  |
| `client_id` | uuid | NO |  |
| `pattern_id` | uuid | yes |  |
| `scheduled_date` | date | NO |  |
| `day_id` | uuid | yes |  |
| `action` | text | NO |  |
| `detail` | text | yes |  |
| `created_at` | timestamptz | NO | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `schedule_generation_log_action_check` CHECK ((action = ANY (ARRAY['inserted', 'skipped_existing', 'skipped_no_assignment'])))

**Indexes:** `schedule_generation_log_pkey` UNIQUE (id); `ix_sgl_batch` (generated_batch_id); `ix_sgl_client_date` (client_id, scheduled_date)

> ⚠️ **RLS enabled, zero policies** — unreadable by `anon` and `authenticated` alike.
> ⚠️ Empty. `generate_scheduled_workouts()` defaults to dry-run, so either it has never been run for real or the log write is not happening.

### `scheduled_workouts`

Rows: **3178** — **the training calendar.** One planned session for one client on one date. `day_id` points at the programmed day (or `published_workout_id` for a drop-in); `workout_log_id` links to what was actually logged. Soft-deleted with `deleted_at` — *every* query must filter `deleted_at is null`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `assignment_id` | uuid | yes |  |
| `day_id` | uuid | yes |  |
| `published_workout_id` | uuid | yes |  |
| `scheduled_date` | date | NO |  |
| `position` | integer | yes | `1` |
| `status` | text | yes | `'scheduled'::text` |
| `source` | text | yes | `'trainer'::text` |
| `moved_from_date` | date | yes |  |
| `workout_log_id` | uuid | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |
| `supervised` | boolean | NO | `false` |
| `deleted_at` | timestamptz | yes |  |
| `appointment_id` | uuid | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
- FOREIGN KEY (assignment_id) REFERENCES program_assignments(id) ON DELETE SET NULL
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (day_id) REFERENCES days(id)
- FOREIGN KEY (published_workout_id) REFERENCES published_workouts(id)
- FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id)

**CHECK constraints:**
- `scheduled_workouts_status_check` CHECK ((status = ANY (ARRAY['scheduled', 'completed', 'skipped', 'moved'])))
- `scheduled_workouts_source_check` CHECK ((source = ANY (ARRAY['trainer', 'client_self_assign', 'claude', 'migration'])))

**Indexes:** `scheduled_workouts_pkey` UNIQUE (id); `idx_sched_client_date` (client_id, scheduled_date); `idx_scheduled_workouts_appointment` (appointment_id) WHERE (appointment_id IS NOT NULL)

**Triggers:**
- `trg_sw_derive_assignment` BEFORE INSERT OR UPDATE OF day_id, client_id → `sw_derive_assignment_id()` — back-fills `assignment_id` from the day's program.
- `trg_sw_enforce_day_isolation` BEFORE INSERT OR UPDATE OF day_id, client_id, status → `sw_enforce_day_isolation()` — refuses to schedule a client-owned (forked) day for a different client.

> ⚠️ `status` is **nullable with a default** — `null` is legal and is not `'scheduled'`. `v_client_now` and `v_plan_vs_actual` only ever test `status = 'completed'`, so a NULL status is silently counted as "not done".
> ⚠️ **`deleted_at` is not part of any index and not enforced anywhere.** `v_client_now` and `v_plan_vs_actual` filter it; `v_client_calendar` does **not**, so the calendar view shows soft-deleted (cancelled) sessions.
> ⚠️ There is no unique constraint on `(client_id, scheduled_date, position)`, so duplicate sessions on a date are possible; the `autoclose-stale-workout-logs` cron job contains explicit anti-duplicate logic to work around this.
> ⚠️ Nothing enforces that exactly one of `day_id` / `published_workout_id` is set; both may be NULL.

### `sections`

Rows: **2975** — a block within a day. Carries both the coach-facing NASM-style `internal_name` and the client-facing label. Parent of `prescribed_exercises`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `day_id` | uuid | NO |  |
| `internal_name` | text | yes |  |
| `client_facing_name` | text | yes |  |
| `position` | integer | NO |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE CASCADE

**CHECK constraints:**
- `sections_internal_name_check` CHECK ((internal_name = ANY (ARRAY['Inhibit', 'Lengthen', 'Activate', 'Integrate', 'Corrective Warm-Up', 'Primary Strength', 'Accessory Strength', 'Cardio'])))
- `sections_client_facing_name_check` CHECK ((client_facing_name = ANY (ARRAY['Warm-Up', 'Strength', 'Accessory', 'Cardio'])))

**Indexes:** `sections_pkey` UNIQUE (id) — **and nothing else**

> ⚠️ **2,975 rows and no index on `day_id`**, despite it being the only way this table is ever queried and a join hop in three RLS policies.
> ⚠️ Both name columns are CHECK-constrained to closed vocabularies with **exact capitalisation and hyphenation** (`'Warm-Up'`, `'Corrective Warm-Up'`). Writing `'Warm Up'` or `'warm-up'` fails.
> ⚠️ Both are nullable, so a section can have neither name.

### `session_notes`

Rows: **0** — trainer's per-session written notes. **Never written** (`trainer_notes` is used instead).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `appointment_id` | uuid | yes |  |
| `note_date` | date | NO | `CURRENT_DATE` |
| `note_text` | text | NO |  |
| `note_type` | text | yes | `'workout'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `updated_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

**CHECK constraints:**
- `session_notes_note_type_check` CHECK ((note_type = ANY (ARRAY['workout', 'assessment', 'general', 'regression', 'progression', 'concern'])))

**Indexes:** `session_notes_pkey` UNIQUE (id); `idx_session_notes_client` (client_id); `idx_session_notes_date` (note_date DESC)

> ⚠️ `note_date` defaults to `CURRENT_DATE`, which is UTC — everything else in this database is `America/Chicago`. After 19:00 CT this records tomorrow's date.

### `set_logs`

Rows: **7303** — **the workout fact table.** One logged set: reps, weight, RPE, duration, distance, speed, heart rate. Child of `workout_logs`; `exercise_id` is back-filled by trigger from `prescribed_exercise_id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `workout_log_id` | uuid | NO |  |
| `prescribed_exercise_id` | uuid | yes |  |
| `exercise_id` | uuid | yes |  |
| `set_number` | integer | yes |  |
| `reps` | integer | yes |  |
| `weight` | numeric | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |
| `client_id` | uuid | yes |  |
| `weight_lbs` | numeric(7,2) | yes |  |
| `rpe` | numeric(3,1) | yes |  |
| `duration_seconds` | integer | yes |  |
| `distance_meters` | numeric(8,2) | yes |  |
| `completed` | boolean | yes | `true` |
| `logged_at` | timestamptz | yes | `now()` |
| `speed` | numeric | yes |  |
| `heart_rate` | integer | yes |  |

**Keys:** PRIMARY KEY (id); UNIQUE (workout_log_id, prescribed_exercise_id, set_number)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (exercise_id) REFERENCES exercises(id)
- FOREIGN KEY (prescribed_exercise_id) REFERENCES prescribed_exercises(id)
- FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE

**CHECK constraints:**
- `set_logs_rpe_check` CHECK (((rpe >= (0)::numeric) AND (rpe <= (10)::numeric)))

**Indexes:** `set_logs_pkey` UNIQUE (id); `set_logs_wl_pe_setnum_key` UNIQUE (workout_log_id, prescribed_exercise_id, set_number); `idx_set_logs_client_id` (client_id); `idx_set_logs_workout_log_id` (workout_log_id)

**Triggers:** `trg_fill_set_log_exercise_id` BEFORE INSERT OR UPDATE → `fill_set_log_exercise_id()` — copies `exercise_id` down from the prescription when it is not supplied.

> ⚠️ **Two weight columns.** `weight` (unconstrained numeric) and `weight_lbs` (numeric(7,2)). Every consumer writes `COALESCE(weight_lbs, weight)`. Always do the same; never read one alone.
> ⚠️ `client_id` is nullable and denormalised from `workout_logs`. It is also the column the client RLS policy (`client_id = my_client_id()`) keys on — **a set log with a NULL `client_id` is invisible to its own client.**
> ⚠️ The unique key treats NULL `prescribed_exercise_id` as distinct, so ad-hoc sets (no prescription) can duplicate freely.
> ⚠️ `est_1rm` in `v_exercise_progression` uses Epley and is only computed for 1–15 reps with weight > 0; time/distance work yields NULL, not 0.

### `skinfold_logs`

Rows: **16** — caliper skinfold measurements and the derived body-fat calculation.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `log_date` | date | NO | `CURRENT_DATE` |
| `method` | text | NO |  |
| `sites` | jsonb | NO |  |
| `sum_mm` | numeric | yes |  |
| `body_density` | numeric | yes |  |
| `body_fat_pct` | numeric | yes |  |
| `age` | integer | yes |  |
| `sex` | text | yes |  |
| `created_at` | timestamptz | yes | `now()` |

**Keys:** PRIMARY KEY (id)

**Indexes:** `skinfold_logs_pkey` UNIQUE (id)

> ⚠️ **`client_id` has no foreign key to `clients`.** Deleting a client leaves orphaned skinfold rows; a typo'd uuid is accepted silently. This is the only client-scoped live table with no FK.
> ⚠️ No index on `client_id`; `method` and `sex` have no CHECK constraints.
> ⚠️ Results are not copied into `metrics`, so a caliper reading here does **not** move `latest_body_fat_pct` in `v_client_now` unless a `metrics` row with `source = 'caliper'` is also written.

### `trainer_notes`

Rows: **8** — the trainer's notes attached to a client, optionally scoped to a day / exercise / prescription. This is the table actually in use (see `session_notes`, which is empty).

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `day_id` | uuid | yes |  |
| `note` | text | NO |  |
| `created_at` | timestamptz | yes | `now()` |
| `exercise_id` | uuid | yes |  |
| `prescribed_exercise_id` | uuid | yes |  |
| `author` | text | yes | `'trainer'::text` |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE SET NULL
- FOREIGN KEY (exercise_id) REFERENCES exercises(id)
- FOREIGN KEY (prescribed_exercise_id) REFERENCES prescribed_exercises(id)

**Indexes:** `trainer_notes_pkey` UNIQUE (id); `idx_trainer_notes_client_id` (client_id); `idx_trainer_notes_day_id` (day_id)

> ⚠️ Despite the name, the RLS policy `client_rw_trainer_notes` gives the **client full read *and write*** on their own rows (`ALL`, `client_id = my_client_id()`). Clients can edit and delete their trainer's notes.

### `trainer_settings`

Rows: **1** — the single trainer row. Holds the Google OAuth refresh/access tokens, the calendar watch channel, and the theme. `is_trainer()` is defined as "a row exists here for `auth.uid()`", so this table *is* the authorisation model.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `user_id` | uuid | yes |  |
| `theme` | text | yes | `'midnight_navy'::text` |
| `updated_at` | timestamptz | yes | `now()` |
| `google_refresh_token` | text | yes |  |
| `google_access_token` | text | yes |  |
| `google_token_expiry` | timestamptz | yes |  |
| `google_sync_token` | text | yes |  |
| `google_channel_id` | text | yes |  |
| `google_channel_resource_id` | text | yes |  |
| `google_channel_expiry` | timestamptz | yes |  |
| `trainer_email` | text | yes |  |
| `gcal_sync_enabled` | boolean | NO | `false` |

**Keys:** PRIMARY KEY (id); UNIQUE (user_id); UNIQUE (trainer_email)

**Foreign keys:**
- FOREIGN KEY (user_id) REFERENCES auth.users(id)

**CHECK constraints:**
- `trainer_settings_theme_check` CHECK ((theme = ANY (ARRAY['steel_sky', 'arctic_teal', 'slate_emerald', 'platinum_indigo', 'warm_gold', 'midnight_navy', 'obsidian_gold', 'carbon_crimson', 'deep_space', 'iron_ember'])))

**Indexes:** `trainer_settings_pkey` UNIQUE (id); `trainer_settings_user_id_key` UNIQUE (user_id); `trainer_settings_trainer_email_key` UNIQUE (trainer_email)

> ⚠️ **Plaintext Google OAuth refresh tokens.** Anyone who can insert a row here (`Trainer manages own settings` is `USING auth.uid() = user_id`, granted to `public`) becomes a trainer — `is_trainer()` returns true for anyone with a `trainer_settings` row. An authenticated client can insert `(user_id = their own auth.uid())` and thereby grant themselves full trainer access to every table. **This is the most serious privilege issue in the schema.**

### `workout_logs`

Rows: **836** — one logged training session per client per date (per day). Parent of `set_logs`. `completed` + `completed_at` are what the nightly auto-close cron job sets.

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `client_id` | uuid | NO |  |
| `day_id` | uuid | yes |  |
| `log_date` | date | NO |  |
| `status` | text | yes |  |
| `note` | text | yes |  |
| `completed` | boolean | yes | `false` |
| `source` | text | yes | `'client'::text` |
| `created_at` | timestamptz | yes | `now()` |
| `started_at` | timestamptz | yes | `now()` |
| `completed_at` | timestamptz | yes |  |
| `duration_minutes` | integer | yes |  |

**Keys:** PRIMARY KEY (id)

**Foreign keys:**
- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
- FOREIGN KEY (day_id) REFERENCES days(id)

**CHECK constraints:**
- `workout_logs_status_check` CHECK ((status = ANY (ARRAY['Done as planned', 'Modified', 'Partial', 'Skipped', 'Rest day'])))
- `workout_logs_source_check` CHECK ((source = ANY (ARRAY['client', 'trainer_backfill', 'claude', 'migration'])))

**Indexes:** `workout_logs_pkey` UNIQUE (id); `uq_workout_log_one_completed` UNIQUE (client_id, day_id, log_date) WHERE (completed = true); `idx_workout_logs_client_id` (client_id); `idx_workout_logs_day_id` (day_id); `idx_workout_logs_log_date` (log_date)

> ⚠️ **`workout_logs.status` uses sentence-case English phrases** (`'Done as planned'`, `'Rest day'`) while `scheduled_workouts.status` uses lowercase tokens (`'scheduled'`, `'completed'`). These are two different vocabularies for adjacent concepts and mixing them up is a constraint violation. There is no `'completed'` value here and no `'Done as planned'` there.
> ⚠️ `status` is nullable with **no default** — most rows carry NULL. `completed` (boolean) is the real signal; `status` is descriptive colour.
> ⚠️ `uq_workout_log_one_completed` treats NULL `day_id` as distinct, so unsupervised/ad-hoc completed sessions can duplicate on the same date.

---

## Backup / legacy tables — NOT live schema

**None of the 46 tables below is part of the running application.** They are hand-made snapshots taken before destructive edits, an abandoned Everfit import, and one demo/seed helper. They are documented only so that nobody mistakes them for real tables. Do not read them in application code, do not join to them, and do not assume any of them is current.

They match these patterns: `bak_%`, `%_bak_%`, `fork_%`, `%_backup_%`, `demo_seed_%`, `everfit_%`, `_sql_load`, plus three that slipped the naming convention (`exercise_dedupe_map_20260724`, `prescribed_exercises_stretchbak_20260713`, `prescribed_exercises_dedupe_bak_20260724`).

| Table | Rows | Cols | Size | What it was |
|---|---:|---:|---|---|
| `_sql_load` | 9 | 2 | 104 kB | Scratch table used to paste SQL into the editor |
| `app_feedback_bak_20260717` | 52 | 12 | 40 kB | Snapshot of `app_feedback` |
| `bak_days_20260731` | 994 | 10 | 264 kB | Snapshot of `days` (taken today) |
| `bak_payment_reminders_20260731` | 40 | 17 | 24 kB | Snapshot of `payment_reminders` (taken today) |
| `bak_prescribed_exercises_20260731` | 9,167 | 20 | 1576 kB | Snapshot of `prescribed_exercises` (taken today) |
| `bak_program_assignments_20260731` | 45 | 8 | 16 kB | Snapshot of `program_assignments` (taken today; live table now has 67) |
| `bak_scheduled_workouts_20260731` | 3,178 | 16 | 552 kB | Snapshot of `scheduled_workouts` (taken today) |
| `calendar_payments_backup_20260703` | 20 | 11 | 16 kB | Snapshot of `calendar_payments` |
| `demo_seed_20260725` | 4 | 5 | 32 kB | Demo-account seed helper (see `wipe_demo_account_20260725()`) |
| `everfit_activities` | 14 | 8 | 32 kB | Abandoned Everfit migration |
| `everfit_daily_steps` | 0 | 6 | 24 kB | Abandoned Everfit migration |
| `everfit_food_log` | 0 | 12 | 24 kB | Abandoned Everfit migration |
| `everfit_progress_photos` | 3 | 7 | 32 kB | Abandoned Everfit migration — the only progress photos in the database |
| `everfit_workout_history` | 0 | 11 | 24 kB | Abandoned Everfit migration |
| `exercise_dedupe_map_20260724` | 67 | 4 | 24 kB | old-id → new-id map from the exercise de-duplication pass |
| `exercises_dedupe_bak_20260724` | 858 | 11 | 264 kB | `exercises` before de-duplication (858 → 821) |
| `fork_bak_program_assignments_20260725` | 45 | 9 | 16 kB | Program-fork migration working set |
| `fork_bak_scheduled_workouts_20260725` | 2,992 | 16 | 512 kB | Program-fork migration working set |
| `fork_borrow_day_map_20260725` | 136 | 4 | 16 kB | Program-fork migration working set |
| `fork_borrow_pairs_20260725` | 136 | 2 | 8 kB | Program-fork migration working set |
| `fork_borrow_section_map_20260725` | 433 | 4 | 64 kB | Program-fork migration working set |
| `fork_day_map_20260725` | 195 | 4 | 32 kB | Program-fork migration working set |
| `fork_lib_day_map_20260725` | 35 | 4 | 8 kB | Program-fork migration working set |
| `fork_lib_pairs_20260725` | 35 | 2 | 8 kB | Program-fork migration working set |
| `fork_lib_prog_20260725` | 7 | 4 | 16 kB | Program-fork migration working set |
| `fork_lib_section_map_20260725` | 91 | 4 | 16 kB | Program-fork migration working set |
| `fork_pairs_20260725` | 23 | 5 | 16 kB | Program-fork migration working set |
| `fork_pers_prog_20260725` | 18 | 5 | 16 kB | Program-fork migration working set |
| `fork_phase_map_20260725` | 32 | 4 | 8 kB | Program-fork migration working set |
| `fork_section_map_20260725` | 578 | 4 | 64 kB | Program-fork migration working set |
| `meal_adherence_logs_bak_20260718` | 70 | 23 | 72 kB | Snapshot of `meal_adherence_logs` |
| `prescribed_exercises_bridge_hinge_bak_20260725` | 492 | 20 | 136 kB | Snapshot before a bridge/hinge rewrite |
| `prescribed_exercises_dedupe_bak_20260724` | 3,842 | 2 | 264 kB | id pairs from the prescription de-dupe pass |
| `prescribed_exercises_holds_bak_20260713` | 53 | 5 | 16 kB | Snapshot before a hold-pattern rewrite |
| `prescribed_exercises_rollpose_bak_20260713` | 327 | 5 | 40 kB | Snapshot before a roll/pose rewrite |
| `prescribed_exercises_rollstretch_bak_20260723` | 1,677 | 20 | 296 kB | Snapshot before a roll/stretch rewrite |
| `prescribed_exercises_stretchbak_20260713` | 266 | 4 | 40 kB | Snapshot before a stretch rewrite (note: **no `_bak_` separator** in the name) |
| `prescribed_exercises_trackfields_bak_20260724` | 3,842 | 2 | 272 kB | `tracked_fields` backfill pairs |
| `prescribed_exercises_trackfix_bak_20260720` | 88 | 20 | 24 kB | Snapshot before a tracked-fields fix |
| `prescribed_exercises_trackfix_bak_20260725` | 10 | 21 | 16 kB | Snapshot before a tracked-fields fix |
| `scheduled_workouts_bak_20260716` | 2,495 | 15 | 408 kB | Snapshot of `scheduled_workouts` |
| `scheduled_workouts_stranded_bak_20260725` | 6 | 16 | 16 kB | Rows orphaned by the fork migration |
| `set_logs_dedupe_bak_20260724` | 4,735 | 2 | 312 kB | id pairs from the set-log de-dupe pass |
| `set_logs_stranded_bak_20260725` | 76 | 19 | 24 kB | Rows orphaned by the fork migration |
| `workout_logs_stranded_bak_20260725` | 10 | 13 | 16 kB | Rows orphaned by the fork migration |

> ⚠️ **These 46 tables are RLS-enabled with zero policies, which is what currently keeps them private** — but they are still `SELECT`/`INSERT`/`UPDATE`/`DELETE`-granted to `anon` and `authenticated` at the privilege level. They hold real client programming and billing data (e.g. `bak_payment_reminders_20260731`). A single `create policy … using (true)` anywhere, or one `alter table … disable row level security`, exposes all of it. They should be dropped.
> ⚠️ `bak_*_20260731` was taken **today**. Whatever migration it was protecting is either in flight or was completed today without a migration file.

---

## Functions

48 functions live in `public`. Most are `SECURITY DEFINER`, which means **they run with the owner's privileges and bypass RLS** — see the security section. `EXECUTE` is granted to `anon` and `authenticated` on essentially all of them (Supabase default).

### Scheduling / programming

| Function | Signature | Notes |
|---|---|---|
| `generate_scheduled_workouts` | `(p_weeks int = 5, p_dry_run bool = true, p_client uuid = null) → table(...)` | **Has a `COMMENT`:** *"Materialises scheduled_workouts from client_training_patterns, p_weeks (1-6) forward starting tomorrow. INSERTS ONLY WHERE NO LIVE ROW EXISTS for that client+date - hand-placed work always wins. Defaults to DRY RUN: pass p_dry_run => false to write. Every run tagged with a batch_id in schedule_generation_log."* |
| `detect_schedule_changes` | `() → int` | Compares Google Calendar against the plan and files `schedule_change_proposals`. Cron, twice daily. |
| `resolve_schedule_proposal` | `(p_id uuid, p_decision text, p_note text = null) → table(...)` | **Has a `COMMENT`:** *"Approve or reject one schedule_change_proposal. moved -> update scheduled_date AND set moved_from_date (never delete-and-reinsert). cancelled -> soft-delete so the date is left empty. uncovered/orphaned/retired/pattern_shift -> acknowledged only; those need a programming decision and are not guessed at. Refuses to act on a proposal that is not pending."* |
| `fork_day_for_client` | `(p_day_id uuid, p_client_id uuid) → uuid` | Deep-copies a shared `day` (and its sections/prescriptions) so one client can be edited in isolation. |
| `day_is_exclusive_to` | `(p_day_id uuid, p_client_id uuid) → bool` | Is this day owned by exactly this client. |
| `ensure_personal_phase` | `(p_client_id uuid) → uuid` | Creates (or returns) the client's personal program/phase container. |
| `sched_day_ids` / `sched_phase_ids` / `sched_program_ids` / `sched_section_ids` | `() → setof uuid` | Helpers used **inside RLS policies** so a client can read the programming behind a workout scheduled for them. |
| `sw_derive_assignment_id` / `sw_enforce_day_isolation` / `days_enforce_owner` / `pa_enforce_program_isolation` / `pa_autocreate_for_personal_program` | trigger fns | See the trigger table. |

### Nutrition

| Function | Signature | Notes |
|---|---|---|
| `flip_due_meal_plans` | `(p_today date = null) → table(client_id, plan_went_live, plans_archived[])` | Promotes a `pending` plan whose `effective_date` has arrived to `live` and archives the previous one. |
| `activate_due_meal_plans` | `() → void` | Older/overlapping version of the same idea. **Not** `SECURITY DEFINER`. |
| `generate_rotation_plans` | `(p_horizon_weeks int = 10) → table(...)` | Clones template plans forward on the cycle described in `plan_rotations`. Cron, daily. |
| `enforce_no_future_live_plan` / `enforce_no_future_macro_target` / `stamp_meal_plan_author` | trigger fns | See the trigger table. |

### Food import

| Function | Signature | Notes |
|---|---|---|
| `import_off_bulk` | `(p_pages int = 30, p_length int = 100) → jsonb` | Open Food Facts bulk importer. Runs **every minute** by cron while `food_import_state.status <> 'done'`. |
| `import_off_food_batch` | `(rows jsonb) → int` | Upserts one page into `food_catalog`. |
| `claim_off_import` | `(max_stale_minutes int = 8) → setof food_import_state` | Lease/lock for the importer. |
| `finish_off_import` | `(p_cursor int, p_inserted int, p_status text) → void` | Releases the lease. |

### Billing

| Function | Signature | Notes |
|---|---|---|
| `generate_due_payment_reminders` | `() → int` | Creates the reminders that are due. Cron, daily at 13:00 UTC. |
| `recalc_pending_payment_reminders` | `() → table(...)` | **Has a `COMMENT`:** *"Sessions-trained billing recalc. Only touches pending reminders with no email_sent_at and no sms_sent_at -- anything already sent to a client is never rewritten. Called by /api/gcal-sync after appointments are refreshed."* |
| `ack_payment_reminder` | `(reminder_id uuid) → void` | Client-side "I've paid" acknowledgement. |
| `gcal_generate_payment_notifications` | `() → int` | Fans reminders out into `client_notifications`. |

### Google Calendar sync

`gcal_get_tokens()`, `gcal_update_access_token(...)`, `save_google_tokens(...)`, `gcal_get_clients()`, `gcal_sync_appointments(jsonb)`, `gcal_sync_payments(jsonb)`, `gcal_reconcile_appointments(text[], tstz, tstz)`, `gcal_reconcile_payments(text[], tstz, tstz)`, `gcal_clear_appointments()` — all `SECURITY DEFINER`, all called from the `/api/gcal-sync` route.

> ⚠️ `gcal_get_tokens()` returns the trainer's Google **access and refresh tokens in plaintext**, is `SECURITY DEFINER`, and `EXECUTE` is granted to `anon`. Anyone with the public anon key can call it and receive working Google OAuth credentials for the trainer's calendar. **This is the single most urgent item in this document.**

### Auth / identity helpers

| Function | Returns | Definition in one line |
|---|---|---|
| `is_trainer()` | bool | "a `trainer_settings` row exists for `auth.uid()`" — used by ~60 RLS policies |
| `my_client_id()` | uuid | `clients.id` where `auth_user_id = auth.uid()` — used by ~30 RLS policies |
| `trainer_user_id()` | uuid | the trainer's `auth.users` id |

### Maintenance / misc

| Function | Notes |
|---|---|
| `run_integrity_checks()` | Writes a row per check into `integrity_checks`. Cron, twice daily. |
| `rls_auto_enable()` | **Event trigger** function: automatically runs `alter table … enable row level security` on every newly created table. This is why all 108 tables have RLS on — including every backup table — and why "RLS enabled" here does **not** imply "a policy was thought about". |
| `update_updated_at_column()` | Generic `updated_at` setter. **Not attached to any trigger.** |
| `compute_lean_fat_mass()` / `metrics_autocalc_mass()` / `fill_set_log_exercise_id()` | trigger fns |
| `wipe_demo_account_20260725()` | One-off destructive helper that deletes the demo client's data. `SECURITY DEFINER`; `EXECUTE` is **not** granted to `anon`/`authenticated` (the one function where it was revoked). Still, it should be dropped. |

> ⚠️ **34 `SECURITY DEFINER` functions are `EXECUTE`-able by `anon`.** Because they run as their owner they bypass RLS entirely. Among them: `gcal_get_tokens()` (returns the trainer's Google access + refresh tokens), `save_google_tokens()` (overwrites them), `generate_scheduled_workouts()`, `detect_schedule_changes()`, `resolve_schedule_proposal()` (approves schedule changes), `ack_payment_reminder()` (marks a bill acknowledged) and `fork_day_for_client()`. All of these should have `EXECUTE` revoked from `anon`.
> ⚠️ `wipe_demo_account_20260725()` is a one-off `SECURITY DEFINER` **delete** function still present in production. `EXECUTE` is correctly revoked from `anon`/`authenticated`, but it should be dropped.
> ⚠️ 10 functions have a mutable `search_path` (no `set search_path = …`), which is a privilege-escalation vector for `SECURITY DEFINER` functions.

---

## Triggers

Eleven row-level triggers, all `BEFORE`/`AFTER` `FOR EACH ROW`. There are no statement-level triggers.

| Table | Trigger | Fires | Function | Purpose |
|---|---|---|---|---|
| `days` | `trg_days_enforce_owner` | BEFORE INSERT OR UPDATE OF `phase_id` | `days_enforce_owner()` | Keeps `client_owner_id` consistent with the owning phase/program |
| `macro_targets` | `trg_no_future_macro_target` | BEFORE INSERT OR UPDATE | `enforce_no_future_macro_target()` | Rejects a future `effective_date` |
| `meal_plans` | `trg_no_future_live_plan` | BEFORE INSERT OR UPDATE | `enforce_no_future_live_plan()` | A plan effective in the future may not be `live` |
| `meal_plans` | `trg_stamp_meal_plan_author` | BEFORE INSERT | `stamp_meal_plan_author()` | Sets `created_by_client` from the caller |
| `metrics` | `trg_compute_lean_fat` | BEFORE INSERT OR UPDATE | `compute_lean_fat_mass()` | Derives `lean_mass` / `fat_mass` |
| `metrics` | `trg_metrics_autocalc_mass` | BEFORE INSERT OR UPDATE | `metrics_autocalc_mass()` | Derives `lean_mass` / `fat_mass` — **again** |
| `program_assignments` | `trg_pa_enforce_program_isolation` | BEFORE INSERT OR UPDATE OF `program_id`, `client_id` | `pa_enforce_program_isolation()` | A personalised program cannot be assigned to another client |
| `programs` | `trg_personal_program_needs_assignment` | AFTER INSERT OR UPDATE OF `personal_for_client_id` | `pa_autocreate_for_personal_program()` | Auto-creates the matching `program_assignments` row |
| `scheduled_workouts` | `trg_sw_derive_assignment` | BEFORE INSERT OR UPDATE OF `day_id`, `client_id` | `sw_derive_assignment_id()` | Back-fills `assignment_id` from the day's program |
| `scheduled_workouts` | `trg_sw_enforce_day_isolation` | BEFORE INSERT OR UPDATE OF `day_id`, `client_id`, `status` | `sw_enforce_day_isolation()` | Refuses to schedule another client's forked day |
| `set_logs` | `trg_fill_set_log_exercise_id` | BEFORE INSERT OR UPDATE | `fill_set_log_exercise_id()` | Copies `exercise_id` down from the prescription |

Plus one **event trigger**, `rls_auto_enable()`, which enables RLS on every newly created table in the database.

> ⚠️ `metrics` has **two triggers computing the same two columns** on the same event. They run in name order, so `trg_metrics_autocalc_mass` always wins and `trg_compute_lean_fat` is effectively dead. If their formulas ever diverge the behaviour is silently determined by alphabetical order.
> ⚠️ `set_logs.client_id` — the column the client RLS policy depends on — is **not** back-filled by any trigger, unlike `exercise_id`. It is currently populated on all 7,303 rows, but nothing enforces that.

---

## pg_cron jobs

Read from `cron.job` (the `cron` schema is present and readable). **All schedules are UTC.** The application's business timezone is `America/Chicago` (UTC−5 in July).

| jobid | Name | Schedule (UTC) | Local (CDT) | Active | Command |
|---:|---|---|---|:---:|---|
| 4 | `autoclose-stale-workout-logs` | `0 9 * * *` | 04:00 | ✅ | Inline `DO` block: marks yesterday's incomplete `workout_logs` that have set logs as `completed` + `status = 'Done as planned'`, then flips the matching `scheduled_workouts` to `completed` |
| 5 | `generate-payment-reminders` | `0 13 * * *` | 08:00 | ✅ | `select public.generate_due_payment_reminders();` |
| 6 | `activate-due-meal-plans` | `10 6 * * *` | 01:10 | ✅ | `select activate_due_meal_plans();` |
| 7 | `flip_due_meal_plans_0510utc` | `10 5 * * *` | 00:10 | ✅ | `select public.flip_due_meal_plans();` |
| 8 | `flip_due_meal_plans_0610utc` | `10 6 * * *` | 01:10 | ✅ | `select public.flip_due_meal_plans();` |
| 13 | `off-bulk-import` | `* * * * *` | every minute | ✅ | `select public.import_off_bulk(30,100) where exists (select 1 from food_import_state where source='off_bulk' and status <> 'done');` |
| 14 | `generate_rotation_plans_daily` | `20 6 * * *` | 01:20 | ✅ | `select public.generate_rotation_plans(10);` |
| 16 | `detect_schedule_changes_12h` | `30 11,23 * * *` | 06:30 / 18:30 | ✅ | `select public.detect_schedule_changes();` |
| 17 | `integrity_checks_12h` | `25 11,23 * * *` | 06:25 / 18:25 | ✅ | `select public.run_integrity_checks();` |

> ⚠️ **Jobs 7 and 8 are duplicates.** `flip_due_meal_plans()` runs twice a night (00:10 and 01:10 CDT) with identical arguments. One should be deleted.
> ⚠️ **Job 6 collides with job 8.** `activate_due_meal_plans()` and `flip_due_meal_plans()` are two implementations of "promote the due meal plan", scheduled at the **same minute** (`10 6 * * *`). Whichever commits first wins; `plan_flip_log` has only 3 rows, so this is not being audited.
> ⚠️ **Job 13 runs every minute, forever.** Its guard is `food_import_state.status <> 'done'` on a table that has **no CHECK constraint on `status`** and is **writable by `anon`**. `food_catalog` already holds 197,826 rows.
> ⚠️ **Nothing generates `scheduled_workouts` on a schedule.** `generate_scheduled_workouts()` is not in cron and defaults to dry-run, and `schedule_generation_log` is empty — so calendar coverage is a manual operation. `v_client_now.coverage_days_left` going negative is the only warning.
> ⚠️ There is **no job monitoring**. `cron.job_run_details` is not surfaced anywhere in the app, and a failing job (e.g. `generate_due_payment_reminders` hitting `uq_one_open_reminder_per_client`) fails silently.

---

## RLS and security posture

### Summary

| | |
|---|---|
| Tables with RLS **enabled** | 108 / 108 |
| Tables with RLS enabled but **no policy at all** | 41 (all 46 legacy tables minus a few, plus `client_training_patterns` and `schedule_generation_log`) |
| Total policies | 141 |
| Policies granted to role `anon` | 6 (all `USING (true) WITH CHECK (true)`) |
| Views with `security_invoker = off` | 11 of 13 |

RLS is on everywhere because of the `rls_auto_enable` **event trigger**, not because each table was reviewed. "RLS enabled" therefore carries no assurance here.

### The two identity predicates

Nearly every policy is one of two shapes:

- **Trainer:** `is_trainer()` — true when a `trainer_settings` row exists for `auth.uid()`.
- **Client:** `client_id = my_client_id()` — where `my_client_id()` is `clients.id` for `auth.uid()`.

Four tables instead hard-code identity, which is fragile and inconsistent:

| Table | Policy | Predicate |
|---|---|---|
| `appointments` | `trainer_all_appointments` | `auth.uid() = 'aaec8ad5-9d01-4110-84f7-a32fa08e8192'` |
| `calendar_payments` | `trainer_all_calendar_payments` | same hard-coded uuid |
| `client_private_profiles` | `trainer_all_client_private_profiles` | same hard-coded uuid |
| `billing_adjustments`, `client_assessments`, `client_private_profiles`, `payment_reminders`, `trainer_settings` | various | `auth.email() = 'symmetrypersonaltraining@gmail.com'` / `auth.jwt() ->> 'email' = …` |

`appointments` is the only table with `FORCE ROW LEVEL SECURITY`.

### 🚨 Tables writable by the `anon` role

Six tables carry a policy named `app_anon_all`: `FOR ALL TO {anon, authenticated} USING (true) WITH CHECK (true)`. Combined with the default `GRANT INSERT, UPDATE, DELETE TO anon`, **anyone holding the public anon key can read, insert, update and delete every row in these tables without logging in**:

| Table | Rows | Why it matters |
|---|---:|---|
| **`food_catalog`** | 197,826 | The entire food database can be wiped or poisoned. |
| **`my_meals`** | 2 | Carries `client_id` — client data readable and forgeable. |
| **`plan_rotations`** | 2 | An attacker can point a rotation at any client's meal plans; the daily cron then clones them. |
| **`plan_flip_log`** | 3 | Audit log, freely rewritable. |
| **`ai_usage_log`** | 14 | Cost/usage accounting, freely rewritable; carries `client_id`. |
| **`food_import_state`** | 2 | Controls the every-minute import cron. |

### 🚨 All 11 `v_*` views bypass RLS entirely

Every view except `ai_usage_daily` / `ai_usage_monthly` is owned by `postgres` with **`security_invoker = off`**, and `SELECT` is granted to `anon`. A view with `security_invoker = off` runs with the *owner's* permissions, and `postgres` bypasses RLS. Therefore:

```
anon key  →  select * from v_client_profile
          →  every client's name, email, date of birth, goals, injuries and fees
```

The same applies to `v_client_now`, `v_plan_vs_actual`, `v_exercise_progression`, `v_nutrition_now`, `v_client_calendar`, `v_client_calendar_pattern`, `v_exercise_history`, `v_metrics_trend`, `v_integrity_flags` and `v_schedule_proposals`. **The canonical views are a complete bypass of the row-level security on the tables underneath them.** Fix: `alter view … set (security_invoker = on)` and `revoke select … from anon`.

### Tables with RLS on and no policy — deny-all

41 tables. Two of them are live application tables and this is almost certainly unintended:

| Table | Rows | Consequence |
|---|---:|---|
| **`client_training_patterns`** | 15 | Not readable or writable by `anon` **or `authenticated`** — including the trainer's own logged-in session. Only `service_role` and `SECURITY DEFINER` functions can see it. Any client-side query returns 0 rows with no error. |
| **`schedule_generation_log`** | 0 | Same; the audit log cannot be read from the app. |

The other 39 are the backup/legacy tables, where deny-all is the desired outcome — but it is the *only* thing protecting them.

### Other notable policy problems

- **`trainer_settings` is a privilege-escalation path.** The policy `Trainer manages own settings` is `FOR ALL TO public USING (auth.uid() = user_id)` with **no `WITH CHECK`**. Any authenticated user can insert a `trainer_settings` row for their own `auth.uid()`; `is_trainer()` then returns true for them, granting full read/write on every table in the database.
- **`trainer_notes` is client-writable.** `client_rw_trainer_notes` is `FOR ALL … USING (client_id = my_client_id())` — clients can edit and delete their trainer's notes about them.
- **`messages` soft-delete policy is a full UPDATE.** `Participants can soft-delete` allows either party to rewrite a message's `body`, not just set `deleted_at`.
- **`published_workouts` is unreachable by clients.** The client read policy requires a `published_workout_access` row, and that table is empty — so all 139 published workouts are invisible, and the `visibility = 'all_clients'` column is never consulted.
- **`prescribed_exercises` client policies are expensive.** Three separate `SELECT` policies each join `sections → days → phases → program_assignments` against a 9,167-row table with **no index on `section_id`**.
- **Six storage buckets are public and allow listing** (`avatars`, `feedback`, `meal-photos`, `message-images`, `progress-photos`, `app-downloads`) — meal photos and progress photos are client health data.
- **Leaked-password protection is disabled** in Supabase Auth.
- **`pg_net` is installed in the `public` schema.**

---

## Appendix A — all 50 CHECK constraints, verbatim

Exactly as `pg_get_constraintdef()` returns them. These vocabularies are load-bearing: writing a value that is not in the list raises `23514 check_violation`, and several of them differ in case or punctuation from what reads naturally.

| Table | Constraint | Definition |
|---|---|---|
| `ai_chat_sessions` | `ai_chat_sessions_context_type_check` | `CHECK ((context_type = ANY (ARRAY['general'::text, 'programming'::text, 'intake'::text, 'billing'::text, 'scheduling'::text, 'notes'::text])))` |
| `ai_program_drafts` | `ai_program_drafts_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text])))` |
| `ai_usage_log` | `ai_usage_log_feature_check` | `CHECK ((feature = ANY (ARRAY['photo'::text, 'voice'::text, 'parse'::text, 'chat'::text, 'plan_build'::text, 'verify'::text])))` |
| `app_users` | `app_users_role_check` | `CHECK ((role = ANY (ARRAY['trainer'::text, 'client'::text])))` |
| `appointments` | `appointments_source_check` | `CHECK ((source = ANY (ARRAY['trainer'::text, 'client'::text, 'gcal_import'::text, 'gcal'::text])))` |
| `appointments` | `appointments_status_check` | `CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled_client'::text, 'cancelled_trainer'::text, 'no_show'::text])))` |
| `cardio_logs` | `cardio_logs_source_check` | `CHECK ((source = ANY (ARRAY['client'::text, 'trainer_backfill'::text, 'claude'::text, 'migration'::text])))` |
| `client_app_settings` | `client_app_settings_theme_check` | `CHECK ((theme = ANY (ARRAY['steel_sky'::text, 'arctic_teal'::text, 'slate_emerald'::text, 'platinum_indigo'::text, 'warm_gold'::text, 'midnight_navy'::text, 'obsidian_gold'::text, 'carbon_crimson'::text, 'deep_space'::text, 'iron_ember'::text])))` |
| `client_assessments` | `client_assessments_status_check` | `CHECK ((status = ANY (ARRAY['pending_signup'::text, 'active'::text, 'declined'::text])))` |
| `client_assessments` | `client_assessments_stress_level_check` | `CHECK (((stress_level >= 1) AND (stress_level <= 10)))` |
| `client_training_patterns` | `client_training_patterns_weekday_check` | `CHECK (((weekday >= 0) AND (weekday <= 6)))` |
| `clients` | `clients_billing_type_check` | `CHECK ((billing_type = ANY (ARRAY['per_session'::text, 'flat'::text, 'none'::text])))` |
| `clients` | `clients_training_frequency_check` | `CHECK (((training_frequency >= 1) AND (training_frequency <= 6)))` |
| `daily_logs` | `daily_logs_source_check` | `CHECK ((source = ANY (ARRAY['client'::text, 'trainer_backfill'::text, 'claude'::text, 'migration'::text])))` |
| `exercises` | `exercises_availability_status_check` | `CHECK ((availability_status = ANY (ARRAY['available'::text, 'confirm_equipment'::text, 'excluded'::text])))` |
| `exercises` | `exercises_modality_check` | `CHECK ((modality = ANY (ARRAY['powerlifting'::text, 'bodybuilding'::text, 'functional/athletic'::text, 'conditioning'::text, 'mobility'::text])))` |
| `food_catalog` | `food_catalog_source_check` | `CHECK ((source = ANY (ARRAY['usda'::text, 'off'::text, 'brand'::text, 'restaurant'::text, 'community'::text, 'client'::text])))` |
| `foods` | `foods_source_check` | `CHECK ((source = ANY (ARRAY['seed'::text, 'ai'::text, 'trainer'::text, 'client'::text, 'claude'::text])))` |
| `group_challenges` | `group_challenges_dates_check` | `CHECK ((ends_on >= starts_on))` |
| `group_challenges` | `group_challenges_metric_check` | `CHECK ((metric = ANY (ARRAY['sessions'::text, 'logging'::text])))` |
| `integrity_checks` | `integrity_checks_severity_check` | `CHECK ((severity = ANY (ARRAY['critical'::text, 'warn'::text, 'info'::text])))` |
| `meal_adherence_logs` | `meal_adherence_logs_adherence_check` | `CHECK ((adherence = ANY (ARRAY['Full'::text, '3/4'::text, '1/2'::text, '1/4'::text, 'Partial'::text, 'Off-plan'::text, 'Skipped'::text])))` |
| `meal_adherence_logs` | `meal_adherence_logs_source_check` | `CHECK ((source = ANY (ARRAY['client'::text, 'trainer_backfill'::text, 'claude'::text, 'migration'::text])))` |
| `meal_items` | `meal_items_basis_check` | `CHECK ((basis = ANY (ARRAY['cooked'::text, 'raw'::text])))` |
| `meal_plans` | `meal_plans_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'live'::text, 'archived'::text])))` |
| `message_reactions` | `message_reactions_allowed` | `CHECK ((emoji = ANY (ARRAY['👊'::text, '💪'::text, '🔥'::text, '👏'::text, '❤️'::text, '😂'::text])))` |
| `metrics` | `metrics_source_check` | `CHECK ((source = ANY (ARRAY['client'::text, 'trainer_backfill'::text, 'claude'::text, 'migration'::text, 'smart_scale'::text, 'InBody'::text, 'caliper'::text])))` |
| `offplan_workout_logs` | `offplan_workout_logs_status_check` | `CHECK ((status = ANY (ARRAY['pending'::text, 'rolled_up'::text])))` |
| `payment_reminders` | `payment_reminders_notification_status_check` | `CHECK ((notification_status = ANY (ARRAY['pending'::text, 'awaiting_approval'::text, 'approved'::text, 'sent'::text, 'skipped'::text, 'paused'::text, 'paid'::text])))` |
| `prescribed_exercises` | `prescribed_exercises_volume_type_check` | `CHECK ((volume_type = ANY (ARRAY['reps'::text, 'rep_range'::text, 'duration'::text, 'distance'::text, 'hold_pattern'::text])))` |
| `programs` | `programs_category_check` | `CHECK ((category = ANY (ARRAY['corrective track'::text, 'training layer'::text, 'split'::text, 'maintenance'::text])))` |
| `programs` | `programs_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'live'::text, 'archived'::text])))` |
| `programs` | `programs_structure_type_check` | `CHECK ((structure_type = ANY (ARRAY['phased-corrective'::text, 'phased-split'::text, 'level-based'::text, 'single-session'::text])))` |
| `progression_events` | `progression_events_event_type_check` | `CHECK ((event_type = ANY (ARRAY['phase up'::text, 'regression'::text, 'swap'::text, 'hold'::text, 'refer out'::text])))` |
| `published_workouts` | `published_workouts_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))` |
| `published_workouts` | `published_workouts_visibility_check` | `CHECK ((visibility = ANY (ARRAY['all_clients'::text, 'assigned'::text])))` |
| `reminders` | `reminders_type_check` | `CHECK ((type = ANY (ARRAY['weigh_in_weekly'::text, 'body_fat_monthly'::text, 'custom'::text])))` |
| `schedule_change_proposals` | `schedule_change_proposals_confidence_check` | `CHECK ((confidence = ANY (ARRAY['one_off'::text, 'pattern'::text])))` |
| `schedule_change_proposals` | `schedule_change_proposals_reason_check` | `CHECK ((reason = ANY (ARRAY['moved'::text, 'cancelled'::text, 'uncovered'::text, 'orphaned'::text, 'pattern_shift'::text, 'retired'::text])))` |
| `schedule_change_proposals` | `schedule_change_proposals_status_check` | `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])))` |
| `schedule_generation_log` | `schedule_generation_log_action_check` | `CHECK ((action = ANY (ARRAY['inserted'::text, 'skipped_existing'::text, 'skipped_no_assignment'::text])))` |
| `scheduled_workouts` | `scheduled_workouts_source_check` | `CHECK ((source = ANY (ARRAY['trainer'::text, 'client_self_assign'::text, 'claude'::text, 'migration'::text])))` |
| `scheduled_workouts` | `scheduled_workouts_status_check` | `CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'skipped'::text, 'moved'::text])))` |
| `sections` | `sections_client_facing_name_check` | `CHECK ((client_facing_name = ANY (ARRAY['Warm-Up'::text, 'Strength'::text, 'Accessory'::text, 'Cardio'::text])))` |
| `sections` | `sections_internal_name_check` | `CHECK ((internal_name = ANY (ARRAY['Inhibit'::text, 'Lengthen'::text, 'Activate'::text, 'Integrate'::text, 'Corrective Warm-Up'::text, 'Primary Strength'::text, 'Accessory Strength'::text, 'Cardio'::text])))` |
| `session_notes` | `session_notes_note_type_check` | `CHECK ((note_type = ANY (ARRAY['workout'::text, 'assessment'::text, 'general'::text, 'regression'::text, 'progression'::text, 'concern'::text])))` |
| `set_logs` | `set_logs_rpe_check` | `CHECK (((rpe >= (0)::numeric) AND (rpe <= (10)::numeric)))` |
| `trainer_settings` | `trainer_settings_theme_check` | `CHECK ((theme = ANY (ARRAY['steel_sky'::text, 'arctic_teal'::text, 'slate_emerald'::text, 'platinum_indigo'::text, 'warm_gold'::text, 'midnight_navy'::text, 'obsidian_gold'::text, 'carbon_crimson'::text, 'deep_space'::text, 'iron_ember'::text])))` |
| `workout_logs` | `workout_logs_source_check` | `CHECK ((source = ANY (ARRAY['client'::text, 'trainer_backfill'::text, 'claude'::text, 'migration'::text])))` |
| `workout_logs` | `workout_logs_status_check` | `CHECK ((status = ANY (ARRAY['Done as planned'::text, 'Modified'::text, 'Partial'::text, 'Skipped'::text, 'Rest day'::text])))` |

### Which values are actually in use (2026-07-31)

Useful for telling a live vocabulary from an aspirational one.

| Column | Distribution |
|---|---|
| `scheduled_workouts.status` | `scheduled` 2,608 · `completed` 562 · `skipped` 8 · **`moved` 0** · NULL 0 |
| `scheduled_workouts.source` | `claude` 2,011 · `migration` 721 · `trainer` 415 · `client_self_assign` 31 |
| `scheduled_workouts.deleted_at` | live 3,141 · soft-deleted 37 |
| `workout_logs.status` | `Done as planned` 833 · NULL 3 · **`Modified` / `Partial` / `Skipped` / `Rest day` all 0** |
| `workout_logs.source` | `client` 448 · `migration` 289 · `trainer_backfill` 93 · `claude` 6 |
| `appointments.status` | `scheduled` 4,726 · `cancelled_client` 148 · **`completed` / `cancelled_trainer` / `no_show` all 0** |
| `appointments.source` | `gcal` 4,874 (100%) · **`trainer` / `client` / `gcal_import` all 0** |
| `meal_adherence_logs.adherence` | `Off-plan` 675 · `Full` 657 · `Skipped` 71 · `Partial` 32 · `3/4` 7 · `1/2` 4 · **`1/4` 0** · NULL 0 |
| `meal_plans.status` | `pending` 25 · `live` 17 · `archived` 12 · **`draft` 0** |
| `schedule_change_proposals.status` | `pending` 72 · `approved` 6 · `superseded` 6 · `rejected` 2 |
| `schedule_change_proposals.reason` | `uncovered` 50 · `orphaned` 16 · `moved` 8 · `retired` 8 · `cancelled` 4 · **`pattern_shift` 0** |
| `payment_reminders.notification_status` | `paid` 19 · `pending` 17 · `sent` 4 · **`awaiting_approval` / `approved` / `skipped` / `paused` all 0** |
| `clients.billing_type` | `per_session` 28 · `flat` 4 · `none` 4 · NULL 0 |

> ⚠️ **`appointments.status` never becomes `completed`.** All 4,874 rows are `scheduled` or `cancelled_client`, including thousands of past dates. Any logic keyed on `appointments.status = 'completed'` is dead code, and `v_plan_vs_actual`'s `n_appointments_live` counts every past appointment as still live.
> ⚠️ **`workout_logs.status` is effectively a constant.** 833 of 836 rows say `Done as planned` — most of them written by the nightly auto-close cron job, which hard-codes that value. It carries no information; use `completed` and `set_logs` instead.
> ⚠️ **`scheduled_workouts.status = 'moved'` is never used**, even though `v_plan_vs_actual` and `resolve_schedule_proposal` both branch on it. Moves are recorded via `moved_from_date` only.
> ⚠️ **72 of 86 schedule change proposals are still `pending`** — 50 of them `uncovered` (a booked session with nothing programmed). The human-in-the-loop queue is not being worked.
> ⚠️ Only 17 clients (of 36) have a `live` meal plan while 25 plans sit at `pending`; combined with three overlapping nightly flip jobs, plans may not be promoting.

---

## Appendix B — indexes

143 indexes across `public`. They are listed per table in the reference section above. Tables carrying **no index other than the primary key**, in descending row order:

| Table | Rows | Missing index |
|---|---:|---|
| `prescribed_exercises` | 9,167 | `section_id`, `exercise_id` |
| `sections` | 2,975 | `day_id` |
| `meal_adherence_logs` | 1,446 | (covered by the `(client_id, log_date, meal_position)` unique key) |
| `meal_items` | 1,316 | `meal_id` |
| `meals` | 409 | `meal_plan_id` |
| `daily_logs` | 319 | `client_id`, `log_date` |
| `phases` | 122 | `program_id` |
| `meal_plans` | 54 | `client_id` |
| `macro_targets` | 41 | `client_id` |
| `cardio_logs` | 40 | `client_id` |
| `skinfold_logs` | 16 | `client_id` |
| `offplan_workout_logs` | 13 | `client_id` |
| `app_feedback` | 88 | `status`, `created_at` |

---

*End of data dictionary. Regenerate from the live database whenever the schema changes — there is no migration history to fall back on.*
