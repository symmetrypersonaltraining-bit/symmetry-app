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

## Standing it up

### Step 1 — get the schema into the repo *(needs a credential from Dustin)*

`scripts/dump-schema.sh` does the whole job, but needs the live database's
connection string:

> Supabase dashboard → the `mkfiginpiesospsnktea` project → **Settings** →
> **Database** → **Connection string** → **URI**

```bash
./scripts/dump-schema.sh "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
```

`--schema-only`: structure only. **No client data ever leaves the database.**

The string is a password. It is passed as an argument, used once, never
committed, never echoed — the script redacts anything that looks like one
before it reaches a log.

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
