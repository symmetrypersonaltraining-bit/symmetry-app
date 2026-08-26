-- Finding the row a food NAME means, so the AI never has to state a number.
--
-- Dustin, 24 Aug 2026: "the ai anywhere in the app needs to be 100% accurate at
-- all times period... I wouldn't have put ai in there if I wanted a 'guess'."
--
-- Every macro figure must come from a food_catalog row, with the model only
-- choosing WHICH row. That needs a shortlist, and search_food_catalog() cannot
-- produce one from a natural food name: it matches the WHOLE PHRASE as a single
-- substring, so 'white potatoes, boiled' returns zero rows.
--
-- It also ranks an exact lowercase name match first, which on this catalogue is
-- actively dangerous. Measured 24 Aug, top hit for 'banana': 242 kcal, 2P 27C
-- 14F -- a crowd-submitted Open Food Facts row outranking 'Bananas, raw'.
-- 574,650 rows; only 21,776 verified.
--
-- A SEPARATE function, not a change to that one: the manual search sheet keeps
-- behaving exactly as it does today. Only the AI path uses this.
--
-- CANDIDATES come from two index-backed routes, unioned:
--   * trigram similarity on the whole phrase   (fc.name % term)
--   * a plain substring match on the LONGEST word of the request
-- Both ride food_catalog_name_trgm_idx. The second exists because a long
-- request dilutes trigram similarity below the default threshold, and that
-- threshold cannot be lowered inside a function without superuser.
--
-- search_path carries 'extensions' because that is where Supabase installs
-- pg_trgm; without it the % operator does not resolve inside the function even
-- though it works in an ad-hoc query.
--
-- Deliberately NOT decided here: which row is RIGHT. Ranking alone picks
-- breaded chicken tenders over roast breast. The shortlist goes to a model WITH
-- ITS MACROS ATTACHED and that judgement happens there -- see
-- src/lib/nutrition/foodResolve.ts.

create or replace function public.match_food_for_ai(p_term text, p_client_id uuid default null, p_limit integer default 10)
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
  ),
  scored as (
    select fc.id,
      (select count(*) from unnest((select toks from tok)) tk where fc.name ilike '%' || tk || '%') as hits,
      similarity(lower(fc.name), (select term from q)) as sim,
      coalesce(fc.created_by_client_id = p_client_id, false) as mine,
      coalesce(fc.verified, false) as ver,
      length(fc.name) as namelen,
      fc.name as nm,
      -- Same food listed twice (usda and usda_generic both carry it). Keep the
      -- verified copy; a shortlist of ten that is really five is half a list.
      row_number() over (partition by lower(fc.name) order by fc.verified desc nulls last, fc.id) as dupe
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

revoke all on function public.match_food_for_ai(text, uuid, int) from public, anon;
grant execute on function public.match_food_for_ai(text, uuid, int) to authenticated, service_role;
