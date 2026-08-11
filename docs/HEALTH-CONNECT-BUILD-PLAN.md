# Health Connect — build plan

**For Dustin to approve before any code is written.**
Written 2026-08-11. Builds on `docs/HEALTH-SYNC-HANDOFF.md` (the research) —
this is the doing half.

**Decided so far:** new `health_daily` table (D2, Dustin 11 Aug). Food import is
CSV-first (D4, 4 Aug). Imported food lands as off-plan (D4).

---

## 1. The one thing to understand before anything else

**This is the first feature in months that does not reach your clients' phones
on its own.**

Everything shipped since July arrives instantly, because the Android app is a
thin shell that loads the live Vercel site (`capacitor.config.ts` →
`server.url`). Push to `main`, Vercel deploys, every phone has it.

Health Connect is different. It needs a **native Android permission and a native
plugin**, which means:

- a **new APK build** in Codemagic, and
- **every client re-installs the app** to get it.

Nothing about the sync works for a given client until they do. That is the real
cost here — not the code. Worth deciding now whether this ships to everyone or
to two or three willing clients first.

**And Health Connect itself must be installed on the phone.** It is built into
Android 14+; on 9–13 it is a Play Store app. Some clients will need to install it
and then grant permissions. Expect that to be the step people get stuck on.

---

## 2. What actually gets pulled, and where it lands

| Data | Where it goes | Why there |
|---|---|---|
| Steps, active kcal, distance, exercise minutes | `health_daily` (new) | One row per client / day / provider |
| Resting HR, HRV, sleep | `health_daily` (new) | Same row, mostly nulls at first |
| Weight, body fat from a smart scale | **`metrics`** (existing) | Already has `weight`, `body_fat_pct`, `source`. Charts already read it — a scale reading becomes a weigh-in with no new UI at all |
| Workouts done elsewhere (a run, a bike, a class) | **`health_workouts`** (new), then `cardio_logs` if unmatched | The staging table keeps the raw session so a dedupe mistake is reversible |

**The important one:** body metrics need **no new anything**. A client with a
smart scale that writes to Health Connect starts producing weigh-ins that appear
on your existing charts. That is probably the fastest real value in the whole
feature.

Health Connect covers **Garmin, Fitbit, Samsung, Withings, most smart scales and
the phone's own step counter**, because they all write into it. That is why it
comes before Garmin's own API — one integration, most of the devices.

---

## 3. Where it lives in the app

### 3.1 Settings → Connected apps *(new screen)*

The only genuinely new surface. Per provider: connect / disconnect, last synced,
what it is allowed to read, and any error in plain words. This is also where a
client revokes, and where they land when a permission is missing.

### 3.2 Progress → steps and resting HR *(existing screen, two new charts)*

Fits the chart components already there. Steps is the number clients care about;
resting HR is the one YOU will care about, because it moves before anything else
when someone is overreaching or getting ill.

### 3.3 Trainer client profile → "trained elsewhere"

Sessions they did that you did not programme. This is the one that changes how
you coach: seeing that someone ran 5k on Saturday explains a bad Monday session.

### 3.4 Weigh-ins → nothing new

Scale readings flow into `metrics` and appear wherever weigh-ins already appear.

**NOT in v1:** an attention-feed row for a stale device, food CSV import, any
Garmin-specific screen. Each is easy to add once real data exists and none of it
is worth guessing at now.

---

## 4. The decision that actually matters: what counts as training

A client does a programmed session, logs it in the app, **and** wears a watch.
That is now two records of one workout. Imported naively:

- their streak double-counts,
- the challenge board inflates,
- you see volume that never happened.

The mechanical rules (from the research doc, §8) are settled:

1. **Ours wins for programmed work.** An imported session overlapping one of
   ours gets linked and never counted separately.
2. **Overlap window:** started within ±30 min, same day. Tune against real data.
3. **Steps and body metrics** dedupe by provider precedence, not overlap.
4. **Backfill is normal** — a watch that syncs three days late delivers Saturday
   on Tuesday, after Saturday's scoring ran. Anything that scores these tables
   must be recomputable.
5. **Chicago-local, imperial on screen.** Providers send UTC and metric. Convert
   at the edge. A UTC timestamp becoming a `log_date` is a bug this codebase has
   already fixed twice.

**What is NOT settled, and is yours to call — see D8 below.**

---

## 5. Decisions I need before writing code

**D8 — Does an unmatched imported workout count toward streaks and challenges?**
A client runs 5k on Saturday, wearing a watch, nothing programmed. Options:

- **(a) No.** Streaks and challenges count only what you programmed and they
  logged. Imported sessions are context for you, visible on their profile, but
  they do not score. *Safest — nothing inflates, and the leaderboard keeps
  meaning what it means today.*
- **(b) Yes, as cardio.** It lands in `cardio_logs` and counts wherever cardio
  already counts.
- **(c) It depends on the challenge.** Most flexible, most to build.

I would start at **(a)** and loosen it once you have seen a month of real
imported data. Tightening later means taking a streak away from someone, which
is worse than granting one late.

**D9 — Who gets this first?** Everyone re-installs, or two or three volunteers?
I would pilot: the install-and-grant-permissions flow is where people get stuck,
and finding that out with 3 clients beats finding it out with 35.

**D10 — Sleep and HRV: pull them or not?** Health Connect exposes both. They are
free to store and I would take them now even if nothing reads them yet — but
they are also the most personal data in the set, and "we collect it because we
can" is a bad answer if a client asks.

---

## 6. Build sequence

| Phase | What | Ships as | Depends on |
|---|---|---|---|
| **1** | Schema: `health_connections`, `health_daily`, `health_workouts`. Migration only, additive. | web deploy | D3 (token storage) |
| **2** | Settings → Connected apps screen, no provider wired. Shows "nothing connected". | web deploy | Phase 1 |
| **3** | Capacitor Health Connect plugin + permission flow + a real read. **New APK.** | APK | Phase 2, D9 |
| **4** | Ingest: daily totals → `health_daily`; scale readings → `metrics`. | web deploy | Phase 3, real data |
| **5** | Workout ingest + dedupe (§4). | web deploy | Phase 4, D8 |
| **6** | Progress charts + "trained elsewhere" on the client profile. | web deploy | Phase 4 |

**Only Phase 3 needs an APK.** Everything else is a normal web deploy, which
means most of this can be built and reviewed before anyone re-installs anything.

Phases 1, 2 and 6 are the ones I can do unsupervised and safely. Phase 3 needs a
device in your hands to test. Phase 5 is the one to be careful with — it touches
what counts as training.

---

## 7. Apple — honestly

**Not next, and not because of the code.**

The iOS app has never been distributed. The developer account is active, but
`docs/IOS-RELEASE-CHECKLIST.md` — TestFlight, the ship sequence, ~45 minutes of
App Store Connect clicks only you can do — is still open as backlog item 7.
HealthKit also raises the review bar on a web-wrapper app.

So Apple Health is gated behind shipping an iOS build at all. **Health Connect
on Android first is the right call**, and the same schema and screens serve
Apple later with only the plugin swapped. Nothing here gets thrown away.

If any of your clients are iPhone-only and this matters to them, the order
changes — but then the real task is backlog 7, not this one.

---

## 8. What this does not do

- No live food-logger sync. CSV import when it happens (D4, decided 4 Aug).
- No Garmin-native data until the application clears — weeks. Health Connect
  gets Garmin's steps and workouts anyway, via the phone.
- No automatic programme changes off health data. It informs you; it does not
  coach on its own.
