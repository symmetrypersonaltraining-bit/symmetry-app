-- A FOOD HE WEIGHS STILL HAS TO OFFER THE MEASURE IT COMES IN
--
-- Dustin, 7 Sep, opening Kerrygold in the food sheet: grams, no tablespoon
-- anywhere in the picker, 750 cal per 100 g. "I still can log my fucking
-- butter!!!! no tbsp, multiple wrong numbers. you rebuilt the full fucking
-- database how are we still here?"
--
-- Fair question, and the answer is that this row never came from the catalogue.
-- The 6 Sep rebuild replaced 322,000 catalogue rows. THIS one is generated from
-- his own meal plans by refresh_trainer_foods, which the rebuild did not touch.
--
-- That function picks ONE unit per food: the one he used most. "Kerrygold Irish
-- butter - 6 g" appears twice, in Claudine's plan, so the row was built on a
-- gram basis and serving_options held "1 g" and "100 g" and nothing else. The
-- butter he has written as a TABLESPOON eight times had no tablespoon on it.
--
-- The app-side half of this is in src/lib/nutrition/foodUnitDefaults.ts: the
-- matcher preferred the longer name on principle, so two entries beat eight,
-- and because the answer was a weight it also skipped the unit borrow. It now
-- weighs his own counts instead.
--
-- This is the data half. A weight-based trainer row also borrows the household
-- measure from HIS OWN row for the same food - "Butter", 1 tbsp, 15 g - longest
-- matching name first, so "Kerrygold Irish butter" takes butter's tablespoon
-- and not something broader.
--
-- IT ONLY ADDS AN OPTION. The basis, the macros and serving_grams are left
-- exactly as they were, so no number on any screen changes as a result of this;
-- there is simply a measure a person can use sitting next to the grams.

begin;

create table if not exists bak_trainer_servings_20260907 as
  select id, name, serving_desc, serving_grams, serving_options
  from food_catalog where source='trainer';

-- Fold the same rule into the weekly generator, or Monday 08:50 puts it back
-- the way it was. Proven by deleting the tablespoon, running the job, and
-- watching it return.
do $do$
declare src text; out text;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='refresh_trainer_foods' and pronamespace='public'::regnamespace;
  if src is null then return; end if;
  if position('household as (' in src) > 0 then return; end if;

  out := replace(src,
'  perform public.recompute_food_quarantine();',
$new$  with household as (
    select lower(name) lname,
           jsonb_build_object('desc', serving_options->0->>'desc',
                              'grams', (serving_options->0->>'grams')::numeric) opt,
           serving_options->0->>'desc' hh_desc
    from food_catalog
    where source='trainer'
      and serving_desc !~* '^1 (g|ml|oz|kg|lb)$'
      and serving_options->0->>'desc' is not null
  ), pick as (
    select distinct on (w.id) w.id, h.opt, h.hh_desc
    from food_catalog w
    join household h
      on lower(w.name) <> h.lname
     and lower(w.name) ~ ('(^|[^a-z])' || regexp_replace(h.lname,'([.^$*+?()\[\]{}|\\])','\\\1','g') || '([^a-z]|$)')
    where w.source='trainer' and w.serving_desc ~* '^1 (g|ml|oz|kg|lb)$'
    order by w.id, length(h.lname) desc
  )
  update food_catalog fc
     set serving_options = fc.serving_options || jsonb_build_array(pick.opt)
  from pick
  where fc.id = pick.id
    and not exists (select 1 from jsonb_array_elements(fc.serving_options) o
                    where o->>'desc' = pick.hh_desc);

  perform public.recompute_food_quarantine();$new$);

  if out = src then raise exception 'refresh_trainer_foods: anchor not found'; end if;
  execute out;
end $do$;

-- And apply it to the rows that already exist. Ten of them, every match his own
-- food lending to its own variant: butter's tablespoon to the Kerrygold,
-- blueberries' cup to the frozen ones, an almond's weight to the sliced ones.
select public.refresh_trainer_foods();

commit;
