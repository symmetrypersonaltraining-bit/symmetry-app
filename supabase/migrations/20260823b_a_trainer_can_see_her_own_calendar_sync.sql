-- A TRAINER CAN SEE HER OWN CALENDAR SYNC.
--
-- `gcal_sync_runs` logs one row per sync INVOCATION, and an invocation loops
-- over every connected trainer. There is no trainer_id to put on the row, which
-- is why 20260821d made the table owner-only: one trainer could otherwise read
-- every trainer's sync health.
--
-- The cost of that was invisible and worse than the leak. SyncHealth.tsx reads
-- the table and returns `null` when it gets nothing, so the ONE card in the app
-- that answers "is my calendar actually working" rendered as empty space for
-- everybody except Dustin. That card exists because the sync was dead from 31
-- July and was found only by reverse-engineering a Google token-refresh
-- timestamp. For a second trainer, that exact silent failure was still fully in
-- place.
--
-- The per-trainer outcome was already in the run: `response -> 'trainers'` is
-- one entry per trainer. It just had no user_id to match on, and the entries
-- were trimmed of `errors` and `unmatched_samples` — the two fields that make a
-- slice worth showing. Both fixed in the route.
--
-- So the table stays shut and this function does the narrowing:
--   owner            -> the whole run, unchanged ('instance')
--   another trainer  -> only their own entry, ok derived from THEIR errors ('mine')
--   a trainer whose calendar was not in the run -> a plain "connect it" line
--   anyone who is not a trainer -> no rows at all
--
-- Verified by simulation before shipping: Dustin gets scope 'instance', Brooke
-- gets scope 'mine' with the connect-it line, a client gets zero rows, and
-- Brooke selecting gcal_sync_runs directly still gets zero rows.

create or replace function public.my_gcal_sync_health()
returns table (
  queued_at    timestamptz,
  ok           boolean,
  status_code  int,
  error        text,
  response     jsonb,
  scope        text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r record;
  mine jsonb;
begin
  if public.my_trainer_id() is null then
    return;
  end if;

  select g.queued_at, g.ok, g.status_code, g.error, g.response
    into r
    from public.gcal_sync_runs g
   order by g.queued_at desc
   limit 1;

  if not found then
    return;
  end if;

  if public.is_owner() then
    queued_at := r.queued_at; ok := r.ok; status_code := r.status_code;
    error := r.error; response := r.response; scope := 'instance';
    return next;
    return;
  end if;

  select t into mine
    from jsonb_array_elements(coalesce(r.response -> 'trainers', '[]'::jsonb)) as t
   where t ->> 'user_id' = auth.uid()::text
   limit 1;

  queued_at := r.queued_at;
  status_code := r.status_code;
  -- The run-level `error` belongs to the invocation, not to this trainer.
  -- Handing it over would report somebody else's dead credential as hers.
  error := null;
  scope := 'mine';

  if mine is null then
    ok := null;
    response := jsonb_build_object(
      'skipped', true,
      'reason', 'Your calendar was not part of the last sync - connect Google Calendar in Settings.',
      'window', r.response ->> 'window'
    );
  else
    -- Judge HER payload, not the HTTP status: a 200 carrying ten of her errors
    -- is not a healthy sync, and neither is a skip.
    ok := (coalesce(jsonb_array_length(mine -> 'errors'), 0) = 0)
          and (mine ->> 'skipped') is null;
    response := mine || jsonb_build_object('window', r.response ->> 'window');
  end if;
  return next;
end;
$$;

revoke all on function public.my_gcal_sync_health() from public, anon;
grant execute on function public.my_gcal_sync_health() to authenticated;
