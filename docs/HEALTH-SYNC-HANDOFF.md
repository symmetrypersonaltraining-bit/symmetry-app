# Health app & food logger sync — implementation handoff

**Status:** not started. This document exists so it can be started properly.
**Raised by:** Todd Prine, 2026-07-29 — *"Have app pull info from other fitness apps garmin, Google, apple"*
**Scope set by Dustin, 2026-08-04:** *"I want the app to pull data from all major health apps, food loggers, reformat to go into our app."*
**Written:** 2026-08-04, against commit `02c8bd6`.

Nothing in here has been built. Section 9 lists the decisions that need Dustin's
answer before anyone writes code — per his instruction, *"if we need new charts,
sheets, etc to import to then discuss them before starting."*

---

## 1. What "pull data in" actually means here

Four kinds of data, and they are not equally hard:

| Data | Sources | Difficulty | What it changes in our app |
|---|---|---|---|
| **Steps / daily activity** | Apple Health, Health Connect, Fitbit, Garmin | Easy | `everfit_daily_steps` already exists and already has a `source` column |
| **Cardio / workouts done elsewhere** | Garmin, Strava, Apple/Health Connect, Whoop | Medium | `cardio_logs` already exists (`duration_minutes, distance, calories, avg_hr, source`) |
| **Body metrics** (weight, body fat) | Smart scales via Apple/Health Connect/Fitbit | Easy | `metrics` already exists (`weight, body_fat_pct, lean_mass, fat_mass, source`) |
| **Food logs** | MyFitnessPal, Cronometer, Lose It | **Hard — see §4** | Would land next to `meal_adherence_logs`, and conflicts with our own logger |

The important and slightly surprising finding: **three of the four already have a
home.** `metrics`, `cardio_logs` and `everfit_daily_steps` were built for the
Everfit migration and every one carries a `source` column. Today those columns
hold `migration`, `client`, `caliper`, `claude`, `trainer_backfill`. Adding
`garmin`, `apple_health`, `health_connect` is the pattern continuing, not a new
one being invented.

Food is the exception and it is the one Dustin will care most about, because it
collides with the nutrition system we have spent weeks building.

---

## 2. Hard constraints from OUR architecture — read this first

These are the things that will surprise whoever picks this up.

### 2.1 The native app is a thin remote shell

`capacitor.config.ts`:

```ts
server: { url: 'https://symmetry-app-omega.vercel.app', cleartext: false }
```

The APK loads the live Vercel deployment. That is why web deploys reach phones
instantly with no app-store round trip — and it is load-bearing for how this
whole project works day to day.

It does **not** block native health plugins: the Capacitor bridge is injected
into the WebView regardless of where the page came from, and we already ship
`@capacitor-community/speech-recognition` this way. But it does mean:

- Every health integration needs a **new APK / IPA build and install**, unlike
  every other feature shipped in the last month.
- Apple reviews web-wrapper apps more carefully, and a HealthKit entitlement
  raises that bar further. See §6.

### 2.2 Capacitor deps live in CI, not in package.json

`codemagic.yaml` installs them at build time:

```
npm install @capacitor/core@^6 @capacitor/cli@^6 @capacitor/android@^6 @capacitor/app@^6 @capacitor-community/speech-recognition@^6
```

and patches `AndroidManifest.xml` in a Python step (predictive back off,
`RECORD_AUDIO`, `CAMERA`, `<queries>` for the speech recognizer). A health plugin
follows the same pattern: add the npm install, add the manifest patch. **Do not
add Capacitor to package.json** — that split is deliberate and the web build
depends on it.

### 2.3 We currently ship a DEBUG APK, and nothing on iOS

- `codemagic.yaml` → workflow `android-debug`, manual trigger, unsigned debug APK,
  emailed to Dustin. There is **no Play Store listing**.
- `ios-release-workflow.yaml` is written and staged but **inert** — Codemagic only
  reads `codemagic.yaml`. It needs an active Apple Developer account, an App Store
  Connect API key, and the app registered under `com.symmetry.app`.

**This is the real blocker.** Apple Health data cannot be read without an iOS
build, and an iOS build cannot exist without a paid Apple Developer account
(~$99/yr) and a TestFlight or App Store release. Health Connect on Android is
reachable from a sideloaded APK for testing, but **Google Play requires the Health
apps declaration form** before a Health-Connect app can be listed publicly, which
matters the moment we stop sideloading.

Sequence implied by this: **Android/Health Connect first, Apple second**, and
Apple only after the developer account exists.

### 2.4 What we already know about our own client base

Todd asked for Garmin. From the roster, phones are mixed Android/iPhone — a
Garmin-only or Apple-only answer covers a minority. Whatever is built has to
degrade gracefully for the clients who connect nothing, which is most of them at
first.

