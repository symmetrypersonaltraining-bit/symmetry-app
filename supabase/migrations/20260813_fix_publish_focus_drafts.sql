-- ─────────────────────────────────────────────────────────────────────────────
-- publish_focus_drafts has never published a single focus line — 2026-08-13
--
-- THE FAULT
-- `clients.weekly_focus_week` is TEXT. `weekly_focus_drafts.week_start` and the
-- `p_week` parameter are DATE. The guard clause compared them directly, so the
-- function died with:
--
--     ERROR: operator does not exist: text = date
--
-- the first time it had a draft to publish.
--
-- WHY NOBODY NOTICED
-- The broken comparison is INSIDE the loop body. On 2 Aug there were no drafts,
-- so the loop never iterated, the line never executed, and cron recorded the
-- run as "succeeded, 1 row". On 9 Aug the Saturday sweep produced 33 drafts,
-- the loop ran, and it failed on the first one. The job has been stuck ever
-- since and would have failed identically every Sunday.
--
-- THE EFFECT ON CLIENTS
-- `weekly_focus_week` was NULL for all 35 clients, so the home-screen focus line
-- fell through to whatever legacy value predated the provenance columns — a
-- line written once, never refreshed, and with no week attached it never
-- expires either.
--
-- THE FIX
-- The cast. Everything else is unchanged, including the guard's intent: never
-- overwrite a focus the trainer wrote himself for this same week.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.publish_focus_drafts(p_week date, p_only_approved boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer := 0;
  r   record;
begin
  for r in
    select d.* from weekly_focus_drafts d
    where d.week_start = p_week
      and d.published_at is null
      and (not p_only_approved or d.approved_at is not null)
  loop
    update clients c
       set weekly_focus        = r.focus,
           weekly_focus_week   = p_week::text,
           weekly_focus_source = case when r.edited_at is not null then 'trainer' else 'ai' end
     where c.id = r.client_id
       -- Never clobber a focus the trainer wrote himself for this same week.
       -- weekly_focus_week is TEXT, so compare as text — comparing it to a DATE
       -- is the bug this migration exists to fix.
       and not (c.weekly_focus_source = 'trainer'
                and c.weekly_focus_week = p_week::text
                and coalesce(c.weekly_focus, '') <> '');

    update weekly_focus_drafts set published_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

-- VERIFIED IN PROD, not just applied:
--   1. Inserted a draft for the TEST account on a far-future week (2099-01-04),
--      ran publish_focus_drafts(..., false) → returned 1, the client's
--      weekly_focus / _week / _source were set, the draft was marked published.
--   2. Set that account's focus to source 'trainer' for 2099-01-11, inserted a
--      competing draft, published → the trainer's line SURVIVED. The cast did
--      not quietly disable the guard it sits in.
--   3. Removed both proofs and reset the test account.
--
-- The 33 drafts stranded since 9 Aug were DISCARDED rather than published, on
-- Dustin's call: they were written about a week that is now more than half over
-- and no client has seen them. Backed up first to bak_focus_drafts_20260813.
-- Saturday's sweep runs on current data and Sunday publishes it properly.
