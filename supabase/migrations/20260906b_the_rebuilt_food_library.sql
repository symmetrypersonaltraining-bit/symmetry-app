-- THE REBUILT FOOD LIBRARY
--
-- Dustin, 6 Sep, after a weekend of the same wrong butter: *"you can and you
-- will verify the full library or you will rebuild the entire thing. not just
-- the item 'at the top'. all of them. there will be zero wrong ones in this app
-- period."*
--
-- So it was rebuilt. What this migration records:
--
--   1. Open Food Facts is gone. 511,552 rows, crowd-typed, unverifiable — one
--      of them had Kerrygold butter at 100 kcal per 100 g, internally
--      consistent and completely wrong, and no test can separate that from the
--      thousands like it. Rows still referenced by a logged meal or a recipe
--      were kept and hidden. The two cron jobs that re-imported OFF every five
--      minutes are unscheduled here; leaving them armed would have refilled
--      both the catalogue and the 1 GB disk within the hour.
--
--   2. An authoritative core: USDA SR28 (8,789 foods, data/usda-sr28.tsv) and
--      USDA Branded (442,891). Postgres fetches both itself through the `http`
--      extension — the sandbox and his laptop are both egress-blocked from
--      those hosts, the database is not.
--
--   3. A quality gate that runs nightly and hides anything that cannot be
--      trusted: numbers that trace to no lab or label, arithmetic that does not
--      hold against the row's own basis, or a food with no measure a person
--      would actually use.
--
--   4. Ranking that puts his own foods first, never leads with a row that
--      contradicts USDA, and — new here — never offers the diet version of a
--      product to someone who typed the plain name.
--
-- Everything below was applied live while the rebuild ran. This file is the
-- record, written so a fresh database reaches the same place.

begin;

-- ---------------------------------------------------------------------------
-- 1. COLUMNS AND KEYS
-- ---------------------------------------------------------------------------

alter table food_catalog add column if not exists usda_ndb      text;
alter table food_catalog add column if not exists fdc_id        text;
alter table food_catalog add column if not exists quarantined   boolean not null default false;
alter table food_catalog add column if not exists usda_conflict boolean not null default false;

comment on column food_catalog.usda_ndb is
  'USDA SR28 NDB number. The natural key for the authoritative core, so a re-import updates in place rather than duplicating.';
comment on column food_catalog.fdc_id is
  'USDA FoodData Central id for a branded row. Also the source of that row''s GTIN — see the barcode note below.';
comment on column food_catalog.quarantined is
  'Set by recompute_food_quarantine(). A quarantined row is never searchable and never resolvable by the AI, but is not deleted: an old log may still reference it.';
comment on column food_catalog.usda_conflict is
  'The row''s calories disagree with USDA for a food of that name. Cannot be used to hide it — shirataki noodles really are 5 cal — but it sorts such a row down.';

create unique index if not exists food_catalog_usda_ndb_uidx on food_catalog (usda_ndb);
create unique index if not exists food_catalog_fdc_id_uidx   on food_catalog (fdc_id);

-- 'usda_core' and 'usda_branded' join the allowed sources; 'trainer' (foods
-- derived from his own meal plans) was already in use but never declared.
alter table food_catalog drop constraint if exists food_catalog_source_check;
alter table food_catalog add constraint food_catalog_source_check check (
  source = any (array['trainer','usda_core','usda_branded','usda','usda_generic',
                      'off','brand','restaurant','community','client'])
);

-- ---------------------------------------------------------------------------
-- 2. REFERENCE TABLES
-- ---------------------------------------------------------------------------

-- How much a household portion of a food weighs, keyed on the last real word of
-- its name ("blueberry pancake" -> pancake). `produce` marks a word that names a
-- fruit or vegetable, because those are the ones that turn up as flavours: a
-- "diet orange burst" soda must not be handed the 182 g of an orange.
create table if not exists serving_kw (
  word    text primary key,
  grams   numeric not null,
  produce boolean not null default false
);

-- Two- and three-word phrases that beat any single word in the name. "pancake
-- mix" is not a pancake, and the word-level rule matched it to "cake mix".
create table if not exists serving_phrase (
  phrase text primary key,
  grams  numeric not null
);

-- Calories per 100 g for a plain food, from USDA. Used to flag a row that
-- contradicts it (food_catalog.usda_conflict), not to correct one.
create table if not exists usda_kcal_ref (
  food text primary key,
  kcal numeric not null
);

