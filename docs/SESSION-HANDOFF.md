# START HERE — Symmetry app, session handoff

**This is the living handoff. It is not dated and it is not archived. Every
session reads it first and updates it before finishing.** The `HANDOFF-*.md`
files with dates in the name are history — do not read them for current state,
and do not create another one.

> ✅ **The food recompute is DONE (9 Sep).** All 16 batches ran: rows opening on
> more than one household unit went **83,478 → 8**. Butter opens on 1 tbsp,
> almonds on 1 oz, baby spinach on 1 cup, chicken breast on 1 breast (6 oz). The
> AI assistant fix shipped as `3c694ed` and the recompute plus `20260909b`
> merged behind it.
>
> ✅ **And the NUTRITION work is merged too (9 Sep, later).** The tile format on
> the Nutrition screen, adherence rebuilt on hitting the numbers alone, and the
> food brain's online USDA lookup. Section 4 has the whole list. **Nothing is
> sitting on a branch any more** — a whole day's work was invisible in the app
> because it was pushed to a branch and never merged, and that is what
> section 3's push rule now exists to stop.
>
> 🔴 **FIRST: the access rule is built and SWITCHED OFF, waiting on his word.**
> An archived client losing the app 30 days after their last payment shipped as
> `cf32c88`. The first run would cut off **five** people and he flagged one;
> `app_flags.access_revoke_live` is false until he has read the list. Section 5
> leads with it, including the Robert Miller ruling it needs.
>
> 🔵 **THEN: the Nutrition walk is OPEN and waiting on him.** The three
> opening questions have been put to him and are **unanswered** — he went out for
> the night on 9 Sep before answering. **Re-ask those three, then go straight to
> Batch 1.** Do not re-derive the control inventory; it is done, six batches at
> the end of `docs/audit/SCREEN-WALKTHROUGH.md`. `docs/audit/AUDIT-RESUME.md`
> owns the audit thread and has the exact resume point.
>
> The biggest number left in the food work is keyword coverage: **68,383 rows
> still say "1 serving"** (counted 9 Sep). Section 5, "Known gaps".

Last updated: **10 Sep 2026, evening** · `main` = `9f44da0`.
**The gate is fully green**: 0 errors in `src/`, **3,067 unit tests pass 0 fail**,
`test-nutrition-ai.cjs` **43 passed 0 failed**, build compiles. Shipped since the
9 Sep merges: the access rule and its switch, the two red nutrition-AI tests
closed, the invisible meal ring and its ghost tick, **the app's own error log**
(`3e4be97` — section 5 has the query to read it), **Client View's chrome agreeing
with its page** (`97aa2b4`, his missing tabs), and **the trainer home in one round
trip** (`9f44da0`, the ten-second toggle — and the calendar past 1 December).

> ⏳ **AWAITING HIS CONFIRMATION** on the last two. He asked *"build it n
> confirm fixed"*; both are merged and deploying, and he has not yet said the
> tabs are back or the toggle is quick. If he reports either still wrong, start
> from the section 5 entry, not from scratch.

> **His other Claude session pushes to this repo while you work.** It is not a
> mistake and it is not to be reverted — check `git log origin/main` before you
> assume a change is yours. On 8 Sep it rewrote `docs/audit/AUDIT-RESUME.md`
> into the audit's own living file within minutes of this one being written.

---

## 0. WHICH SURFACE ARE YOU IN — ANSWER THIS BEFORE ANYTHING ELSE

Two kinds of session work on this repo, and **they ship differently**. Work out
which one you are before you commit anything, because following the wrong half
of this file wastes twenty minutes building a bundle nobody needs.

| | **Claude Code** | **Cowork cloud session** |
|---|---|---|
| How you can tell | You have the repo on disk with git credentials; `git push --dry-run` succeeds | `git push` 403s, and you have `device_*` tools for his laptop |
| Shipping | **`git push`. That is the whole procedure.** Ignore section 2 entirely. | The ship bridge, section 2 |
| Database | Needs the Supabase MCP connected, or `SUPABASE_SERVICE_ROLE_KEY` in the environment. **If neither is there, say so rather than guessing at data** | Supabase MCP is already connected |
| His laptop's files | Not reachable | `device_bash`, `device_list_dir` |

**Claude Code is the preferred surface for code work as of 8 Sep 2026.** The
old rule — *"run in the cloud always, local sessions are invisible on his
phone"* — is dead: he uses Claude Code from the Claude mobile app, so those
sessions are visible on his phone too, and they push directly. The ship bridge
exists only for Cowork sessions now.

Cloud sessions are still right for database work (the Supabase MCP is there) and
for anything that needs files on his laptop.

## 0b. THE FIRST FIVE MINUTES

1. Read this file.
2. **Claude Code:** `git push --dry-run` to prove auth, and skip to step 3.
   **Cowork:** check the ship bridge — `device_list_dir` on
   `C:\Users\dusti\Claude\Projects\Trainer App\outbox`, look at
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

## 2. HOW CODE SHIPS FROM A COWORK SESSION — SKIP THIS IN CLAUDE CODE

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
   A bare `stagedPath` under `/mnt/user-data/outputs/` does work; `force: true`
   is needed because the watcher's own writes move the file's mtime.
   **USE A NEW LOCAL FILENAME FOR EVERY ATTEMPT.** Overwriting
   `outputs/ship.bundle` and re-committing it to the same device path sends the
   PREVIOUS content — twice on 8 Sep the bridge answered `bundle tip <old sha>
   does not match requested <new sha>` after a rebase, with the correct bundle
   sitting in the sandbox. `ship-2.bundle`, `ship-3.bundle` and so on cost
   nothing and skip the round trip. Stage the file back and check its header
   (`head -c 200 <file> | strings`) if a tip mismatch ever appears again: the
   second line of a bundle is the ref it carries.
   Also: `git bundle create` fails writing directly into
   `/mnt/user-data/outputs/` ("sha1 file '<stdout>' write error"). Build it in
   `/tmp` and copy it across.