---

## 3. The landscape, per source (verified 2026-08-04)

### Google — **Google Fit is a dead end**

Google Fit APIs (Android *and* REST) are deprecated and **shut down at the end of
2026**; new developer sign-ups closed 1 May 2024. There is **no direct replacement
for the Fit REST API**. Google's own guidance is to move to Health Connect
(on-device, Android-only) or the Fitbit Web API (cloud, account-based).

**Consequence:** do not write a line of Google Fit code. Health Connect is the
Android answer, and it is on-device only — there is no server-to-server Google
endpoint to pull from. Data must be read by the app on the phone and pushed to
us.

### Apple — HealthKit, on-device only

Same shape: no cloud API, no webhooks. The app reads on-device with user
permission and forwards what it reads. Notes that bite:

- Requires the HealthKit entitlement plus `NSHealthShareUsageDescription` and
  `NSHealthUpdateUsageDescription` in Info.plist.
- Background delivery is **not** real-time streaming; expect batch-on-open.
- Apple will not sign a BAA for HealthKit data. **The moment health data leaves
  the phone and lands in our Supabase, the compliance burden is ours, not
  Apple's.**
- HealthKit data may not be used for advertising, and Apple prohibits storing it
  in iCloud. Our privacy policy has to say what we collect and why.

### Garmin — a real server API, but gated

The Garmin Connect Developer Program has a **Health API** (wellness: steps, sleep,
HR, stress, body composition) and an **Activity API** (workouts). Both are
OAuth + **push webhooks**, which is exactly what we want — Garmin posts to us
rather than us polling. The catch is approval: Garmin reviews applications and
turns down vague or consumer-analytics use cases. An application needs a clear
description of the use case and a live privacy policy.

**Approval is the long pole and it is free to start.** Whoever picks this up
should submit the Garmin application on day one and build everything else while
waiting.

### Fitbit — cloud API, Google-owned

OAuth 2.0 Web API with subscriptions (webhooks). This is now Google's
account-centric path and the recommended REST-shaped replacement for Fit.

### Whoop / Oura / Strava

All three have documented OAuth REST APIs and are the standard "long tail". Each
is a few days of work — worth doing only via an aggregator (§5) unless a client
actually asks.

### Samsung Health

Reaches Health Connect on Android, so it comes free with the Health Connect work.
No separate integration needed.

---

## 4. Food loggers — the hard one, and the honest answer

**MyFitnessPal has no open API.** Access is partner-only, commercially negotiated,
and not available on request to a small studio app. The third-party libraries on
GitHub that scrape the diary are unofficial, break when MFP changes, and violate
their terms — we should not ship one for clients' accounts.

Realistic routes for food, best first:

1. **Aggregator.** Terra (and others) list MyFitnessPal as a supported
   integration, having done the partner deal themselves. If food logger import is
   a real requirement, this is the only clean path to MFP.
2. **Cronometer** has a documented partner API and is the friendliest of the
   dedicated trackers.
3. **File import.** MFP, Cronometer and Lose It all let a *user* export their own
   diary as CSV. A "import my food diary" upload in our app is legal, needs no
   partner deal, and is maybe two days of work. It is not live sync.
4. **Health Connect nutrition.** Health Connect has nutrition data types and MFP
   writes some of it on Android. Coverage is partial and per-app.

**And the design question underneath all of it:** we have just built a nutrition
system with plans, adherence, per-meal macros and now recipes. If a client's food
comes from MyFitnessPal, what happens to adherence — which is measured against
*our* plan? Importing calories from another app gives us totals with no plan
relationship. That is a product decision, not an engineering one, and it is
decision **D4** in §9.

---

## 5. Build direct, or use an aggregator

| | Direct | Aggregator (Terra / Rook / Vital / Spike) |
|---|---|---|
| Time to first data | Weeks per source | Days for all of them |
| MyFitnessPal | Effectively impossible | Available |
| Cost | Developer time only | Monthly SaaS, usually per connected user |
| Failure modes | Ours, visible | Theirs, opaque |
| Lock-in | None | Real — their schema becomes ours |

Published 2026 cost bands for this work: aggregator MVP **$40–120k / 6–10 weeks**,
single-stack direct **$80–250k / 10–16 weeks**. Those are agency numbers for
regulated healthcare and are not what this will cost us — but the *ratio* is the
useful part: an aggregator is roughly a third of the effort, and it is the only
route to MFP.

**My recommendation:** a hybrid, in this order.

1. **Health Connect + HealthKit direct**, via a Capacitor plugin. Covers steps,
   workouts, heart rate, weight for every client with a phone, with no vendor,
   no monthly fee, and no approval queue. Samsung Health and most watches feed
   Health Connect anyway.
