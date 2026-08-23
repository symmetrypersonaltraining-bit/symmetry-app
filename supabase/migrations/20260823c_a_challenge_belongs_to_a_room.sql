-- A CHALLENGE BELONGS TO A ROOM.
--
-- Dustin, 23 Aug: "if I have a group chat with challenges and ai bots, and
-- other trainers do not, thats not exactly like mine is it?"
--
-- 20260821g split the group ROOMS per trainer and added group_challenges
-- .trainer_id with a stamping trigger and per-trainer RLS. It stopped there.
-- Everything that READS, SCORES, CLOSES, ANNOUNCES or CREATES a challenge was
-- still written for a world with exactly one, and four of those were actively
-- broken rather than merely unfinished:
--
--   * generate_next_challenge() inserted with no trainer_id. It runs from
--     pg_cron, where auth.uid() is NULL, so the stamping trigger stamped NULL —
--     and read_own_group_challenges requires trainer_id = my_group_trainer_id().
--     Every auto-generated challenge since 21 Aug would have been invisible to
--     every authenticated reader while remaining visible to the service role.
--     The live one ends TODAY, so tonight's 7pm tick was the first to land.
--   * Its two "never two at once" guards were global. Once ANY trainer had a
--     live challenge, no other trainer would ever get an auto-generated one.
--   * announce_challenge_winner() found the coach with
--     `select user_id from trainer_settings limit 1` and posted the winner
--     message with no group_trainer_id — so, like the bots, into the table and
--     onto nobody's screen.
--   * challenge_leaderboard() and challenge_group_total() are SECURITY DEFINER
--     and read v_challenge_roster, which had no trainer column. A client of
--     Brooke's opening the board would have seen Dustin's clients by name.
--
-- close_due_challenge() was not broken, just single-room: `limit 1` scored one
-- gym per hourly tick and left every other room live past its own end date.
--
-- Verified by simulation before shipping: Dustin sees exactly one live
-- challenge, Brooke sees zero (she has none yet — tonight's tick makes her
-- one), the guards refuse a second live challenge in a room that has one, and
-- a null trainer creates nothing.

-- ── the roster knows whose client it is ─────────────────────────────────────
-- Column ORDER matters to CREATE OR REPLACE VIEW, so tid is appended rather
-- than slotted in beside cname.
create or replace view public.v_challenge_roster as
  select c.id as cid, c.name as cname,
         coalesce(c.exclude_from_rankings, false) = false as ranked,
         c.trainer_id as tid
    from public.clients c
   where c.archived_at is null
     and coalesce(lower(btrim(c.email)), '') <> 'demo@symmetrytraining.app'
     and coalesce(lower(c.name), '') not like '%test client%'
     and coalesce(lower(c.name), '') not like '%demo account%';

-- ── a board ranks the room its challenge belongs to ────────────────────────
create or replace function public.challenge_leaderboard(p_challenge_id uuid)
 returns table(rnk integer, client_id uuid, client_name text, score numeric, is_me boolean, joined boolean)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_start date; v_end date; v_metric text; v_trainer uuid;
  v_me uuid := public.my_client_id();
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions'), trainer_id
    into v_start, v_end, v_metric, v_trainer
  from group_challenges where id = p_challenge_id;

  if v_start is null then return; end if;
  -- A challenge with no room ranks nobody. Silence beats naming one trainer's
  -- clients on another's board.
  if v_trainer is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    -- Ranked only, and only this room. Filtered BEFORE rank() so removing the
    -- coach promotes everyone below him rather than leaving a hole at the top.
    select r.cid, r.cname from v_challenge_roster r
     where r.ranked and r.tid = v_trainer
  ),
  all_days as (
    select w.client_id as cid, (w.completed_at at time zone 'America/Chicago')::date as d
      from workout_logs w
     where w.completed_at is not null
       and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date from meal_adherence_logs m
     where v_metric = 'logging' and m.adherence is not null
       and m.log_date between v_start and v_end
  ),
  scores as (
    select r.cid, r.cname, count(distinct a.d)::numeric as sc,
           exists (select 1 from challenge_participants cp
                    where cp.challenge_id = p_challenge_id and cp.client_id = r.cid) as has_joined
      from roster r left join all_days a on a.cid = r.cid
     group by r.cid, r.cname
  )
  select (rank() over (order by sc desc))::int,   -- score ONLY: ties share a place
         cid, cname, sc, (cid = v_me), has_joined
    from scores order by sc desc, cname;
