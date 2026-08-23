-- ⚠️ NOT YET APPLIED TO PRODUCTION. The Supabase connector's token expired
-- mid-session on 22 Aug before this could run. Apply it with the SQL editor
-- (https://supabase.com/dashboard/project/mkfiginpiesospsnktea/sql/new) or from
-- a session with a live connector, then delete this notice.
--
-- placeholder_macro_targets reported a bare count of 17 with no detail and a
-- severity of 'info', which is why nobody has looked at it since 23 Jul.
--
-- What it is actually counting: THIRTEEN ACTIVE CLIENTS whose only macro target
-- is an auto-seeded 1800/150/165/60 row, stamped "no bodyweight on file. Refine
-- after weigh-in." It was never refined. Six of them are logging food against
-- it right now -- Robby Burns has 141 days of it and logged again today. Their
-- calorie ring is measured against a number Dustin never set.
--
-- Archived clients are excluded (four of the seventeen), the client names and
-- their food-log counts go in the detail, and it becomes a warn. A bare count
-- could not tell anybody that somebody has been eating to an invented target
-- for a month.

do $$
declare src text; out text;
begin
  src := pg_get_functiondef('public.run_integrity_checks'::regproc);
  out := replace(
    src,
    'select ''placeholder_macro_targets'',''info'',count(*),null
  from macro_targets where calories=1800 and protein=150 and carbs=165 and fats=60',
    'select ''placeholder_macro_targets'',''warn'',count(*),
         jsonb_agg(jsonb_build_object(''client'', t.name, ''since'', t.effective_date, ''food_logs'', t.logs))
  from (select c.name, mt.effective_date,
               (select count(*) from meal_adherence_logs l where l.client_id = c.id) as logs
        from macro_targets mt join clients c on c.id = mt.client_id
        where mt.calories=1800 and mt.protein=150 and mt.carbs=165 and mt.fats=60
          and c.archived_at is null
          -- Only when it is still the ONLY thing they have. A placeholder that
          -- has since been superseded is history, not a live wrong number.
          and not exists (select 1 from macro_targets m2 where m2.client_id = c.id and m2.id <> mt.id)
       ) t');
  if out = src then raise exception 'placeholder fragment not found'; end if;
  execute out;
end $$;
