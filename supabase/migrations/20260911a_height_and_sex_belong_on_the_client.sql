-- HEIGHT AND SEX BELONG ON THE CLIENT.
--
-- Dustin, 11 Sep 2026, on the meal-plan consult guessing daily expenditure
-- without them: "make sure those missing columns, the height and sex, go into
-- their actual profile page. Also make sure that gets added into the assessment
-- page and the onboarding. Whenever somebody starts the app it should collect
-- all of that information and put it in their profile. If a trainer is starting
-- the app, the assessment should get all of that information and put it in
-- their profile."
--
-- Neither existed anywhere on the client record. skinfold_logs carried age and
-- sex per READING, which is why the body-fat screen defaults to 38 and "male"
-- (docs/BODYFAT-SCREEN-2026-09-05.md). One home for both, nullable, and every
-- surface that asks writes here. Applied to the live project 11 Sep.
alter table clients
  add column if not exists height_in numeric,
  add column if not exists sex text;

alter table clients drop constraint if exists clients_sex_check;
alter table clients
  add constraint clients_sex_check check (sex is null or sex in ('male', 'female'));

comment on column clients.height_in is
  'Height in inches. Collected at onboarding, on the assessment, and editable on the profile. Needed with sex, age and weight to estimate daily energy expenditure honestly.';
comment on column clients.sex is
  'male or female — the two the energy-expenditure formulas have coefficients for. Nullable: never guessed, always asked.';
