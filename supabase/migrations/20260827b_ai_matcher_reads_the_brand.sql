-- The AI matcher had the same blind spot as the manual search: it scored
-- against fc.name only, so a person naming a brand ("Thomas bagel", "Fairlife
-- protein shake") got the brand word treated as noise.
--
-- The haystack is now name-plus-brand for both token counting and the anchor
-- match. The trigram candidate branch stays on fc.name, where the index is; a
-- brand-only match comes in through a third anchor branch instead.
--
-- Dedupe also widened to (name, brand): two different brands of the same food
-- name are two different foods and both belong on the shortlist.
create or replace function public.match_food_for_ai(
  p_term text,
  p_client_id uuid default null::uuid,
  p_limit integer default 10
)
returns setof food_catalog
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with q as (select lower(btrim(coalesce(p_term, ''))) as term),
  tok as (
    select array_remove(array(
      select t
      from unnest(regexp_split_to_array(regexp_replace((select term from q), '[^a-z0-9 ]', ' ', 'g'), '\s+')) t
      -- Two-letter words carry no signal and match everything.
      where length(t) >= 3
        and t not in ('the', 'and', 'for', 'with', 'some', 'plain')
    ), null) as toks
  ),
  anchor as (
    -- The longest word is the most distinctive one: 'potatoes' over 'white'.
    select (select t from unnest((select toks from tok)) t order by length(t) desc, t limit 1) as a
  ),
  candidates as (
    select fc.id from food_catalog fc, q
    where (select term from q) <> '' and fc.name % (select term from q)
    union
    select fc.id from food_catalog fc, anchor
    where (select a from anchor) is not null and fc.name ilike '%' || (select a from anchor) || '%'
    union
    -- BRAND. "Thomas bagel" anchors on 'thomas', which appears in no name.
    select fc.id from food_catalog fc, anchor
    where (select a from anchor) is not null and fc.brand ilike '%' || (select a from anchor) || '%'
  ),
  scored as (
    select fc.id,
      (select count(*) from unnest((select toks from tok)) tk
        where (fc.name || ' ' || coalesce(fc.brand, '')) ilike '%' || tk || '%') as hits,
      similarity(lower(fc.name || ' ' || coalesce(fc.brand, '')), (select term from q)) as sim,
      coalesce(fc.created_by_client_id = p_client_id, false) as mine,
      coalesce(fc.verified, false) as ver,
      length(fc.name) as namelen,
      fc.name as nm,
      -- Same food listed twice (usda and usda_generic both carry it). Keep the
      -- verified copy; a shortlist of ten that is really five is half a list.
      row_number() over (partition by lower(fc.name), coalesce(lower(fc.brand), '')
                         order by fc.verified desc nulls last, fc.id) as dupe
    from food_catalog fc
    join candidates c on c.id = fc.id
    where (p_client_id is null or fc.created_by_client_id is null or fc.created_by_client_id = p_client_id)
      and fc.protein is not null and fc.carbs is not null and fc.fats is not null
  )
  select fc.*
  from scored s
  join food_catalog fc on fc.id = s.id
  where s.dupe = 1
    -- A row sharing no word with the request is a trigram accident.
    and s.hits > 0
  order by
    -- The client's own saved foods win: they made that row on purpose.
    s.mine desc, s.hits desc, s.ver desc, s.sim desc, s.namelen, s.nm
  limit greatest(1, least(p_limit, 25));
$function$;
