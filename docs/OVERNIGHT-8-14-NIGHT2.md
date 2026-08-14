# Overnight, night of 14 Aug — handoff

**Repo HEAD when this was written: `7a2d3b2`.** Everything below is shipped,
verified against live rows, or explicitly marked as not done.

Read `docs/OVERNIGHT-8-14.md` for the *previous* night. This is the one after it.

---

## ⛔ THE THREE THINGS THAT MATTER MOST

### 1. Your CI had been failing on every push since 13 Aug

Twenty-two failure emails from one night, plus more. **Nothing was scheduled** —
`Syntax Check` runs on every push and type-checks the whole repo, so once one
commit broke it, every commit after inherited the failure.

Two faults, neither in application code:

- `tsconfig` targeted **ES2017**; two guard tests use the regex `/s` (dotAll)
  flag, which needs ES2018+. tsc emitted `TS1501`. First one arrived in
  `4df0802` (13 Aug, the weigh-in fix), second in `da9f9d1`.
- The workflow matched with a bare `grep "error TS1"` — not "TS1xxx parse
  errors" but *anything starting TS1*, which sweeps up TS15xx **config**
  errors. TS1501 is a config error. **The job failed itself on its own compiler
  settings** while every line of code parsed fine.

Fixed in `7a2d3b2`: target → ES2018, grep bounded to **TS1000–TS1499**.
**Verified green on GitHub — run #680 is the first pass in the workflow's
history.** Neither guard test was touched; `noDuplicateRows` is the one
protecting Robert Miller's four real sessions from 31 Aug 2024.

### 2. The food import was DEAD, not paused — one character

`food_import_state` said *"paused — 179,835 foods is enough for this roster"*.
That was a decision **a bug had already made for us**.

The HuggingFace page at offset 205,300 contains exactly ONE JSON NUL escape in
2,351,968 bytes. Postgres can't store NUL, so `content::jsonb` raised **22P05**
— inside `exception when others then v_http_status := -1`, which recorded a
permanent PARSE failure as a transient TRANSPORT failure. Stall protection
correctly refuses to skip past transport failures, so it re-fetched the same
2.35 MB page forever.

**The tell:** every run took ~7.97s and did nothing. The 1 Aug audit recorded a
"7.74s average" and read it as *slow*. That was the failure signature.

Fixed (`fix_off_import_nul_escape_stall`). **Now running every minute.**

### 3. The YouTube duration scrape is OBSOLETE, not blocked — and videos are done

Measured, not assumed: YouTube does **not** block Postgres (oEmbed returns 200,
unlike from Vercel). But the watch page with a browser UA returns 200 / 1.13 MB
with `ytInitialPlayerResponse` present **3 times** and `lengthSeconds` present
**ZERO times**. The field is gone. Relocating the scrape would have achieved
nothing.

Replaced with `measure_video_durations()` on the YouTube Data API.
**All 237 measured in 1.3 seconds.**

---

## What shipped (2 commits)

| SHA | What |
|---|---|
| `def6309` | The video fill loop stops when it stops making progress |
| `7a2d3b2` | Stop Syntax Check failing itself on its own compiler settings |

`def6309` fixed a livelock: the loop ran its full 25 rounds against the same 30
rows — *"Done — 2 videos added from 750 checked"*, where 750 = 25 × 30 — and
called it success. It now breaks when `remaining` stops falling and says
plainly that nothing changed.

## Database migrations applied

| migration | what |
|---|---|
| `fix_off_import_nul_escape_stall` | strip NUL escapes; tell parse failures from transport failures |
| `off_import_uses_hf_token_when_present` | optional HF auth; pacing 0.25s → 0.05s when authenticated |
| `add_app_api_keys_store` | `public.app_api_keys`, RLS on / zero policies, + `get_api_key()` |
| `add_measure_video_durations` | `measure_video_durations()` via YouTube Data API |
| `allow_video_candidate_lifecycle_statuses` | status CHECK now allows `too_long`/`dead`/`superseded` |

**That last one was a third latent bug.** The CHECK allowed only
`pending`/`approved`/`rejected`, but the shipped route writes `too_long`,
`dead` and `superseded`. Every one would have thrown `23514`. Nobody noticed
because measurement never succeeded — **the two bugs hid each other**, and
fixing only the measurement turned a silent no-op into a hard crash on the very
first real result.

