-- The duration job stops putting videos in front of clients by itself.
--
-- ── WHAT WAS MEASURED, 16 Aug ───────────────────────────────────────────────
--
--   select count(*) filter (where status='approved' and applied_at is not null),
--          count(*) filter (where status='approved' and applied_at is null)
--   from exercise_video_candidates;
--   → 179 auto-applied, 0 reviewed by hand.
--
-- 792 exercises have a video. 617 of those came from the original library and
-- are not in question. The other 175 were chosen by an agent web search and put
-- in front of clients by a cron job, and NOT ONE of them was looked at first —
-- there is no such thing in this database as a video a person approved.
--
-- ── WHY THAT IS A BUG AND NOT A DESIGN ──────────────────────────────────────
--
-- `/api/video-candidates/decide/route.ts` opens with the rule, in its own words:
--
--   "The candidates came out of a web search run by an agent, which is a
--    perfectly good way to find a demo of a Romanian deadlift and a perfectly
--    good way to find a fourteen-minute critique of one. Nothing found that way
--    goes in front of a client without a human looking at it first."
--
-- The whole staging table, the review screen, the approve/reject/undo route and
-- the previous_video_url stash exist to enforce that sentence. `measure_video_
-- durations()` then reached past all of it: its second loop took any candidate
-- of 30 seconds or less on an exercise with no video and wrote
-- `exercises.video_url` directly, every ten minutes, unreviewed.
--
-- The review queue was not being skipped. It was being run AFTER publication —
-- the screen's "live" list is videos already in front of clients, sorted
-- longest-first, with an undo. Review after the fact is a different product
-- from review before it, and only one of them matches what the code says.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
--
-- The measuring half is untouched: the job still fills `duration_sec` and still
-- parks dead URLs, which is the part nothing else can do (it holds the YouTube
-- key). Only the apply loop is removed.
--
-- The 175 videos already live are LEFT EXACTLY AS THEY ARE. Pulling them would
-- take demos away from clients tonight on nobody's say-so, which is a worse
-- thing to do unasked than leaving them up; they are all reviewable from the
-- queue screen, and the undo path works on every one of them (previous_video_url
-- is null, which restores correctly to "no video").
--
-- Reversible: the previous definition is stored verbatim in
-- public.bak_measure_video_durations_20260816. Run its `def` column to restore.
--
-- ── NOT DECIDED HERE ────────────────────────────────────────────────────────
--
-- The 30-vs-60-second ceiling stays exactly as it is. This function says 30,
-- `verify/route.ts` says MAX_SECONDS = 60, and the evidence of both running is
-- sitting in the table: ten candidates between 35 and 60 seconds are `pending`
-- (measured by the route) while three at 48, 49 and 53 are `too_long` (measured
-- by this function), all created in the same hour. That is one rule with two
-- homes and it is on Dustin's list as a question, not a bug to be guessed at.

