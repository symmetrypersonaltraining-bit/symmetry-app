-- Back up sync_supervised_workouts_to_appointments() before unblocking it.
--
-- Run BEFORE 20260816_homework_never_blocks_a_move.sql. Stores the live
-- definition verbatim, so restoring is `select def from` this table and running
-- it — no hunting through migration history for which version was actually
-- deployed.
--
-- Idempotent: `create table if not exists`, and the insert reads whatever is
-- currently defined.

create table if not exists public.bak_sync_supervised_workouts_20260816 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_sync_supervised_workouts_20260816 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sync_supervised_workouts_to_appointments';