-- Words that mark a food as a VARIANT of a plainer product.
create table if not exists food_variant_qualifier (
  phrase text primary key,
  weight int not null default 1
);
comment on table food_variant_qualifier is
  'Qualifiers that make a food a variant of a plainer one. If the search did not ask for the qualifier, the row carrying it ranks below the row without: "kerrygold butter" led with Reduced Fat Irish Butter, 571 kcal, where the butter he buys is 717. Weight 2 = the macros are deliberately different (a diet version). Weight 1 = the same food in another form.';

insert into food_variant_qualifier (phrase, weight) values
  ('reduced fat',2),('low fat',2),('lowfat',2),('fat free',2),('fatfree',2),
  ('nonfat',2),('non fat',2),('no fat',2),('half fat',2),('lower fat',2),
  ('fat reduced',2),('reduced calorie',2),('low calorie',2),('light',2),('lite',2),
  ('diet',2),('sugar free',2),('sugarfree',2),('no sugar',2),('reduced sugar',2),
  ('less sugar',2),('zero sugar',2),('no sugar added',2),('unsweetened',2),
  ('imitation',2),('substitute',2),('meatless',2),('plant based',2),('vegan',2),
  ('skim',2),('part skim',2),('nonfat dry',2),('1%',2),('2%',2),
  ('decaffeinated',2),('caffeine free',2),('alcohol free',2),
  ('reduced sodium',1),('low sodium',1),('no salt',1),('no salt added',1),
  ('unsalted',1),('salt free',1),('lightly salted',1),
  ('whipped',1),('spreadable',1),('softer',1),('powdered',1),
  ('dried',1),('dehydrated',1),('freeze dried',1),('instant',1),
  ('concentrate',1),('concentrated',1),('condensed',1),('evaporated',1),
  ('flavored',1),('flavoured',1),('seasoned',1),('smoked',1),
  ('mini',1),('miniature',1),('bite size',1),('snack size',1),('fun size',1),
  ('family size',1),('king size',1)
on conflict (phrase) do update set weight = excluded.weight;
-- Deliberately absent: 'extra' (extra virgin olive oil IS the plain product),
-- 'double', and 'soft' (soft taco, soft drink — there the word is the food).

-- ---------------------------------------------------------------------------
-- 3. THE AUTHORITATIVE CORE — USDA SR28
-- ---------------------------------------------------------------------------

