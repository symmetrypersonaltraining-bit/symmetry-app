-- Back up detect_schedule_changes() and the pending 'orphaned' rows before the
-- rule change.
--
-- Run BEFORE 20260816_detector_absence_is_not_a_signal.sql. Two snapshots:
--
--   1. The live function definition, verbatim. Restoring is `select def from`
--      this table and running it — no hunting through migration history for
--      which version was actually deployed.
--   2. The ids of every pending 'orphaned' proposal, because the fix supersedes
--      them and superseding is a status change that should be reversible.
--      Nothing is deleted; the rows stay, and this records exactly which ones
--      were touched so they can be put back to 'pending' if that turns out to
--      be wrong.
--
-- Idempotent: `create table if not exists`, and both inserts read current state.

create table if not exists public.bak_detect_schedule_changes_20260816 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_detect_schedule_changes_20260816 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'detect_schedule_changes';

create table if not exists public.bak_scp_orphaned_pending_20260816 (
  saved_at    timestamptz not null default now(),
  proposal_id uuid not null,
  client_id   uuid not null,
  from_date   date,
  created_at  timestamptz
);

insert into public.bak_scp_orphaned_pending_20260816 (proposal_id, client_id, from_date, created_at)
select id, client_id, from_date, created_at
from public.schedule_change_proposals
where status = 'pending' and reason = 'orphaned';