## Scheduled jobs now live

| job | schedule | notes |
|---|---|---|
| `off-bulk-import` | every minute | `import_off_bulk(30,100)` |
| `video-duration-measure` | every 10 min | no-ops instantly if the queue is empty |

**Rate limiting is the ceiling, measured empirically:**

| pages/min | result |
|---|---|
| 30 | clean, ~3,000 records/min |
| 45 | `http_status_429` |
| 55 | `429`, and throughput **fell** to ~1,200/min |

Overshooting is *penalised*, not capped. 30/min is the fastest **clean** rate.
Do not "optimise" this upward without re-measuring.

## Results, verified against live rows

**Exercise videos — DONE**

| | before | after |
|---|---|---|
| Exercises with video | 595 | **703** of 839 |
| Without | 244 | 136 |

108 applied, **avg 18.6s, max 30s** — inside Dustin's "under 30, preferably
under 20". 129 `too_long` kept visible for his review. 2 dead. 94 candidates
were found by 6 agents using 93 of the 200-call WebSearch budget.

**Food catalog** — 179,835 → 260,000+ and climbing every minute. Total
available 4,626,862. ~1–1.5 days to complete at the clean rate. 544 bytes/row
measured, so the full import lands around **2.1 GB** (Pro includes 8 GB).

## Data cleanups (all backed up first)

- **Pec Deck / Pec Dec** merged. Pec Dec was a pure orphan — 0 prescriptions,
  0 set logs — so it was a clean delete. Survivor keeps its video, 27
  prescriptions, 62 set logs. → `bak_pec_dec_merge_20260814`
- **Jennifer Day, 30 Jul** duplicate removed. Bigger than described: it spanned
  **three** tables, and the two `days` rows differed only by **position 12 vs
  13**, which is why the 8/13 unique index didn't catch it (position is part of
  the key). → `bak_jennifer_dup_20260814_*`
- **4 wrong video candidates binned** → `bak_video_candidates_dropped_20260814`

⚠️ **NOT touched, deliberately:** three more same-label day pairs exist, but
they are **template** days (`client_owner_id` null, "Gym A/B/C — (New)") and two
are referenced by live schedules. That is the near-miss shape the notes warn
about. Flagged, not deleted. And the unique index was **not** widened — dropping
`position` from it would reject legitimately repeated labels.

---

## ⚠️ #44 IS NOT WHAT EVERY HANDOFF SAYS IT IS

Every prior handoff says *"the data layer already exists, the gap is display."*
**That is true of the schema and false of the rows**, and one `count(*)`
disproves it:

| | |
|---|---|
| `meal_items` | 1,528 rows — **0 with micros** |
| `meal_adherence_logs` | 1,680 rows — **20** with any nutrient (1.2%) |
| `food_catalog` | 197,894 rows — **195,992 (99%) carry nutrients** |

**The catalog is full and almost none of it reaches a client.**
`planMealNutrients()` works correctly and returns nothing for every planned meal
in the database. Building display on it renders 1,528 blanks. `PLAN_SELECT`
already carries `micros`, so the documented trap is not the cause either.

The log write path *works* but fires on ~10% of logs (13 Aug: 3 of 30; 7 Aug:
3 of 49) — only the catalog-backed minority path. **That is exactly what
"everywhere in food logger" meant.**

**Build order:** write paths first (at pick time the exact catalog row is known
— deterministic, no fuzzy matching) → the `plan-edit` clone trap that silently
drops micros → *then* backfill. Backfill needs Dustin's eyes: only **296
distinct foods**, 61.3% match by name once parentheticals are stripped, and the
misses are `(cooked)` qualifiers, unlimited items, and OR-choices like
`"Boiled Eggs (whole) OR Steak (ribeye/sirloin)"` which isn't a food.

**Scope Dustin locked:** fiber, sugar, sodium, sat fat. NOT the 33-micro panel.

---

## Dustin's 9 locked decisions (do not re-ask)

1. Videos — bin the 4 bad, run the other 241 ✅ done
2. **Pec Deck** survives ✅ done
3. #44 — **fiber, sugar, sodium, sat fat** only
4. #39 button — *"wherever it fits well, do not let it cover any buttons on any
   page or tab. test this multiple times from every single angle in the live
   app."* **The acceptance test is live visual verification, not code review.**
