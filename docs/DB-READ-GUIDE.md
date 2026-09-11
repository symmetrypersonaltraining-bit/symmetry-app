<!-- Moved from the Cowork project (`claude/SYMMETRY-DB-READ-GUIDE-JARVIS.md`) on
     10 Sep 2026 so Claude Code sessions can read it. Written for a read-only
     voice assistant, but it is the best record of how this schema actually
     behaves — read it before writing any query against the live database. -->

# Symmetry app — canonical read guide for the database

**Verified against the live database on 9 Sep 2026** and against the app's own
queries. Every SELECT below was executed before it was written down. Where a
number is quoted, it is the number the database returned that day — treat the
shape as canonical and re-run the count.

Project: `mkfiginpiesospsnktea`.

---

## 0. THE TWO RULES THAT CAUSE THE MOST WRONG ANSWERS

1. **Central time, never UTC.** After 7pm Central the UTC date is already
   tomorrow. Every date comparison must be
   `(now() at time zone 'America/Chicago')::date`. This has broken dated writes
   in the app itself more than once.
2. **`scheduled_workouts` is not a calendar of Dustin's day.** It is the
   *programmed workout* layer — one row per assigned workout. A client can have
   three or four on one date (lift + solo rehab + cardio). Counting it gives
   numbers like "87 sessions today", which is not a thing. Dustin's day comes
   from `appointments`. See §2.

---

## 1. WHAT IS AN "ACTIVE CLIENT"?

`clients` has 41 rows. There is no `status` and no `archived` column.

| column | meaning |
|---|---|
| `archived_at` | Soft delete. **This is the one that decides active.** |
| `archive_effective_on` | **NOT a pending archive.** Only 2 rows have it and both are already archived; zero rows are "archived with a future effective date". It records when the archive takes effect for BILLING. Ignore it for roster questions. |
| `is_self_coached` | They follow their own programming rather than Dustin's. 6 rows — **and Dustin himself is one of them.** Exclude for "clients I train"; include for "people using the app". |
| `nutrition_only` | A real client who will never have a training session. Expect them to be absent from every session query. |

### Test / demo rows

Two, identified by email domain:

- `Demo Client (Stephanie)` — `demo.stephanie@symmetry.invalid` — **not archived,
  not self-coached, so it survives the obvious filter.**
- `Test Client` — `test-client@symmetry-test.com` — already archived.

**Do not filter on "has an email".** At least one real, active client has a NULL
email.

```sql
-- (a) COUNT OF ACTIVE CLIENTS   -> 26 on 9 Sep 2026
select count(*) as active_clients
from clients
where archived_at is null
  and is_self_coached is not true
  and coalesce(email,'') not like '%@symmetry.invalid'
  and coalesce(email,'') not like '%@symmetry-test.com';
```

```sql
-- the roster itself, same rules
select id, name, email, nutrition_only
from clients
where archived_at is null
  and is_self_coached is not true
  and coalesce(email,'') not like '%@symmetry.invalid'
  and coalesce(email,'') not like '%@symmetry-test.com'
order by name;
```

---

## 2. TODAY'S SESSIONS

### What the columns mean

| column | meaning |
|---|---|
| `supervised` | **Dustin is running it in person.** `false` = the client does it on their own. |
| `deleted_at` | **Soft delete — regenerated or superseded, NOT cancelled.** 1,043 of 4,651 rows (22%). Always exclude. Cancellation lives on the *appointment*, not here. |
| `status` | `scheduled`, `completed`, `replaced`, `moved`. (`appointments.status` is a different set: `scheduled`, `cancelled_client`.) |
| `source` | `claude`, `trainer`, `client_self_assign`, `migration`. Provenance only — **never filter on it.** |
| `position` | Order within the client's day. **Not unique per (client, date)** — see the note below. |
| `moved_from_date` | Set when a workout is rescheduled. The app moves by UPDATE, never delete-and-reinsert, because that would break `workout_log_id` history. |

### Dustin's actual day comes from `appointments`

The app builds Today's Sessions from `appointments`, then adds any **supervised**
`scheduled_workouts` row that has no matching appointment. That second half
matters: 227 supervised workouts have no appointment. The main case is the
client who books a week at a time and has no Google Calendar sync at all, by
design.

`appointments` columns worth knowing: `scheduled_at`, `ends_at`, `status`,
`gcal_cancelled_at`, `title`, `notes`.

⚠️ **`gcal_cancelled_at` is a cancellation that leaves `status = 'scheduled'`.**
Filter on both or you will announce cancelled sessions.