create or replace function public.measure_video_durations(p_batches integer default 5)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_key       text;
  v_ids       text;
  v_url       text;
  v_status    int;
  v_raw       text;
  v_body      jsonb;
  v_item      jsonb;
  v_vid       text;
  v_iso       text;
  v_secs      int;
  v_measured  int := 0;
  v_dead      int := 0;
  v_too_long  int := 0;
  v_batches   int := 0;
  v_remaining int;
  v_err       text := null;
  v_started   timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(556677889) then
    return jsonb_build_object('skipped','locked');
  end if;

  v_key := public.get_api_key('youtube');
  if v_key is null or btrim(v_key) = '' then
    return jsonb_build_object(
      'skipped','no_api_key',
      'hint','insert into public.app_api_keys(name,value) values (''youtube'', ''<key>'');'
    );
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','20000');

  for i in 1..p_batches loop
    -- Pull up to 50 unmeasured candidates and extract their 11-char video ids.
    -- Every URL shape the search agents recorded is handled here.
    create temporary table if not exists _vid_batch (cand_id uuid, vid text) on commit drop;
    delete from _vid_batch;

    insert into _vid_batch (cand_id, vid)
    select c.id,
           coalesce(
             (regexp_match(c.url, '[?&]v=([A-Za-z0-9_-]{11})'))[1],
             (regexp_match(c.url, 'youtu\.be/([A-Za-z0-9_-]{11})'))[1],
             (regexp_match(c.url, '/embed/([A-Za-z0-9_-]{11})'))[1],
             (regexp_match(c.url, '/shorts/([A-Za-z0-9_-]{11})'))[1]
           )
    from public.exercise_video_candidates c
    where c.status = 'pending' and c.duration_sec is null
    order by c.created_at
    limit 50;

    -- A row whose URL yields no id can never be measured; park it rather than
    -- letting it block the queue forever (the failure mode that killed the food
    -- import for two weeks).
    update public.exercise_video_candidates
       set status = 'dead', reviewed_at = now()
     where id in (select cand_id from _vid_batch where vid is null);
    delete from _vid_batch where vid is null;

    select string_agg(vid, ','), count(*) into v_ids, v_remaining from _vid_batch;
    exit when v_ids is null;

    v_url := 'https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id='||v_ids||'&key='||btrim(v_key);

    begin
      select r2.status, r2.content into v_status, v_raw
      from extensions.http(('GET', v_url, NULL, NULL, NULL)::extensions.http_request) r2;
    exception when others then
      v_err := 'http_threw: '||sqlerrm; exit;
    end;

    if v_status <> 200 or v_raw is null then
      v_err := 'http_status_'||coalesce(v_status::text,'null'); exit;
    end if;

    begin
      v_body := v_raw::jsonb;
    exception when others then
      v_err := 'parse_error'; exit;
    end;

    -- Anything the API did not return is gone: removed, private, or the account
    -- is deleted. Mark it dead so it stops being retried.
    update public.exercise_video_candidates c
       set status = 'dead', reviewed_at = now()
     where c.id in (
       select b.cand_id from _vid_batch b
       where not exists (
         select 1 from jsonb_array_elements(coalesce(v_body->'items','[]'::jsonb)) it
         where it->>'id' = b.vid
       )
     );
    get diagnostics v_dead = row_count;

    for v_item in select * from jsonb_array_elements(coalesce(v_body->'items','[]'::jsonb)) loop
      v_vid := v_item->>'id';
      v_iso := v_item->'contentDetails'->>'duration';   -- ISO-8601, e.g. PT1M30S

      -- Hours/minutes/seconds parsed independently; any part may be absent.
      v_secs := coalesce((regexp_match(v_iso, '(\d+)H'))[1]::int, 0) * 3600
              + coalesce((regexp_match(v_iso, '(\d+)M'))[1]::int, 0) * 60
              + coalesce((regexp_match(v_iso, '(\d+)S'))[1]::int, 0);

      -- A live stream reports P0D / PT0S. Zero is not a length, it is a
      -- non-answer, and a non-answer must not read as "very short".
      if v_secs is null or v_secs = 0 then
        continue;
      end if;

      update public.exercise_video_candidates
         set duration_sec = v_secs,
             status = case when v_secs <= 30 then 'pending' else 'too_long' end
       where id = (select cand_id from _vid_batch where vid = v_vid limit 1);

      v_measured := v_measured + 1;
      if v_secs > 30 then v_too_long := v_too_long + 1; end if;
    end loop;

    v_batches := v_batches + 1;
  end loop;

  -- THE APPLY LOOP THAT USED TO BE HERE IS GONE, ON PURPOSE.
  --
  -- It took every candidate of 30 seconds or less on an exercise with no video
  -- and wrote exercises.video_url straight away. 179 of the 179 videos clients
  -- can watch got there that way, none of them looked at first, against the
  -- rule written at the top of /api/video-candidates/decide/route.ts.
  --
  -- Measured candidates now WAIT in the queue. Approving is a person pressing
  -- "Use this", which stashes the previous URL so the choice can be taken back.
  -- `applied` stays in the return shape and reports 0 rather than vanishing, so
  -- anything reading this function's output keeps working and can see that it
  -- has stopped applying.

  select count(*) into v_remaining
  from public.exercise_video_candidates
  where status='pending' and duration_sec is null;

  return jsonb_build_object(
    'batches', v_batches, 'measured', v_measured, 'too_long', v_too_long,
    'dead', v_dead, 'applied', 0, 'remaining_unmeasured', v_remaining,
    'error', v_err, 'elapsed_ms', round(extract(milliseconds from clock_timestamp()-v_started))
  );
end;
$function$;