5. #35 — he sets defaults, **client chooses their own**
6. Emoji reactions — **the message's sender** opts in (clients too, not just him)
7. #45 — free only → Google Fit / Health Connect. Apple's $99/yr is out.
8. Jennifer Day — keep first ✅ done
9. #37 — **draft only, held for morning** ✅ done

---

## STILL OPEN — the honest list

| item | state |
|---|---|
| **#39 Gerard & Sharon button** | **NOT STARTED as a build.** Research done — see below. |
| **#44 nutrients** | Diagnosed (above). Write paths not built. |
| **#35 notifications** | Decisions captured. Not built. |
| **#45 wearables** | Already scoped in `HEALTH-CONNECT-BUILD-PLAN.md`, `HEALTH-SYNC-HANDOFF.md`, `GARMIN-APPLICATION-DRAFT.md`. Needs his OAuth step, not more scoping. |
| **Claudine 13 Aug total** | Needs her to reload and confirm. Morning job. |
| **129 too_long videos** | His review queue. |

### #39 — what the research found, so the next session doesn't redo it

**Do not simply make the FAB bigger.** `src/components/CoachFab.tsx` is 56px and
carries hard-won collision rules: hides entirely when the keyboard is up, lifts
for `SessionDock`, sits under sheets (z 1100 vs 1200), above the nav.
`GlobalCoach.tsx` has a per-screen `FAB_LIFT` map that exists **because the 56px
circle already covered the Messages send button** — Dustin, 13 Aug: *"the ai bot
[is] over a button blocking it."* A larger circle in the same corner covers
strictly more on every screen and re-opens that whole class.

**The insight worth keeping: an in-flow element cannot cover a button; a
floating one always can.** So the safe design is a large, labelled, in-flow bar
on the client home screen for pool-gated clients only, leaving the 56px FAB
untouched everywhere else. That satisfies "cover nothing" by construction
rather than by testing.

**What it needs:**
- `ai_pool_only` is currently read **server-side only** (`src/lib/ai/workoutPool.ts:97`).
  It must be exposed client-side. `client_app_settings` is already read from the
  client elsewhere (`HomeMacrosCard`, `ExperienceSettings`), so RLS permits it.
- There is **no external open event for the client coach**. `AIAssistant.tsx`
  listens for `symmetry:open-ai` but that FAB is `!hidden` and is the *trainer*
  one. `GlobalCoach` → `CoachChatSheet` has no equivalent. One must be added.
- Mount in `src/app/(app)/home/ClientDashboard.tsx` (869 lines), additive,
  minimal edit — the same containment pattern Goals used.
- Then live-verify every tab, per decision 4.

---

## Gates and how to ship

```
npx tsc --noEmit    → 0 errors in src/   (all errors under tests/ are expected)
npm run test:unit   → 0 failed
npx next build      → "Compiled successfully"
```

`/login` and `/set-password` prerender errors are expected sandbox noise.

⚠️ **`tsconfig.tsbuildinfo` caches tsc results.** It masked the ES2018 fix
locally — `rm -f tsconfig.tsbuildinfo` if tsc reports something that should be
gone. It's gitignored, so CI is always clean.

Ship via the bridge (cloud cannot push): commit → `git bundle create` →
`SendUserFile` → `device_commit_files` **bundle first, SHIP-NOW second** → poll
`outbox\SHIP-RESULT.txt`.

## Keys

`public.app_api_keys` — RLS on, **zero policies**, service role only. Read with
`get_api_key(name)`. Holds `huggingface` and `youtube`, both added by Dustin in
his own SQL editor. **Both jobs run in the DATABASE, so Vercel env vars are
useless to them.** Both features degrade cleanly when a key is absent.

---

## The lesson this night kept teaching

Three separate things were written down as fact and were wrong: *"paused,
179k is enough"*, *"the network is real on Vercel"*, *"the data layer exists,
the gap is display."* All three were sincere. Each was disproved in seconds by
one direct measurement — a `count(*)`, a `regexp_match`, a status tally.

**Swallowed errors become confident documentation.** When a doc asserts why
something is the way it is, measure it before building on it.
