# Dylan's instance — same app, his own clients

**Decided 2026-08-11 (Dustin):** separate repo + separate Supabase today; he
should have **his own clients only**, never Symmetry client data; and schema
changes reach him as **migration files in this repo**.

---

## What was actually broken

It was never really about the code. It was the database.

| | Live (Dustin) | In this repo |
|---|---|---|
| Migrations applied | **193** | **7** |
| Tables | 142 | — |
| RLS policies | 165 | — |
| Functions | 63 | — |

186 schema changes existed **only** inside Supabase's own
`supabase_migrations.schema_migrations` table. So the database could not be
rebuilt from this repo, and a second one could not be built from it at all.

That matters more than it sounds. Shipping Dylan the same code against a
different schema is **worse than leaving him on a fork**: the code assumes
columns his database does not have, so it breaks at runtime, on his phone, in
front of a client — not at build time where someone would notice.

Trainer identity being a setting (shipped `b92b3e3`) removed the *code* half of
the problem. This is the other half.

---

## The target shape

```
                    ONE repo, one branch
                            |
              +-------------+-------------+
              |                           |
      Vercel: symmetry-app        Vercel: dylan-app
              |                           |
      Supabase: mkfigin...        Supabase: <his own>
      TRAINER_EMAILS=dustin       TRAINER_EMAILS=dylan
```

Two Vercel projects can deploy from the **same GitHub repo** — that is a
supported setup, not a workaround. Every push then reaches both instances at
once, which is the entire point.

Separate Supabase projects mean his clients and Symmetry's clients are in
different databases and cannot see each other. Given this is real people's
weight, body fat and food logs, that separation is the right default and the
only one worth defending later.

---

## What was ALREADY fine (checked, not assumed)

**His own Claude works today, with no code change.** `ANTHROPIC_API_KEY` is read
from the environment in 29 places — it is per-DEPLOYMENT, not per-trainer. His
own Vercel project with his own key means his AI spend is entirely his.

**And his AI budget is automatically his own.** The $95 kill switch
(`MONTHLY_COST_CAP_USD`) and every per-client cap read `ai_usage_log`, which
lives in each instance's own database. Separate Supabase → separate meter, for
free. The only way to get this wrong is to SHARE one Anthropic key between
instances, at which point his usage counts toward Dustin's cap and can pause AI
for Symmetry's clients.

## What was actually broken — the coach was found by NAME

Nine places looked up the trainer's own `clients` row with:

```ts
.ilike("name", "%Dustin%")
```

...and only on the trainer branch. For a client they did the right thing and
used `auth_user_id`.

On any other database there is no client called Dustin. The query returns
nothing, and the component renders as though the person has no data: **no coach
avatar, no week summary, no milestone badges, no macros card, no Sunday
weigh-in reminder, an empty client-preview, an empty log page.** Nothing
throws. Nothing logs. It is simply not there.

That is the same mistake as the hardcoded email — identity by literal string —
one layer down, in the data, where it fails silently instead of loudly. Fixed:
`fetchOwnClientRow()` in `src/lib/ownClient.ts` looks up by `auth_user_id`,
then email, never by name. Verified first that Dustin's row already carries
`auth_user_id` and a matching email, so the name match was never load-bearing.

A test now fails the build on a new one.

## Three more things that would have broken his instance

Found on a sweep for single-tenant assumptions after the name fixes:

- **The invite email shipped Dustin's APK.** `APK_URL` fell back to a hardcoded
  `mkfiginpiesospsnktea` storage URL. The APK is a thin shell that loads a fixed
  server URL, so Dylan's clients would have installed an app that opens
  **Dustin's login screen**. An invite that works perfectly and lands on the
  wrong app. Now falls back to the instance's own Supabase storage.
- **Google Calendar OAuth was pinned to `symmetry-app-omega.vercel.app`** in
  both halves of the flow, so connecting a calendar on another instance would
  bounce the trainer to Dustin's deployment. Now derived from
  `NEXT_PUBLIC_APP_URL`.
- **Peak week hardcoded a client UUID** from Dustin's database. Harmless
  elsewhere (it matches nobody, so nothing locks) but a raw row id is exactly
  the sort of value that silently means something different on another
  database. Now `NEXT_PUBLIC_PEAK_WEEK_CLIENT_ID`.

## The env contract

`.env.local.example` listed **four** variables. The code reads **fifteen**.
Standing up a second instance meant discovering the other eleven by watching
things fail one at a time — which is most of why this ended up a fork. That
file is now the complete list, marked REQUIRED vs optional.

## Standing it up

### Step 1 — get the schema into the repo *(runs on Dustin's laptop)*

**This one cannot run in a cloud session.** Verified 2026-08-11: the direct
database host is IPv6-only and the pooler ports are firewalled from the build
sandbox — a connection attempt hangs rather than refusing. Pulling the SQL
through the chat instead is 544,355 characters, which is not a sane way to move
a schema and risks arriving truncated.

Hand-rolling the DDL from catalog queries was considered and rejected: a subtly
wrong schema is the exact failure this whole document exists to prevent, and
`pg_dump` exists because getting it right is hard.

So it runs where there is both network and git — the laptop:

1. Put the connection string in `db-url.txt` next to `DUMP-SCHEMA.bat`, in the
   Trainer App folder. One line, nothing else.
   > Supabase → `symmetry-training` → **Settings** → **Database** →
   > **Connection string** → **URI**. If it shows `[YOUR-PASSWORD]`, hit
   > **Reset database password** first — nothing uses that password directly.
2. Double-click **`DUMP-SCHEMA.bat`**.

It dumps `--schema-only` (structure only — **no client data ever leaves the
database**), writes `supabase/schema/baseline.sql`, commits and pushes. It
refuses to push a file that looks truncated, logs to `dump-schema-log.txt`,
catches its own crashes, and redacts anything password-shaped before it can
reach the log. `db-url.txt` never leaves the machine.

### Step 2 — his Supabase project

Create it, then replay the schema:

```bash
psql "<HIS-connection-string>" -f supabase/schema/schema.sql
```

He then signs up in his app as normal, and gets one row:

```sql
insert into public.trainers (email, name) values ('<dylan>', 'Dylan');
```

### Step 3 — his Vercel project

New project, **pointed at this same repo**, with his own:

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_TRAINER_EMAILS=<dylan's address>
ANTHROPIC_API_KEY            # see the note below
```

### Step 4 — retire the fork

Once his instance runs from this repo, the old forked repo gets archived, not
deleted. If it stays alive someone will push to it and the drift starts again
from zero.

---

## From here on

**Every schema change ships as a file in `supabase/migrations/` in the same
commit as the code that needs it.** Not applied by hand to one database and
remembered later — that is precisely how 186 of them went missing.

A change is only "shipped" when it has run against **both** databases.

---

## Two things to decide before he has real clients

- **The AI bill.** If his instance uses the same `ANTHROPIC_API_KEY`, his usage
  spends Dustin's balance and trips the $95 kill switch for *Symmetry's*
  clients. He needs his own key. (Total spend to date is about $1.54, so this
  is cheap to get right and annoying to get wrong.)
- **`is_trainer()` is still binary.** Inside any one database a trainer sees
  every client in it. That is fine while the databases are separate. It stops
  being fine the moment two trainers share one — which is the real
  multi-tenancy work, and is not this.
