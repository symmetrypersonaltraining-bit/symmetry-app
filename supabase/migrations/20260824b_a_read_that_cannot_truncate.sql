-- A READ THAT CANNOT TRUNCATE.
--
-- Dustin, 24 Aug, 8:04am, looking at "Programming running out — 9" listing
-- clients he had just programmed into October: "major issue here. we just
-- programmed through i think sept, maybe firther?? where the hell did that
-- progrsmking go!?"
--
-- Nothing had gone anywhere. Every one of those nine had 20 to 112 scheduled
-- workouts past the horizon, all of them visible to him through RLS. The
-- DASHBOARD was wrong.
--
-- PostgREST caps a read at 1,000 rows no matter what .limit() asks for. The
-- coverage check fetched every scheduled_workout past the horizon and worked
-- out the answer in the browser; on 24 Aug that was 1,611 rows, so 611 of them
-- never arrived and the clients they belonged to looked unprogrammed.
--
-- Proven rather than assumed: taking the first 1,000 rows of that exact query
-- and asking which clients fall out returns EXACTLY the nine names on his
-- screen.
--
-- This has happened before on the same line. The previous fix was to raise
-- .limit() to 20,000 — which works right up until the roster grows past the
-- server's ceiling again, which is precisely what happened. Raising a number
-- that the server ignores is not a fix. The question has to be asked where the
-- data is.
--
-- Then I went looking for the same SHAPE elsewhere and found two more already
-- over the line:
--
--   * TrainerWeekDigest's "ever logs food" — 1,829 rows in its window, so
--     clients who log every day were being treated as never-loggers, which
--     silently changes the weekly focus suggestions they are given.
--   * /settings/ai-health — 1,365 rows in its window. The page whose entire
--     job is to tell a working AI surface from a dead one was computing
--     "never used" and "last worked" from a truncated log.
--
-- All three now return one row per THING rather than every row that went into
-- it. None of them can truncate, whatever the roster grows to.

-- One row per client, however many workouts each of them has.
-- security invoker: RLS on clients and scheduled_workouts still applies, so a
-- trainer sees their own roster and the owner sees everyone.
create or replace function public.programming_coverage()
returns table (client_id uuid, client_name text, last_date date, days_left int)
language sql stable security invoker set search_path to 'public'
as $$
  select c.id,
         c.name,
         max(sw.scheduled_date) filter (where sw.deleted_at is null) as last_date,
         -- -1 for a client with nothing scheduled at all, so they sort to the
         -- top of the list rather than looking like the healthiest entry.
         coalesce(
           max(sw.scheduled_date) filter (where sw.deleted_at is null)
             - (now() at time zone 'America/Chicago')::date,
           -1
         )::int as days_left
    from public.clients c
    left join public.scheduled_workouts sw on sw.client_id = c.id
   where c.archived_at is null
     -- Nutrition-only clients have no programming BY DESIGN.
     and coalesce(c.nutrition_only, false) = false
     -- And a coach does not programme themselves. Five of the fourteen names
     -- on 24 Aug were trainers' own self-coached rows.
     and coalesce(c.is_self_coached, false) = false
   group by c.id, c.name;
$$;
revoke all on function public.programming_coverage() from public, anon;
grant execute on function public.programming_coverage() to authenticated;

-- Distinct clients, not 1,829 adherence rows.
create or replace function public.clients_logging_food(p_since date)
returns table (client_id uuid)
language sql stable security invoker set search_path to 'public'
as $$
  select distinct m.client_id from public.meal_adherence_logs m
   where m.adherence is not null
     and m.adherence <> 'Skipped'   -- a Skipped-only history is not food logging
     and m.log_date >= p_since;
$$;
revoke all on function public.clients_logging_food(date) from public, anon;
grant execute on function public.clients_logging_food(date) to authenticated;

-- One row per AI feature, not 5,000 log lines.
-- security definer because ai_usage_log is not readable by a trainer directly;
-- p_trainer is how the caller scopes it, and the page passes null only for the
-- owner.
create or replace function public.ai_feature_health(p_since timestamptz, p_trainer uuid default null)
returns table (
  feature text, calls bigint, failures bigint, recent_failed bigint,
  last_ok timestamptz, last_error_at timestamptz, last_error_text text,
  model text, usd numeric, median_ms int, month_usd numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with scoped as (
    select * from public.ai_usage_log l
     where l.created_at >= p_since
       and (p_trainer is null or l.trainer_id = p_trainer)
  ),
  recent as (
    select feature, status,
           row_number() over (partition by feature order by created_at desc) as rn
      from scoped
  )
  select s.feature,
         count(*)::bigint,
         count(*) filter (where s.status = 'error')::bigint,
         -- "Recently" = the last ten calls. A surface that failed twice in
         -- March and has worked every day since is not failing.
         (select count(*) from recent r where r.feature = s.feature and r.rn <= 10 and r.status = 'error')::bigint,
         max(s.created_at) filter (where s.status is distinct from 'error'),
         max(s.created_at) filter (where s.status = 'error'),
         (array_agg(s.error order by s.created_at desc) filter (where s.status = 'error'))[1],
         (array_agg(s.model order by s.created_at desc) filter (where s.status is distinct from 'error'))[1],
         round(coalesce(sum(s.cost_usd), 0)::numeric, 4),
         percentile_disc(0.5) within group (order by s.latency_ms)
           filter (where s.status is distinct from 'error' and s.latency_ms is not null)::int,
         round(coalesce(sum(s.cost_usd) filter (where s.created_at >= date_trunc('month', now())), 0)::numeric, 4)
    from scoped s
   group by s.feature;
$$;
revoke all on function public.ai_feature_health(timestamptz, uuid) from public, anon;
grant execute on function public.ai_feature_health(timestamptz, uuid) to authenticated;