end;
$function$;

-- ── the anonymous total, same room ─────────────────────────────────────────
create or replace function public.challenge_group_total(p_challenge_id uuid)
 returns table(group_total numeric, contributors integer, my_score numeric, joined boolean)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_start date; v_end date; v_metric text; v_trainer uuid;
  v_me uuid := public.my_client_id();
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  select starts_on, ends_on, coalesce(nullif(metric, ''), 'sessions'), trainer_id
    into v_start, v_end, v_metric, v_trainer
  from group_challenges where id = p_challenge_id;
  if v_start is null or v_trainer is null then return; end if;
  v_end := least(v_end, v_today);

  return query
  with roster as (
    -- Everyone in the room, ranked or not: the total names nobody.
    select r.cid from v_challenge_roster r where r.tid = v_trainer
  ),
  all_days as (
    select w.client_id as cid, (w.completed_at at time zone 'America/Chicago')::date as d
      from workout_logs w
     where w.completed_at is not null
       and (w.completed_at at time zone 'America/Chicago')::date between v_start and v_end
    union
    select m.client_id, m.log_date from meal_adherence_logs m
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

-- ── close EVERY room that is due, not one per hour ─────────────────────────
create or replace function public.close_due_challenge()
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_hour int := extract(hour from (now() at time zone 'America/Chicago'))::int;
  v_first uuid; v_winner uuid; v_score numeric; r record;
begin
  -- Due = the end date has passed, or it is the end date and 6pm CT has come.
  -- Returns the FIRST id closed, so the caller's existing "did anything close"
  -- check still reads the same.
  for r in
    select id from group_challenges
     where status = 'live' and scored_at is null
       and (ends_on < v_today or (ends_on = v_today and v_hour >= 18))
     order by ends_on
  loop
    select client_id, score into v_winner, v_score
      from public.challenge_leaderboard(r.id)
     where rnk = 1 order by client_name limit 1;

    -- A challenge nobody scored in has no winner, and inventing one would be
    -- worse than leaving it blank.
    update group_challenges
       set status = 'complete',
           ended_at = coalesce(ended_at, now()),
           scored_at = now(),
           winner_client_id = case when coalesce(v_score, 0) > 0 then v_winner end,
           winner_score = case when coalesce(v_score, 0) > 0 then v_score end
     where id = r.id;

    v_first := coalesce(v_first, r.id);
  end loop;
  return v_first;
end;
$function$;

-- ── announce in the challenge's own room, as that room's coach ─────────────
create or replace function public.announce_challenge_winner(p_challenge_id uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid; v_ch record; v_names text; v_n int; v_body text; v_unit text;
begin
  select * into v_ch from group_challenges where id = p_challenge_id;
  if v_ch.id is null or v_ch.announced_at is not null then return false; end if;
  if v_ch.trainer_id is null then return false; end if;

  select auth_user_id into v_uid from trainers where id = v_ch.trainer_id and active;
  if v_uid is null then return false; end if;

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

  -- group_trainer_id EXPLICITLY. stamp_group_message fills it from auth.uid(),
  -- and pg_cron has none, so this was stamped NULL — and
  -- read_own_group_messages requires NOT NULL. The winner announcement was
  -- landing in the table and being shown to nobody.
  insert into messages (from_id, to_id, body, is_group, is_broadcast, group_trainer_id)
  values (v_uid, v_uid, v_body, true, false, v_ch.trainer_id);

  update group_challenges set announced_at = now() where id = p_challenge_id;
  return true;
end;
$function$;

-- ── one new challenge per room, per week ───────────────────────────────────
create or replace function public.generate_next_challenge(p_trainer uuid default null)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_start date := v_today + 1;          -- Monday, when the tick runs on Sunday
  v_end   date := v_today + 7;          -- through the following Sunday
  v_ord smallint; v_t record; v_id uuid;
begin
  if p_trainer is null then return null; end if;
  -- Never two live in ONE ROOM: "who is winning" has to have one answer, per
  -- room. Global, this meant that once any trainer had a live challenge no
  -- other trainer ever got an auto-generated one again.
  if exists (select 1 from group_challenges where status = 'live' and trainer_id = p_trainer) then return null; end if;
  -- Never two for the same week in one room, however many times this is called.
  if exists (select 1 from group_challenges where starts_on = v_start and trainer_id = p_trainer) then return null; end if;

  -- The rotation is this room's own, so two rooms are not forced to run the
  -- same challenge in the same week.
  select coalesce(
           (select (ord + 1) % (select count(*) from challenge_templates)
              from challenge_templates t
              join group_challenges g on g.title = t.title
             where g.trainer_id = p_trainer
             order by g.starts_on desc limit 1),
           0)::smallint
    into v_ord;

  select * into v_t from challenge_templates where ord = v_ord;
  if v_t.title is null then select * into v_t from challenge_templates order by ord limit 1; end if;

  -- trainer_id EXPLICITLY: this runs from pg_cron, where the stamping trigger's
  -- auth.uid() is NULL.
  insert into group_challenges
    (title, emoji, tagline, metric, scoring_note, starts_on, ends_on, status, auto_generated, trainer_id)
  values
    (v_t.title, v_t.emoji, v_t.tagline, v_t.metric, v_t.scoring_note, v_start, v_end, 'live', true, p_trainer)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ── the hourly tick runs every room ────────────────────────────────────────
create or replace function public.challenge_cycle_tick()
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_hour int := extract(hour from (now() at time zone 'America/Chicago'))::int;
  v_closed uuid; v_new uuid; v_out text := ''; v_made int := 0; t record;
begin
  -- 6pm: lock scoring on anything due, in every room.
  v_closed := public.close_due_challenge();
  if v_closed is not null then v_out := 'closed ' || v_closed::text || '; '; end if;

  -- 7pm: announce, then start the next one. Announce whatever is scored but
  -- unannounced, not just what closed on this tick, so a missed hour catches up.
  if v_hour >= 19 or v_closed is null then
    perform public.announce_challenge_winner(id)
    from group_challenges
    where scored_at is not null and announced_at is null and trainer_id is not null;
  end if;

  if v_hour >= 19 then
    -- EVERY active trainer gets next week's challenge in their own room.
    for t in select id from trainers where active order by created_at loop
      v_new := public.generate_next_challenge(t.id);
      if v_new is not null then v_made := v_made + 1; end if;
    end loop;
    if v_made > 0 then v_out := v_out || 'created ' || v_made::text; end if;
  end if;

  return nullif(v_out, '');
end;
$function$;

-- ── policies ───────────────────────────────────────────────────────────────
-- Inserting a challenge into somebody else's room is not a thing. The old
-- policy was `with check (is_trainer())` — any trainer, any room.
drop policy if exists group_challenges_insert on public.group_challenges;
create policy group_challenges_insert on public.group_challenges
  for insert to authenticated
  with check (public.is_trainer() and trainer_id = public.my_trainer_id());

-- cp_read was `using (true)`: every signed-in user could read every trainer's
-- participant list.
drop policy if exists cp_read on public.challenge_participants;
create policy cp_read on public.challenge_participants
  for select to authenticated
  using (exists (
    select 1 from public.group_challenges g
     where g.id = challenge_participants.challenge_id
       and g.trainer_id = public.my_group_trainer_id()
  ));

-- ── the view stops being "whichever one row" ───────────────────────────────
-- security_invoker = true, so RLS still gives each reader at most their own
-- room's live challenge. Dropping LIMIT 1 is what lets two rooms have one at
-- the same time. Callers keep .maybeSingle() safely for that reason; the
-- SERVICE-ROLE callers do not, and they now pass a trainer instead.
drop view if exists public.v_active_challenge;
create view public.v_active_challenge with (security_invoker = true) as
select gc.*,
       (select count(*) from challenge_participants cp where cp.challenge_id = gc.id) as participant_count,
       (gc.ends_on - (now() at time zone 'America/Chicago')::date) as days_left
  from group_challenges gc
 where gc.status = 'live'
   and (now() at time zone 'America/Chicago')::date between gc.starts_on and gc.ends_on
 order by gc.starts_on desc;

-- ── which room does this person belong to, asked without a session ─────────
-- my_group_trainer_id() reads auth.uid(). The API routes run on the SERVICE
-- ROLE — they authenticate the caller themselves and then need the same answer
-- for a user id they already hold.
create or replace function public.my_group_trainer_id_for(p_user uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select t.id from public.trainers t
      where t.active and t.auth_user_id = p_user limit 1),
    (select c.trainer_id from public.clients c where c.auth_user_id = p_user limit 1)
  );
$$;
revoke all on function public.my_group_trainer_id_for(uuid) from public, anon;
grant execute on function public.my_group_trainer_id_for(uuid) to authenticated, service_role;