2. **Garmin direct** — free, push-based, and Todd specifically asked. Submit the
   application now.
3. **Aggregator only if food logger sync is confirmed as a requirement**, since
   MFP is the one thing we cannot reach ourselves.

`@capgo/capacitor-health` and `mley/capacitor-health` both wrap Apple Health +
Health Connect and read steps, active calories, distance, exercise/workouts,
heart rate and route. Both are **read-only** — fine, we have no reason to write
back. Neither covers weight or nutrition, so those data types need either a fork
or a small custom plugin. Verify current maintenance before picking one.

---

## 6. Compliance and store review — do not leave this to the end

- **Google Play Health apps declaration form** is required for Health Connect
  access, with a privacy policy URL. Google reviews it. Sideloaded testing does
  not need it; a public listing does.
- **Apple**: HealthKit entitlement, both Info.plist usage strings, a privacy
  policy, and App Store review of a web-wrapper app carrying health permissions.
- **Privacy policy**: we do not currently have one published. Both stores require
  it before health data is touched. This is a real, small, unglamorous task and
  it blocks both platforms.
- **Data handling**: health data in Supabase must stay behind the same RLS shape
  as everything else (`client_id = my_client_id()` for clients, `is_trainer()`
  for Dustin). No new service-role read paths without a reason.
- **Deletion**: if a client disconnects a source, what happens to the data we
  already pulled? Decision **D5**.

---

## 7. Proposed schema — this is the part to discuss before building

Following the existing pattern rather than inventing one. Three new tables, plus
`source` values on tables that already exist.

### 7.1 `health_connections` — who has linked what

```sql
create table health_connections (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  provider      text not null,          -- 'apple_health' | 'health_connect' | 'garmin' | 'fitbit' | ...
  status        text not null default 'active',   -- active | revoked | error
  external_id   text,                   -- provider's user id, for webhook routing
  access_token  text,                   -- OAuth providers only; on-device ones have none
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[] not null default '{}',
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (client_id, provider)
);
```

Tokens in a table is the part worth arguing about. Alternatives: Supabase Vault,
or a separate schema with no client-readable policy. **Decision D3.**

### 7.2 `health_daily` — one row per client per day per provider

```sql
create table health_daily (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  day            date not null,
  provider       text not null,
  steps          int,
  active_kcal    int,
  resting_kcal   int,
  distance_m     numeric,
  exercise_min   int,
  avg_hr         int,
  resting_hr     int,
  hrv_ms         numeric,
  sleep_min      int,
  sleep_score    int,
  raw            jsonb,                 -- what the provider actually sent
  synced_at      timestamptz not null default now(),
  unique (client_id, day, provider)
);
```

One row per provider per day, **not** one merged row: keeping Garmin's 9,412 steps
and Apple's 9,388 for the same day separately is what makes a disagreement
debuggable. The merge happens in a view.

### 7.3 `health_workouts` — sessions done outside our app

```sql
create table health_workouts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  provider       text not null,
  external_id    text not null,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  type           text,                  -- 'running' | 'cycling' | 'strength' | ...
  duration_min   numeric,
  distance_m     numeric,
  calories       int,
  avg_hr         int,
  max_hr         int,
  raw            jsonb,
  linked_log_id  uuid references workout_logs(id),   -- set when matched to one of ours
  ignored        boolean not null default false,
  synced_at      timestamptz not null default now(),
  unique (provider, external_id)
);
```

`linked_log_id` and `ignored` are the dedupe machinery — see §8.

### 7.4 Existing tables: `source` values only, no schema change

- `metrics.source` ← `'apple_health' | 'health_connect' | 'garmin' | 'fitbit'`
- `cardio_logs.source` ← same
- `everfit_daily_steps` — misnamed for a general steps table. Either rename to
  `daily_steps` (touches the Everfit importer) or leave it and treat
  `health_daily.steps` as the new home. **Decision D2.**

### 7.5 Charts and screens this implies

Nothing here draws itself. At minimum:

- **Settings → Connected apps**: connect/disconnect, last sync, per-provider
  status. New screen.
- **Progress**: steps and resting HR trend lines next to the existing charts.
  These fit the existing chart components.
- **Trainer client profile**: "trained elsewhere" sessions, so Dustin can see a
  client ran 5k on Saturday without it being programmed.
- **Attention feed**: a client whose connected device has not synced in a week is
  a signal, but a weak one — probably not worth a row.

**Decision D6** covers which of these to build in v1.

---

## 8. Deduplication — the part that will actually bite

The named failure: a client does a programmed session, logs it in our app, *and*
wears a Garmin. We now have two records of one workout. Naively imported, their
consistency streak double-counts, the challenge board inflates, and the trainer
sees phantom volume.

