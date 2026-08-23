-- Two live plans with the same effective_date and the same day_group is not a
-- cosmetic problem: the app picks one of them and no rule says which. It
-- happened on 22 Aug -- a retried insert left Dustin and Steph each holding two
-- "live" plans starting 31 Aug, one of them with zero food in it. Whichever the
-- ordering happened to pick was what they would have opened to on Monday.
--
-- plan-restore already documents the hazard in a comment. A comment is not an
-- invariant.
create unique index if not exists meal_plans_one_live_per_start
  on public.meal_plans (client_id, effective_date, day_group)
  nulls not distinct
  where status = 'live';
