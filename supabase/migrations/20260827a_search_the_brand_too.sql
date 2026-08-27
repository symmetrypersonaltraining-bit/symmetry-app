-- "THOMAS BAGEL" FOUND NOTHING, AND THOMAS' BAGELS ARE IN THE TABLE.
--
-- Dustin, 27 Aug: "yiu telling me we dont have the most well known brand bagels
-- in there?"
--
-- We do. `Bagels plain` / brand `Thomas`, `Cinnamon Raisin Pre-Sliced Bagels` /
-- brand `Thomas`, `Cranberry Bagels` / brand `Thomas'`, six more. Both search
-- functions looked only at fc.name. The brand column has never been searched.
--
-- search_food_catalog was worse than that: it matched the WHOLE PHRASE as one
-- substring (fc.name ilike '%thomas bagel%'), so it could not find a row called
-- "Bagels plain" from the words "Thomas" and "bagel" even if brand were part of
-- the name. Every word now has to appear SOMEWHERE in name-plus-brand, which is
-- what a person means when they type two words.
--
-- See 20260827b for the same fix on the AI matcher.

create or replace function public.search_food_catalog(
  p_term text,
  p_client_id uuid default null::uuid,
  p_limit integer default 40,
  p_mine_only boolean default false
)
returns setof food_catalog
language sql
stable
set search_path to 'public'
as $function$
  with t as (select lower(btrim(coalesce(p_term, ''))) as q),
  tok as (
    select array_remove(array(
      select w
      from unnest(regexp_split_to_array(
        regexp_replace((select q from t), '[^a-z0-9 ]', ' ', 'g'), '\s+')) w
      where length(w) >= 2
    ), null) as toks
  )
  select fc.*
  from food_catalog fc, t, tok
  where (not p_mine_only or fc.created_by_client_id = p_client_id)
    and (p_client_id is null or fc.created_by_client_id is null or fc.created_by_client_id = p_client_id)
    and (
      (select q from t) = ''
      -- EVERY word, anywhere in name or brand. "thomas bagel" -> a row named
      -- "Bagels plain" branded "Thomas" matches on both, which is the point.
      or (
        cardinality((select toks from tok)) > 0
        and not exists (
          select 1 from unnest((select toks from tok)) w
          where (fc.name || ' ' || coalesce(fc.brand, '')) !~* ('(^|[^a-z0-9])' || regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'))
        )
      )
    )
  order by
    coalesce(fc.created_by_client_id = p_client_id, false) desc,
    case
      when lower(fc.name) = (select q from t) then 0
      when lower(fc.name) like (select q from t) || '%' then 1
      -- A branded row whose brand the person actually typed ranks with the
      -- name-prefix matches: typing a brand is a strong signal.
      when fc.brand is not null and (select q from t) like '%' || lower(fc.brand) || '%' then 1
      when lower(fc.name) ~ ('\y' || regexp_replace((select q from t), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\y') then 2
      else 3
    end,
    coalesce(fc.verified, false) desc,
    -- How badly the stated calories disagree with its own macros, bucketed so
    -- that rounding noise does not reorder good rows.
    case
      when fc.kcal is null or fc.protein is null or fc.carbs is null or fc.fats is null then 1
      when greatest(fc.kcal, fc.protein*4 + fc.carbs*4 + fc.fats*9) <= 0 then 1
      else least(9, floor(
        abs(fc.kcal - (fc.protein*4 + fc.carbs*4 + fc.fats*9))
        / greatest(1, greatest(fc.kcal, fc.protein*4 + fc.carbs*4 + fc.fats*9))
        / 0.15)::int)
    end,
    length(fc.name),
    fc.name
  limit greatest(1, least(p_limit, 100));
$function$;
