-- Applied to production 2026-08-20 as multitrainer_gcal_scoped_20260820.
--
-- COMMITTED LATE, AND THAT WAS THE BUG BEFORE THE BUG. An audit of this repo on
-- the same evening could not find `p_trainer_id` anywhere, while the running
-- code passed it to three RPCs and called a fourth that did not exist here at
-- all — so the scoping that stops one trainer's calendar sync from deleting the
-- other's future schedule was unverifiable and unrebuildable from version
-- control. The file below is the exact statement that was applied.
--
-- WHY: three functions were load-bearing on "there is exactly one trainer", and
-- each fails without an error.
--
--   gcal_get_tokens()   LIMIT 1, no ORDER BY -- an arbitrary Google account.
--   gcal_get_clients()  the whole roster, so Dustin's calendar could match an
--                       event titled "Sarah" to one of Stephanie's clients and
--                       bill the session to the wrong trainer.
--   gcal_reconcile_*()  deletes future rows absent from p_seen_ids. Trainer A's
--                       event list does not contain trainer B's events, so run
--                       per trainer and unscoped, A's first sync deletes B's
--                       entire future schedule -- and the reconcile's own "more
--                       than half the window" guard does NOT fire, because from
--                       A's side the deletion looks legitimate.
--
-- Each gains an optional scope argument; NULL reproduces the old behaviour
-- exactly. The old zero/three-arg signatures are DROPPED rather than left
-- alongside: a defaulted parameter next to an overload makes the call ambiguous
-- and Postgres refuses it outright.

drop function if exists public.gcal_get_tokens();
create function public.gcal_get_tokens(p_user_id uuid default null)
returns table(user_id uuid, google_access_token text, google_refresh_token text,
              google_token_expiry timestamptz, gcal_sync_enabled boolean)
language plpgsql security definer set search_path to 'public'
as $$
begin
  return query
  select ts.user_id, ts.google_access_token, ts.google_refresh_token,
         ts.google_token_expiry, ts.gcal_sync_enabled
  from trainer_settings ts
  left join trainers t on t.auth_user_id = ts.user_id
  where ts.google_refresh_token is not null
    and (p_user_id is null or ts.user_id = p_user_id)
  -- Owner first, then a stable tiebreak. A caller that does not name a trainer
  -- gets Dustin's calendar every time rather than a coin flip.
  order by (coalesce(t.role, '') = 'owner') desc, ts.user_id
  limit 1;
end;
$$;
revoke all on function public.gcal_get_tokens(uuid) from public;
grant execute on function public.gcal_get_tokens(uuid) to service_role;

-- Which trainers have a calendar connected at all. The sync loops over this.
create or replace function public.gcal_list_connected_trainers()
returns table(user_id uuid, trainer_id uuid, trainer_name text, is_owner boolean)
language plpgsql security definer set search_path to 'public'
as $$
begin
  return query
  select ts.user_id, t.id, coalesce(t.name, ''), coalesce(t.role, '') = 'owner'
  from trainer_settings ts
  left join trainers t on t.auth_user_id = ts.user_id
  where ts.google_refresh_token is not null
    and coalesce(ts.gcal_sync_enabled, true)
  order by (coalesce(t.role, '') = 'owner') desc, t.name nulls last;
end;
$$;
revoke all on function public.gcal_list_connected_trainers() from public;
grant execute on function public.gcal_list_connected_trainers() to service_role;

drop function if exists public.gcal_get_clients();
create function public.gcal_get_clients(p_trainer_id uuid default null)
returns table(id uuid, name text)
language plpgsql security definer set search_path to 'public'
as $$
begin
  return query
  select c.id, c.name
  from clients c
  where c.archived_at is null
    and (p_trainer_id is null or c.trainer_id = p_trainer_id)
  order by c.name;
end;
$$;
revoke all on function public.gcal_get_clients(uuid) from public;
grant execute on function public.gcal_get_clients(uuid) to service_role;

