-- Retire the false positives the old rule left in the queue.
--
-- Run AFTER 20260816_detector_absence_is_not_a_signal.sql. Two groups, both
-- created by the pre-fix detector, neither of which the rewritten
-- detect_schedule_changes() can produce any more:
--
--   1. reason='orphaned' — "supervised workout with no appointment", i.e. the
--      default state reported as an error. 10 rows.
--   2. Any pending proposal for a client with ZERO future appointments — the
--      new eligibility gate skips those clients entirely, so these are output
--      from a rule that no longer exists. 1 row, Robert Miller's 'retired'.
--
-- SUPERSEDED, NOT DELETED. The rows stay in the table with their history; only
-- `status` moves. Every id touched is recorded in bak_scp_superseded_20260816
-- alongside its previous status and the reason it was retired, so the whole
-- change is one UPDATE ... FROM away from being undone.
--
-- Without this the queue reads as a failure for up to a day — the detector's own
-- 20-hour ageing rule would eventually catch them — and the spec's verification
-- query would report the fix as broken when it is not.
--
-- ── Why this is its own migration ──────────────────────────────────────────
--
-- It ran first as a trailing statement inside
-- 20260816_detector_absence_is_not_a_signal.sql and did NOT take effect: the
-- statement following a dollar-quoted function body was dropped, the function
-- was replaced, and the 10 'orphaned' rows were still sitting pending
-- afterwards. Verified by querying, not by trusting the success response. Split
-- out so it is its own migration and can be checked on its own.

create table if not exists public.bak_scp_superseded_20260816 (
  saved_at    timestamptz not null default now(),
  proposal_id uuid not null,
  client_id   uuid not null,
  reason      text,
  prev_status text,
  from_date   date,
  to_date     date,
  created_at  timestamptz,
  why         text
);

insert into public.bak_scp_superseded_20260816
  (proposal_id, client_id, reason, prev_status, from_date, to_date, created_at, why)
select p.id, p.client_id, p.reason, p.status, p.from_date, p.to_date, p.created_at,
       case when p.reason = 'orphaned' then 'reason retired: absence of an appointment is not a signal'
            else 'client has no future appointments: out of scope for the detector' end
from public.schedule_change_proposals p
where p.status = 'pending'
  and (p.reason = 'orphaned'
       or not exists (select 1 from public.appointments a
                      where a.client_id = p.client_id
                        and (a.scheduled_at at time zone 'America/Chicago')::date
                            >= (now() at time zone 'America/Chicago')::date));

update public.schedule_change_proposals p
   set status = 'superseded', resolved_at = now()
 where p.status = 'pending'
   and exists (select 1 from public.bak_scp_superseded_20260816 b where b.proposal_id = p.id);
