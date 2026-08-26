-- The session mirror gets a schedule of its own.
--
-- It used to run at the tail of /api/gcal-sync, which is jobid 41 at '25 * * * *'
-- (narrow) and jobid 25 at '0 9,21' (full). On 25 Aug it began failing every
-- Google write -- it created events with PUT, which does not create -- so the
-- watermark never advanced and all 200 writes retried on the following hour,
-- inside a request already using 55 of its 60 seconds. The sync timed out
-- hourly for a day and a half. Appointments, payment rows and payment reminders
-- went down for a read-only copy of the schedule.
--
-- :40 rather than :25, so it reads appointment rows the sync has just finished
-- writing rather than racing it. 15 minutes of extra latency on a calendar
-- another trainer glances at.
--
-- timeout_milliseconds is set explicitly: the route's own wall-clock budget is
-- 48s and Vercel's ceiling is 60s, so 55s here means pg_cron gives up at
-- roughly the same moment the function would, and a hung run cannot pile up.
select cron.schedule(
  'session_mirror_hourly',
  '40 * * * *',
  $$
  select net.http_get(
    url := 'https://symmetry-app-omega.vercel.app/api/cron/session-mirror',
    headers := jsonb_build_object('x-scheduler-key', (select key from public.app_scheduler_key limit 1)),
    timeout_milliseconds := 55000
  );
  $$
);
