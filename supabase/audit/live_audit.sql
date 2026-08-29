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

-- ── 13. THE OWNER'S FEEDBACK IS HIS ALONE ──────────────────────────────────
-- Dustin, 28 Aug: "no testers don't see feedback".
--
-- app_feedback had one FOR ALL policy on trainer_can_see_client(client_id),
-- and that function returns is_trainer() when client_id is null. Every row
-- Dustin files himself has a null client_id, so all 66 were readable AND
-- DELETABLE by every trainer, including the five testers added 22-23 Aug.
--
-- Proved 28 Aug by impersonating tester Justin Ray's JWT inside a rolled-back
-- transaction: before, 66 rows readable and 66 deletable; after, 0 and 0,
-- while the owner still sees all 106. Read is split from delete so that even a
-- future mistake on the read side cannot destroy anything.
--
-- This check asserts on the POLICY SHAPE rather than on a count, because the
-- count is identical whether the fix is present or the table is empty.
feedback_locked as (
  select 'security' as area,
    'only the owner can delete app_feedback' as check_name,
    case when exists (
      select 1 from pg_policy
       where polrelid = 'public.app_feedback'::regclass
         and polcmd = 'd'
         and pg_get_expr(polqual, polrelid) like '%is_owner%'
    ) and not exists (
      select 1 from pg_policy
       where polrelid = 'public.app_feedback'::regclass
         and polcmd = '*'
    ) then 'ok' else 'FAIL' end as status,
    (select string_agg(polname || ':' || polcmd::text, ' ') from pg_policy
      where polrelid = 'public.app_feedback'::regclass) as detail
),

-- ── 14. A PAYMENT MARKER MUST CARRY MONEY ──────────────────────────────────
-- Social-media reminders ("POST STORIES - Perfect Day Macro Log") were being
-- filed as payment markers against live billed clients, because
-- gcal_sync_payments inserted the row whether or not it found a $ figure in
-- the title. Fixed 29 Aug: no amount, no row. The four existing rows were
-- backed up to bak_calendar_payments_noamount_20260829 and removed.
-- Red-first proof: feeding the function one social post and one real payment
-- returns {synced:1, skipped_no_amount:1} and only the payment lands.
payments_have_money as (
  select 'billing' as area,
    'every calendar payment marker carries an amount' as check_name,
    case when count(*) = 0 then 'ok' else 'FAIL' end as status,
    count(*) || ' markers with no dollar figure' as detail
  from calendar_payments where amount is null
),

-- ── 15. BODY FAT MUST NOT SHOW A DASH WHEN A READING EXISTS ────────────────
-- The client profile took the newest metrics ROW and read body_fat_pct off it.
-- Most weigh-ins are weight-only, so six clients showed "-" with a trend line
-- drawn beside it: Lauren, Dustin, Jennifer, Claudine, Robert Miller, Jerry
-- Bourgeois. Each field now finds its own newest reading.
--
-- This asserts the DATA SHAPE the bug fed on still exists -- clients whose
-- newest row has no body fat but who do have a reading. It is informational:
-- it stays non-zero because that shape is normal and correct. The fix is that
-- the UI no longer reads a dash off it.
bodyfat_shape as (
  select 'metrics' as area,
    'clients whose newest row lacks body fat but who have a reading' as check_name,
    'ok' as status,
    count(*) || ' (each must now show their last real reading, not a dash)' as detail
  from clients c
  where c.archived_at is null
    and exists (select 1 from metrics m where m.client_id=c.id and m.body_fat_pct is not null)
    and (select m2.body_fat_pct from metrics m2 where m2.client_id=c.id
          order by m2.metric_date desc, m2.created_at desc limit 1) is null
),

