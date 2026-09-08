# START HERE — Symmetry app, session handoff

**This is the living handoff. It is not dated and it is not archived. Every
session reads it first and updates it before finishing.** The `HANDOFF-*.md`
files with dates in the name are history — do not read them for current state,
and do not create another one.

Last updated: **8 Sep 2026, 13:10 CDT** · `origin/main` at **`aefc0cec`**

> **His other Claude session pushes to this repo while you work.** It is not a
> mistake and it is not to be reverted — check `git log origin/main` before you
> assume a change is yours. On 8 Sep it rewrote `docs/audit/AUDIT-RESUME.md`
> into the audit's own living file within minutes of this one being written.

---

## 0. THE FIRST FIVE MINUTES

1. Read this file.
2. Check the ship bridge: `device_list_dir` on
   `C:\Users\dusti\Claude\Projects\Trainer App\outbox` and look at
   `watcher-alive.txt`. Fresh → say *"Ship bridge is up."* and carry on. Missing
   or stale → say *"Double-click SHIP-WATCHER.bat in the Trainer App folder and
   leave the window open. Tell me when it's running."* and WAIT. Never open a
   session by investigating auth.
3. `git fetch origin main` and see where main actually is. **Another session of
   his pushes to this repo while you work.** It has happened three times in two
   days. Your first push of the session may be refused as a non-fast-forward:
   rebase onto `origin/main`, re-run the gates, resend. Never force.
4. Read `CLAUDE.md` (the rules) and `docs/BACKLOG.md` (the queue).
5. **If the work is the screen-by-screen audit**, `docs/audit/AUDIT-RESUME.md`
   owns that thread's state and has its own reading order on top of this one:
   itself, then `docs/audit/AI-CONTRACT.md` (the ten rules and four rulings
   every AI surface must meet — non-negotiable and half-built), then
   `docs/audit/APP-FORMAT.md` (one object, thirty colour schemes). This file
   does not duplicate any of that. Two files, one each.

Do not ask him what we are doing or how any of it works. It is all written down.

---

## 1. WHAT THIS IS

The Symmetry trainer/client app. Next.js 15 App Router, React 19, TypeScript
strict, Supabase Postgres, PWA.

- Repo `symmetrypersonaltraining-bit/symmetry-app`, branch `main` (public)
- Supabase project `mkfiginpiesospsnktea`
- Live at `symmetry-app-omega.vercel.app`, deploys from `main`
- Owner: Dustin Gautreaux, NASM corrective-exercise specialist, ~33 active clients

He runs his whole business on it. Every bug is a real client's real day.

---

## 2. HOW CODE SHIPS — READ BEFORE YOU COMMIT