5. Wait ~50s, then `git fetch origin main` and confirm it landed. On failure read
   `outbox\SHIP-RESULT.txt`; a non-fast-forward means rebase and resend.
6. **Never end a session with work only in the sandbox.** The container is
   deleted when the session ends. Ship it or lose it.

**Gates before every push** (all run fine in the sandbox; `npm ci` works):

```
npx tsc --noEmit        # 0 errors in src/  (tests/e2e errors are pre-existing:
                        #  @playwright/test is not installed here — ignore them)
npm run test:unit       # 0 failed. ~2,960 tests, about 3 minutes. If the npm
                        # script times out, run it directly:
                        #   node --import tsx --test tests/unit/*.test.ts
                        #   node scripts/test-nutrition-ai.cjs
npx next build          # "Compiled successfully"
```

The `/login` prerender error about Supabase env vars is **expected** in the
sandbox (no env vars). Vercel has them. Ignore it.

---

## 3. HARD RULES — these are his, and they cost real time when broken

### Session names start with the date — added 9 Sep 2026

He asked for it directly: *"start the session name with 9/10"*. So a session
created for him is titled **`M/D — what it is for`**, e.g.
`9/10 — Nutrition, button-by-button walk (screen 3)`. He works across several
sessions at once and the date is what tells them apart in the list on a phone.

### ⚡ CONFIRMED MEANS SHIPPED — added 9 Sep 2026

> *"i want everything pushed upon confirmation every time not leave it for me
> im using code specifically for that reason if i confirm a fix or update you
> push it period moving forward."*

He confirms a fix → run the gates → commit → push → **open the PR and merge
it**. In Claude Code that is the whole job; stopping at the branch is not
shipping, because Vercel deploys from `main`.

This exists because a full day of nutrition work was gated, committed and
pushed to a branch and nobody merged it. He opened the app, saw the old screen,
and said *"the visual rebuild of the nutrition page never landed"*. It was all
there and none of it was live.

Pause only for a red gate or a merge conflict that genuinely needs his call.

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

## 4. WHAT JUST HAPPENED — 9 Sep (NUTRITION)

> ### ✅ ALL OF 9 SEP IS ON `main` — PR #3 MERGED
>
> **PR #3** merged as `4d379cd`, 17 commits, branch
> `claude/symmetry-audit-resume-ws695t`. Everything below is live on
> `symmetry-app-omega.vercel.app`. **Do not ask him whether to merge it** — that
> question is closed, and asking it again is asking him something he has already
> answered.
>
> `main` and the database now agree: the migrations had already been applied to
> the live project through the Supabase MCP, and their `.sql` files rode in with
> the merge.

### Shipped on the branch — the screen

- **The tile format is live on Nutrition.** `.sym-page`, a cap on every tile, no
  side borders, meal options A/B as real objects, an empty slot in the rest
  shape, the log ring at 44px in the action strip.
  **His two rulings, both enforced by `tests/unit/nutritionWearsTheFormat.test.ts`:**
  *"do not lift meals, leave them in order we eat them in. bright fill on today
  block as in the mock up is correct."* Meals stay M1 → M6. Exactly one
  `is-today` on the screen, on the day tile, and only when the day really is
  today.
- Approved from a mock-up first, per `APP-FORMAT.md` §5. The mock-up is
  `docs/mockups/nutrition-format.html`, generated by
  `scripts/gen-nutrition-mockup.py`, which **inlines the real `globals.css`** —
  reuse that generator for every screen from here on.
- **Three defects ended, not moved:** the A/B option buttons were `<button>`s
  nested inside the row's own `<button>` (a tap on A sometimes opened the meal
  sheet); the `⋯` was `position:absolute` over the `›` on long dates; an extra's
  name was truncated.

### Shipped on the branch — the numbers

- **Adherence is hitting the numbers alone** — calories and all three macros,
  per day against that day's target, averaged over the week so far. Supersedes
  his 31 Jul `consistency × accuracy` ruling. Both figures are printed side by
  side, so multiplying them charged a missed day twice.
- **The client and the coach were shown different adherence for the same week.**
  `weekly-context.ts` always excluded the in-progress day; the hook drawing the
  client's number never did. Both do now.
- **A hand-built plan is checked against the target** on the day tile, trainer
  only, today only, at the AI builder's own 3% / 5 g tolerances.

### Shipped on the branch — the food brain

- **On a catalogue miss the app goes to USDA FoodData Central**, pulls the real
  measured rows, and hands them to the SAME pick prompt every other path uses.
  The model chooses between rows it can see and is never asked for a figure.
  What it picks is written into `food_catalog` with its `fdc_id`, so the next
  client to eat it reads it from the catalogue with no network. **The catalogue
  teaches itself.** `src/lib/nutrition/usdaOnline.ts`.
  Needs `USDA_FDC_API_KEY` in the environment; without it the step is skipped
  and the old estimate fallback runs, so it degrades rather than breaks.
- **The coach chat stops inventing macros.** Its prompt said, in these words,
  *"Estimate realistic macros per item"* — and whatever it said went onto the
  plate **and into that client's My Meals library**. It now carries the parse
  prompt's rule and the route prices every named food through the database.
- **My Meals only accepts a meal when every item resolved to a real row.**
- **`priceNamedFoods` is now the one pricing loop**, shared by
  `/nutrition-ai/parse` and `/nutrition-ai/act`.
- **`add_to_meal` had never once worked.** Built 5 Sep for *"add the jam to that
  meal"*, extracted and validated correctly, then `wireParams()` had no case for
  it and Confirm threw every time.
