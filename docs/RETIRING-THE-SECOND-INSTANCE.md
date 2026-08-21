# Retiring the second instance — the steps, and the thing it costs

**Status: PREPARED, NOT EXECUTED.** Written 21 Aug 2026.

Dustin, 20 Aug: *"lets go ahead and just do away with dylans app, lets run all
test trainers on my app once we get stephs all dialed in."*

Every destructive step below is left for him to run. Deleting a Supabase
project or a Vercel project is irreversible and cannot be undone from a chat at
two in the morning, so this document stops at the edge of each one.

---

## What is being decided, stated plainly

`docs/DYLAN-INSTANCE.md` argued for separate databases, and argued for it well:

> *"Separate Supabase projects mean his clients and Symmetry's clients are in
> different databases and cannot see each other. Given this is real people's
> weight, body fat and food logs, that separation is the right default and the
> only one worth defending later."*

Running every trainer on one instance **gives that up**. The boundary between
one trainer's clients and another's stops being two different databases and
becomes row-level security inside one. That is a weaker boundary. Not a bad
one — it is the same mechanism every multi-tenant product on earth relies on,
and as of 20 August it is real here: 41 policies, `trainer_can_see_client()`,
and a live check showing a second trainer seeing 1 reminder, 1 payment, 1
appointment, 0 billing adjustments, 0 device tokens and 0 client notifications
where the owner saw everything.

But it is one bug away in a manner that two databases were not. A mistaken
policy, a service-role query that forgets to filter, a new table shipped
without RLS — any of those exposes one trainer's clients to another, and none
of them could have done that before.

**This is a real trade and it is worth making.** One instance means one
deployment, one schema, one migration path, one place to fix a bug, and every
trainer on the same code the same day — which is most of why the fork was
painful. The point of writing it down is so that nobody is surprised later, and
so the two obligations it creates are visible:

1. **No new table ships without RLS.** Not "we will add it after".
2. **The service role is not a convenience.** Anything running as service role
   filters by trainer explicitly, because nothing else will do it for them.

---

## Before anything is deleted

**1. Confirm the second instance has no real clients.**

Run against the OTHER project, not this one:

```sql
select count(*) as clients,
       count(*) filter (where auth_user_id is not null) as with_logins,
       max(created_at) as newest
  from public.clients;

select count(*) as workout_logs from public.workout_logs;
select count(*) as metrics       from public.metrics;
select count(*) as meal_plans    from public.meal_plans;
```

If any of those is non-zero and belongs to a real person, **stop**. Migrating
somebody's training history between databases is its own project and is not
part of retiring a test instance.

**2. Take a dump anyway.**

```bash
pg_dump "<other-instance-connection-string>" --schema-only > retired-instance-schema.sql
pg_dump "<other-instance-connection-string>" --data-only   > retired-instance-data.sql
```

Keep both off the machine's temp folder. They cost nothing to hold and they are
the only thing standing between "we deleted it" and "we lost it". This is the
same rule as `bak_*` before a destructive change, applied to a whole project.

**3. Check nothing points at it.**

- Any invite link or install QR handed out from that deployment sends people to
  a URL that will stop existing. Search Gmail for its Vercel domain before
  deleting.
- Its Google Calendar OAuth consent, if one was ever connected, should be
  revoked from the Google account rather than orphaned.

---

## The steps

Each one is Dustin's to run.

**Step 1 — move any test trainer onto this instance.**
Exactly the process Stephanie went through, which is now known to work:

```sql
insert into public.trainers (email, name, first_name, role, active)
values ('<their address>', '<Their Name>', '<First>', 'trainer', true);
```

Then add the address to `NEXT_PUBLIC_TRAINER_EMAILS` in Vercel and redeploy.
`TRAINER_EMAILS` is a union with a hardcoded default, so adding to it can never
remove anybody — see `src/lib/trainer.ts`.

Give them a sandbox client to look at rather than a real one. Stephanie's demo
client is the pattern.

**Step 2 — verify the new trainer sees only their own.**
Do not skip this and do not take the screens' word for it. The check that was
used on 20 August, run as them:

```sql
-- as the new trainer's JWT, not as service role
select count(*) from public.payment_reminders;
select count(*) from public.appointments;
select count(*) from public.device_tokens;
select count(*) from public.client_notifications;
select count(*) from public.clients where archived_at is null;
```

Expect their own rows and nothing else. The shared exercise library (843 rows)
SHOULD be visible — that is deliberate.

**Step 3 — turn the old deployment off before deleting it.**
Pause the Vercel project rather than deleting it. Leave it paused for a week.
If nothing is missed in a week, nothing was being used.

**Step 4 — pause the Supabase project.**
Same reasoning, and Supabase pausing is explicitly reversible. Do not delete on
the same day you pause.

**Step 5 — delete, if still wanted, after the week.**
Vercel project, then Supabase project. Then update `docs/DYLAN-INSTANCE.md`
with a header saying it describes a shape no longer in use, and why — do not
delete that document. It is the record of what a second instance costs, and if
the one-instance model is ever regretted, it is the map back.

---

## What stays true either way

The instance-neutrality work does not become pointless. `TRAINER_EMAILS`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_INSTANCE`, the APK URL fallback, the
calendar OAuth redirect, `fetchOwnClientRow()` looking people up by
`auth_user_id` rather than by name — all of that is what makes the multi-trainer
single instance work at all. It was written for a second deployment and it is
load-bearing for a second *trainer*, which is the thing actually happening.

`docs/ADDING-A-TRAINER.md` still claims *"A trainer sees ALL clients… It is NOT
yet multi-tenancy."* That was true on 11 August and is false now. It should be
corrected in the same pass that executes this, so the two documents do not
disagree with each other in front of a new trainer.

---

## Open question for Dustin

The week-long pause in steps 3 and 4 is a suggestion, not a rule. If the other
instance genuinely has never had a real client on it, deleting on the day is
defensible. **The dumps in step 2 are not optional either way.**
