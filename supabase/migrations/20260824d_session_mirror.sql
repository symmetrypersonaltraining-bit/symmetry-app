-- The mirrored Google calendar.
--
-- PushPress Grow's Two-Way / Smart Sync can read a Google calendar INTO
-- PushPress, which is how the gym's trainers get to see Dustin's sessions. But
-- it connects to a Google ACCOUNT, and his primary calendar is his life. So the
-- app maintains a secondary calendar containing client sessions and nothing
-- else, and THAT is the one PushPress is pointed at.
--
-- Off by default, per trainer, like the .ics feed it sits beside.

alter table public.trainers
  add column if not exists session_mirror_enabled boolean not null default false,
  add column if not exists session_mirror_calendar_id text,
  add column if not exists session_mirror_synced_at timestamptz,
  add column if not exists session_mirror_error text;

comment on column public.trainers.session_mirror_calendar_id is
  'Google id of the secondary calendar the app publishes sessions to. NEVER the primary.';

-- One definition of "a publishable session", shared by the .ics feed and the
-- Google mirror. Two copies of this rule would drift, and the drift would show
-- up as the gym''s calendar and the subscribe link disagreeing about who is
-- booked -- with nothing to say which was right.
create or replace function public.trainer_session_rows(
  p_trainer_id uuid,
  p_days_back int default 14,
  p_days_ahead int default 120
)
returns table (
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled boolean,
  display_name text,
  updated_at timestamptz,
  trainer_name text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.scheduled_at,
    coalesce(a.ends_at, a.scheduled_at + interval '1 hour'),
    a.status like 'cancelled%',
    case
      when t.session_feed_name_style = 'initial'
        then split_part(c.name, ' ', 1)
             || case when position(' ' in c.name) > 0
                     then ' ' || left(split_part(c.name, ' ', 2), 1) || '.'
                     else '' end
      else c.name
    end,
    coalesce(a.updated_at, a.created_at, a.scheduled_at),
    t.name
  from trainers t
  join clients c on c.trainer_id = t.id and c.archived_at is null
  join appointments a on a.client_id = c.id
  where t.id = p_trainer_id
    and t.active
    and a.scheduled_at >= now() - make_interval(days => p_days_back)
    and a.scheduled_at <= now() + make_interval(days => p_days_ahead)
  order by a.scheduled_at, a.id
$$;

-- The token wrapper now delegates, so the two surfaces cannot drift apart.
-- It keeps its own gate: the .ics feed answers only for a trainer who switched
-- THE FEED on, which is a different switch from the mirror.
create or replace function public.session_feed_rows(
  p_token text,
  p_days_back int default 14,
  p_days_ahead int default 120
)
returns table (
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled boolean,
  display_name text,
  updated_at timestamptz,
  trainer_name text
)
language sql
security definer
set search_path = public
as $$
  select r.*
  from trainers t
  cross join lateral public.trainer_session_rows(t.id, p_days_back, p_days_ahead) r
  where t.session_feed_token = p_token
    and t.session_feed_enabled
    and t.active
$$;

revoke all on function public.trainer_session_rows(uuid, int, int) from public, anon, authenticated;
grant execute on function public.trainer_session_rows(uuid, int, int) to service_role;
revoke all on function public.session_feed_rows(text, int, int) from public, anon, authenticated;
grant execute on function public.session_feed_rows(text, int, int) to service_role;