- **`verified` now means MEASURED.** It was true on all 442,891 manufacturer-label
  rows, including a `Banana` at 336 kcal with zero protein. Backed up to
  `bak_food_verified_20260909`.
- **15 log rows had their lost fat recovered** (266 g). Backed up to
  `bak_offplan_macros_20260909`.

---

## 4b. WHAT JUST HAPPENED — 6-8 Sep

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

**BUILT — and then four faults were found in it and fixed the same night.** He
answered the two open questions on 8 Sep: the row's own named serving wins, a
real piece before a volume ("A AND fix the names now"), and his unit map always
beats the row for the foods he programmes ("A"). `bfe0bd6` shipped the code half
and `food_default_serving()` the Postgres half. **322,232 of 322,232 searchable
rows now carry a default; 10 still open on "100 g".**

### The four faults found in it afterwards — 8 Sep, all shipped

Each was found by reading the diff BEFORE keeping it. That is the method this
work runs on now, and three of the four would have made the database worse.

| | what was wrong | commit |
|---|---|---|
| **b** | USDA writes a half cup as `.5 cup` with no leading zero. Both SQL parsers opened with `[0-9]+`, so 494 foods rendered as **"1 .5 cup"**. TypeScript parsed it correctly all along — two parsers, one format. | `612874a` |
| **c** | His own programmed foods opened on **a cup weighing 240 g, which is water**. Spinach +700%, oats +196%, rice +52%. Plus "Canned tuna in water" matched the keyword `water` over `tuna`. 28 rows corrected. | `5397ceb` |
| **d** | **"Chicken breast" logged 1 oz — 28 g.** The catalogue cannot answer this: median "1 breast" is 863 g because USDA means bone-in. `food_piece_sizes` holds the standard; small/med/large in the picker. 6 rows, all his. | `9acc316` |
| **e** | 26 rules carried the label `each` while their keyword WAS the noun. 3,623 rows renamed, **0 weights moved**. | `dc186b5` |

### The AI button was there and nothing opened — 9 Sep, `3c694ed`

Dustin, on Todd Prine's page with the header **AI** button visible in the
screenshot: *"trainer ai assistant is gone!!"* Both halves true at once.

`HeaderAssist` (the BUTTON) re-read the client-mode cookie every 2 seconds.
`AIAssistant` (the DRAWER) asked once at mount, folded the cookie into the same
latched boolean, and ends in `if (!isTrainer) return null`. So leaving Client
View brought the button back within two seconds over a drawer that stayed shut
until a full reload.

Both now read one watcher — `src/lib/auth/trainerMode.ts`, with its browser
wiring split into `trainerModeBrowser.ts` so the logic is unit-testable without
a DOM. It re-asks on every Supabase auth change, which also fixes the cold start
where `auth.getUser()` resolved before the session restored.

**This stays presentation.** `/api/agent` authorizes itself server-side and
fail-closed against an ACTIVE trainers row and refuses client mode; its tools run
on the service role, so it cannot lean on RLS and does not lean on the UI.
`trainerGate.ts`: *"The UI decides which button to draw. It never decides who is
allowed."* That is what makes a live client-side answer safe.

⚠️ **Note for whoever touches this next:** the trainer half is still latched on
purpose — `if (answer) trainer = true`, never back to false. That is deliberate,
and `viewerIsTrainer` explains why: it FAILS OPEN to the build-time list so a
database blip cannot demote the owner in his own app. Setting it false on error
would make his own AI button flicker away on a transient failure. Do not
"fix" it.

### The fifth fault, and the pass that is now finished — 9 Sep

`20260909a` finally made butter open on 1 tbsp. Its data pass was stopped 11 of
16 batches through; the rest ran on 9 Sep. **24,522 rows changed in those four
batches, 23,604 portions shrank and 0 grew**, and rows opening on a multiple of a
divisible unit went from 83,478 to 8 — those 8 being the known "100 g" residue.

Reading that batch diff before keeping it found the fault. **A can of ginger ale
opened on 1 tsp — 2 g against a real 591 g serving**, and so did 9,128 other
rows, understating by 31× on average and 430× at worst. `20260909a` had put the
opens-on-one return BEFORE the cap check. The cap is what says *this unit does
not belong to this food* — 591 g of ginger ale is 296 teaspoons, and the count
blowing past the cap is exactly how the brain knew "ginger" had matched a
flavour. `20260909b` puts the cap first at both call sites. 8,484 rows corrected;
**539 of 539 sample changes grew, none shrank, and 0 of his own 249 foods moved.**

⚠️ **A confirmation query on this function must round the way the function
rounds.** Checking the raw ratio reports 644 phantom failures — a 33 g bag of
popcorn is 4.125 cups, which rounds to 4, which is exactly the cup cap. The
corrected query is at the bottom of `20260909b`.

**Still the biggest number left in the food work: 68,778 rows say "1 serving"**
and 73,453 carry a vague word. Every one is a missing keyword, not a missing
mechanism — the machinery names a food the moment the map has a word for it.
Closing them is keyword coverage at scale and wants its own measured pass:
propose, read the diff, keep only what does not move a gram it should not.
Details and the guards already built are in the four `SCREEN-WALKTHROUGH.md`
interludes dated 8 Sep.


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

### 🔵 FIRST THING, EVERY TIME: `git fetch origin main`

**PR #3 is merged and that question is closed.** What replaced it is the one
that keeps biting: his other session pushes to this repo while you work, so find
out where `main` actually is before you write a line. On the evening of 9 Sep it
landed `547a544` mid-session, while this one was reading.

### ✅ THE ACCESS RULE IS LIVE — switched ON 9 Sep, all eight ruled

