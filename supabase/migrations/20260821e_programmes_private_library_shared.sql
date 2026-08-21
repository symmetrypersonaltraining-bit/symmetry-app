-- Programmes belong to the trainer who wrote them. The movement library does not.
--
-- Dustin, 21 Aug, choosing between three options: "shared library, private
-- programmes." So:
--
--   SHARED  — exercises, equipment, foods, food_catalog. A reference
--             catalogue. A new trainer inherits ~843 movements and the video
--             work rather than starting on an empty screen.
--   PRIVATE — programs, phases, days, sections, prescribed_exercises,
--             program_versions. This is a trainer's actual work for actual
--             clients.
--
-- What it was: `USING (is_trainer())` FOR ALL on every one of those tables. Not
-- merely readable — any trainer could EDIT or DELETE another trainer's client
-- programming, and nothing would say who did it. That is the part that matters
-- more than the Venmo tag this started with.
--
-- Measured before writing this: 102 programmes, 76 attributable to a trainer
-- through their assignments or personal_for_client_id, 26 unattached, and ZERO
-- shared across two trainers. So the split is clean and nothing has to be
-- duplicated.
--
-- NULL owner means a house template — every trainer may USE it, only the owner
-- may change it. That is what the 26 unattached ones are, and it is how the
-- corrective tracks stay available to a trainer who has just joined.

alter table public.programs
  add column if not exists owner_trainer_id uuid references public.trainers(id);

update public.programs p
   set owner_trainer_id = sub.t
  from (
    select p2.id,
           coalesce(
             (select c.trainer_id from public.clients c where c.id = p2.personal_for_client_id),
             (select c2.trainer_id
                from public.program_assignments pa
                join public.clients c2 on c2.id = pa.client_id
               where pa.program_id = p2.id
               limit 1)
           ) as t
    from public.programs p2
  ) sub
 where p.id = sub.id and sub.t is not null and p.owner_trainer_id is null;

create index if not exists idx_programs_owner_trainer on public.programs (owner_trainer_id);

create or replace function public.stamp_program_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.owner_trainer_id is null then
    new.owner_trainer_id := coalesce(
      public.my_trainer_id(),
      (select c.trainer_id from public.clients c where c.id = new.personal_for_client_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_program_owner on public.programs;
create trigger trg_stamp_program_owner
  before insert on public.programs
  for each row execute function public.stamp_program_owner();

-- One place decides, so the child tables cannot disagree with the parent.
create or replace function public.trainer_can_use_program(p_program uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when not public.is_trainer() then false
    when public.is_owner() then true
    else exists (
      select 1 from public.programs p
       where p.id = p_program
         and (p.owner_trainer_id is null            -- house template: usable by all
              or p.owner_trainer_id = public.my_trainer_id())
    )
  end;
$$;

create or replace function public.trainer_can_edit_program(p_program uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when not public.is_trainer() then false
    when public.is_owner() then true
    else exists (
      select 1 from public.programs p
       where p.id = p_program
         and p.owner_trainer_id = public.my_trainer_id()  -- NOT the templates
    )
  end;
$$;

comment on function public.trainer_can_use_program is
  'May this trainer READ this programme? Own programmes and house templates (owner_trainer_id null). The owner sees everything.';
comment on function public.trainer_can_edit_program is
  'May this trainer CHANGE this programme? Own programmes only — a house template is read-only to everyone but the owner.';
