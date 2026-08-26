-- A capped mirror publish has to be able to finish.
--
-- The first publish is ~721 events and a run writes about 83 before its
-- wall-clock deadline. session_mirror_synced_at deliberately does NOT move on a
-- capped run -- advancing it would mark unwritten sessions as published and
-- they would never be written again -- but that also leaves `since` null, which
-- turns the incremental skip off. So every run started at the top of the window
-- and rewrote the same first 83 events. An hour at a time, forever, never
-- reaching the 84th.
--
-- The cursor is the other half of that rule: the watermark says "everything up
-- to here is published and current", the cursor says "carry on from here". A
-- timestamp rather than a row count, because a count means a different session
-- between one run and the next.
alter table public.trainers add column if not exists session_mirror_cursor timestamptz;

comment on column public.trainers.session_mirror_cursor is
  'Resume point for a capped mirror publish: the starts_at of the last session written. NULL means start from the beginning of the window. Cleared when a pass completes cleanly, at which moment session_mirror_synced_at takes over as the incremental watermark.';