drop function if exists public.gcal_reconcile_appointments(text[], timestamptz, timestamptz);
create function public.gcal_reconcile_appointments(
  p_seen_ids text[], p_time_min timestamptz, p_time_max timestamptz,
  p_trainer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  removed    int := 0;
  n_seen     int := coalesce(array_length(p_seen_ids, 1), 0);
  n_live     int;
  n_would_go int;
begin
  if p_seen_ids is null or n_seen < 50 then
    return jsonb_build_object('removed', 0, 'skipped', 'seen set too small', 'seen', n_seen);
  end if;

  select count(*) into n_live
  from appointments a
  where a.gcal_event_id is not null
    and a.scheduled_at > now()
    and a.scheduled_at >= p_time_min
    and a.scheduled_at <= p_time_max
    and (p_trainer_id is null or a.client_id in (select c.id from clients c where c.trainer_id = p_trainer_id));

  select count(*) into n_would_go
  from appointments a
  where a.gcal_event_id is not null
    and a.scheduled_at > now()
    and a.scheduled_at >= p_time_min
    and a.scheduled_at <= p_time_max
    and (p_trainer_id is null or a.client_id in (select c.id from clients c where c.trainer_id = p_trainer_id))
    and not (a.gcal_event_id = any(p_seen_ids));

  -- More than half the window disappearing at once is a bad fetch, not a bad
  -- calendar. Refuse, and say so loudly enough to be seen in the run log.
  if n_live > 20 and n_would_go * 2 > n_live then
    return jsonb_build_object(
      'removed', 0,
      'skipped', 'refused: would delete ' || n_would_go || ' of ' || n_live ||
                 ' future rows in window - treating as an incomplete fetch',
      'seen', n_seen, 'live', n_live, 'would_remove', n_would_go);
  end if;

  with del as (
    delete from appointments a
    where a.gcal_event_id is not null
      and a.scheduled_at > now()
      and a.scheduled_at >= p_time_min
      and a.scheduled_at <= p_time_max
      and (p_trainer_id is null or a.client_id in (select c.id from clients c where c.trainer_id = p_trainer_id))
      and not (a.gcal_event_id = any(p_seen_ids))
    returning 1
  )
  select count(*) into removed from del;

  return jsonb_build_object('removed', removed, 'seen', n_seen, 'live', n_live);
end;
$$;
revoke all on function public.gcal_reconcile_appointments(text[], timestamptz, timestamptz, uuid) from public;
grant execute on function public.gcal_reconcile_appointments(text[], timestamptz, timestamptz, uuid) to service_role;

drop function if exists public.gcal_reconcile_payments(text[], timestamptz, timestamptz);
create function public.gcal_reconcile_payments(
  p_seen_ids text[], p_time_min timestamptz, p_time_max timestamptz,
  p_trainer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  removed int := 0;
begin
  if p_seen_ids is null or coalesce(array_length(p_seen_ids, 1), 0) < 50 then
    return jsonb_build_object('removed', 0, 'skipped', 'seen set too small');
  end if;

  with del as (
    delete from calendar_payments cp
    where cp.source = 'gcal_sync'
      and cp.google_event_id is not null
      and cp.payment_date > (now() at time zone 'America/Chicago')::date
      and cp.payment_date >= (p_time_min at time zone 'America/Chicago')::date
      and cp.payment_date <= (p_time_max at time zone 'America/Chicago')::date
      and (p_trainer_id is null or cp.client_id in (select c.id from clients c where c.trainer_id = p_trainer_id))
      and not (cp.google_event_id = any(p_seen_ids))
    returning 1
  )
  select count(*) into removed from del;

  return jsonb_build_object('removed', removed);
end;
$$;
revoke all on function public.gcal_reconcile_payments(text[], timestamptz, timestamptz, uuid) from public;
grant execute on function public.gcal_reconcile_payments(text[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
