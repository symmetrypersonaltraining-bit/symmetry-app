-- Back up resolve_schedule_proposal() before fixing what "apply" targets.
--
-- Run BEFORE 20260816_resolve_moves_the_one_session.sql. Stores the live
-- definition verbatim, so restoring is `select def from` this table and running
-- it — no hunting through migration history for which version was actually
-- deployed, which is what makes a rollback take an hour instead of a minute.
--
-- Idempotent: `create table if not exists`, and the insert reads whatever is
-- currently defined. Running it twice keeps both snapshots, ordered by
-- saved_at, which is the useful behaviour rather than an error.

create table if not exists public.bak_resolve_schedule_proposal_20260816 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_resolve_schedule_proposal_20260816 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'resolve_schedule_proposal';
