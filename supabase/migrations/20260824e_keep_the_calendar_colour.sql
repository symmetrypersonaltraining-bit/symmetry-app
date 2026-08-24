-- KEEP THE COLOUR.
--
-- Dustin, 24 Aug 2026: "it needs to sync by color. red events are bills, green
-- are income. anything blue w cliejts name are sessions."
--
-- The colour was being read and thrown away. gcal-sync uses it to decide
-- cancelled (tangerine) and payment (tomato) and then drops it on the floor, so
-- nothing downstream can ask "is this one of the blue ones" -- and there was no
-- way to answer his rule without guessing which blue he means. Google has two
-- blues (Peacock and Blueberry) and two greens (Sage and Basil).
--
-- This stores it. It changes NO behaviour: what counts as a session, what gets
-- billed, and what the mirror publishes are all exactly as before. It just
-- makes the question answerable from data instead of from a guess.
--
-- NOTE: `colorId` is absent on an event using the calendar's default colour.
-- NULL therefore means "default", not "unknown", and must not be lumped in
-- with a colour he chose deliberately.

alter table public.appointments
  add column if not exists gcal_color_id text;

comment on column public.appointments.gcal_color_id is
  'Google colorId as sent by the API. NULL = the calendar default (no explicit colour).';

-- Replaces gcal_sync_appointments. Two changes, both narrow:
--
--   1. gcal_color_id is carried through.
--
--   2. THE UPSERT NO LONGER TOUCHES A ROW THAT HAS NOT CHANGED. It used to set
--      updated_at = NOW() on every conflict, so every appointment looked freshly
--      modified after every hourly sync whether anything moved or not. That is
--      wrong on its own terms, and it defeats the session mirror: the mirror
--      skips events whose appointment is unchanged since the last publish, so
--      with every row stamped every hour it would rewrite all 721 events, every
--      hour, forever.
create or replace function public.gcal_sync_appointments(p_appointments jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  appt JSONB;
  synced INT := 0;
  err_msgs TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR appt IN SELECT * FROM jsonb_array_elements(p_appointments)
  LOOP
    BEGIN
      INSERT INTO appointments (
        client_id, scheduled_at, ends_at, status, gcal_event_id,
        gcal_recurring_id, title, source, gcal_color_id
      )
      VALUES (
        (appt->>'client_id')::UUID,
        (appt->>'scheduled_at')::TIMESTAMPTZ,
        NULLIF(appt->>'ends_at', '')::TIMESTAMPTZ,
        appt->>'status',
        appt->>'gcal_event_id',
        NULLIF(appt->>'gcal_recurring_id', ''),
        appt->>'title',
        COALESCE(appt->>'source', 'gcal'),
        NULLIF(appt->>'gcal_color_id', '')
      )
      ON CONFLICT (gcal_event_id) WHERE gcal_event_id IS NOT NULL DO UPDATE SET
        client_id = EXCLUDED.client_id,
        scheduled_at = EXCLUDED.scheduled_at,
        ends_at = EXCLUDED.ends_at,
        status = EXCLUDED.status,
        gcal_recurring_id = EXCLUDED.gcal_recurring_id,
        title = EXCLUDED.title,
        source = EXCLUDED.source,
        gcal_color_id = EXCLUDED.gcal_color_id,
        updated_at = NOW()
      WHERE (
        appointments.client_id, appointments.scheduled_at, appointments.ends_at,
        appointments.status, appointments.gcal_recurring_id, appointments.title,
        appointments.source, appointments.gcal_color_id
      ) IS DISTINCT FROM (
        EXCLUDED.client_id, EXCLUDED.scheduled_at, EXCLUDED.ends_at,
        EXCLUDED.status, EXCLUDED.gcal_recurring_id, EXCLUDED.title,
        EXCLUDED.source, EXCLUDED.gcal_color_id
      );
      synced := synced + 1;
    EXCEPTION WHEN OTHERS THEN
      err_msgs := array_append(err_msgs, SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('synced', synced, 'errors', to_jsonb(err_msgs));
END;
$function$;
