-- Shared recipe library: let every client READ the library recipes.
--
-- ── Why this is needed, and why the obvious fix was wrong ─────────────────
--
-- Library recipes are inserted with client_id NULL and visibility 'public'.
-- They came out 'private', all twenty of them, and were therefore invisible to
-- every client — recipes_read is
--   (visibility = 'public' OR client_id = my_client_id() OR is_trainer())
-- and a library row satisfies none of those once its visibility is private.
--
-- The cause is trg_recipe_publish → enforce_recipe_publish(), which downgrades
-- an INSERT of visibility='public' to 'private' unless is_trainer(). The sync
-- route writes with the SERVICE ROLE, which has no authenticated user, so
-- is_trainer() is false and the downgrade fires.
--
-- THAT TRIGGER IS CORRECT AND IS NOT BEING CHANGED. It is what stops a client
-- publishing their own recipe to everybody else, and loosening it — or teaching
-- is_trainer() to say yes to the service role — would trade a real security
-- property for a seeding convenience. The trigger is not the problem; the read
-- policy simply had no concept of a row that belongs to nobody.
--
-- So: library rows are readable because they are LIBRARY rows (client_id IS
-- NULL), exactly as my_meals does it. Writes are untouched — recipes_insert,
-- recipes_update and recipes_delete all still require ownership or trainer, so
-- a client can read a library recipe and copy it, and can never edit the shared
-- one.
--
-- Found by querying the rows after the sync reported 200 OK. The route's own
-- report said {"ok":true,"recipes":20} and it was telling the truth — the
-- inserts DID succeed. What it could not see was a trigger quietly rewriting a
-- column on the way in.

drop policy if exists recipes_library_read on public.recipes;

create policy recipes_library_read on public.recipes
  for select using (client_id is null);

-- The ingredients follow the recipe. Without this the recipe is visible and
-- lists nothing, which is worse than not showing it at all.
drop policy if exists recipe_ing_library_read on public.recipe_ingredients;

create policy recipe_ing_library_read on public.recipe_ingredients
  for select using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.client_id is null
    )
  );
