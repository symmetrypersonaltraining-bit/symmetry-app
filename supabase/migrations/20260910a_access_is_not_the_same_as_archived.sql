-- ACCESS IS NOT THE SAME THING AS ARCHIVED
--
-- Dustin, 2026-09-09: an archived client keeps full app access until 30 days
-- after their LAST PAID invoice, then loses it automatically.
--
--     access_ends_on = last PAID payment_reminders.due_date + 30 days
--
-- WHY A SECOND COLUMN RATHER THAN READING archived_at
--
-- Because they are different questions and answering them with one field is
-- what produced this rule. `archived_at` is a ROSTER state: it decides who
-- appears in his client lists and his billing. It has never gated sign-in.
-- Bobbie Page was archived on 2026-08-31 and still had full app access on
-- 9 Sep, which is how we found out.
--
-- `access_revoked_at` is an ACCESS state, written only by the nightly job, and
-- it is what the app reads. Keeping them apart means archiving someone stays a
-- reversible bookkeeping act with no effect on their phone, and revoking is a
-- deliberate separate event with a date on it.
--
-- NOTHING HERE DELETES ANYTHING. His words: revoking access is not deleting the
-- client. workout_logs, set_logs, meal_adherence_logs and metrics are untouched
-- by this rule and stay for ever.

alter table clients
  add column if not exists access_revoked_at timestamptz,
  add column if not exists access_override_until date;

comment on column clients.access_revoked_at is
  'Set by /api/cron/revoke-access when an archived client passes 30 days from their last paid invoice. Null = they still have the app. Never set by hand except to restore someone (set null AND unban their auth user).';

comment on column clients.access_override_until is
  'Dustin''s manual extension. While this date is in the future the job skips the client. It can only ever EXTEND access past the rule, never shorten it.';

-- The job asks exactly one question every night: who is archived and not yet
-- revoked. Eight rows today, so this is for the shape of the query rather than
-- its cost.
create index if not exists clients_pending_revoke_idx
  on clients (archived_at)
  where archived_at is not null and access_revoked_at is null;

-- THE OFF SWITCH, AND IT STARTS OFF.
--
-- Two reasons it ships false. First, the nudge job: its flag gated DELIVERY and
-- not whether the job RAN, so Dustin turned nudges off ten times and the thing
-- kept messaging him nightly for weeks. This job reads its flag before it does
-- anything at all, and shipping it off is the only honest way to prove that.
--
-- Second, and the real one: on 9 Sep this rule would revoke FIVE people, and
-- Dustin flagged one. Tina Haley, Christine Latham, Brooke Reynolds and Robert
-- Miller are all past their date too. Nobody gets cut off by a deploy. He turns
-- this on when he has read the list.
insert into app_flags (key, enabled)
values ('access_revoke_live', false)
on conflict (key) do nothing;

-- BOBBIE PAGE — his exception, set before the switch can ever be thrown.
--
-- Her last paid invoice was due 2026-08-01, so the rule ends her access on
-- 2026-08-31. He is giving her until 1 Oct. Written by id, not by name.
update clients
   set access_override_until = date '2026-10-01'
 where id = '15c44869-9433-4c12-a907-11bb95447fda'
   and access_override_until is null;