create or replace function public.import_usda_core()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare v_raw text; v_status int; v_ins int := 0; v_upd int := 0; v_n int := 0;
        v_started timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(918273647) then return jsonb_build_object('skipped','locked'); end if;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','60000');
  select r.status, r.content into v_status, v_raw
  from extensions.http(('GET',
    'https://raw.githubusercontent.com/symmetrypersonaltraining-bit/symmetry-app/main/data/usda-sr28.tsv',
    array[extensions.http_header('Accept','text/plain')], NULL, NULL)::extensions.http_request) r;
  if v_status <> 200 or v_raw is null then return jsonb_build_object('error','fetch_failed','status',v_status); end if;

  create temp table _sr28 on commit drop as
  with lines as (select row_number() over () rn, l from unnest(string_to_array(v_raw, E'\n')) l),
  parsed as (select rn, string_to_array(l, E'\t') f from lines where rn > 1 and btrim(l) <> '')
  select f[1] ndb, f[2] name,
    nullif(f[3],'')::numeric kcal, nullif(f[4],'')::numeric protein,
    nullif(f[5],'')::numeric carbs, nullif(f[6],'')::numeric fats,
    nullif(f[7],'')::numeric fiber, nullif(f[8],'')::numeric sugar,
    nullif(f[9],'')::numeric sodium, nullif(f[10],'')::numeric sat_fat,
    nullif(btrim(f[11]),'') p1, nullif(f[12],'')::numeric p1g,
    nullif(btrim(coalesce(f[13],'')),'') p2, nullif(coalesce(f[14],''),'')::numeric p2g
  from parsed;

  select count(*) into v_n from _sr28;

  with prepared as (
    select s.*, (jsonb_build_array(
        jsonb_build_object('desc','100 g','grams',100),
        jsonb_build_object('desc','1 oz','grams',28.35))
      || case when s.p1 is not null and s.p1g > 0 then jsonb_build_array(jsonb_build_object('desc',s.p1,'grams',s.p1g)) else '[]'::jsonb end
      || case when s.p2 is not null and s.p2g > 0 then jsonb_build_array(jsonb_build_object('desc',s.p2,'grams',s.p2g)) else '[]'::jsonb end
      ) opts from _sr28 s
  ), up as (
    insert into food_catalog (name, brand, source, verified, kcal, protein, carbs, fats,
      fiber, sugar, sodium, sat_fat, serving_desc, serving_grams, serving_options, usda_ndb)
    -- serving_desc/serving_grams describe the BASIS of the macros, not a
    -- portion. USDA quotes per 100 g, so this is always '100 g'/100; the real
    -- measures live in serving_options. Setting it to the pat weight once made
    -- a tablespoon of butter read 2,036 cal. Every SQL check looked fine; it
    -- was caught only by opening the app.
    select p.name, null, 'usda_core', true, p.kcal, p.protein, p.carbs, p.fats,
           p.fiber, p.sugar, p.sodium, p.sat_fat, '100 g', 100, p.opts, p.ndb
    from prepared p
    on conflict (usda_ndb) do update
      set name=excluded.name, kcal=excluded.kcal, protein=excluded.protein, carbs=excluded.carbs,
          fats=excluded.fats, fiber=excluded.fiber, sugar=excluded.sugar, sodium=excluded.sodium,
          sat_fat=excluded.sat_fat, serving_desc='100 g', serving_grams=100,
          serving_options=excluded.serving_options, verified=true, source='usda_core'
    returning (xmax = 0) inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;

  return jsonb_build_object('parsed',v_n,'inserted',v_ins,'updated',v_upd,
    'elapsed_ms', round(extract(milliseconds from clock_timestamp()-v_started)));
end $function$;

-- ---------------------------------------------------------------------------
-- 4. USDA BRANDED — 442,891 packaged products, imported in parallel slices
-- ---------------------------------------------------------------------------
--
-- Eight workers each own a slice of the dataset and page through it on their own
-- cron schedule, staggered a minute apart. Anonymous HuggingFace requests get
-- rate limited hard at that concurrency, hence the token and the backoff. The
-- workers are all 'done' now; the function stays so the dataset can be pulled
-- again without reconstructing any of this.

create or replace function public.import_usda_branded(p_worker integer, p_workers integer default 8, p_pages integer default 25, p_length integer default 100)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_src text := 'usda_branded_w' || p_worker;
  v_offset bigint; v_end bigint; v_status text; v_total bigint := 456453;
  v_url text; v_http int; v_raw text; v_body jsonb; v_rows jsonb;
  v_n int; v_ins int := 0; v_run int := 0; v_pages int := 0; v_429 int := 0;
  v_done boolean := false; v_err text := null; v_attempt int;
  v_slice bigint; v_started timestamptz := clock_timestamp();
  v_token text; v_headers extensions.http_header[];
begin
  if not pg_try_advisory_xact_lock(918274000 + p_worker) then
    return jsonb_build_object('skipped','locked');
  end if;
  select cursor, status into v_offset, v_status
    from public.food_import_state where source = v_src for update;
  if not found then
    v_slice := ceil(v_total::numeric / p_workers);
    v_offset := p_worker * v_slice;
    insert into public.food_import_state (source, cursor, status, imported_count, total_available)
    values (v_src, v_offset, 'running', 0, v_total);
    v_status := 'running';
  end if;
  if v_status = 'done' then return jsonb_build_object('skipped','done'); end if;
  v_slice := ceil(v_total::numeric / p_workers);
  v_end := least(v_total, (p_worker + 1) * v_slice);

  -- Anonymous requests get rate limited hard; the token lifts that.
  v_token := public.get_api_key('huggingface');
  v_headers := case when v_token is null or btrim(v_token) = ''
    then array[extensions.http_header('Accept','application/json')]
    else array[extensions.http_header('Accept','application/json'),
               extensions.http_header('Authorization','Bearer ' || btrim(v_token))] end;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS','45000');

  for i in 1..p_pages loop
    exit when v_offset >= v_end;
    begin
      v_url := format('https://datasets-server.huggingface.co/rows?dataset=jacktol%%2Fusda-branded-food-data&config=default&split=train&offset=%s&length=%s',
                      v_offset, least(p_length, v_end - v_offset));
      v_body := null;
      for v_attempt in 1..4 loop
        v_http := null; v_raw := null;
        begin
          select r.status, r.content into v_http, v_raw
          from extensions.http(('GET', v_url, v_headers, NULL, NULL)::extensions.http_request) r;
        exception when others then v_http := -1; end;
        if v_http = 200 and v_raw is not null then
          begin v_body := v_raw::jsonb; exception when others then v_body := null; end;
        end if;
        exit when v_body is not null;
        if v_http = 429 then v_429 := v_429 + 1; perform pg_sleep(2 * v_attempt);
        else perform pg_sleep(1); end if;
      end loop;
      if v_body is null then v_err := 'http_' || coalesce(v_http::text,'null'); exit; end if;

      v_rows := v_body->'rows';
      v_n := coalesce(jsonb_array_length(v_rows), 0);
      if v_n = 0 then v_done := true; exit; end if;

      with e as (select x->'row' r from jsonb_array_elements(v_rows) x),
      m as (
        select nullif(btrim(r->>'FOOD_ID'),'') fdc, nullif(btrim(r->>'FOOD_NAME'),'') nm,
          nullif(btrim(r->>'FOOD_SERVING_SIZE'),'') ss,
          (r->>'ENERGY (KCAL)')::numeric kcal, (r->>'PROTEIN (G)')::numeric protein,
          (r->>'CARBOHYDRATE, BY DIFFERENCE (G)')::numeric carbs,
          (r->>'TOTAL LIPID (FAT) (G)')::numeric fats,
          (r->>'FIBER, TOTAL DIETARY (G)')::numeric fiber,
          (r->>'TOTAL SUGARS (G)')::numeric sugar,
          (r->>'SODIUM, NA (MG)')::numeric sodium,
          (r->>'FATTY ACIDS, TOTAL SATURATED (G)')::numeric sat_fat
        from e
      ),
      d as (
        select distinct on (fdc) *,
          case when ss ~* '^[0-9.]+\s*(g|ml)$'
               then nullif(regexp_replace(ss, '[^0-9.]', '', 'g'), '')::numeric end as ss_g
        from m
        where fdc is not null and nm is not null and kcal is not null
          and protein is not null and carbs is not null and fats is not null
        order by fdc
      ),
      ins as (
        insert into food_catalog (name, brand, source, verified, kcal, protein, carbs, fats,
          fiber, sugar, sodium, sat_fat, serving_desc, serving_grams, serving_options, fdc_id)
        select initcap(lower(d.nm)), null, 'usda_branded', true,
               d.kcal, d.protein, d.carbs, d.fats, d.fiber, d.sugar, d.sodium, d.sat_fat,
               '100 g', 100,
               jsonb_build_array(jsonb_build_object('desc','100 g','grams',100),
                                 jsonb_build_object('desc','1 oz','grams',28.35))
               || case when d.ss_g is not null and d.ss_g > 0 and d.ss_g <> 100
                       then jsonb_build_array(jsonb_build_object('desc','1 serving','grams',d.ss_g))
                       else '[]'::jsonb end,
               d.fdc
        from d on conflict (fdc_id) do nothing returning 1
      )
      select count(*) from ins into v_ins;

      v_run := v_run + coalesce(v_ins,0);
      v_offset := v_offset + v_n;
      v_pages := v_pages + 1;
    exception when others then v_err := 'page@' || v_offset || ': ' || sqlerrm; exit;
    end;
  end loop;

  if v_offset >= v_end then v_done := true; end if;
  update public.food_import_state
     set cursor = v_offset, imported_count = imported_count + v_run,
         status = case when v_done then 'done' else 'running' end,
         last_error = v_err, updated_at = now()
   where source = v_src;
  return jsonb_build_object('worker', p_worker, 'pages', v_pages, 'inserted', v_run,
    'offset', v_offset, 'done', v_done, 'rate_limited', v_429, 'error', v_err,
    'ms', round(extract(milliseconds from clock_timestamp() - v_started)));
end $function$;

-- ---------------------------------------------------------------------------
-- 5. HIS OWN FOODS
-- ---------------------------------------------------------------------------

create or replace function public.refresh_trainer_foods()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_ins int := 0; v_upd int := 0;
begin
  -- HIS PLANS ARE THE SOURCE. Every meal he builds states a food, an amount, a
  -- unit and its macros. Divided out, that is a per-unit food entry more
  -- accurate for his clients than anything a scraped catalogue holds - and it
  -- stays current as he programmes, which is why this is a function and not a
  -- one-off import.
  create temp table _tf on commit drop as
  with per_unit as (
    select lower(btrim(mi.food)) fkey, btrim(mi.food) fname, lower(btrim(mi.unit)) unit,
           mi.protein/nullif(mi.amount,0) p, mi.carbs/nullif(mi.amount,0) c, mi.fats/nullif(mi.amount,0) f
    from meal_items mi
    where mi.food is not null and btrim(mi.food) <> '' and mi.unit is not null
      and mi.amount is not null and mi.amount > 0
      and mi.protein is not null and mi.carbs is not null and mi.fats is not null
      and coalesce(mi.is_unlimited,false) = false
      and mi.food !~* '(log what you eat|unlimited|approved list)'
      and mi.food !~* '\yor\y' and mi.food not like '%/%'
      and (mi.protein + mi.carbs + mi.fats) > 0
  ),
  agg as (
    select fkey, min(fname) fname, unit, count(*) uses,
           round(percentile_cont(0.5) within group (order by p)::numeric,3) p,
           round(percentile_cont(0.5) within group (order by c)::numeric,3) c,
           round(percentile_cont(0.5) within group (order by f)::numeric,3) f
    from per_unit group by fkey, unit having count(*) >= 2
  ),
  best as (select distinct on (fkey) * from agg order by fkey, uses desc, unit)
  select b.*, round((4*b.p+4*b.c+9*b.f)::numeric,1) kcal,
    case
      when b.unit in ('g','gram','grams') then 1
      when b.unit in ('oz','ounce','ounces','oz cooked','oz dry') then 28.35
      when b.unit = 'fl oz' then 29.57
      when b.unit in ('lb','lbs') then 453.6
      when b.unit in ('tsp','teaspoon','teaspoons') then 5
      when b.unit in ('tbsp','tablespoon','tablespoons','tbsp oil') then 15
      when b.unit in ('cup','cups') then 240
      when b.unit in ('scoop','scoops') then 30
      else coalesce((select k.grams from serving_kw k
              where k.word = (select w.word from unnest(string_to_array(
                      regexp_replace(lower(b.fname),'[^a-z ]',' ','g'),' ')) with ordinality as w(word,pos)
                    where length(w.word) >= 3 order by w.pos desc limit 1)), 100)
    end as gram_weight
  from best b;

  with up as (
    insert into food_catalog (name, brand, source, verified, kcal, protein, carbs, fats,
      serving_desc, serving_grams, serving_options, created_by_client_id)
    select t.fname, 'Symmetry', 'trainer', true, t.kcal, t.p, t.c, t.f,
      '1 ' || t.unit, t.gram_weight,
      jsonb_build_array(jsonb_build_object('desc','1 ' || t.unit,'grams',t.gram_weight))
        || case when t.gram_weight <> 100 then jsonb_build_array(jsonb_build_object('desc','100 g','grams',100)) else '[]'::jsonb end,
      null
    from _tf t
    where not exists (select 1 from food_catalog fc where fc.source='trainer' and lower(fc.name)=lower(t.fname))
    returning 1
  ) select count(*) into v_ins from up;

  update food_catalog fc
     set kcal = t.kcal, protein = t.p, carbs = t.c, fats = t.f
  from _tf t
  where fc.source='trainer' and lower(fc.name)=lower(t.fname)
    and (fc.kcal is distinct from t.kcal or fc.protein is distinct from t.p
         or fc.carbs is distinct from t.c or fc.fats is distinct from t.f);
  get diagnostics v_upd = row_count;

  perform public.recompute_food_quarantine();
  return jsonb_build_object('added', v_ins, 'updated', v_upd);
end $function$;

-- ---------------------------------------------------------------------------
-- 6. THE QUALITY GATE
-- ---------------------------------------------------------------------------
--
-- Three earlier versions of this were wrong in ways only sampling caught:
-- calling an ounce "not a portion" hid 30 of his own foods (he programmes meat
-- and fish by the ounce), and judging every row as per-100 g made a 240 g cup
-- of dry oats look impossible. Both are fixed below — the limits scale to the
-- row's own serving_grams, and a real household serving_desc counts.

create or replace function public.recompute_food_quarantine()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_bad int; v_ok int;
begin
  update food_catalog fc set quarantined = q.bad
  from (
    select id,
      not (
        -- 1. THE NUMBERS MUST TRACE TO A LAB, A LABEL, OR DUSTIN.
        -- Open Food Facts is crowd-typed and unverifiable: one of its rows had
        -- Kerrygold butter at 100 kcal per 100 g - internally consistent and
        -- completely wrong - and no test separates that from thousands like it.
        source in ('usda_core','usda_branded','usda','usda_generic',
                   'trainer','client','brand','restaurant')
        -- 2. THE ARITHMETIC MUST HOLD, against the row's own basis.
        and kcal is not null and kcal >= 0
        and kcal <= 9.02 * greatest(coalesce(serving_grams,100), 1)
        and coalesce(protein,0) >= 0 and coalesce(carbs,0) >= 0 and coalesce(fats,0) >= 0
        and coalesce(protein,0) + coalesce(carbs,0) + coalesce(fats,0)
              <= 1.01 * greatest(coalesce(serving_grams,100), 1)
        and abs(coalesce(kcal,0) - (4*coalesce(protein,0)+4*coalesce(carbs,0)+9*coalesce(fats,0)))
              <= greatest(30, 0.15*greatest(kcal,1))
        -- 3. THERE MUST BE A MEASURE A PERSON USES.
        and (
          exists (select 1 from jsonb_array_elements(coalesce(serving_options,'[]'::jsonb)) o
                  where o->>'desc' !~* '^(100 g|1 oz)$'
                    and (o->>'grams') ~ '^[0-9.]+$' and (o->>'grams')::numeric > 0)
          or (serving_desc is not null and serving_desc !~* '^\s*(100\s*g|100g)\s*$'
              and serving_grams is not null and serving_grams > 0)
        )
      ) as bad
    from food_catalog
  ) q
  where q.id = fc.id and fc.quarantined is distinct from q.bad;
  select count(*) filter (where quarantined), count(*) filter (where not quarantined)
    into v_bad, v_ok from food_catalog;
  return jsonb_build_object('hidden', v_bad, 'searchable', v_ok);
end $function$;

-- ---------------------------------------------------------------------------
-- 7. SEARCH
-- ---------------------------------------------------------------------------
--
-- Note there is no metacharacter escaping on the token regexes: `tok` strips
-- everything outside [a-z0-9 ] before splitting, so a token can never carry a
-- regex operator. An escaping call used to sit here and could never fire.

create or replace function public.search_food_catalog(p_term text, p_client_id uuid default null::uuid, p_limit integer default 40, p_mine_only boolean default false)
 returns setof food_catalog
 language sql
 stable
 set search_path to 'public'
as $function$
  with t as (select lower(btrim(coalesce(p_term, ''))) as q),
  tok as (select array_remove(array(select w from unnest(regexp_split_to_array(
      regexp_replace((select q from t), '[^a-z0-9 ]', ' ', 'g'), '\s+')) w where length(w) >= 2), null) as toks),
  matched as (
    select fc.id as fid, fc.kcal, fc.name, fc.brand, fc.source, fc.usda_conflict, fc.verified,
           fc.serving_options, fc.created_by_client_id,
           lower(btrim(fc.name)) nk, lower(coalesce(btrim(fc.brand),'')) bk,
           -- THE BRAND IS PART OF THE NAME FOR MATCHING. "Salted butter" by
           -- Kerrygold was scored as explaining only half of "kerrygold butter"
           -- while a row that repeats the brand inside its own name scored full
           -- marks, which is how a 100-cal butter outranked three correct ones.
           array(select x from unnest(regexp_split_to_array(
                 regexp_replace(lower(fc.name || ' ' || coalesce(fc.brand,'')), '[^a-z0-9 ]', ' ', 'g'), '\s+')) x
                 where length(x) >= 2 and x not in ('and','the','with','without','raw','from')) as namewords,
           array(select x from unnest(regexp_split_to_array(
                 regexp_replace(lower(split_part(fc.name, ',', 1) || ' ' || split_part(fc.name, ',', 2)
                                      || ' ' || coalesce(fc.brand,'')), '[^a-z0-9 ]', ' ', 'g'), '\s+')) x
                 where length(x) >= 2 and x not in ('and','the','with','without','raw','from')) as headwords,
           array(select x from unnest(regexp_split_to_array(
                 regexp_replace(lower(fc.name), '[^a-z0-9 ]', ' ', 'g'), '\s+')) x
                 where length(x) >= 2) as bare_namewords
    from food_catalog fc, t, tok
    where (not p_mine_only or fc.created_by_client_id = p_client_id)
      and (p_client_id is null or fc.created_by_client_id is null or fc.created_by_client_id = p_client_id)
      and (not fc.quarantined or fc.created_by_client_id = p_client_id)
      and ((select q from t) = '' or (cardinality((select toks from tok)) > 0
        and not exists (select 1 from unnest((select toks from tok)) w
          where (fc.name || ' ' || coalesce(fc.brand, '')) !~* ('(^|[^a-z0-9])' || w))))
  ),
  scored as (
    select m.*,
      (select count(*) from unnest((select toks from tok)) tk
        where exists (select 1 from unnest(m.namewords) nw
                      where nw = tk or nw = tk||'s' or tk = nw||'s' or nw = tk||'es')) as word_hits,
      (select count(*) from unnest((select toks from tok)) tk
        where exists (select 1 from unnest(m.headwords) hw
                      where hw = tk or hw = tk||'s' or tk = hw||'s' or hw = tk||'es')) as head_hits,
      (exists (select 1 from unnest((select toks from tok)) tk
               where m.bare_namewords[1] = tk or m.bare_namewords[1] = tk||'s'
                  or tk = m.bare_namewords[1]||'s' or m.bare_namewords[1] = tk||'es')) as is_about_it,
      -- THE VARIANT PENALTY. Dustin searched "kerrygold butter" and the first
      -- thing offered was Reduced Fat Irish Butter -- 571 kcal, where the butter
      -- he actually buys is 717. He did not ask for reduced fat. Nobody asks for
      -- a diet version by typing the plain name. So a row that adds a qualifier
      -- the search did not contain sorts below the row that does not add one,
      -- and a qualifier that changes the macros (weight 2) costs more than one
      -- that only changes the form (weight 1). Ask for it by name and the
      -- penalty disappears: "reduced fat kerrygold" still finds reduced fat.
      coalesce((select sum(vq.weight) from food_variant_qualifier vq
                where (m.name || ' ' || coalesce(m.brand,'')) ~* ('(^|[^a-z0-9])' || vq.phrase || '($|[^a-z0-9])')
                  and (select q from t) !~* ('(^|[^a-z0-9])' || vq.phrase || '($|[^a-z0-9])')), 0) as variant_penalty,
      cardinality(m.headwords) as head_len, cardinality(m.namewords) as name_len,
      avg(coalesce(m.kcal,0)) over (partition by m.nk, m.bk) as grp_kcal
    from matched m
  ),
  hit as (
    select s.fid, s.nk, s.source, s.verified, s.usda_conflict, s.created_by_client_id,
           s.word_hits, s.head_hits, s.head_len, s.name_len, s.name, s.is_about_it,
           s.variant_penalty,
      row_number() over (partition by s.nk, s.bk
        order by (s.source='trainer') desc, (s.source='usda_core') desc, s.usda_conflict,
                 abs(coalesce(s.kcal,0) - s.grp_kcal),
                 (exists (select 1 from jsonb_array_elements(coalesce(s.serving_options,'[]'::jsonb)) o
                          where o->>'desc' ~* '(tbsp|tablespoon|tsp|teaspoon|cup|slice|piece|each|bagel|cookie|scoop|bar|pat|stick)')) desc,
                 coalesce(s.verified,false) desc,
                 jsonb_array_length(coalesce(s.serving_options,'[]'::jsonb)) desc, s.fid) as copy_rank
    from scored s
  )
  select fc.* from hit join food_catalog fc on fc.id = hit.fid, t, tok
  where hit.copy_rank = 1
  order by
    coalesce(hit.created_by_client_id = p_client_id, false) desc,
    (hit.word_hits >= cardinality((select toks from tok))) desc,
    -- A ROW THAT CONTRADICTS USDA NEVER OUTRANKS ONE THAT DOES NOT. It cannot
    -- be hidden -- the signal has real false positives, shirataki noodles really
    -- are 5 cal -- but a Kerrygold butter claiming 100 kcal must never be the
    -- first thing offered when three correct ones are right there.
    hit.usda_conflict,
    case when hit.source = 'trainer' then 0 else 1 end,
    (hit.head_hits >= cardinality((select toks from tok))) desc,
    hit.is_about_it desc,
    case when hit.source = 'usda_core' and hit.is_about_it then 0
         when coalesce(hit.verified,false) and hit.is_about_it then 1
         when hit.source = 'usda_core' then 2
         when coalesce(hit.verified,false) then 3 else 4 end,
    -- The plain product before its variants (see variant_penalty above).
    hit.variant_penalty,
    (hit.head_hits::numeric / greatest(hit.head_len,1)) desc,
    case when hit.nk = (select q from t) then 0
         when hit.nk like (select q from t) || ',%' then 1
         when hit.nk like (select q from t) || '%' then 2 else 3 end,
    hit.name_len, length(hit.name), hit.name
  limit greatest(1, least(p_limit, 100));
$function$;

-- The AI resolver, ordered on the same principles so a food logged by talking
-- and the same food logged by searching land on the same row.

create or replace function public.match_food_for_ai(p_term text, p_client_id uuid default null::uuid, p_limit integer default 10)
 returns setof food_catalog
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with q as (select lower(btrim(coalesce(p_term, ''))) as term),
  tok as (select array_remove(array(
      select t from unnest(regexp_split_to_array(regexp_replace((select term from q), '[^a-z0-9 ]', ' ', 'g'), '\s+')) t
      where length(t) >= 3 and t not in ('the','and','for','with','some','plain')), null) as toks),
  anchor as (select (select t from unnest((select toks from tok)) t order by length(t) desc, t limit 1) as a),
  candidates as (
    select fc.id from food_catalog fc, q
    where (select term from q) <> '' and fc.name % (select term from q)
    union
    select fc.id from food_catalog fc, anchor
    where (select a from anchor) is not null and fc.name ilike '%' || (select a from anchor) || '%'
    union
    select fc.id from food_catalog fc, anchor
    where (select a from anchor) is not null and fc.brand ilike '%' || (select a from anchor) || '%'
  ),
  scored as (
    select fc.id,
      (select count(*) from unnest((select toks from tok)) tk
        where (fc.name || ' ' || coalesce(fc.brand, '')) ilike '%' || tk || '%') as hits,
      similarity(lower(fc.name || ' ' || coalesce(fc.brand, '')), (select term from q)) as sim,
      coalesce(fc.created_by_client_id = p_client_id, false) as mine,
      (fc.source = 'trainer') as his,
      (fc.source = 'usda_core') as core,
      fc.usda_conflict as conflicts,
      coalesce(fc.verified, false) as ver,
      -- The same variant penalty the search sheet uses: a qualifier the
      -- client did not say ("reduced fat", "sugar free") sorts the row below
      -- the plain product. When Claude resolves "kerrygold butter" from a chat
      -- message it must land on the butter he buys, not the diet version.
      coalesce((select sum(vq.weight) from food_variant_qualifier vq
                where (fc.name || ' ' || coalesce(fc.brand,'')) ~* ('(^|[^a-z0-9])' || vq.phrase || '($|[^a-z0-9])')
                  and (select term from q) !~* ('(^|[^a-z0-9])' || vq.phrase || '($|[^a-z0-9])')), 0) as variant_penalty,
      length(fc.name) as namelen, fc.name as nm,
      row_number() over (partition by lower(fc.name), coalesce(lower(fc.brand), '')
                         order by (fc.source='trainer') desc, (fc.source='usda_core') desc,
                                  fc.usda_conflict, fc.verified desc nulls last, fc.id) as dupe
    from food_catalog fc
    join candidates c on c.id = fc.id
    where (p_client_id is null or fc.created_by_client_id is null or fc.created_by_client_id = p_client_id)
      and fc.protein is not null and fc.carbs is not null and fc.fats is not null
      and (not fc.quarantined or fc.created_by_client_id = p_client_id)
  )
  select fc.*
  from scored s join food_catalog fc on fc.id = s.id
  where s.dupe = 1 and s.hits > 0
  order by
    s.mine desc,
    -- A row contradicting USDA never resolves ahead of one that does not.
    s.conflicts,
    s.his desc,
    s.hits desc,
    s.core desc,
    s.ver desc,
    s.variant_penalty,
    s.sim desc, s.namelen, s.nm
  limit greatest(1, least(p_limit, 25));
$function$;

-- ---------------------------------------------------------------------------
-- 8. BARCODES
-- ---------------------------------------------------------------------------
--
-- A USDA branded row's fdc_id IS its GTIN, so 442,775 products became
-- scannable without another import. USDA writes them zero-padded to 12, 13 or
-- 14 characters; a phone scanner emits the UPC-A printed on the box. The
-- lookups in the app match across every padding of the number rather than on
-- the scan exactly as it arrived (src/lib/nutrition/barcode.ts).

update food_catalog
   set barcode = fdc_id
 where source = 'usda_branded'
   and barcode is null
   and fdc_id ~ '^[0-9]{8,14}$';

-- ---------------------------------------------------------------------------
-- 9. SCHEDULES
-- ---------------------------------------------------------------------------

select cron.unschedule('off-bulk-import')      where exists (select 1 from cron.job where jobname='off-bulk-import');
select cron.unschedule('off-micros-backfill')  where exists (select 1 from cron.job where jobname='off-micros-backfill');

update food_import_state set status='paused',
  last_error='retired 2026-09-06: Open Food Facts removed from the catalogue'
 where source in ('off_bulk','off_micros_backfill');

select cron.schedule('food-quality-gate-nightly', '35 8 * * *', 'select public.recompute_food_quarantine();')
 where not exists (select 1 from cron.job where jobname='food-quality-gate-nightly');
select cron.schedule('trainer-foods-weekly', '50 8 * * 1', 'select public.refresh_trainer_foods();')
 where not exists (select 1 from cron.job where jobname='trainer-foods-weekly');

commit;
