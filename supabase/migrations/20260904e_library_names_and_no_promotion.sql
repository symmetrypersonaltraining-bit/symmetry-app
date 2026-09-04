-- TWO GUARDS FOR THE TWO RULES DUSTIN WROTE INTO HIS PROGRAMMING PROJECT (4 Sep).
--
--   A. "public workouts should never get named by client names or initials"
--   B. "when i modify current workouts in the library, that's a 1 time thing,
--       i do not want those saved as near duplicates to the library ... just
--       mark them in calendar as modified from original"
--
-- Enforced here rather than at a call site because at least four routes create
-- or re-own a day (workout-manual, workout-ai, workoutAdjust, the swap fork).
-- Finding three of four is how the last one got missed.
--
-- ── A. THE NAMING GUARD ─────────────────────────────────────────────────────
--
-- Deliberately narrow. A false positive blocks his programming, and the standing
-- rule is that when a check disagrees with how he works, the CHECK changes. Two
-- patterns only, both replayed against the live data before being turned on:
--
--   1. A client-code prefix — "GG2 ", "HK6 ", "LSP6 ". Letters plus a REQUIRED
--      digit, so no exercise abbreviation (BW, DB, KB, SL, GHD, APT) can trip it.
--   2. A client's first name of four letters or more, used as a person
--      reference: after a dash, after an open paren, or possessive. The length
--      floor and the position requirement are what stop "Day" — as in Jennifer
--      Day — from flagging every workout in the library. A first draft without
--      them matched 200+ innocent labels including "Barn Workout - Day 1".
create or replace function public.library_name_is_not_a_person()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := coalesce(new.label, '');
  v_hit  text;
begin
  -- Client-owned workouts are private to that client; this rule is about what
  -- the whole roster can see.
  if new.client_owner_id is not null then
    return new;
  end if;

  if v_name ~ '^[A-Z]{2,4}[0-9]\s' then
    raise exception
      'A library workout cannot be named with a client code. "%" starts with a client prefix — name it for the work (pattern, focus, level), not the person.',
      left(v_name, 40)
      using errcode = 'check_violation';
  end if;

  select split_part(c.name, ' ', 1) into v_hit
  from clients c
  where length(split_part(c.name, ' ', 1)) >= 4
    and ( v_name ~ ('(—|–|-)\s*' || split_part(c.name, ' ', 1) || '\M')
       or v_name ~ ('\(' || split_part(c.name, ' ', 1) || '\M')
       or v_name ~ (split_part(c.name, ' ', 1) || '''s\M') )
  limit 1;

  if v_hit is not null then
    raise exception
      'A library workout cannot be named after a client. "%" names %  — name it for the work, not the person. A condition on its own ("No Overhead", "Low Back Sensitive") is fine.',
      left(v_name, 40), v_hit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_library_name_is_not_a_person on public.days;
create trigger trg_library_name_is_not_a_person
  before insert or update of label, client_owner_id on public.days
  for each row execute function public.library_name_is_not_a_person();

-- ── B. A ONE-OFF EDIT CANNOT BECOME A LIBRARY WORKOUT ───────────────────────
--
-- A mid-block modification is "a 1 time thing": the scheduled session changes,
-- the library original does not, and no near-duplicate is left behind. The
-- routes that clone a day for one client stamp it `library_fork`,
-- `forked_for_swap`, `ai_adjust` or `ai_replace`. Clearing the owner on one of
-- those is exactly the promotion he does not want, and it is how the library
-- would fill with 60 near-identical entries — the count that was already
-- sitting there on 4 Sep.
--
-- Trigger order matters and is deliberate: triggers fire alphabetically, so
-- trg_owner_creations_are_library (o) runs before this one (t). A fork made
-- from his own client account gets its owner nulled there and is caught here.
-- That is the right outcome — a fork is a fork whoever made it.
create or replace function public.a_one_off_edit_stays_a_one_off()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and old.client_owner_id is not null
     and new.client_owner_id is null
     and coalesce(new.origin, '') in ('library_fork', 'forked_for_swap', 'ai_adjust', 'ai_replace')
  then
    raise exception
      'This workout is a one-off modification of "%", not a new library workout. It stays with the client it was made for.',
      coalesce((select label from days where id = new.swapped_from_day_id), 'a library workout')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_a_one_off_edit_stays_a_one_off on public.days;
create trigger trg_a_one_off_edit_stays_a_one_off
  before update of client_owner_id on public.days
  for each row execute function public.a_one_off_edit_stays_a_one_off();
