-- The 20 cook-from-scratch library recipes could never be published, and
-- nothing ever said so.
--
-- Found 17 Aug while fact-checking the group message, which told clients they
-- had "20 cook-from-scratch recipes with weighed portions and checked macros".
-- They had none of them. The Recipes screen's "Shared library" tab asks for
-- `visibility = 'public'` and all 20 library rows were 'private'.
--
-- The sync route that builds the library inserts them with visibility "public"
-- (src/app/api/admin/sync-library/route.ts). So the code was right and had
-- been right for a while. The rows were private anyway.
--
-- ── WHY, and it took four attempts to see it ───────────────────────────────
--
-- `enforce_recipe_publish` is a BEFORE INSERT OR UPDATE trigger. It stops a
-- CLIENT publishing their own recipe without review, which is correct and must
-- stay. But it does it by REWRITING the row rather than refusing it:
--
--   if new.visibility = 'public' and not is_trainer() then
--     new.visibility := 'private';        -- INSERT
--   ...
--     new.visibility := old.visibility;   -- UPDATE
--
-- and `is_trainer()` resolves through `auth.uid()`:
--
--   select exists (select 1 from auth.users u
--                  join public.trainers t on lower(t.email) = lower(u.email)
--                  where u.id = auth.uid() and t.active)
--
-- The sync route runs on the SERVICE ROLE. A service-role connection has no
-- `auth.uid()`, so `is_trainer()` is false, so the trigger quietly demoted
-- every library recipe to 'private' as it was inserted. Same for a migration:
-- `is_trainer()` measured false as `postgres` today.
--
-- The failure is invisible from every angle. The insert succeeds. The update
-- reports 20 rows affected and RETURNING hands back 20 ids. `updated_at` moves,
-- because the same trigger sets it. Only the column you asked for is unchanged.
-- Three "successful" migrations changed nothing before this was found — which
-- is the same lesson as the rest of this week, one layer deeper: it is not
-- enough to check the error, or even the row count. Read the value back.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- Exempt library rows — `client_id is null` — from the publish guard.
--
-- Safe, because a client cannot create one. The INSERT policy is
-- `((client_id = my_client_id()) OR is_trainer())`, and `NULL = my_client_id()`
-- is NULL, never true. A client_id-null row can only come from a trainer or the
-- service role. The guard exists to stop a CLIENT self-publishing THEIR OWN
-- recipe, and a library row is neither.
--
-- Deliberately NOT done: widening `is_trainer()` to treat any service-role or
-- superuser connection as a trainer. That would silently relax every RLS policy
-- and every other guard in the database to fix one screen.
--
-- Also deliberately NOT done: making the trigger RAISE instead of rewriting.
-- It is reached by ordinary client saves, and turning a silent demotion into an
-- error would start failing a save that currently succeeds. Worth doing, worth
-- doing on purpose, and not in the same change as unbreaking the library.
--
-- Rollback: select def from public.bak_enforce_recipe_publish_20260817 and run
-- it; then update public.recipes r set visibility = b.visibility
--   from public.bak_recipes_visibility_20260817 b where b.id = r.id;

create table if not exists public.bak_enforce_recipe_publish_20260817 as
select pg_get_functiondef(oid) as def, now() as taken_at
from pg_proc where proname = 'enforce_recipe_publish';

create or replace function public.enforce_recipe_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Library rows are not anybody's recipe. `client_id is null` cannot be
  -- created by a client — the INSERT policy is
  -- ((client_id = my_client_id()) OR is_trainer()) and NULL = my_client_id()
  -- is never true — so these come only from a trainer or the service role that
  -- builds the library. The publish guard below exists to stop a CLIENT
  -- self-publishing THEIR OWN recipe; applying it here silently demoted all 20
  -- library recipes to 'private' on the way in and left the shelf empty.
  if new.client_id is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.visibility = 'public' and not is_trainer() then
      new.visibility := 'private';
    end if;
    return new;
  end if;
  if new.visibility is distinct from old.visibility
     and (new.visibility = 'public' or old.visibility = 'public')
     and not is_trainer() then
    new.visibility := old.visibility;
  end if;
  new.updated_at := now();
  return new;
end $function$