Rules to agree before writing the importer:

1. **Ours wins for programmed work.** A `health_workouts` row whose window overlaps
   a `workout_logs` session for the same client gets `linked_log_id` set and is
   never counted separately.
2. **Overlap window:** started within ±30 min of one of ours, on the same day.
   Needs tuning against real data.
3. **Unmatched external workouts count as cardio**, not as a programmed session —
   they should not touch the challenge board or the streak without an explicit
   rule. That is currently "days trained" and Dustin has strong opinions about
   what counts (see the streak feedback thread, 7/25).
4. **Steps and body metrics** never dedupe by overlap; they dedupe by precedence
   — one provider per client is the source of truth per data type, in a fixed
   order (Garmin > Fitbit > phone).
5. **Backfill is not an edge case.** A watch that syncs three days late will
   deliver Saturday's data on Tuesday, after the challenge scoring for Saturday
   has run. Any scoring that reads these tables must be recomputable.
6. **Units and timezone.** Everything in this app is Chicago-local (`America/Chicago`)
   and imperial on screen. Providers send UTC and metric. Convert at the edge,
   store canonical, and never let a UTC timestamp become a `log_date` by accident —
   that bug has already been fixed twice in this codebase.

---

## 9. Decisions needed before anyone starts

**D1 — Aggregator or direct?**
Recommendation: direct for Health Connect + Apple Health + Garmin. Revisit an
aggregator only if food-logger sync is a hard requirement.

**D2 — Where do steps live?** `everfit_daily_steps` renamed to `daily_steps`, or a
new `health_daily` and leave the Everfit table alone?
Recommendation: new `health_daily`, leave the old table untouched; it is historical.

**D3 — Where do OAuth tokens live?** Plain column, Supabase Vault, or a
service-role-only schema?
Recommendation: service-role-only, no client-readable policy at all.

**D4 — What does imported food DO to adherence?** Options: (a) imported meals are
informational only and adherence still measures our plan; (b) imported calories
count as off-plan entries; (c) a client on an external food logger opts out of
plan adherence entirely.
Recommendation: (a) for v1 — it changes nothing we already trust.

**D5 — On disconnect, keep or delete the imported history?**
Recommendation: keep, flagged as from a now-disconnected source. Deleting a
client's training history because they changed watches is worse.

**D6 — Which screens ship in v1?** Recommendation: Settings → Connected apps, plus
steps on Progress. Everything else after real data exists.

**D7 — Who is doing this?** It is a native + backend project with store review in
it, and the Apple half cannot start until there is a developer account. If it is
me in a future session, the Apple account and the Garmin application both need to
be in place first, and neither is something I can do.

---

## 10. Suggested sequence

| Phase | Work | Blocked on |
|---|---|---|
| 0 | Publish a privacy policy. Submit the Garmin developer application. | Dustin |
| 1 | Schema (§7) + Settings → Connected apps screen, no providers wired | D1–D3, D6 |
| 2 | Health Connect via Capacitor plugin, Android APK, real data end to end | Phase 1 |
| 3 | Dedupe rules (§8) + steps on Progress + "trained elsewhere" on the client profile | Phase 2, real data |
| 4 | Garmin webhooks | Garmin approval |
| 5 | Apple Health | Apple Developer account, App Store or TestFlight |
| 6 | Food: CSV import first; aggregator only if D4 says live sync | D4 |

Phase 0 costs nothing and unblocks two long queues. It should start whether or
not the rest does.

---

## 11. What I could not verify from here

- Whether Garmin currently approves applications from single-trainer studios —
  the guidance says use cases are reviewed, but not the bar.
- Current maintenance status of the two Capacitor health plugins. Both looked
  alive on 2026-08-04; check commit dates before committing to one.
- Aggregator pricing. All of them quote per connected user and none publish
  numbers publicly. Somebody has to ask.
- Whether the studio's Apple Developer account exists or has lapsed —
  `ios-release-workflow.yaml` says *"When the Apple Developer account is ACTIVE"*,
  which implies it is not.

---

**Sources:** [Google Fit migration FAQ](https://developer.android.com/health-and-fitness/health-connect/migration/fit/faq) ·
[Publish a health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish) ·
[Health apps declaration form](https://support.google.com/googleplay/android-developer/answer/14738291) ·
[Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/) ·
[Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) ·
[capacitor-health plugin](https://github.com/mley/capacitor-health) ·
[@capgo/capacitor-health](https://capgo.app/plugins/capacitor-health/) ·
[Wearables integration in 2026 — cost bands and pitfalls](https://sidebench.com/wearables-integration-healthcare-2026/) ·
[Terra MyFitnessPal integration](https://tryterra.co/integrations/myfitnesspal)