```sql
-- (b) TODAY'S SUPERVISED SESSIONS, ordered as Dustin sees them
with d as (select (now() at time zone 'America/Chicago')::date as today)
select c.name,
       to_char(a.scheduled_at at time zone 'America/Chicago','HH12:MI AM') as at,
       a.status,
       'appointment' as via
from appointments a
join clients c on c.id = a.client_id
cross join d
where (a.scheduled_at at time zone 'America/Chicago')::date = d.today
  and a.status <> 'cancelled_client'
  and a.gcal_cancelled_at is null
  and c.archived_at is null

union all

-- supervised workouts with no appointment (~227 of them)
select c.name, null, sw.status, 'supervised workout'
from scheduled_workouts sw
join clients c on c.id = sw.client_id
cross join d
where sw.scheduled_date = d.today
  and sw.supervised is true
  and sw.deleted_at is null
  and c.archived_at is null
  and not exists (
    select 1 from appointments a2
    where a2.client_id = sw.client_id
      and (a2.scheduled_at at time zone 'America/Chicago')::date = d.today
      and a2.status <> 'cancelled_client')
order by at nulls last, name;
```

**`c.archived_at is null` is load-bearing.** Without it this returns an archived
client who still has live supervised rows.

```sql
-- EVERY workout assigned to anyone today, supervised or not
select c.name, sw.position as slot, d2.label as workout, sw.status, sw.supervised
from scheduled_workouts sw
join clients c on c.id = sw.client_id
left join days d2 on d2.id = sw.day_id
where sw.scheduled_date = (now() at time zone 'America/Chicago')::date
  and sw.deleted_at is null
  and c.archived_at is null
order by c.name, sw.position;
```

### A repeated `position` is not a duplicate

Two live rows, both `completed`, both `position = 1`, same date — but **different
`day_id` and different `workout_log_id`**. Two genuinely different workouts, both
logged that day. `position` collides because they came from different slots in
the same assignment.

**Do not de-duplicate on (client, date, position).** De-dupe on `id` only. If a
client legitimately has three rows today, say three things.

---

## 3. WHAT IS THE CLIENT ACTUALLY DOING?

### The right path is `day_id`

```
scheduled_workouts.day_id
  -> days                    (days.label = the workout's name/focus)
  -> sections                (order by sections.position)
  -> prescribed_exercises    (order by prescribed_exercises.position)
  -> exercises               (the name)
```

- **`day_id`** — the live path. Use this.
- **`published_workout_id`** — a client-delivery snapshot. Null on most rows and
  **not used by the workout screen at all**. Ignore it.
- **`assignment_id`** — links to the programme, not to the content. Ignore it for
  "what are they doing".

The day's name and focus is **`days.label`**, e.g.
`"P3 Gym A — Posterior Chain Under Load (Wed)"`.

```sql
-- (c) ONE CLIENT, ONE DATE: what they're doing, in order
select d.label                                          as workout,
       coalesce(sec.client_facing_name, sec.internal_name) as section,
       e.name                                           as exercise,
       pe.sets,
       pe.volume_value,        -- "12", "12-15", "45 sec each side"
       pe.load_descriptor,     -- "60 lb", "bodyweight", "moderate"
       pe.cue
from scheduled_workouts sw
join clients c    on c.id  = sw.client_id
join days d       on d.id  = sw.day_id
join sections sec on sec.day_id = d.id
join prescribed_exercises pe on pe.section_id = sec.id
join exercises e  on e.id  = pe.exercise_id
where c.name = $1
  and sw.scheduled_date = $2
  and sw.deleted_at is null
order by sw.position, sec.position, pe.position;
```

### ⚠️ NEVER SPEAK `sections.internal_name` TO A CLIENT

`internal_name` is NASM language — Inhibit / Lengthen / Activate / Integrate,
Primary Strength, Accessory Strength. It is the internal engine and is a hard
rule in this app: **NASM terminology is never surfaced to clients.**

`client_facing_name` is the safe one (Warm-Up / Strength / Accessory). Always
`coalesce(client_facing_name, internal_name)` at minimum; for a client-facing
voice, read **only** `client_facing_name` and say nothing if it is null.

Other `prescribed_exercises` columns: `volume_type` (`reps` | `rep_range` |
`duration` | `distance` | `hold_pattern`), `tempo`, `rest`, `unilateral`,
`superset_group`, `use_drop_sets`, `use_rest_pause`, `use_partials`.

---

