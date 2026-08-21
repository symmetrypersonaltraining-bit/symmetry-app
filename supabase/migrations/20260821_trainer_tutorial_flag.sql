-- The new-trainer tutorial ships dark.
--
-- Built end to end, reachable by nobody until this row is flipped from
-- Settings. Dustin reviews it first and tests it on a second trainer's
-- account before it goes anywhere near a real new trainer.
--
-- Additive only. No table is altered and no data is touched.
insert into public.app_flags (key, enabled)
values ('trainer_tutorial_live', false)
on conflict (key) do nothing;