Shipped as `cf32c88`. An archived client loses the app 30 days after their last
paid invoice. **`app_flags.access_revoke_live` was set TRUE on 9 Sep at his
word**, so the job runs daily at 06:30 Central and this is no longer dormant.

He ruled on every archived client individually. Do not re-ask:

| | archived | last paid | outcome |
|---|---|---|---|
| Tina Haley | 13 Aug | 12 Jul | cut off, first run |
| Christine Latham | 31 Aug | 22 Jul | cut off, first run |
| Brooke Reynolds | 31 Jul | never | cut off, first run — no login to ban |
| Robert Miller | 1 Sep | 1 Aug | cut off, first run |
| Jada Cook | 13 Aug | never | auto cut-off **12 Sep** |
| Tania Millan | 13 Aug | never | auto cut-off **12 Sep** |
| Bobbie Page | 31 Aug | 1 Aug | KEPT — override to **1 Oct** |
| Test Client | 13 Aug | never | KEPT — override to 2099-12-31 |

His words: *"Tina, Christine and Brooke can be archived, not robert!"*, then
*"robert is archived i forgot he quit!!"*, then *"Jada n Tania can be archived,
leave test client"*.

**ROBERT MILLER — the round trip worth not repeating.** He was first reported as
wrongly archived (*"Robert still trains but I only do programming but he's still
paying"*), so his `archived_at` was cleared; he then corrected himself and it was
restored from `bak_robert_miller_unarchive_20260909`. His row is back exactly as
it was. The lesson underneath: his case is the one where the rule looks harsh —
access ending the day *before* the archiving, no grace at all — and the tempting
fix was to soften the rule with a floor. **He ruled: no floor.** Check the row
and ask him before changing this rule the next time it looks harsh.

#### ⚠️ `payment_reminders` is a thinner ledger than this rule assumes

Robert pays $300/month flat and has exactly ONE invoice row, for $150, with
reminders off. **16 of the 33 active clients have `payment_reminders_enabled =
false`**, all of them `billing_type = 'none'` with zero paid rows: four family
accounts, five self-coached, one demo, and six real training clients — Celeste
Lennon, Greg Lennon, Jerry Bourgeois, Krysta Ruiz-Schnitzler, Laurie Kane and
Troy Schnitzler.

So "their last paid invoice" is **not** a reliable record of when somebody last
paid. Where no paid row exists the rule falls back to `archived_at + 30`, which
is the safer answer and is doing more of the work here than the headline rule
suggests. It was right for everyone he ruled on. **It is a standing risk for
anyone archived in future** — check the row before trusting the date, and use the
override.

#### Still open on this

- **The trainer-facing override control is NOT built**, deliberately. The column
  works and two overrides are set, but the button belongs on
  `/clients/[clientId]`, which has not been walked, and audit rule 6 is never
  edit a screen that has not been walked. Until then:

      update clients set access_override_until = date '2026-11-01' where id = '<id>';

- **`Test Client` has `is_test_account = false`**, which looks wrong for a row
  named that. It is currently held back by a 2099 override, which is a workaround
  rather than an answer. The tidier fix is flagging it a test account and having
  the job skip test accounts outright. Not built; his call.
- **`billing_type = 'none'` on six real training clients** may be worth a look.
  Noticed, not touched.

### ✅ CLOSED — the two red nutrition-AI tests, and the gate is fully green

`node scripts/test-nutrition-ai.cjs` now reports **43 passed, 0 failed**. Fixed
by the bug-fix session as `49ccb63` (PR #8) on 9 Sep.

**The tests were wrong, not the code — and the number they demanded is the exact
thing his 9 Sep ruling took out.** `a1edf49` changed one line in
`validateActItems` from `validateParseResult` (which carried the model's macros
and derived a missing kcal from 4/4/9) to `validateParsedNames` (which builds
`{name, amount, unit}` and drops the rest, because `/act` now prices every item
through `priceNamedFoods`). It did not touch that script, so both tests kept
asserting the old contract and went red the moment the contract changed.

The 56 kcal one of them asserted for an oreo was a figure **the model made up**,
on its way to the plate and into that client's My Meals library. The rewrite
asserts the current contract with `deepStrictEqual` on the whole item, so it
proves the macros are ABSENT rather than merely unread.

Worth keeping because of the shape: a red test is not automatically a broken
app, and here it was the ruling working. `/act` itself was left alone, still
deferred to the Nutrition screen.

### ✅ SHIPPED 10 Sep — the unchecked ring on a meal was invisible

`381d758` (PR #11). Dustin, with a screenshot of M5 and M6: *"you cant see the
unchecked circles on unlocked foods w the new layout on nutrition logger."*

`circleFor` passed `var(--brand-border)` inline for an unlogged meal, overriding
the `--tile-ctrl-bd` that `.sym-ring` already carried. **`--brand-border` is
mixed against the PAGE and the ring sits inside a TILE** — in dark those are two
near-identical darks, so the circle was a ghost. `globals.css` has warned about
this for months: *"Everything a tile contains derives from the TILE, not from the
raw token."*

**This is the first thing to suspect for any "I can't see X" report on a tiled
screen**, and every screen is being converted to tiles. An unlogged ring now
paints nothing inline and lets the class win — which also made
`.sym-tile.is-today .sym-ring` reachable, having been dead code overridden on
every meal.

`.sym-ring--todo` additionally gives it a real border and a faint inset, because
every other state of that control is a filled circle and the one state a client
must ACT on was the only one with no fill.

**Then he asked for an icon in it** (*"we need some type of icon in there,
ideas?"* → *"Just run 1 ghost check plz"*) — shipped `6fb55d5` (PR #14). An
unlogged ring now carries a dimmed tick, `currentColor` from `.sym-ring--todo`.
Not a ＋: that already means "build this meal" on the open-slot ring and "insert
a meal" on the line between tiles. `CheckSvg` takes a colour now, default `#fff`.
Full write-up: the interlude "the ring you could not see" at the end of
`docs/audit/SCREEN-WALKTHROUGH.md`.

### ✅ SHIPPED 10 Sep — the app records its own errors (`3e4be97`, PR #15)

Dustin: *"anytime something goes wrong or errors or there's a bug, you can look
back at the actual log of when it happened and what happened … and we don't keep
running into the same problems."* He chose **everything, grouped**, and **fix
the trainer hole**. Both shipped; the workout logger was not touched to do it.

**READ THIS FIRST WHEN HE REPORTS A BUG.** The table is `app_error_log`, one row
per DISTINCT fault, and it is the thing to check before theorising — the same
rule as "check the data before you explain". You need the Supabase MCP; Claude
Code has no service key in its environment.

    -- what is broken now, worst-most-recent first
    select scope, source, occurrences, last_seen_at, path, message, client_id
    from app_error_log where resolved_at is null
    order by last_seen_at desc limit 20;

    -- the last ten actual hits of one row: time, client, path, detail
    select jsonb_pretty(recent) from app_error_log where id = '<id>';

    -- when it is fixed. A LATER OCCURRENCE CLEARS THIS AGAIN on its own, so a
    -- bug that comes back cannot hide behind a tick.
    update app_error_log set resolved_at = now() where id = '<id>';

What lands there: every uncaught throw and unhandled rejection (`ErrorReporter`
in the root layout), every crashed screen (`(app)/error.tsx`, `global-error.tsx`),
the three original workout writes (`logClientError`, now routed through
`/api/log-error`), and anything a server route reports via `logServerError`
(`lib/errorLog.ts`). **No server route calls `logServerError` yet** — it exists
for the next failure that needs it; add it in the catch block, fire-and-forget.

`detail.code` is the postgrest code — an RLS refusal, a constraint, a dropped
request are all different codes, and that distinction is the one 26 Aug could
not recover. `scope` says which net caught it: `render`, `unhandled`,
`rejection`, `server`, or one of the workout three.

**Zero rows is the good answer, not a broken one** — it was checked. Do not
"fix" an empty table. A client's crash tile says *"reported automatically"*, so
if he sends a screenshot of that tile, the row is already there.

The fingerprint (`lib/errorFingerprint.ts`) decides what "the same fault" means.
If two rows look like one bug, or one row is clearly two, the normaliser is what
to change — and `tests/unit/oneBugIsOneRow.test.ts` pins both directions.

### ✅ SHIPPED 10 Sep — his tabs were gone, and the toggle took ten seconds (`97aa2b4`, `9f44da0`)

Dustin, with a screenshot of his own Client View: *"my own client view nav
tabs r gone! fix n check other clients"* — then *"the trainer view takes about
10 seconds to switch screen over its laggy fix that too"*.

**The tabs (PR #18).** The page was the client home; the chrome was the
trainer's. Every server page and the middleware decide Client View from `?as=`
and the `symmetry_client_mode` cookie; `TrainerLayoutWrapper` decided from
**localStorage** and read neither. Android evicts localStorage under storage
pressure, cookies are not subject to quota, so once localStorage was gone the
two disagreed for 30 days. Now `lib/clientModeResolve.ts` is the pages' rule,
pure; the server layout hands the wrapper its starting mode from the cookie;
localStorage is written as a mirror and never read. **Other clients:**
client-only accounts could never hit it (their branch mounts `<BottomNav />`
unconditionally); the seven trainer-who-is-also-a-client accounts could, and
now cannot. Nothing had crashed — `app_error_log` was empty, and that query
was the first move.

**The toggle (PR #19).** Measured: the trainer branch of `/home` made five
serial reads, one paging **5,697** rows at 1,000 a time — ~10 hops per render —
and the toggle called `router.refresh()` **and** `router.replace()`, two full
renders, ~20 hops per tap. Now one `Promise.all` (the client branch already
did this) and no `refresh()`: ~6 hops per tap. **Found on the way, and
correctness:** the appointments read was not paged; **2,491** rows in its
window, the 1,000th dated 1 December, **1,491 future appointments never
reached the calendar**. Today's Sessions was right only because today was
rank 557. Paged now, its own commit.

**If the toggle is still slow after this,** the next lever is the calendar read
itself: 5,697 scheduled workouts with two joins is a large payload for a HOME
screen. Bounding it to the visible month means the calendar loads months on
demand — a design change to `TrainerCalendarPanel`, not a query change. Not
done; his call.

**Follow-up worth a line:** `readsCannotTruncate.test.ts` cannot see a bounded
window with no `.limit()` — exactly the shape that just bit. A scanner cannot
know a row count; the pager's runtime ceiling is the only real guard, so every
windowed calendar-style read should go through `fetchAllRowsSafe`. There may
be more.

### ✅ DONE 10 Sep — the pulldown/row library consolidated; blank boxes on day one explained

Dustin, 10 Sep, logging Todd Prine's session, twice: *"Todd's weight is not
pulling up in history"* — T Bar Chest Supported Row, then Wide Grip Lat
Pulldown, both with the programmed weight sitting in the chip and the box blank.

**Checked before explaining, and it is two different things.**

- **T-Bar: genuinely no history.** Todd has never logged it, and no row-type
  movement he has logged is it. The blank box is the rule — *weights from
  history* — with no history. Not a bug.
- **Lat pulldown: the same movement under a different library row.** Todd has
  **18 weighted sets of Machine Lat Pulldown at 150 lb** and 4 of Free Motion
  at 120. Today's programme — **built today, 10 Sep** — prescribes *Wide Grip*
  Lat Pulldown at a 150 lb target, *Reverse Grip* at 120, T-Bar at 90. Whatever
  built it read his history correctly and then picked **different rows** for
  the same movements. History is keyed by row, so every one reads "No history
  yet". The library has **thirteen** pulldown rows for this to happen across.

⚠️ **A wrong column nearly sent this the other way.** `set_logs` has both
`weight` (dead) and `weight_lbs` (real). Counting on `weight` said Todd had
zero weighted sets ever; on `weight_lbs` he has 497. Section 6.

**HIS RULING, 10 Sep (voice, verbatim):** *"most recent weight at that number
of reps should autofill. all history should be there at all reps. all history
and reps full history should be in history button."*

**All three already hold in the logger — for the row the history is on.** The
box takes the newest weight at the target rep count (`histByPe`), falls back to
the last session (`prevByPe`), and the history sheet shows every session at
every rep count with no cap. Read and confirmed. **The whole gap is row
identity**, and nothing in the library links the rows: the thirteen pulldown
rows carry no `aliases` (2 of 858 rows library-wide do), no `forked_from_id`
(0 of 858), and the builder resolves a movement by exact name then alias — it
never asks which rows the client already has history on. So it named "Wide
Grip Lat Pulldown", got that row, and began a new lineage for a movement Todd
has done 18 times.

**Do NOT build "history by base name."** Todd's Wide Grip target is 150 and his
Reverse Grip target is 120 — he loads grips differently, so merging every
"lat pulldown" row would put the wrong most-recent weight in the box, which is
worse than a blank one.

**HIS RULING ON THE LIBRARY:** *"we dont have a machine lat pull down or
machine row so they both are cable n need to be consolidated n machines
removed from library permanently as an option."* Then, asked the three
ambiguities: survivor = **Wide Grip Lat Pulldown**; Hammer Strength pulldown
folds into Reverse Grip; **Smith Machine Row stays** (he has one).

**DONE, data only, no code.** Backups `bak_exercises_exmerge_20260910`,
`bak_set_logs_exmerge_20260910` (119 rows), `bak_prescribed_exercises_exmerge_20260910`
(64), `bak_exercise_notes_exmerge_20260910` (2).
- **Wide Grip Lat Pulldown** `ccdfa82a` absorbed Machine Lat Pulldown, Lat
  Pulldown, Cable Seated Lat Pull Down, Cable Lat Pulldown → 139 set logs, 84
  prescriptions, 2 notes. **The old names are its `aliases`** so the builder's
  exact-name-then-alias lookup resolves any of them here.
- **Reverse Grip Lat Pulldown** `a348d3a8` absorbed the Hammer Strength one.
- **Machine Row Underhand Grip** `9715e272` renamed in place to **Cable Seated
  Underhand Grip Row** (no cable underhand row existed; 24 sets, logged that
  day, all intact), old name as alias.
- **Cable Wide Grip Seated Row** absorbed its empty duplicate *Cable Seated
  Wide Grip Row*.
- Seven rows renamed `(retired) …` and `availability_status='excluded'` — the
  picker and the AI pool filter that; the rename is because
  `lib/exerciseLookup.ts` does NOT skip excluded rows and would still match
  the exact name. **Never deleted.**
- Verified: every retired row has 0 set logs / 0 prescriptions; the five
  clients split across two pulldown lineages (Claudine, Hassan, Jennifer, Tim,
  Todd) are now each under one row, **0 still split**; the only selectable
  "Machine" pull/row rows are Machine Assisted Pull Up and Smith Machine Row.
  Todd: 22 sets on the survivor, newest at 10 reps = his 130 from that night.

**STILL OPEN — the root cause, for the AI-programme thread:** the builder
resolves a movement by exact name then alias and never asks which rows the
client already has history on. Aliases now catch the four names above; they do
not catch the next sibling it invents. Rule to add: *when the client has
weighted history on a row, prescribe that row, not a sibling name.*

The "prefill the programmed weight when history is empty" idea is
**superseded** by his ruling — he wants history, not the chip.

### THE NEXT SESSION'S JOB — the Nutrition button-by-button walk

He asked for this specifically: *"then lets do the walk through button by button
and make sure everything is working the way it should... take your time here
this one has to be perfect."*

**STATE, 9 Sep evening: opened, nothing recorded yet.** The three opening
questions were put to him and he went out for the night before answering —
*"we will pick up here tomorrow im out for the night"*. So tomorrow: re-ask the
three, then Batch 1's six controls. Nothing has been walked, nothing decided,
no row filled in. `docs/audit/AUDIT-RESUME.md` carries the same resume point.

**The control inventory is already done** — it is in
`docs/audit/SCREEN-WALKTHROUGH.md` under "SCREEN 3 — NUTRITION · THE CONTROL
INVENTORY". Do not re-derive it. Walk it in the order written there, one batch
of controls at a time, and record what he says against each row.

Audit method, unchanged (`AUDIT-RESUME.md` has the long version): inventory from
the CODE, then his three questions, then he taps every control and says what
happened. One batch at a time — never a wall of questions.

### Still open from his six rulings

| | Ruling | State |
|---|---|---|
| 1 | Route photo **and** chat macros through the database, with an online lookup when it is missing | **Chat: done. Photo: NOT DONE** — spec below |
| 2 | Stop saving foods that are not accurate | done |
| 3 | Make `verified` mean something | done (data half). The **origin label** — Cronometer's stronger answer, showing "USDA" / "your library" / "from a label" instead of a tick — is not built and is a design pass |
| 4 | Check a hand-built plan against the target | done |
| 5 | "Macros tonight" | **HE ASKED WHAT IT MEANT AND HAS NOT RULED.** Do not change it until he does — see below |
| 6 | Recompute the 95 bad log rows | **15 of 95 done.** The other 80 need the resolver — spec below |

#### A. The photo route still lets the model state macros

`/api/analyze-meal-photo` asks for `calories`, `protein_g`, `carbs_g`, `fat_g`
and uses them directly. It is the last path that does.

**The design, already worked out — do not redesign it:**

1. Change the prompt so it returns `{"items":[{"name","amount","unit"}],
   "description", "restaurant"}` and **no figures**. Keep every word about
   identifying restaurants, counting discrete items, and not over-estimating
   wings — identification is what the model is good at here.
2. Price the items with `priceNamedFoods` from `resolveFoodOp.ts`, exactly as
   `/nutrition-ai/act` now does. Totals are the sum of the priced items.
3. Unresolved items are **named back**, never zeroed and never dropped.
4. **Keep the last-resort estimate** when nothing at all resolves, marked
   `source: "visual_estimate"` and `estimated: true`, so a client
   photographing dinner is never left with nothing — friction is what decides
   whether a meal gets logged at all, and the estimate is already labelled EST
   on screen.
5. Watch the nutrient columns: `est_fiber`, `est_sugar`, `est_sodium`,
   `est_sat_fat` and `est_micros` are written alongside the macros and must
   move with them. A null must stay null — zeroing an unknown sodium makes a
   day of restaurant food read as a low-sodium day.
6. `off_plan_macros` and the `est_*` columns are written together and the code
   says they "can never disagree". Keep that true.

#### B. The other 80 bad log rows

`bak_offplan_macros_20260909` holds the 15 that were repaired. The remaining 80
are **not** repairable by arithmetic: `banana — 105 kcal, 1P, 27C, 14F` has no
non-negative solution for any single macro. The fat is simply wrong.

The honest repair is to **re-resolve `off_plan_details` through the food brain**
— which now reaches USDA online — and write the result. That is a script, not a
migration: read every before/after pair first, back up to a `bak_*` table, and
show him a sample before writing. Query for them:

```sql
select id, log_date, off_plan_details, est_kcal, est_protein, est_carbs, est_fats
from meal_adherence_logs
where est_kcal is not null
  and (coalesce(est_protein,0)+coalesce(est_carbs,0)+coalesce(est_fats,0)) > 0
  and abs(est_kcal - (coalesce(est_protein,0)*4+coalesce(est_carbs,0)*4+coalesce(est_fats,0)*9)) > 25;
```

#### C. "Macros tonight" — his question, not yet his answer

He asked: *"5: what does that mean?"* **Nothing has been changed.**

What it means: the off-plan sheet offers *"save it as pending — macros get
filled in tonight"*, and the summary card prints *"totals update tonight"*.
There is no job. Four crons run (weekly-ai, weekly-ai refresh, birthdays,
goals) and none touches `macros_pending`. A row saved that way would sit at
zero calories for ever and quietly under-count the day.

**Zero rows are pending right now**, so nothing is broken today — it is a
promise on a button nothing keeps. Two ways out: build a nightly pass that
resolves pending rows through the food brain, or take the option off the sheet.
Put it to him and do what he says.

#### D. Three trainer rows still contradict themselves

Search "banana" and his own rows come first, correctly — and two of the three
are wrong about their own serving:

| Name | Serving says | Weight on file | kcal |
|---|---|---|---|
| Bananas | 1 large (8″–8-7/8″) | **100 g** | 128 |
| Banana (small) | **"1 medium"** | — | 112 |
| Banana (medium) | 1 each | — | 112 |

Small and medium are the same 112 kcal. `food_portion_reference` fixed the
*function* that picks a serving; these rows carry their own hard-coded numbers.
**His data, so ask before touching it.**

---

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

3. **Keyword coverage is the biggest number left in the food work.** Counted
   after the 9 Sep recompute: **68,383 rows say "1 serving"** and 68,490 carry a
   vague label. (The 8 Sep figures of 68,778 and 73,453 predate the recompute —
   `20260909b` moved ~8,484 rows INTO "1 serving" on purpose, trading an unnamed
   unit at the right weight for a named one at the wrong weight.) Every one is a missing
   keyword, not a missing mechanism — the machinery names a food the moment the
   map has a word for it. `20260909b` made a *missed* keyword fail safely (back
   to the package's own serving weight rather than to a teaspoon), but it adds no
   keywords: "Lemon Lime Soda" still reads `6 lemon`, and a granola bar with
   "peanut butter" in its name still borrows a tablespoon. Wants its own measured
   pass — propose, read the diff, keep only what does not move a gram it should
   not. Reasoning and the guards already built are in the four 8 Sep
   `SCREEN-WALKTHROUGH.md` interludes and the 9 Sep one.
4. **`src/lib/nutrition/foodUnitDefaults.ts` is stale.** 251 foods; `meal_items`
   now holds **310**. Fifty-nine foods he has programmed since it was generated
   have no unit at all and fall through to the catalogue. Regenerate with
   `scripts/food-unit-defaults.sql` — note the file now stores
   `{ unit, uses }` per key, not a bare string, because the count is what
   decides ties.
5. **The Open Food Facts fallback** in `/api/nutrition-ai/barcode-lookup` is now
   the only path that can write an `off` row. The nightly gate hides whatever it
   writes, so a scanned miss is offered once and never becomes searchable.
   Decide whether to keep it.
6. **`usda_conflict` is advisory only** — sorts a row down, never hides it.
   Sampling put false positives near 50% (shirataki noodles really are 5 cal).
7. **The "modified from original" calendar marker.** `days.swapped_from_day_id`
   exists but only 6 of 73 forks carry it; the fork routes do not set it.
8. Deferred by him until those screens are walked: the `/progress` tiles, and
   the coach-chat snack path (`/api/nutrition-ai/act`).

### The audit thread

`docs/audit/AUDIT-RESUME.md` owns its own state and is the file to read for it.
In short: 2 of 39 screens closed, the Workout tab was rebuilt 4 Sep and has
never been tapped button-by-button, and the workout logger has never been walked
at all. (The line that used to stand here — "the client AI still cannot see the
assessment" — was already wrong when it was written: that is item A and it
shipped as `234619c8`.)

---

## 6. THINGS THAT COST TIME — do not rediscover these

- **Postgres can reach the internet; the sandbox cannot.** `extensions.http(...)`
  is how USDA and HuggingFace data got in.
- **A test that goes red after a ruling is not automatically a defect.** Check
  whether the assertion predates the ruling BEFORE touching a line of source.
  `git log -S '<the changed call>' -- <file>` on the line the test exercises
  found the two red `/act` tests in minutes — the contract had moved and the
  script had not. Fixing the code there would have undone the ruling.
- **A shallow clone hides the history that answers this.** `git log` on a
  `--depth 1` clone shows only the merge commit, so the real change looks like
  it never happened. `git fetch --depth=200 origin main` first; prefer a bounded
  deepen over `--unshallow`.
- **The MERGE API call is refused INTERMITTENTLY by the sandbox, not always.**
  On 10 Sep it was blocked three times running — `python urllib`, then `curl`,
  then even `git ls-remote` — and PR #8 had to be merged by hand. Twenty minutes
  later the identical call merged PR #10 with no complaint. So: try it, and if
  it is refused, **try once more and then stop**. Do not go hunting for a third
  route; hand him the PR link and say it is ready. Pushing a branch and opening
  a PR have never been blocked. **When he merges on his phone he must be SIGNED
  IN or GitHub draws no merge button** — that cost the first round trip.
- **Do not merge on "some check passed" — wait for the NAMED checks.** GitHub's
  check-runs list fills in over a minute or so, and the Vercel one lands first.
  A poll that stops when "every check present is complete" declared PR #15
  ready with 1 of 3 reported; `mergeable_state: unstable` was the tell. Require
  `syntax-check` and `tutorial-current` to be present AND completed. `clean` is
  the state to merge on.
- **Renaming a table leaves its constraints named after the old table.**
  `app_error_log` still had `client_error_log_pkey` and `_client_id_fkey` until
  they were renamed by hand — which is what a violation message would have
  printed. `rename constraint` has no IF EXISTS; guard it in a DO block.
- **One mode, one store.** Client View is decided by `?as=` then the
  `symmetry_client_mode` cookie — `lib/clientModeResolve.ts` is the rule and
  every page, the middleware and the wrapper now use it. localStorage
  (`symmetry_view_mode`) is a write-only mirror for three feedback labels. Do
  not add a third store, and do not read the mirror to decide anything: two
  stores for one mode is how his tabs vanished.
- **A bounded read with no `.limit()` can still exceed 1,000 rows, and nothing
  flags it.** The static audit bans `.limit(n)` above the cap; a windowed
  `.gte/.lte` read has no `.limit()` to see. Count the window against the live
  table before trusting a calendar-style read, and page it. The appointments
  read was 2,491 rows and silently ended the trainer calendar on 1 December.
- **`set_logs.weight` is dead; `weight_lbs` is the column.** Both exist. The
  logger reads and writes `weight_lbs`; `weight` is a legacy column that is
  NULL on rows that plainly have a weight. A count on `weight` said Todd Prine
  had never logged a weight; on `weight_lbs` he had 497. Check the column list
  before counting anything on this table. **`v_exercise_history` reads the dead
  column** and nothing in `src/` reads the view — do not reach for it.
- **The library has no "same movement" relation.** `exercises.aliases` is
  other NAMES that resolve to a row (used by the builder and the picker), not a
  history family; `forked_from_id` is unused; `prescribed_exercises.alternate_of`
  is unused. History is keyed by `exercise_id`, full stop. A movement prescribed
  under a sibling row starts from zero, and thirteen pulldown rows make that
  easy. The fix is the builder reusing the client's rows, not the logger
  guessing which rows are alike.
- **A toggle that "flips then waits" is two renders.** `router.replace()` plus
  `router.refresh()` renders the page being left and then the destination. With
  `?as=` markers on both directions and Next 15's dynamic staleTime of 0, the
  refresh is pure cost — and on a ten-hop page it is the whole lag.
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
- **The ship bridge is OUTBOUND ONLY, and no cloud session can read his laptop.**
  The bridge carries a bundle from the sandbox to his machine so his machine can
  push. It is not a file share. If work exists only as a file on his laptop — a
  patch in Downloads, anything under `claude/` — a cloud session cannot get at it,
  and **turning the ship watcher on does not change that.** Claude Code has no
  `device_*` tools at all, and can already push directly without the bridge. The
  only ways in are: he pastes the content, or he runs the command himself. This
  cost a round trip on 9 Sep over the AI assistant patch.
- **A check on a rounded value must round the same way.** The confirmation
  query for `food_default_serving` compared the raw ratio while the function
  tests `food_serving_pretty_count` of it, and reported 644 failures that were
  all correct rows — a 33 g bag of popcorn is 4.125 cups, rounds to 4, and 4 is
  exactly the cup cap. Twenty minutes chasing rows that were already right.
- **The local Postgres 16 will hold the whole food function chain.** Dump the
  dependency functions with `pg_get_functiondef`, the two small rule tables as
  inserts, and the shipped `food_default_serving` straight out of its migration
  file with `awk '/^create or replace function food_default_serving/,/^\$\$;/'`.
  That is what made the ginger-ale fault reproducible and provable red before a
  line was changed. It needs `su postgres` and a data directory the postgres
  user can traverse — `/var/lib/postgresql/...`, not the scratchpad.
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
