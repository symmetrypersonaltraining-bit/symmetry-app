-- Every trainer can run an assessment on somebody who is not a client yet.
--
-- Dustin, 21 Aug: "they should also be able to fill out assessment pages, add
-- clients etc... they are testing the app, they need full functionality just
-- like i have to manage their own clients and all their data."
--
-- The blocker was one branch of one policy:
--
--   CASE WHEN client_id IS NULL THEN is_owner()
--        ELSE trainer_can_see_client(client_id) END
--
-- An assessment for a walk-in has no client row yet, so client_id is NULL — and
-- that branch made it OWNER ONLY. Every trainer but Dustin was locked out of
-- the front door of his own intake flow: assess the prospect, then create the
-- client from the assessment. Not a deliberate restriction; the table simply
-- had no way to say whose assessment it was, so the safe fallback was "his".
--
-- Now it can say. created_by_trainer_id is stamped automatically, so no write
-- path has to remember, including the ones that run as the service role and
-- have no auth.uid() to read.
alter table public.client_assessments
  add column if not exists created_by_trainer_id uuid references public.trainers(id);

update public.client_assessments a
   set created_by_trainer_id = c.trainer_id
  from public.clients c
 where a.client_id = c.id and a.created_by_trainer_id is null;

create or replace function public.stamp_assessment_trainer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.created_by_trainer_id is null then
    -- The signed-in trainer, or failing that the client's trainer. The second
    -- branch covers the service-role routes, where auth.uid() is null — the
    -- same trap that made every client Stephanie created land on Dustin's
    -- roster back in August.
    new.created_by_trainer_id := coalesce(
      public.my_trainer_id(),
      (select c.trainer_id from public.clients c where c.id = new.client_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_assessment_trainer on public.client_assessments;
create trigger trg_stamp_assessment_trainer
  before insert on public.client_assessments
  for each row execute function public.stamp_assessment_trainer();

create index if not exists idx_client_assessments_created_by
  on public.client_assessments (created_by_trainer_id);

drop policy if exists "trainer_scoped_assessments" on public.client_assessments;

create policy "trainer_scoped_assessments"
  on public.client_assessments for all to authenticated
  using (
    case
      when client_id is not null then public.trainer_can_see_client(client_id)
      else public.is_owner() or created_by_trainer_id = public.my_trainer_id()
    end
  )
  with check (
    case
      when client_id is not null then public.trainer_can_see_client(client_id)
      else public.is_owner() or created_by_trainer_id = public.my_trainer_id()
    end
  );
