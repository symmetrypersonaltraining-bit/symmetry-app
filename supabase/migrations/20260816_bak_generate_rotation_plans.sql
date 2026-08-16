-- Back up generate_rotation_plans() before adding kcal and micros to its clone.
--
-- Run BEFORE 20260816_rotation_clone_keeps_kcal_and_micros.sql. Stores the live
-- definition verbatim, so restoring is `select def from` this table and running
-- it — no hunting through migration history for which version was actually
-- deployed, which is what makes a rollback take an hour instead of a minute.
--
-- Idempotent: `create table if not exists`, and the insert reads whatever is
-- currently defined. Running it twice keeps both snapshots, ordered by
-- saved_at, which is the useful behaviour rather than an error.

create table if not exists public.bak_generate_rotation_plans_20260816 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_generate_rotation_plans_20260816 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'generate_rotation_plans';
