-- THE APP RECORDS ITS OWN ERRORS, NOT JUST THE THREE THAT COST SETS.
--
-- Dustin, 2026-09-10: "anytime something goes wrong or errors or there's a bug,
-- you can look back at the actual log of when it happened and what happened and
-- figure it out a little bit easier to make sure that we fix it permanently,
-- and we don't keep running into the same problems."
--
-- WHAT WAS ALREADY HERE, AND WHY IT SAW NOTHING
--
-- `client_error_log` (20260826e) was built after Jennifer lost 27 minutes of
-- sets, and it works. It watches three writes -- set_log, bulk_set_log,
-- workout_complete -- and it has never recorded a row, which is the honest
-- answer rather than a broken one: the integrity check that would catch a
-- missing session also reads zero across 60 days.
--
-- Everywhere else, an error went to console.error -- 124 of them -- which on a
-- phone means a hidden console and then nothing. So "it didn't work" had no
-- record behind it unless it was one of those three writes.
--
-- THE FEAR IN THE ORIGINAL, WHICH IS THE RIGHT FEAR
--
-- 20260826e said it in as many words: "Anything broader becomes a table nobody
-- reads, which is where the integrity checker sat for ten days." Widening the
-- net without changing the shape produces ten thousand rows of the same bug and
-- a page no one opens.
--
-- So this does NOT store one row per occurrence. It stores ONE ROW PER DISTINCT
-- ERROR, keyed by a fingerprint, carrying:
--
--   occurrences  -- how many times it has happened
--   last_seen_at -- when it last happened
--   recent       -- the last 10 individual hits, each with its own time,
--                   client, path and detail
--
-- A bug that fires two thousand times is ONE row that says 2000, and still
-- holds the ten most recent actual occurrences to read. That is what makes a
-- broad net readable, and it caps growth at the number of distinct faults
-- rather than the number of failures.
--
-- RENAMED, BECAUSE THE NAME WAS ABOUT TO BECOME A LIE
--
-- It is no longer only clients and no longer only the browser: server routes
-- write to it too, and those rows have no client at all. Renaming is free here
-- -- the table has zero rows, so there is nothing to migrate and nothing to
-- back up.

alter table if exists public.client_error_log rename to app_error_log;

alter index if exists client_error_log_recent rename to app_error_log_recent;
alter index if exists client_error_log_client rename to app_error_log_client;

-- Renaming a table leaves its CONSTRAINTS carrying the old name, so an
-- app_error_log row would report violating "client_error_log_pkey" -- a table
-- that no longer exists, in the one message someone reads while debugging.
-- `alter table ... rename constraint` has no IF EXISTS, hence the guard: this
-- migration has to be safe to run twice.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_error_log_pkey') then
    alter table public.app_error_log rename constraint client_error_log_pkey to app_error_log_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'client_error_log_client_id_fkey') then
    alter table public.app_error_log
      rename constraint client_error_log_client_id_fkey to app_error_log_client_id_fkey;
  end if;
end $$;

alter table public.app_error_log
  -- The grouping key: scope + normalised message + path, hashed. Nullable only
  -- so the rename cannot fail on legacy rows; every writer sets it.
  add column if not exists fingerprint  text,
  add column if not exists occurrences  integer     not null default 1,
  add column if not exists last_seen_at timestamptz not null default now(),
  -- 'client' (a browser) or 'server' (an API route / cron).
  add column if not exists source       text        not null default 'client',
  -- The last 10 hits, newest first: {at, client_id, path, message, detail}.
  add column if not exists recent       jsonb       not null default '[]'::jsonb,
  -- Set by hand when a fault is fixed. A later occurrence clears it again --
  -- see the upsert in /api/log-error -- because a bug that comes back is not
  -- resolved, and silently leaving it ticked is how it gets missed twice.
  add column if not exists resolved_at  timestamptz;

-- One row per distinct fault. This index is what the upsert conflicts on.
create unique index if not exists app_error_log_fingerprint_key
  on public.app_error_log (fingerprint)
  where fingerprint is not null;

-- The read a person actually does: what is broken now, worst first.
create index if not exists app_error_log_triage
  on public.app_error_log (last_seen_at desc)
  where resolved_at is null;

-- WRITES NOW COME FROM THE SERVER, AND THAT IS THE OTHER BUG FIXED HERE.
--
-- The old insert policy was `client_id = my_client_id()`, and my_client_id()
-- resolves the LOGGED-IN user's client row. When Dustin logs a client's session
-- at /workout?forClient=<id> he has no client row, so the insert was refused by
-- RLS and then swallowed by the reporter's own catch. Any write failure during
-- a session HE logged could not be recorded -- the one case most likely to be
-- reported, and the one guaranteed to leave no trace.
--
-- /api/log-error writes with the service role and authorises the caller itself,
-- so that hole closes without the browser needing any insert grant at all.
drop policy if exists client_writes_own_errors on public.app_error_log;

-- Trainers still read their own clients' rows, and now also the ones with no
-- client attached -- server faults and errors from a signed-out screen, which
-- `trainer_can_see_client(null)` would otherwise hide completely.
drop policy if exists trainer_reads_client_errors on public.app_error_log;
create policy trainer_reads_errors on public.app_error_log
  for select to authenticated
  using (
    public.trainer_can_see_client(client_id)
    or (client_id is null and exists (
      -- trainers.active, a boolean. There is no `status` column on this table;
      -- assuming one cost a failed migration before it was checked.
      select 1 from public.trainers t
      where t.auth_user_id = auth.uid() and t.active
    ))
  );

comment on table public.app_error_log is
  'One row per DISTINCT error, not per occurrence: fingerprint groups them, occurrences counts them, recent holds the last 10 actual hits. Written only by /api/log-error under the service role; read by trainers. Was client_error_log (20260826e), which watched three workout writes and never fired.';

comment on column public.app_error_log.fingerprint is
  'scope + normalised message + path, hashed. Normalisation strips uuids, numbers and quoted strings so one fault does not spread across a thousand rows.';

comment on column public.app_error_log.recent is
  'Last 10 occurrences, newest first. This is what "look back at when it happened" reads; occurrences alone cannot tell you which client or which screen.';
