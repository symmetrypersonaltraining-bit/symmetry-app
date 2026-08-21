# Adding a trainer

Shipped 2026-08-11. Before this, "is this person the trainer" was the literal
string `symmetrypersonaltraining@gmail.com` in 63 places across 62 files plus
once inside the database. Adding a trainer meant editing all of them, which is
why Dylan's instance is a fork rather than a setting.

It is now **two steps**, and both are additive.

---

## 1. The database — what a trainer may READ

```sql
insert into public.trainers (email, name)
values ('someone@example.com', 'Their Name');
```

This is the one that matters. 64 RLS policies call `is_trainer()`, and that
function now reads this table. Without a row here, the person sees nothing no
matter what the app says.

`public.trainers` is deliberately **not writable through the API** — no session
can promote itself. Use the SQL editor or a service-role key.

To remove a trainer, set `active = false` rather than deleting the row, so the
history of who had access survives.

## 2. The app — what a trainer SEES

Set `NEXT_PUBLIC_TRAINER_EMAILS` in Vercel (comma-separated):

```
NEXT_PUBLIC_TRAINER_EMAILS=symmetrypersonaltraining@gmail.com,someone@example.com
```

Redeploy — it is inlined at build time. Unset, it defaults to Dustin's address,
which is why nothing changed in production the day this shipped.

This controls which controls get DRAWN: the coach dock, the client list, the
inbox, the trainer AI tools. It grants nothing. If you set this and skip step 1,
they get a trainer-shaped screen with no data in it.

---

## The one thing to understand

**Superseded 20 Aug 2026.** What stood here said *"A trainer sees ALL clients…
It is NOT yet multi-tenancy."* That was true when it was written on 11 August
and it is false now, and a stale sentence saying a boundary does not exist is
the kind that gets somebody to design around a problem that has been solved.

Per-trainer scoping shipped on 20 August: `trainer_can_see_client()` and 41
policies covering payment reminders, calendar payments, billing adjustments,
appointments, device tokens and client notifications. Verified live rather than
assumed — a second trainer saw 1 reminder, 1 payment, 1 appointment, 0 billing
adjustments, 0 device tokens and 0 client notifications, while the owner saw
all of it and exactly one `trainer_settings` row, his own.

Three things stay shared **on purpose**: the exercise library, the workout and
programme library, and the group chat. And the owner sees everything, which is
the one deliberate asymmetry.

What this means for the two steps above is unchanged — they still only decide
which controls get drawn and which data comes back. What has changed is that
the answer to "which data" is now per trainer instead of everything.

## Rules for code

- `isTrainerEmail(email)` for "is this the trainer". Never `=== TRAINER_EMAIL` —
  that compiles, reads fine, and silently supports exactly one trainer.
- `TRAINER_EMAIL` only where a SINGLE address is genuinely needed: looking up
  the trainer's own `clients` row, an email recipient.
- Never write the address into a file. `tests/unit/trainerIdentity.test.ts`
  fails the build if you do.
