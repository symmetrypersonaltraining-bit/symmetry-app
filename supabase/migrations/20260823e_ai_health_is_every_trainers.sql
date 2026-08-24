-- AI HEALTH IS EVERY TRAINER'S PAGE, SHOWING THEM THEIR OWN.
--
-- /settings/ai-health was gated on "is a trainer" and then read with the
-- SERVICE ROLE, so a coach hired on Monday could read the whole business's AI
-- costs on Tuesday. On 23 Aug I fixed that by making the page owner-only, and
-- that was the wrong fix.
--
-- Dustin: "if I have it on my trainer app, build it exactly the same on
-- theirs." And the page's own header says why he is right: SILENCE IS THE
-- FAILURE MODE. Every AI surface in this app degrades quietly on purpose — a
-- celebration that cannot reach the model shows its written headline, a coach
-- card that fails just does not appear. A trainer with no health page cannot
-- tell a feature nobody uses from a feature that has been broken for her
-- clients for a week. That blindness is the exact thing the page was built to
-- end, and owner-only handed it straight back to everyone else.
--
-- So the page is every trainer's, scoped to their own clients. The month-to-date
-- SPEND stays owner-only: there is one API key and one cap, the number is the
-- business's rather than a per-coach one, and a slice of it shown against the
-- whole cap would mean nothing.
--
-- Scoping needs an owner on the row. `ai_usage_log` had `client_id` (nullable)
-- and nothing else, and resolving a trainer through a join at read time would
-- miss the rows that matter most — a failure logged for a client who has since
-- been reassigned should still be the coach's who was there when it happened.
--
-- The stamp is a TRIGGER rather than an argument to logUsage(). logUsage has
-- fourteen call sites across the AI routes; an argument is fourteen chances to
-- forget, and the one that forgets is invisible until somebody notices a
-- surface missing from their page. The trigger cannot be forgotten.
--
-- A row with no client at all — the trainer agent, a roster-wide sweep — is
-- attributed to nobody and stays null, which is where the owner sees it and
-- where its cost already lands.

alter table public.ai_usage_log
  add column if not exists trainer_id uuid references public.trainers(id) on delete set null;

create or replace function public.stamp_ai_usage_trainer()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.trainer_id is null and new.client_id is not null then
    select c.trainer_id into new.trainer_id from public.clients c where c.id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_ai_usage_trainer on public.ai_usage_log;
create trigger trg_stamp_ai_usage_trainer
  before insert on public.ai_usage_log
  for each row execute function public.stamp_ai_usage_trainer();

-- Backfill what is attributable. 1,327 of 1,342 rows at time of writing; the
-- 15 that are not have no client_id.
update public.ai_usage_log l
   set trainer_id = c.trainer_id
  from public.clients c
 where l.client_id = c.id and l.trainer_id is null;

create index if not exists ai_usage_log_trainer_created
  on public.ai_usage_log (trainer_id, created_at desc);