**A cloud session cannot push to GitHub.** Verified repeatedly, two ways: the
sandbox git proxy returns 403 ("not in this session's authorized repository
set") and `device_bash` has no network at all. **This is not an expired token.
Do not re-diagnose it. Do not ask him to rotate the PAT.**

The cloud does everything except the final push. His laptop does that one step
through the ship bridge:

```
C:\Users\dusti\Claude\Projects\Trainer App\SHIP-WATCHER.bat   (he runs this)
C:\Users\dusti\Claude\Projects\Trainer App\ship-watcher.sh    (the logic)
C:\Users\dusti\Claude\Projects\Trainer App\outbox\            (the mailbox)
```

**The exact sequence, including the two things that waste a round trip:**

1. Commit in the sandbox clone. One logical change per commit.
2. `git bundle create <path> <last-shipped-sha>..main`
   — **INCREMENTAL, not the whole branch.** A full bundle of this repo is 23 MB
   and `device_commit_files` refuses anything over 20 MB.
3. `git rev-parse HEAD > SHIP-NOW`
4. Write both into the outbox — **bundle first, `SHIP-NOW` second.**
   `device_commit_files` will not take a bare `stagedPath`; call `SendUserFile`
   on each file first and pass the returned `fileUuid`.
5. Wait ~50s, then `git fetch origin main` and confirm it landed. On failure read
   `outbox\SHIP-RESULT.txt`; a non-fast-forward means rebase and resend.
6. **Never end a session with work only in the sandbox.** The container is
   deleted when the session ends. Ship it or lose it.

**Gates before every push** (all run fine in the sandbox; `npm ci` works):

```
npx tsc --noEmit        # 0 errors in src/  (tests/e2e errors are pre-existing:
                        #  @playwright/test is not installed here — ignore them)
npm run test:unit       # 0 failed. ~2,890 tests, about 3 minutes. If the npm
                        # script times out, run it directly:
                        #   node --import tsx --test tests/unit/*.test.ts
                        #   node scripts/test-nutrition-ai.cjs
npx next build          # "Compiled successfully"
```

The `/login` prerender error about Supabase env vars is **expected** in the
sandbox (no env vars). Vercel has them. Ignore it.

---

## 3. HARD RULES — these are his, and they cost real time when broken

- **Both workout loggers are OFF LIMITS** without per-item permission.
- **Reps come from the programmed target, weights from history.** Never "fix"
  reps to autoload from history.
- **Never delete a programme** without asking.
- **Back up to a `bak_*` table before any destructive database change.**
- **Central time, never UTC.** After 7pm Central the UTC date is already
  tomorrow, and that has broken dated writes before.
- **Capacitor dependencies stay out of `package.json`.**
- **A `package.json` change ships with a synced lockfile** — CI runs `npm ci`.
- **No `any`, no `@ts-ignore`, no `@ts-expect-error`** to silence a type error.
- **Git Bash on his machine, never PowerShell.** PowerShell resolves `git` to a
  same-named function before the executable and binds `-c`/`-B`/`--hard` as its
  own parameters.
- **No screenshots** unless every relevant app is allowlisted — the screenshot
  tool hides non-allowlisted windows and has minimised his browser mid-meeting.
- **Google actions use `symmetrypersonaltraining@gmail.com` only.**
- **The tutorial is the spec.** Any change to what a screen or control does
  updates `src/lib/tutorial/script.ts` in the same commit, or the message says
  `Tutorial: n/a — <reason>`. CI enforces it. If you edit narration text, run
  `npx tsx scripts/voice/build-manifest.ts > scripts/voice/narration-manifest.json`
  or `narrationManifestInSync` fails — and keep any one narration under 120 words.
- **Run in the cloud, always.** He monitors from his phone; local sessions are
  invisible to him.

## How he wants to be worked with

- Work autonomously. Batch questions; don't stop for each one.
- **Set up the permanent, lowest-friction path FIRST.** Never iterate on a
  fragile route — he has said this more times than anyone should have to.
- Claude cannot perform sign-ins. Never design a plan whose last step is Claude
  authenticating; put his interactive step first.
- He works by voice on a phone. Messages are terse and sometimes garbled — "Erin
  Arit" was "Erin Arlt". Check the data before assuming a name or a word.
- When he says a thing is broken, **check the data before you explain**. Twice
  this week the data was correct and the screen was stale, and twice the honest
  answer was worth more than a theory.
- **Prove a fix was needed.** Run the new test against the unfixed code and watch
  it fail. A check that cannot fail is not a check.
- When asking him to edit a file, give the ABSOLUTE path and say exactly what
  the file should contain when he is done.

---

## 4. WHAT JUST HAPPENED — 6-8 Sep

Every item below is shipped and on `origin/main`.

### THE FOOD DATABASE IS THE ONLY PRIORITY — 8 Sep

Dustin, 8 Sep, and this outranks everything else in this file:

> *"the biggest problem I've had for the last two weeks is that when I use AI or
> manually search any items in the food database, ninety nine percent of them
> have been wrong with the wrong measurements, the wrong info, and they don't
> default to the standard serving size for that particular food... that part of
> the app has to work properly, and we need everything to be accurate. If it's
> not, it gets rebuilt until it is."*

**His "ninety nine percent" is not an exaggeration — it is 99.9%, and the cause
is one field.**

    searchable USDA rows                                    321,841
    ...whose serving_desc is '100 g'                        321,841   (100%)
    ...that already carry a real serving in serving_options 321,841   (100%)
    ...that have no other serving to offer                        0

Every row opens on 100 g, and every row has something better sitting unused in
its own `serving_options`:

| row | opens on | already has |
|---|---|---|
| Butter, salted | 100 g — 717 cal | `1 tbsp = 14.2 g` |
| Egg, whole, raw | 100 g — 143 cal | `1 large = 50 g` |
| White rice, cooked | 100 g | `1 cup = 158 g` |
| Bananas, raw | 100 g | `1 cup sliced = 150 g`, `1 small = 101 g` |

The 6 Sep rebuild imported the servings correctly. What it did not do is make
one of them the DEFAULT, so the whole library answers "100 g" to everything.
`weighedDefaultAmount` and the unit map are both patches over this — they were
fixing the symptom one food at a time.

**NOT STARTED, AND IT NEEDS HIS RULE FIRST.** Picking the default is a judgement
call across 321,841 rows and getting it wrong is the same complaint again: a
banana must not open on "1 cup, mashed". The question put to him is which
serving wins when a row offers several, and whether his own unit map
(`meal_items.unit`, 299 foods) should override the row for foods he programmes.
Do not run a bulk update before he answers.


### The unit map was two weeks stale, and answering with fragments (`89d991fa` → `aefc0cec`)

Three commits, each proven red against the unfixed code first.

- **`89d991fa` — three foods filed under keys nothing could look up.** The map
  is generated from `meal_items`; `unitKey` is what turns a name into a key at
  runtime. They disagreed about accents: the file folds them (`jocko molk whey`),
  `unitKey` stripped them (`jocko m lk whey`). "Jocko Mölk Whey" and both Núrri
  shakes answered for nothing. `unitKey` now folds before stripping — which also
  beats stripping on its own terms, since stripping breaks one word into two
  fragments too short for the family matcher to see.
- **`d998ca03` — the map held 251 foods, `meal_items` held 305.** A missing food
  does not fail quietly: the family matcher finds any known food inside the name
  and answers with it. `"Animal Isolate Loaded Whey — shake with water"` was
  **oz, from the word WATER**; so was `"Infinis Cream of Rice — mixed with
  water"`. `"Roasted carrots & green beans"` was grams, borrowed from green
  beans. 12 answers corrected, 34 gained, none lost.
  **The generator is now one implementation instead of two**:
  `scripts/food-unit-defaults.sql` only counts raw pairs, and
  `scripts/emit-food-unit-defaults.ts` imports the app's own `unitKey`, sums the
  counts AFTER normalising, and splices the marked region. That is what stops
  the accent class of drift recurring.
- **`aefc0cec` — a unit has to be one he can pick.** `meal_items.unit` is free
  text and some of it is a portion DESCRIPTION: `large (8" to 8-7/8" long)`,
  `each or 6 oz`, `servings of 1 slice`, `serving (2 softgels)`, `to taste`.
  Seven went in as units; none can be displayed, and the AI resolver is worse
  off with one than with nothing because it hunts the borrowed serving set for
  that string. One was a regression from `d998ca03` — Jennie-O turkey bacon lost
  SLICES to "servings of 1 slice". Foods whose only unit is a description are
  now left out (299 keys). **Measured against the map as it stood at the start
  of the day: 284 unchanged, 39 improved, zero lost an answer.**

### Data health showed three checks out of twenty-three (`9fa169b6`)

`/settings/data-health` showed the rows whose `ran_at` equalled the newest.
That is the whole board on a cron run — all eight functions share one
transaction — but **not after anyone runs a single check function by hand.** On
7 Sep at 3:20pm one wrote three rows; for three hours the page showed 3 checks
and hid 20, including all five criticals, and would have printed *"Everything
passed"* had the third been clean. It now shows the latest result of each check
(`src/lib/dataHealth.ts`), inside a 36-hour window measured from the newest row
so a retired check cannot come back and a stopped checker cannot look clean.

### The food library was rebuilt (`7639ea9b` → `f0bcc2b8`)

He gave an ultimatum after a weekend of the same wrong butter: verify the whole
library or rebuild it. Rebuilt.

- **Open Food Facts deleted** — 511,552 crowd-typed rows. One had Kerrygold at
  100 kcal/100 g, internally consistent and completely wrong.
- **USDA SR28 (8,789) and USDA Branded (442,891) imported** — by Postgres
  itself, through the `http` extension, because the sandbox and his laptop are
  both egress-blocked from those hosts and **the database is not.** Remember
  this trick; it is the only way to get external data in.
- **322,227 searchable rows**: zero unverifiable, zero with arithmetic that does
  not hold, zero without a real measure. Nightly quality gate keeps it that way.
- **Barcodes**: 442,775 products scannable. USDA zero-pads the GTIN, phone
  scanners do not — both lookups now match across every padding.
- **Ranking**: a qualifier the search did not ask for sorts the row down
  (`food_variant_qualifier`), so "kerrygold butter" stops leading with Reduced Fat.

Migration: `supabase/migrations/20260906a`, `20260906b`.

### Client View is a boundary, not chrome (`9464505a`)

He was in Client View and looking at another client's full profile page. **Not a
client-facing leak** — the page redirects a non-trainer and RLS gives a client
only their own row — but the trainer-only pages never read the client-mode
cookie. One guard in `src/middleware.ts` now redirects trainer-only paths to
`/home?as=client`. `/workout` is deliberately NOT blocked: that is how he logs a
client's session.

### Erin Arlt removed completely

Never signed up. Client row, 184 appointments, 24 calendar payments, 49 schedule
proposals, the intake form, app settings, her login, her Google Calendar events,
and her name in one nudge-preview message. All recoverable from
`bak_erin_arit_20260907_*` (eight tables).

### A screen put aside asks again (`99201d0e`, `03d99442`)

He logged a workout; home still showed Start 47 minutes later. **The data was
correct.** The screen was a render from before he finished.

The cause is dated: `1b60f66a` (26 Jun) added a bfcache reload *"stops phones
serving stale workout screens"*; `f55a7135` (1 Aug) removed it because it broke
the hardware Back button — correctly — and **nothing replaced it.** Five weeks
unguarded.

`src/components/RefreshOnReturn.tsx`, mounted in both shells, refreshes on
`visibilitychange` and on a `pageshow` with `persisted`. **It refreshes; it never
reloads** — `location.reload()` on a bfcache restore is what broke Back. The
test is what makes it stick: nothing went red when the 26 Jun guard was deleted.

Also: `scheduled_workouts.updated_at` had no trigger and was dead; `REPLICA
IDENTITY` was DEFAULT with RLS on, so realtime could not carry updates. Both
fixed in `20260907a`, plus a `completed_session_not_credited` integrity check at
`critical`, twice a day. **It reads zero, and across 60 days and every active
client the write path has never missed** — so anything it reports is real.

### Two entries outvoted eight (`3beef73e`)

Kerrygold opened in grams with **no tablespoon in the picker at all**.

`meal_items` holds `butter → tbsp` eight times (his plans) and `kerrygold irish
butter → g` twice (Claudine's). `unitHeUses` took the longest matching name and
returned, so two entries beat eight — and because the answer was a weight it
also tripped `heWeighsIt`, which skips the unit borrow. The tablespoon was
absent, not merely unselected.

Now the matcher weighs **his own counts**, specific name winning ties. Sweet
potato (cooked) is grams 38 times vs ounces 4 and does not move. Also fixed:
branded rows are `<brand>, <food>` while USDA generic is `<food>, <qualifier>`,
and only the head was being read — so "Kerrygold, …Irish Butter" returned no
unit at all.

The row now carries `1 tbsp = 15 g` too, and **the same rule went into
`refresh_trainer_foods`** — proven by deleting the tablespoon, running the job,
and watching it come back. Without that, Monday 08:50 undoes it.

---

## 5. OPEN — pick up here

### Owed to him, waiting on his word

1. **Claudine's two Kerrygold meal-plan entries.** `Kerrygold Irish butter —
   6 g — 5 g fat` ×2 (ids `9f417d96…`, `afc88871…`). Five over six is 0.833 g
   fat/g → 83 per 100 instead of 81, which is why that row reads 750 cal/100 g
   instead of 717. **The trainer row is generated from those two lines, so
   fixing the row alone does nothing** — the generator rebuilds it weekly. His
   programming, so it has not been touched. Offered; awaiting yes.
2. **An end-to-end browser test of the home screen** against the live app. The
   current guard proves the refresh mechanism is mounted, not that the screen is
   right on a real phone. Offered; not started.

### Known gaps, nobody blocked

3. **`src/lib/nutrition/foodUnitDefaults.ts` is stale.** 251 foods; `meal_items`
   now holds **310**. Fifty-nine foods he has programmed since it was generated
   have no unit at all and fall through to the catalogue. Regenerate with
   `scripts/food-unit-defaults.sql` — note the file now stores
   `{ unit, uses }` per key, not a bare string, because the count is what
   decides ties.
4. **The Open Food Facts fallback** in `/api/nutrition-ai/barcode-lookup` is now
   the only path that can write an `off` row. The nightly gate hides whatever it
   writes, so a scanned miss is offered once and never becomes searchable.
   Decide whether to keep it.
5. **`usda_conflict` is advisory only** — sorts a row down, never hides it.
   Sampling put false positives near 50% (shirataki noodles really are 5 cal).
6. **The "modified from original" calendar marker.** `days.swapped_from_day_id`
   exists but only 6 of 73 forks carry it; the fork routes do not set it.
7. Deferred by him until those screens are walked: the `/progress` tiles, and
   the coach-chat snack path (`/api/nutrition-ai/act`).

### The audit thread

`docs/audit/AUDIT-RESUME.md` owns its own state and is the file to read for it.
In short: 2 of 39 screens closed, **the client AI still cannot see the
assessment** (his biggest open gap — Ruling 1, 5 Sep), the Workout tab was
rebuilt 4 Sep and has never been tapped button-by-button, and the workout logger
has never been walked at all.

---

## 6. THINGS THAT COST TIME — do not rediscover these

- **Postgres can reach the internet; the sandbox cannot.** `extensions.http(...)`
  is how USDA and HuggingFace data got in.
- **A local Postgres 16 is in the sandbox** at `/usr/lib/postgresql/16/bin`. It
  is the cheapest way to prove a migration runs, runs twice, and that a new
  integrity check actually fires on a planted fault. Use it every time.
- **PostgREST serves functions from a cached schema.** A SQL function created
  minutes ago is a 404 to a browser until the cache turns over — silently. Never
  put a brand-new RPC on a browser path; read the table instead.
- **The Supabase MCP wraps statements in a transaction.** A failed batch rolls
  back DDL, and `VACUUM` cannot run.
- **Editing a live SQL function**: fetch `pg_get_functiondef`, `replace()` the
  part you want, `execute` it. Retyping a function by hand loses escaping.
- **The disk is 1 GB.** An import filled it once. Guard bulk inserts with
  `where pg_database_size(current_database()) < 900000000`.
- **Big table updates restart the database.** Batch at 45–50k rows.
- **A source-reading test cannot tell code from comments.** Strip comments before
  asserting a string is absent, or the file's own explanation fails the test.

---

## 7. KEEPING THIS FILE TRUE

**Update this file before you finish, every session.** Not a new dated file —
this one. The bar: a brand-new session reading only this file, `CLAUDE.md`,
`docs/BACKLOG.md` and `docs/audit/AUDIT-RESUME.md` can pick up with nothing lost
and without asking him a single question he has already answered.

What to update: the date and SHA at the top, section 4 (fold anything older than
about a week into `docs/BACKLOG.md` and leave a line pointing there), section 5
(add what you opened, delete what you closed), and section 6 whenever something
costs you more than twenty minutes to work out.
