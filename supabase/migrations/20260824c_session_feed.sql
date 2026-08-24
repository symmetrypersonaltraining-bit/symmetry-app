-- A read-only feed of one trainer's client sessions.
--
-- WHY: the other trainers at Sevens need to see where Dustin has clients
-- booked. PushPress cannot be written to -- its public API exposes exactly one
-- appointment operation, GET /appts/{id} -- so the sessions have to be
-- PUBLISHED and subscribed to rather than pushed into anything.
--
-- The set being published already exists: `appointments` is the trainer's
-- Google Calendar after the sync has filtered it to real client sessions,
-- matched each to a client, stripped payments, and mapped orange to
-- cancelled_client. This just exposes that, per trainer, behind a secret.
--
-- OFF BY DEFAULT. It carries clients' names on a URL with no login, so it is
-- opt-in per trainer and the token can be rotated the moment anyone wants it
-- to be. Every trainer gets the feature; nobody gets it switched on for them.

alter table public.trainers
  add column if not exists session_feed_token text unique,
  add column if not exists session_feed_enabled boolean not null default false,
  -- 'full' = "Robert Miller". 'initial' = "Robert M." for a trainer who would
  -- rather a shared calendar did not carry their clients' surnames.
  add column if not exists session_feed_name_style text not null default 'full'
    check (session_feed_name_style in ('full', 'initial'));

comment on column public.trainers.session_feed_token is
  'Secret in the .ics URL. Rotate to revoke every existing subscription at once.';

-- The rows the feed publishes.
--
-- SECURITY DEFINER and keyed by the token alone: the caller is a calendar
-- client with no session, so there is no auth.uid() to scope by. It returns
-- nothing at all unless the token matches a trainer who has switched the feed
-- ON, which makes the off switch a real one rather than a UI preference.
--
-- Aggregated and filtered HERE rather than in the route. A client-side filter
-- over a fetched list is how three screens this week ended up stating facts
-- about rows they never received.
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
  with t as (
    select id, name, session_feed_name_style
    from trainers
    where session_feed_token = p_token
      and session_feed_enabled
      and active
    limit 1
  )
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
  from t
  join clients c on c.trainer_id = t.id and c.archived_at is null
  join appointments a on a.client_id = c.id
  where a.scheduled_at >= now() - make_interval(days => p_days_back)
    and a.scheduled_at <= now() + make_interval(days => p_days_ahead)
  order by a.scheduled_at, a.id
$$;

-- The route calls this with the service role. Nothing else should reach it:
-- a token is a bearer secret, and anon holding EXECUTE would let anyone who
-- guessed one read it straight from the browser.
revoke all on function public.session_feed_rows(text, int, int) from public, anon, authenticated;
grant execute on function public.session_feed_rows(text, int, int) to service_role;
