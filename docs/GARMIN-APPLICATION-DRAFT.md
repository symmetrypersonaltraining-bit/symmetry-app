# Garmin Connect Developer Program — application draft

**For Dustin to submit** at https://developer.garmin.com/gc-developer-program/ (Health API + Activity API).
Drafted 2026-08-04. Nothing here is submitted yet.

Garmin reviews every application and declines vague ones. The two things they are
looking for are a **specific, named use case** and a **live privacy policy URL** —
both of which we now have. What follows is written to be pasted into their form
with minimal editing; the bracketed bits are the only parts that need your input.

---

## Before you submit

1. **Privacy policy must be live.** It ships with the next web deploy at
   `https://symmetry-app-omega.vercel.app/privacy`. Open it and confirm it loads
   before you submit — a dead link is the most common instant decline.
2. **Use the studio email**, `symmetrypersonaltraining@gmail.com`, not a personal one.
3. **Apply for both APIs** if the form lets you: the **Health API** (steps, sleep,
   heart rate, body composition) and the **Activity API** (the workouts themselves).
   Todd's request needs both.
4. Expect **weeks, not days**. This is why it goes first — everything else can be
   built while it sits in a queue.

---

## Company / applicant

| Field | Value |
|---|---|
| Company name | Symmetry Personal Training |
| Website | https://symmetry-app-omega.vercel.app |
| Privacy policy URL | https://symmetry-app-omega.vercel.app/privacy |
| Contact | Dustin Gautreaux — symmetrypersonaltraining@gmail.com |
| Country | United States |
| App name | Symmetry |
| Platforms | Android (published), iOS (planned) |
| Approximate user base | ~35 active clients, one trainer |

---

## Describe your application *(paste this)*

> Symmetry is the private training app for a personal training studio in
> Princeton, Texas. It is used by one trainer and roughly thirty-five of his clients.
> It is not a consumer product, is not sold, and is not available to the general
> public — accounts are created by the trainer for people he trains in person.
>
> The app holds each client's programme, their logged workouts (sets, reps, load),
> their nutrition plan and food logging, body metrics, progress photos, scheduling
> and messaging with their trainer.
>
> A number of our clients wear Garmin devices and train outside their supervised
> sessions — running, cycling, walking, and gym work done on their own. At the
> moment none of that is visible to the trainer unless the client tells him, and
> none of it counts toward the consistency tracking inside the app. The client is
> doing the work twice: once with the watch on, and again typing it into our app.

## How will you use Garmin data? *(paste this)*

> Two purposes, both inside the app, both visible only to the client and their
> trainer:
>
> **1. Show work the client already did.** Activities from the Activity API appear
> in the client's own training history and on their trainer's view of that client,
> so a run on Saturday is visible without them re-entering it. Where an activity
> overlaps a session already logged in our app, we link the two rather than
> counting both — we do not want to inflate anyone's totals.
>
> **2. Daily context for coaching.** Steps, resting heart rate and sleep from the
> Health API are shown on the client's progress screen and to their trainer, to
> inform programming decisions — for example, easing a session after a week of
> poor sleep, or noticing that daily activity has dropped off.
>
> We request only the data types needed for the above. Data is stored in our own
> database (Supabase, US region) with row-level access control: a client account
> can read only its own records, and only the one trainer can read across clients.
>
> Garmin data is never used for advertising or marketing, never sold, never shared
> with any third party, and never shown to other clients. The app contains no
> advertising and no analytics or tracking products. If a client disconnects
> Garmin, syncing stops immediately and we delete previously imported data on
> request.

## Which APIs and data types *(tick / list)*

**Health API**
- Daily summaries — steps, distance, active calories
- Sleep summaries
- Heart rate, including resting heart rate
- Body composition (weight), if available

**Activity API**
- Activity summaries — type, start time, duration, distance, calories, average and
  max heart rate

*Not requested:* location/GPS routes, pulse ox, stress details, third-party data.
Ask for less; it is faster to approve and we do not need it.

## Technical *(paste this)*

> Integration is server-side: OAuth for the client to link their Garmin account,
> and Garmin's push notification (webhook) endpoints delivering data to our
> backend, rather than polling. Our backend is a Next.js application on Vercel
> with a Supabase Postgres database. We expect low volume — well under a hundred
> users — and no bulk historical backfill beyond what a newly connected user
> brings with them.

---

## If they decline

Most declines are for a missing privacy policy, a vague use case, or asking for
more data types than the use case justifies. All three are addressed above. If it
still comes back declined, ask them which of the three it was — they will usually
say — and the fallback is a data aggregator (Terra, Rook and similar carry Garmin
under their own agreement), which is discussed in
`docs/HEALTH-SYNC-HANDOFF.md` §5.

---

## Fill in before sending

- [x] City and state for the studio — **Princeton, Texas**, filled in 2026-08-11
- [ ] Confirm the privacy policy URL loads
- [ ] Decide whether to give the app's Play Store listing URL — we do not have one
      yet (we sideload a debug APK). If the form demands a store URL, say the app
      is distributed privately to studio clients and an Android listing is in
      progress.