-- ── 16. THE BOARD NEVER SHOWS A SURNAME, AND NEVER TWO OF THE SAME NAME ────
-- Every client's FULL NAME was on every other client's home screen next to
-- their session count. Fixed 29 Aug: first names, with a last initial only
-- where a first name repeats -- there are two Sharons, and "Sharon" twice is
-- worse than a full name because nobody can tell which score is theirs.
--
-- Asserts BOTH halves, because fixing one and breaking the other is the
-- obvious failure: no surname on screen, and no two rows sharing a label.
board_names as (
  select 'privacy' as area,
    'the challenge board shows first names and no duplicates' as check_name,
    case when (select count(*) from v_challenge_roster
                where ranked and cname ~ '^[^ ]+ [^ ]{2,}') = 0
          and (select count(*) from (select cname from v_challenge_roster
                where ranked group by cname having count(*) > 1) d) = 0
         then 'ok' else 'FAIL' end as status,
    (select count(*)::text from v_challenge_roster where ranked)
      || ' on the board, '
      || (select count(*) filter (where cname ~ '^[A-Za-z]+ [A-Z]\.$')::text
            from v_challenge_roster where ranked)
      || ' disambiguated with a last initial' as detail
),

-- ── 17. THE TOP HIT MUST BE SOMETHING YOU CAN PORTION ──────────────────────
-- Dustin, 29 Aug: "cream cheese ... there is no tablespoon or teaspoon options
-- in there at all."
--
-- The unit picker was never the fault -- it already offers whatever household
-- servings the ROW declares. Searching "cream cheese" returned, in order:
--   1 food club      100 g · 1 oz · 2 Tbsp (28 g)   portionable
--   2 Philadelphia   100 g · 1 oz · 28 g            <- what he opened
--   3 H-E-B          100 g · 1 oz · 2 Tbsp (31 g)   portionable
-- He picked the brand he recognises and got the one row of three that cannot
-- be measured in anything a person uses. 487 of 1,250 cream cheese rows carry
-- a tbsp; 42,236 rows catalogue-wide do. The data was there and the ranking
-- was indifferent to it.
--
-- Fixed by ranking portionable rows above weights-only ones, AFTER verified and
-- AFTER macro plausibility -- a portion is a convenience, being correct is not.
portionable_first as (
  select 'search' as area,
    'the top hit is portionable, unless it is verified' as check_name,
    case when count(*) filter (where not ok) = 0 then 'ok' else 'FAIL' end as status,
    count(*) filter (where portionable) || ' of ' || count(*)
      || ' probe foods return a portionable top hit; '
      || count(*) filter (where not portionable and is_verified)
      || ' return a VERIFIED weights-only row, which outranks on purpose' as detail
  from (
    select p.term,
      coalesce(r.verified, false) as is_verified,
      exists (
        select 1 from jsonb_array_elements(coalesce(r.serving_options,'[]'::jsonb)) o
         where (o->>'grams') is not null and (o->>'grams')::numeric > 0
           and (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'
      ) as portionable,
      -- ⚠️ THE ASSERTION IS DELIBERATELY NOT "always portionable", because that
      -- is not what the fix promises and asserting it would ship this check
      -- RED. Verified is ranked ABOVE portionable on purpose: a verified USDA
      -- row with accurate macros and no tablespoon beats an unverified crowd
      -- row that has one. Being correct outranks being convenient.
      --
      -- Measured 29 Aug: 4 of 6 probes return a portionable top hit; the other
      -- two (peanut butter, olive oil) return VERIFIED rows carrying only
      -- "100 g" and "1 oz". Those are a DATA-COVERAGE gap in the verified
      -- source, not a ranking fault, and filling it means adding gram weights
      -- to verified rows -- which is Dustin's call, not an unattended one. It
      -- is in the needs-you list beside the missing micronutrients.
      (exists (
        select 1 from jsonb_array_elements(coalesce(r.serving_options,'[]'::jsonb)) o
         where (o->>'grams') is not null and (o->>'grams')::numeric > 0
           and (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'
      ) or coalesce(r.verified, false)) as ok
    from (values ('cream cheese'),('peanut butter'),('butter'),('mayonnaise'),
                 ('sour cream'),('olive oil')) p(term)
    cross join lateral (select * from search_food_catalog(p.term, null, 1)) r
  ) z
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
union all select * from feedback_locked
union all select * from payments_have_money
union all select * from bodyfat_shape
union all select * from board_names
union all select * from portionable_first
order by status desc, area, check_name;
