-- WHAT DUSTIN BUILDS IS THE LIBRARY, WHICHEVER ACCOUNT HE BUILT IT FROM.
--
-- 4 Sep, confirming the visibility rule: "if I created it under my account then
-- it gets saved to my library for everyone. only ones that stay on client only
-- are something they create themselves from their account. i always create new
-- workouts, those should keep building my library bigger."
--
-- He has a client record of his own — he trains himself and uses the client app —
-- so a workout he built while signed into it was stamped with HIS client id and
-- became private to him. Twelve had. Every one is library content the whole
-- roster should have.
--
-- Two halves: clear those twelve, and stop it happening again at the write, so
-- every path is covered rather than whichever ones we happened to find.
create table if not exists bak_days_owner_stamp_20260904 as
select d.id, d.label, d.client_owner_id, d.phase_id, now() as taken_at
from days d
where d.client_owner_id in (
  select c.id from clients c
  join trainers t on (t.auth_user_id = c.auth_user_id or lower(t.email) = lower(c.email))
  where t.role = 'owner' and t.active
);

update public.days set client_owner_id = null
where id in (select id from bak_days_owner_stamp_20260904);

create or replace function public.owner_creations_are_library()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only the OWNER's stamp is cleared. Another trainer's client-side creation is
  -- left alone deliberately: the library is one shared pool today with no
  -- per-trainer scoping, so clearing their stamp would publish their work to
  -- every client in the business. That is a decision for Dustin, not a side
  -- effect of this trigger. See AUDIT-RESUME.md.
  if new.client_owner_id is not null
     and exists (
       select 1
       from clients c
       join trainers t on (t.auth_user_id = c.auth_user_id or lower(t.email) = lower(c.email))
       where c.id = new.client_owner_id
         and t.role = 'owner'
         and t.active
     )
  then
    new.client_owner_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_owner_creations_are_library on public.days;
create trigger trg_owner_creations_are_library
  before insert or update of client_owner_id on public.days
  for each row execute function public.owner_creations_are_library();
