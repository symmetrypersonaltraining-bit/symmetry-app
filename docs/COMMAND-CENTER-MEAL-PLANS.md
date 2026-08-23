# Command Center — meal plan authoring

Paste this whole file into the **Command Center project's custom instructions**.
It applies to every chat in that project automatically.

---

## THE ONE RULE

**Dustin writes the meal plans. The app displays them. The app never changes them.**

This is no longer a convention anybody can forget. It is enforced in the
database as of 22 Aug 2026.

- `clients.plan_locked = true` for **Dustin Gautreaux** and **Steph Gautreaux**.
- Any write from the app — the AI plan builder, "adjust this meal", adopt-plan,
  plan-restore, the trainer agent — to `meal_plans`, `meals`, `meal_items` or
  `macro_targets` for a locked client is **rejected by the database**, whatever
  route it comes through and whatever a future code change forgets to check.
- A **direct database session is allowed**. That is this project. That is the
  only hand on the plan.

To unlock a client (reversible, one line):

```sql
update public.clients set plan_locked = false where name = 'Steph Gautreaux';
```

---

## HOW A PLAN IS STRUCTURED — read this before writing one

A plan row starts on its `effective_date` and runs **until the next plan row
starts**. There is no end date. That is the whole model, and it is why a
one-week change has always leaked into every week after it.

**Every plan starts on a Monday.**

**A one-week change is therefore TWO rows, never one:**

| row | effective | what it is |
|---|---|---|
| 1 | the Monday of the changed week | the change |
| 2 | the **following** Monday | a copy of the standing plan — the resume |

Write row 2 in the same breath as row 1. A change without a resume row runs
forever, and nobody notices until the week it should have ended.

Two more rules that follow from the same model:

- **Never edit a live plan in place.** Always a new dated row. The old row stays
  in the timeline; that is the history.
- **Never delete a plan.** Archive it: `status = 'archived'`.

---

## THE RECIPE

### 1. See what's standing

```sql
select c.name, mp.id, mp.version_number, mp.effective_date, mp.status, mp.title,
       (select count(*) from public.meals m where m.meal_plan_id = mp.id) meals,
       (select count(*) from public.meal_items mi
          join public.meals m on m.id = mi.meal_id
         where m.meal_plan_id = mp.id) items
from public.meal_plans mp
join public.clients c on c.id = mp.client_id
where c.name = 'Dustin Gautreaux'
order by mp.effective_date desc, mp.created_at desc
limit 10;
```

The **standing plan** is the newest row whose `effective_date` is on or before
the Monday you are changing. That is the one you clone — both times.

### 2. Write the changed week

```sql
select public.clone_meal_plan(
  '<standing plan id>',
  '2026-09-07',                       -- the Monday it starts
  'BULK v2 — week of Sep 7'
);
```

Then edit **only the new plan's rows**:

```sql
update public.meal_items set amount = 8, protein = 56
 where meal_id in (select id from public.meals where meal_plan_id = '<new plan id>')
   and food ilike '%egg white%';
```

### 3. Write the resume — same call, next Monday, same source

```sql
select public.clone_meal_plan(
  '<standing plan id>',
  '2026-09-14',
  'BULK v2 — resumes Sep 14'
);
```

### 4. Macros for both dates

```sql
insert into public.macro_targets (client_id, effective_date, calories, protein, carbs, fats, rationale)
values
  ((select id from public.clients where name = 'Dustin Gautreaux'), '2026-09-07', 4148, 244, 377, 185, 'Week of Sep 7'),
  ((select id from public.clients where name = 'Dustin Gautreaux'), '2026-09-14', 4213, 254, 381, 186, 'Resume standing bulk');
```

### 5. VERIFY — before telling Dustin it is done

Re-run the ladder query from step 1 and check all three:

- the dates run **Monday → Monday** with no gap and no overlap
- **every** row shows `items > 0` — a plan with meals and zero items is the
  failure mode that has bitten this project three times
- there is exactly **one** `live` row per start date

The database now refuses a second live plan on the same start date, and
`clone_meal_plan` refuses to leave behind a plan with no food in it. Check
anyway.

---

## NEVER HAND-ROLL THE COPY

`clone_meal_plan(source, effective_date, title, status)` exists because
hand-written CTE inserts silently inserted **zero** item rows three separate
times on 22 Aug — no error, just six empty meals — and one of those got as far
as sitting live next to the real plan. One call. Not a CTE.

---

## DATES — Central, always

`current_date` in SQL is **UTC** and is a day ahead every evening after 7pm
Central. It has already produced wrong answers here.

```sql
select (now() at time zone 'America/Chicago')::date;
```

Use that for "today". Work out the Monday from it and state the actual dates
back to Dustin before writing anything.

---

## WHEN THE SUPABASE CONNECTOR IS MISSING

`Supabase:execute_sql` returning **"tool not found"** does **not** mean the
connector is broken, the login expired, or the project is unreachable. It means
the connector dropped out of *that conversation's* tool list. The list is built
once per conversation and never re-synced, so a chat that has been open a while
can lose it while every other chat keeps working.

There is **no in-chat repair on claude.ai web** — `RefreshMcpTools` does not
exist on that surface, and the error text is identical to a tool that never
existed at all. So do not spend the chat diagnosing it.

In order:

1. **Start a new chat in the project.** The tool list is rebuilt per
   conversation, and this fixes it nearly every time.
2. If a new chat also cannot see it, ask the chat for the **finished SQL** and
   run it yourself at
   <https://supabase.com/dashboard/project/mkfiginpiesospsnktea/sql/new>.
   That editor connects as `postgres`, which is exactly the hand the lock
   allows, so the script works unchanged.
3. A Cowork / Claude Code session is a third route with its own connector.

**Never** work around a missing connector by going through the app. The app
cannot write these plans, by design.

---

## WHAT A CHAT IN THIS PROJECT MUST DO

1. Read the ladder before writing anything. Never assume what is standing.
2. State the real dates — "Mon 7 Sep through Sun 13 Sep, resumes Mon 14 Sep" —
   and get a yes before writing.
3. Write the change **and** the resume together.
4. Verify with the ladder query and report `items` per row.
5. Update the Notion Command Center to match, same session.
