-- WHEN A CLIENT'S SET DOESN'T SAVE, SOMEBODY OTHER THAN THE CLIENT SHOULD KNOW.
--
-- Jennifer, 26 Aug: "About midway through my workout. It wouldn't let me check
-- a completed set." She finished with 27 minutes of work and ZERO set_logs.
--
-- The logger behaved correctly: it refuses to tick a set green on a failed
-- write and it showed her the error. That guard is the only reason this was
-- noticed at all rather than becoming a session that quietly recorded nothing.
-- But the error went to her screen and nowhere else, so finding out WHY took an
-- afternoon of inference across six tables and still did not reach a definite
-- cause -- nothing anywhere recorded that a write had been attempted and
-- refused. A guard that can only report to the one person who cannot act on it
-- is half a guard.
--
-- Deliberately narrow. This is not general client-side error reporting: it is
-- the writes whose failure silently costs someone their training data. Anything
-- broader becomes a table nobody reads, which is where the integrity checker
-- sat for ten days.
create table if not exists public.client_error_log (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients(id) on delete cascade,
  user_id      uuid,
  scope        text not null,          -- 'set_log' | 'bulk_set_log' | ...
  message      text,
  detail       jsonb,
  path         text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists client_error_log_recent
  on public.client_error_log (created_at desc);
create index if not exists client_error_log_client
  on public.client_error_log (client_id, created_at desc);

alter table public.client_error_log enable row level security;

-- A client may only ever WRITE their own, and may not read the table at all:
-- there is nothing here for them, and the detail column carries ids.
create policy client_writes_own_errors on public.client_error_log
  for insert to authenticated
  with check (client_id = public.my_client_id());

-- Trainers read the ones belonging to their own clients, same rule as every
-- other client-owned table.
create policy trainer_reads_client_errors on public.client_error_log
  for select to authenticated
  using (public.trainer_can_see_client(client_id));

comment on table public.client_error_log is
  'Failed client-side writes that cost training data. Written by the workout logger when a set upsert fails; read by the trainer. Not general error reporting.';
