-- Publish the 20 library recipes.
--
-- Ships SEPARATELY from 20260817_library_recipes_can_actually_publish.sql on
-- purpose: a statement placed after a dollar-quoted function body in one
-- migration is silently dropped (16 Aug), and the trigger fix has to be in
-- place before this runs or the trigger reverts it — which is exactly what
-- happened to three earlier "successful" attempts today.
--
-- Dustin, 17 Aug, asked whether to retire the 14 older overlapping recipes
-- filed under his own client record: keep them both. So this publishes and
-- hides nothing. Shared library goes from 14 to 34.
--
-- Rows backed up in public.bak_recipes_visibility_20260817.
-- Rollback: update public.recipes r set visibility = b.visibility
--           from public.bak_recipes_visibility_20260817 b where b.id = r.id;

create table if not exists public.bak_recipes_visibility_20260817 as
select id, client_id, title, visibility, now() as taken_at
from public.recipes
where client_id is null;

update public.recipes
set visibility = 'public'
where client_id is null
  and visibility is distinct from 'public';
