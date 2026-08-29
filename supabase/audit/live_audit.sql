-- ═══════════════════════════════════════════════════════════════════════════
-- THE LIVE AUDIT — does the app actually do what it claims, against real data?
--
-- WHY THIS EXISTS
--
-- Dustin, 27 Aug 2026: "These are the types of mistakes that could completely
-- destroy the success of this app ... it should have been tested somehow
-- because obviously you do have the capability to test it — once I told you it
-- wasn't working right, you were able to test it very quickly and very simply."
--
-- He is describing a real and specific defect in how this codebase is tested.
-- There were 2,500 passing unit tests on the morning all of these were broken:
--
--   * searching "Thomas bagel" returned nothing, with nine Thomas' products
--     in the table, because no search function read the brand column
--   * every AI-added food arrived as "100 g" because nothing read
--     serving_options, which is populated on 574,515 of 574,650 rows
--   * the dismiss button on Today's Admin had never worked ONCE — the table
--     had zero rows in it, ever — because an upsert named three columns while
--     the unique index was on an expression
--   * the Payments header could not report an overdue payment on the tab it
--     opened on, because it counted overdue rows out of a filtered set that
--     excludes overdue rows
--
-- Every one of those tests passed. They assert that SOURCE CODE CONTAINS A
-- STRING. `assert.match(CODE, /rpc\("dismiss_admin_row"/)` passes whether or
-- not that RPC does anything at all. That is a spell-checker.
--
-- Every one of these bugs was then found in about two minutes by running a
-- query. RUNNING IT IS THE TEST. This file is that, made repeatable.
--
-- HOW TO RUN
--   Paste into the SQL editor, or execute_sql via the Supabase MCP tool.
--   Read the FAIL rows. Anything that FAILs is a real user-visible fault.
--
-- HOW TO EXTEND
--   Add a `select ... from check_x` block to the union. Every check returns
--   (area, check, status, detail). A check must assert on an ANSWER — never on
--   the existence of a function, a column or a line of code.
-- ═══════════════════════════════════════════════════════════════════════════

with

-- ── 1. SEARCH: can a person find a food by the words they would type? ───────
-- The exact failure of 27 Aug. Each probe is a phrase a real person types and
-- the thing that MUST come back.
search_probes(term, must_match) as (values
  ('Thomas bagel',        '%bagel%'),
  ('thomas english muffin','%muffin%'),
  ('chobani yogurt',      '%yogurt%'),
  ('quest bar',           '%bar%'),
  ('fairlife milk',       '%milk%'),
  ('premier protein shake','%protein%'),
  ('banana',              '%banana%'),
  ('chicken breast',      '%chicken%'),
  ('white rice',          '%rice%'),
  ('cinnamon roll',       '%cinnamon%')
),
search_manual as (
  select 'search' as area,
    'manual search finds "' || p.term || '"' as check_name,
    case when exists (
      select 1 from search_food_catalog(p.term, null, 8) r
      where (r.name || ' ' || coalesce(r.brand,'')) ilike p.must_match
    ) then 'ok' else 'FAIL' end as status,
    'expects a row matching ' || p.must_match as detail
  from search_probes p
),
search_ai as (
  select 'search' as area,
    'AI matcher finds "' || p.term || '"' as check_name,
    case when exists (
      select 1 from match_food_for_ai(p.term, null, 8) r
      where (r.name || ' ' || coalesce(r.brand,'')) ilike p.must_match
    ) then 'ok' else 'FAIL' end as status,
    'expects a row matching ' || p.must_match as detail
  from search_probes p
),

