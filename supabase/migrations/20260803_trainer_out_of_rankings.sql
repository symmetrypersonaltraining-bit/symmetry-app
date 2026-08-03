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
