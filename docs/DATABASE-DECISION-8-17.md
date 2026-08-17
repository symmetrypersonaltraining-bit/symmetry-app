# The database: what happened, and what to do

**17 Aug 2026.** Written after the morning outage. Every price and spec below is
from Supabase's own docs, linked at the bottom.

---

## THE ONE URGENT THING

**You have no backups, and 72.8% of your storage ceiling is used.**

- `LAST BACKUP: No backups` — the free plan includes none.
- Your database is **364 MB**. The free plan's hard limit is **500 MB**, at which
  point Supabase forces it **read-only**. You are 136 MB from the app refusing
  to accept a single new weigh-in.

That database holds 30 clients' training history, nutrition logs,
body-composition metrics and messages. Right now a bad restart loses all of it
with no undo.

**Do this today, before anything else.** Three commands in Git Bash. Takes ten
minutes and costs nothing:

```bash
supabase db dump --db-url "$DB_URL" -f roles.sql  --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql   --data-only --use-copy
```

`DB_URL` is the **session pooler** string from Supabase → Settings → Database
(port **5432**, not 6543 — the transaction pooler cannot do dumps). Put the
three files in Google Drive under symmetrypersonaltraining@gmail.com.

---

## WHAT ACTUALLY WENT WRONG

Not CPU, and not connections. Both are ruled out by the numbers on your own
screenshot: CPU 10%, connections 29 of 60.

**It was disk.** NANO's baseline disk is 5 MB/s and 250 IOPS. Your Postgres logs
show 96 buffers — about 768 KB — taking 10 seconds to write. That is roughly
**0.08 MB/s, about 60x slower than even NANO's throttled floor.** The disk was
saturated and queuing. Everything else follows from that one fact:

- queries exceeded their timeout waiting on I/O → the PostgREST timeout errors
- `/api/health` returned 503 because its query never came back
- **CPU sat at 10% precisely because everything was blocked waiting on disk,
  not computing.** Low CPU during an outage is the signature of I/O starvation,
  not evidence of health

**RAM made it worse.** NANO has 0.5 GB. 70% of that is ~358 MB, and every
database connection carries its own memory. A Vercel redeploy makes every
serverless function reconnect at once — 29 connections spawning on a
half-gigabyte box. When memory runs short the machine swaps, and swap writes go
to the same throttled disk. That is a loop that feeds itself.

*(Honest caveat: the swap link is inference. It is the standard mechanism and it
fits, but swap metrics were not captured. The disk starvation is proven; the
swap contribution is reasoning.)*

**Why the restart took 20 minutes and worked.** Startup recovery reads and
writes on the same throttled disk, so it crawled. It fixed things because it
killed all 29 connections, freed the memory, and let burst credits refill.

**Why Supabase still said ACTIVE_HEALTHY.** Not a bug. That check asks whether
the instance exists and responds at the infrastructure level. It does not
measure whether queries return.

**This is the same disease as 15 Aug.** That time the CPU credits ran out; this
time the disk and memory headroom did. NANO through 2XL are burstable — they
earn credits when idle and spend them under load. **The instance has no
guaranteed floor of performance.** It will happen a third time.

**Your traffic is not the problem.** 1–2 requests per second is nothing. You do
not have a scaling problem. You have an instance below the minimum floor for
running a real app for 30 people.

---

## WHAT TO SPEND

### Recommended: **Pro + Small — $30/month**

Pro is $25, the Small compute add-on is $15, and Pro includes a $10 compute
credit. Net $30.

| | NANO (now) | MICRO | **SMALL** | MEDIUM |
|---|---|---|---|---|
| RAM | 0.5 GB | 1 GB | **2 GB** | 4 GB |
| Baseline IOPS | 250 | 500 | **1,000** | 2,000 |
| Baseline disk | 5 MB/s | 11 MB/s | **22 MB/s** | 43 MB/s |
| Connections | 60 | 60 | **90** | 120 |
| Net cost with Pro | — | $25/mo | **$30/mo** | $75/mo |

**What $30 buys:** 4x the memory, so a reconnect storm is nowhere near the
ceiling. 4x the disk floor — the thing that actually broke. Managed daily
backups kept 7 days, restorable from the dashboard with one click. Storage
ceiling goes from 500 MB to 8 GB, which retires the second clock you are
currently running down. 7-day log retention, so next time the evidence is still
there. And projects stop pausing after a week of inactivity.

**What it does not buy, and I want to be straight about this:** Small is still a
burstable tier. Only Large and above ($110/mo) have dedicated CPU. Small raises
the floor 4x; it does not leave the credit model. If it happens again on Small,
the next step is Medium at $75, not Large.

**You cannot stay on NANO once you go paid** — in a paid org NANO is billed at
MICRO rates anyway. So the realistic floor is MICRO at $25. MICRO is 1 GB RAM
and 500 IOPS: double what just failed, which is too thin a margin for my
comfort. The extra $5 for SMALL is the best-value line in this document.

### The whole decision

| Option | Cost | Backups | Storage ceiling | Outage risk |
|---|---|---|---|---|
| Do nothing | $0 | none | 500 MB (72.8% used) | recurs |
| Free + nightly dumps | $0 | self-managed | 500 MB (72.8% used) | recurs |
| Pro (MICRO) | $25/mo | 7-day managed | 8 GB | ~2x better |
| **Pro + SMALL** | **$30/mo** | 7-day managed | 8 GB | ~4x better |
| Pro + MEDIUM | $75/mo | 7-day managed | 8 GB | ~8x better |

**Skip point-in-time recovery.** $100/month per 7 days of retention. Wildly
disproportionate for 30 clients.

---

## FREE THINGS WORTH DOING ANYWAY

1. **Nightly automated dumps.** Supabase publishes a GitHub Actions workflow
   that runs those three dump commands on a cron.
   ⚠️ **It must go in a NEW PRIVATE repo.** `symmetry-app` is public, and
   Supabase's own doc says never store backups in a public repository —
   committing `data.sql` there would publish 30 clients' body-composition
   metrics and messages to the open internet.

2. **Point Vercel at the transaction pooler** (port **6543**, not 5432).
   Supabase recommends transaction mode for serverless precisely because it
   shares a few real connections among many short-lived functions. This is the
   direct antidote to the redeploy reconnect storm that triggered today.
   Prepared statements must be disabled when using it.

3. **Make `/api/health` cheap** — `select 1` with a short timeout. A health check
   that queues on a busy database turns a slow morning into a hard outage.

4. **Keep the bulk import crons off.** On a burstable tier, batch jobs burn the
   credits your clients need.

---

## Sources

- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/manage-your-usage/compute
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/deployment/ci/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/database-size

Database size measured directly: `select pg_size_pretty(pg_database_size(current_database()))` → 364 MB.
