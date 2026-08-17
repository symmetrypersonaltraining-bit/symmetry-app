-- Back up fork_day_for_client() before it learns to reuse an existing fork.
--
-- Run BEFORE 20260817_fork_day_reuses_an_existing_fork.sql. Stores the live
-- definition verbatim, so restoring is `select def from` this table and running
-- it.
--
-- Idempotent: `create table if not exists`, and the insert reads whatever is
-- currently defined.

create table if not exists public.bak_fork_day_for_client_20260817 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_fork_day_for_client_20260817 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fork_day_for_client';