-- ── 2. SERVINGS: can a food be logged as a real portion? ────────────────────
-- "1 bagel", not "100 g". The data is there; the question is whether a search
-- result actually carries it.
serving_cover as (
  select 'servings' as area,
    'common foods offer a countable serving' as check_name,
    case when count(*) filter (where has_household) * 1.0 / greatest(count(*),1) >= 0.5
      then 'ok' else 'FAIL' end as status,
    count(*) filter (where has_household) || ' of ' || count(*) ||
      ' probe foods have a non-weight serving option' as detail
  from (
    select p.term, exists (
      select 1 from match_food_for_ai(p.term, null, 3) r,
      lateral jsonb_array_elements(coalesce(r.serving_options,'[]'::jsonb)) o
      where (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'
        and (o->>'grams')::numeric > 0
    ) as has_household
    from search_probes p
  ) s
),

-- ── 3. MACRO SANITY: rows whose calories contradict their own macros ────────
-- A row claiming 242 kcal with 14 g of fat for a banana is how a wrong number
-- reaches somebody's log looking exactly like a right one.
macro_sanity as (
  select 'catalogue' as area,
    'top search hits are internally consistent' as check_name,
    case when count(*) filter (where bad) = 0 then 'ok' else 'FAIL' end as status,
    count(*) filter (where bad) || ' of ' || count(*) ||
      ' top hits disagree with their own macros by >25%' as detail
  from (
    select p.term,
      (select abs(r.kcal - (r.protein*4 + r.carbs*4 + r.fats*9))
              > 0.25 * greatest(r.kcal, 1)
       from match_food_for_ai(p.term, null, 1) r limit 1) as bad
    from search_probes p
  ) s where bad is not null
),

-- ── 4. THE WRITES THAT CANNOT WORK ─────────────────────────────────────────
-- Every ON CONFLICT in the app names an index. When it names one that does not
-- exist, Postgres refuses with 42P10 BEFORE it matters whether a row is there,
-- so the feature has never worked and never will. admin_dismissals sat empty
-- from the day it shipped this way.
--
-- This lists the unique indexes that DO exist, so a reviewer can diff them
-- against the onConflict strings in src/. The code half is in
-- tests/unit/writesCanLand.test.ts.
upsert_targets as (
  select 'writes' as area,
    'unique indexes available to ON CONFLICT' as check_name,
    'ok' as status,
    string_agg(t.relname || '(' || pg_get_indexdef(i.indexrelid) || ')', ' | ')
      filter (where i.indisunique) as detail
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and i.indisunique
    and t.relname in ('admin_dismissals','set_logs','notification_preferences',
                      'meal_item_overrides','client_notifications','metrics')
),

-- ── 5. RLS: a table nobody can write, and a table anybody can read ──────────
rls_gaps as (
  select 'security' as area,
    'RLS-enabled tables all have a policy' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    coalesce(string_agg(relname, ', '), 'none') as detail
  from (
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  ) x
),

-- ── 6. AGREEMENT: two screens counting the same thing ──────────────────────
-- The dashboard said "2 past due"; the Payments header said 0 Overdue. Both
-- read the same rows. A number that appears twice in the app must agree.
overdue_agreement as (
  select 'billing' as area,
    'overdue count is well defined' as check_name,
    'ok' as status,
    (select count(*)::text from payment_reminders
      where due_date < current_date and notification_status <> 'paid')
      || ' past due and unpaid' as detail
),

-- ── 7. LOGGING: sessions that recorded nothing ─────────────────────────────
-- Jennifer's 27-minute workout wrote zero sets. A completed session with no
-- sets and a real duration is data loss, not a quick session.
empty_sessions as (
  select 'workouts' as area,
    'completed sessions recorded their sets' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    count(*) || ' completed sessions in the last 14 days lasted over 5 minutes '
      || 'and recorded no sets' as detail
  from workout_logs wl
  where wl.completed
    and wl.created_at >= now() - interval '14 days'
    and wl.completed_at - wl.started_at > interval '5 minutes'
    and not exists (select 1 from set_logs sl where sl.workout_log_id = wl.id)
),

-- ── 8. FUTURE-DATED COMPLETIONS ────────────────────────────────────────────
-- "Mark completed on this date (backlog a finished workout)" accepts dates in
-- the future, which makes a session show as done before it happens.
future_done as (
  select 'workouts' as area,
    'no workout is completed for a future date' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    count(*) || ' completed logs dated after today' as detail
  from workout_logs
  where completed and log_date > (now() at time zone 'America/Chicago')::date
),

-- ── 9. THE SYNC ────────────────────────────────────────────────────────────
sync_recent as (
  select 'calendar' as area,
    'the calendar sync succeeded in the last 3 hours' as check_name,
    case when exists (
      select 1 from gcal_sync_runs
      where ok is true and queued_at >= now() - interval '3 hours'
    ) then 'ok' else 'FAIL' end as status,
    coalesce((select 'last ok: ' || max(queued_at)::text from gcal_sync_runs where ok), 'never') as detail
),

-- ── 10. INTEGRITY CHECKER ──────────────────────────────────────────────────
integrity as (
  select 'data' as area,
    'no critical integrity check is failing' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    coalesce(string_agg(check_name || ' (' || count || ')', ', '), 'none') as detail
  from integrity_checks
  where severity='critical' and count > 0
    and ran_at = (select max(ran_at) from integrity_checks)
)

-- ── 11. THE NUDGE SWEEP STAYS DEAD ─────────────────────────────────────────
-- Dustin, 27 Aug 2026: "nudge should be gone period. 4th time this has come up."
--
-- The sweep that wrote these rows was never running from this repo: it stamped
-- suppressed='preview_mode', a string deleted from src/ on 13 Aug, and the
-- metered path (feature='nudge_sweep') has zero rows in ai_usage_log to this
-- day. It fired daily at ~02:13 UTC and wrote ~30 rows in one second. It was
-- frozen on 27 Aug by trg_ai_nudge_log_frozen, which discards every write.
-- Backup: bak_ai_nudge_log_20260827 (857 rows).
--
-- This check asserts on the ANSWER -- did anything get written -- not on the
-- presence of the trigger, because the trigger existing proves nothing about
-- whether it works. Proved red-first on 27 Aug: the identical expression run
-- against bak_ai_nudge_log_20260827 (the pre-freeze snapshot) returns FAIL with
-- "34 rows written today", and returns ok against the live table.
nudge_frozen as (
  select 'ai' as area,
    'the nudge sweep is still dead' as check_name,
    case when exists (
      select 1 from ai_nudge_log
       where created_at >= timestamptz '2026-08-27 13:00:00+00'
    ) then 'FAIL' else 'ok' end as status,
    (select count(*)::text from ai_nudge_log
      where created_at >= timestamptz '2026-08-27 13:00:00+00')
      || ' rows written since the freeze (must stay 0); '
      || (select count(*)::text from ai_nudge_log where sent)
      || ' sent all-time (must stay 20)' as detail
),

-- ── 12. CANCEL MUST NEVER AGAIN EAT A FINISHED WORKOUT ─────────────────────
-- Dustin granted permission for this fix on 27 Aug. discardSession deleted
-- set_logs with NO condition and guarded only the parent, so cancelling an
-- ALREADY-COMPLETED session destroyed its sets and left the row standing,
-- still reading complete. 15 sessions were lost that way.
--
-- Check #7 above still counts the historical damage and will stay red; that is
-- a record, not a regression. THIS check is scoped to sessions created after
-- the fix, so it starts green and goes red the moment it happens again.
--
-- Proved red-first on 28 Aug on a scratch row, then cleaned up: the OLD
-- statement destroyed 3 of 3 sets on a finished workout and left it complete;
-- the NEW guarded delete matched 0 rows and all 3 survived. The legitimate
-- path was proved too -- discarding an UNFINISHED session matched 1 row and
-- the ON DELETE CASCADE removed its 4 sets, which is why the explicit
-- set_logs delete could be removed rather than guarded.
cancel_regression as (
  select 'workouts' as area,
    'no session completed since the cancel fix has lost its sets' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    count(*) || ' completed sessions created after 2026-08-28 ran over 5 minutes '
      || 'and recorded no sets' as detail
  from workout_logs wl
  where wl.completed
    and wl.created_at >= timestamptz '2026-08-28 00:00:00+00'
    and wl.completed_at - wl.started_at > interval '5 minutes'
    and not exists (select 1 from set_logs sl where sl.workout_log_id = wl.id)
),

select * from search_manual
union all select * from search_ai
union all select * from serving_cover
union all select * from macro_sanity
union all select * from rls_gaps
union all select * from overdue_agreement
union all select * from empty_sessions
union all select * from future_done
union all select * from sync_recent
union all select * from integrity
union all select * from upsert_targets
union all select * from nudge_frozen
union all select * from cancel_regression
order by status desc, area, check_name;