## 4. NOTES — WHAT DUSTIN NEEDS TO KNOW BEFORE A SESSION

### Current vs legacy

| table / column | rows | last write | verdict |
|---|---|---|---|
| `exercise_notes` | 106 | current | **LIVE.** The one he writes into. |
| `clients.notes` | 23 | current | **LIVE.** Holds real operating protocol. |
| `clients.weekly_focus` | 33 | current | **LIVE.** |
| `clients.injuries_limitations` | 18 | current | **LIVE — the real injuries column.** |
| `clients.injuries` | 7 | sparse | legacy, read as a fallback |
| `clients.medical_notes` | 6 | sparse | legacy, read as a fallback |
| `client_goals` | 11 | 24 Aug | current-ish |
| `trainer_notes` | 70 | 25 Aug | **superseded by `exercise_notes`** |
| `client_private_profiles` | 27 | 10 Jul | **stale** — Notion-sync leftover |
| `session_notes` | **0** | never | **DEAD. Empty table.** |

**"Flag this next time you see them"** = `exercise_notes.resolved = false`.
That is the mechanism; there is no other.

**`clients.notes` is not a scratchpad.** One client's contains a full scheduling
protocol including which calendar proposals are always false for them, plus a
disc-safety rule for every squat and leg press. Read it out in full rather than
summarising it away.

```sql
-- (d) EVERYTHING THAT MATTERS BEFORE A SESSION, for one client
select 'limitations'  as kind, c.injuries_limitations as body
  from clients c where c.name = $1 and coalesce(btrim(c.injuries_limitations),'') <> ''
union all
select 'injuries (legacy)', c.injuries::text
  from clients c where c.name = $1 and c.injuries is not null
union all
select 'medical (legacy)', c.medical_notes
  from clients c where c.name = $1 and coalesce(btrim(c.medical_notes),'') <> ''
union all
select 'protocol', c.notes
  from clients c where c.name = $1 and coalesce(btrim(c.notes),'') <> ''
union all
select 'weekly focus', c.weekly_focus
  from clients c where c.name = $1 and coalesce(btrim(c.weekly_focus),'') <> ''
union all
select 'OPEN NOTE (' || n.log_date || ')', n.note
  from exercise_notes n
  join clients c on c.id = n.client_id
  where c.name = $1 and n.resolved is not true;
```

---

## 5. TRAPS

### Never read these

- `session_notes` — empty, 0 rows.
- `trainer_notes` — superseded by `exercise_notes`.
- `client_private_profiles` — stale since 10 July.
- `client_program_feedback` — 6 rows, abandoned.
- Anything prefixed `bak_` — backups.

### `symptom_flags` is the one that will invent injuries

75 rows, and **it has no `client_id`.** Columns are `phrase`, `tier`, `active`,
`note`. It is a **phrase dictionary for detecting symptom language in text** —
not a record of any client's symptoms. Read it as per-client data and the
assistant will confidently report injuries nobody has.

### Soft deletes you would otherwise miss

| table | column | note |
|---|---|---|
| `scheduled_workouts` | `deleted_at` | 22% of rows |
| `clients` | `archived_at` | |
| `appointments` | `gcal_cancelled_at` | cancelled while `status` still says `scheduled` |

### Same fact in two places

- `clients.current_weight` and `clients.current_body_fat_pct` are a
  trigger-maintained cache of the newest `metrics` row. Usually right;
  **`metrics` is the truth.**
- `v_integrity_flags` shows each check's most recent result **with no freshness
  bound**, so a check that stopped running still displays its last count as if
  current. Six checks in it had not run for days as of 9 Sep. If you surface it,
  surface `ran_at` too.

### Counts that mislead

- `scheduled_workouts` today = 87 rows ≈ 9 actual sessions. See §2.
- `clients` = 41 rows, 26 active clients.
- `skinfold_logs` contains exact duplicate rows (5 of 22) and at least one row
  with the wrong sex and age recorded, which produced a wildly wrong body fat
  percentage. Don't quote body fat from `skinfold_logs`; use `metrics`.

### PostgREST 1,000-row cap

Straight SQL through a read-only role is fine. But if any part of this ever goes
through the REST API, responses are silently capped at 1,000 rows with no error
— that hid the trainer calendar for a month. Page it.

---

## 6. QUICK REFERENCE — the four queries

- **(a)** active clients → §1
- **(b)** today's supervised sessions → §2
- **(c)** one client, one date, what they're doing → §3
- **(d)** notes and limitations before a session → §4

All four were executed against the live database before being written here.
