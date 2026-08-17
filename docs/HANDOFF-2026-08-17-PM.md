# Symmetry Trainer App — session handoff, 17 Aug 2026 (afternoon)

**Supersedes `docs/HANDOFF-COMPLETE-8-17.md` for the task list only.** That
document is still the right thing to read for *how work gets done here* —
Parts 1, 2 and 5 in particular. Read it first, then this.

---

# PART 0 — FIRST FIVE MINUTES

1. **Check the ship bridge.** `device_list_dir` on
   `C:\Users\dusti\Claude\Projects\Trainer App\outbox`; `watcher-alive.txt`
   should be under ~2 minutes old. Stale → *"Double-click SHIP-WATCHER.bat in
   the Trainer App folder and leave the window open. Tell me when it's
   running."* Then WAIT. Never investigate auth.
2. `git clone https://github.com/symmetrypersonaltraining-bit/symmetry-app`,
   `npm ci`.
3. Read `docs/BACKLOG.md`.
4. **Do not re-verify anything in Part 2.** It was measured today.

**State at end of session, 17 Aug ~16:00 CT:**

| | |
|---|---|
| `origin/main` | `3f831cc` |
| Tree | clean, nothing unshipped |
| Supabase plan | **Pro**, compute **Small** (`max_connections` 90, 512 MB shared buffers) |
| Managed backups | **on**, 7-day retention |
| Storage ceiling | **8 GB** (was 500 MB); database 364 MB |
| Unit tests | 1551 tests, 0 failing |
| `npx tsc --noEmit` | 0 errors in `src/` |
| `npx next build` | Compiled successfully |

---

# PART 1 — WHAT DUSTIN DECIDED TODAY

Do not re-ask any of these.

1. **Database** → Pro + Small, $30/month. Done, live, verified.
2. **The replace button** → he believed he used "Swap for one I pick". The data
   says otherwise (see Part 2). He chose: **"Add a workout" onto an occupied day
   should ASK — replace, or add as well.** Explicitly not always-replace.
3. **The swap list** → shared library **plus his own saved workouts**. Not other
   clients' forks.
4. **Today's leftover walk** → yes, mark it skipped. Done.
5. **`generate_scheduled_workouts`** → in his words: *"it should never refuse if
   me or my client does it. it goes wherever we put it. the app should only auto
   generate or move assigned workouts to days they are on the schedule so it's
   right in the app but if we override it leave it alone."* Two rules, both
   implemented.

---

# PART 2 — WHAT SHIPPED, AND WHAT WAS MEASURED

Four commits, all verified by fetching `origin/main` and comparing the SHA —
never by trusting `SHIP-RESULT.txt`.

### `128e7da` — replacing a workout removes the one it replaces

**The diagnosis in the previous handoff was wrong about which button, and that
mattered.** He had not used the swap picker and *could not have*: it loaded only
`client_owner_id is null` days, and "Fat Loss Cardio Phase 3: Stair Master" is
one of his own saved workouts. The row's `position` was 2 — "one past the
busiest slot on the day", which is `AddWorkoutButton`'s arithmetic. `doSwap`
writes into the original's slot and the AI route sets no position at all.

So he used **"Add a workout"** — the only picker with a search box, which is
exactly why he found the Stair Master there — and that button only adds.

Two filters were doing one filter's job. `swappable` gates the SHARED library
(11 of 641 sessions). It has no business gating a client's own saved workouts;
requiring it hid 8 of Dustin's 9.

Shipped: swap picker gains search and his own workouts; "Add a workout" asks
replace-or-add on an occupied day; a replacement takes the slot it displaces.

**And the part that matters most:** the replace path fired an update and ignored
the outcome. PostgREST returns its error rather than throwing, and **an update
matching zero rows is not an error**, so "replaced" was reported on a request
having been *sent*. Both callers now chain `.select("id")` and run the returned
ids through `skipVerdict()` in `src/lib/replaceOnDate.ts`. Identity, not a count.

### `4b5a351` — two existing guards were passing on broken code

Found by the mutation harness, both worth internalising:

- **A comment satisfied a structural assertion.** Deleting the real
  `.select("id")` from `AddWorkoutButton` left the suite green, because
  `addLibrary` contains an unrelated `.select("id").single()` on its backdating
  branch. "Somewhere in this function" is not an assertion about the statement
  that matters. Assertions are now anchored between `status: "skipped"` and
  `skipVerdict(`.
- **A fixed-size slice decided what the test could see.** Both `doSwap` guards
  read `BANNER.slice(i, i + 1600)`; adding comments pushed a marker past 1600,
  `indexOf` returned -1, and the order assertion failed on correct code. The
  same brittleness runs the other way, which is the dangerous direction — -1
  sails through `<` comparisons. `fnBody()` bounds at the next declaration and
  `at()` proves each marker exists before comparing positions.

### `5c7ac2f` — the third copy of the occupancy bug

`generate_scheduled_workouts` asked whether ANY live row sat on the date, with
no `supervised` filter. **Seven pattern-days over five weeks were refused for no
reason**, not three: Sharon Rambo 22 Aug and Greg Lennon 7/14/21 Sep supervised,
plus three of Greg's Saturday Daily Reset Walks blocked by his supervised
Saturday session. (The morning's count of three was correct then; Greg's 21 Sep
entered the rolling window overnight.)

**Rule 1 opened a hole the over-broad guard was covering by accident.** Once
homework stops counting as occupancy, a day a human has *moved a session off*
looks empty and generation puts it straight back. Real case: **Sara Prince**
pulled her Wed 19 Aug ankle mobility forward to the 17th and completed it,
leaving `moved_from_date = 2026-08-19`, `moved_by = null` (human). Without the
guard she is handed back the session she already did — her own 11 Aug complaint
in reverse. New action `skipped_moved_away`; the log's CHECK constraint was
widened in the same migration, **before** the body.

Verified: deployed function body MD5-matches the migration file (comments
stripped, whitespace collapsed, both sides); the `bak_` table was confirmed to
hold the OLD definition by asserting it still contains `date_already_covered`,
not merely that a row exists.

### `52fc120` — foods by unit

**The open question is answered and the answer is better than expected: the data
was already there and nothing read it.** `food_catalog` carries `serving_grams`
and a `serving_options` jsonb array; 574,515 of 574,617 rows have both. His own
food:

```
HARD BOILED EGGS · serving_desc "100 g" · serving_grams 100
serving_options [{desc "100 g", grams 100}, {desc "1 oz", grams 28.35},
                 {desc "1 EGG (44 g)", grams 44}]
```

`FoodSearchSheet` already fetched these rows with `select("*")`; `mapRow` dropped
the column. `serving_options` is written by the barcode importer and
`lib/nutrition/off.ts` and **read nowhere in the app**. The dropdown showed
grams because `unitsForServing()` derives its list *dimensionally* from the base
serving string.

**The trap, if anyone extends this:** the descriptions are not all singular.
`"2 Tbsp (30 g)"` appears 3,497 times and means the *pair* weighs 30 g. Taking
30 as the unit weight doubles every tablespoon logged, forever, and the screen
looks normal. Everything is normalised to grams-per-ONE-unit in
`src/lib/servingOptions.ts`.

---

# PART 2b — LATE SESSION: FACT-CHECKING THE GROUP MESSAGE

Dustin asked one question — *"is everything in the group msg live in app now?"* —
and it was the highest-value question of the day. Every claim was checked against
the live app and database rather than the changelog. Most held. **One was false
and it exposed a bug nobody had finished fixing.**

### `b1a95d4` — the recipe library could never be published

The message told 30 clients they had "20 cook-from-scratch recipes". They had
none. All 20 library rows were `private`; the Shared library tab asks for
`public`. What clients saw was a different, older set of 14 under Dustin's own
client record.

`enforce_recipe_publish` — the BEFORE INSERT OR UPDATE trigger that stops a
client self-publishing — **rewrites the row rather than refusing it**, and
decides with `is_trainer()`, which resolves through `auth.uid()`. The service
role that builds the library has no `auth.uid()`, so every library recipe was
demoted on the way in.

**This is the most invisible failure found this week, and every angle was tried
in turn:**

- the insert succeeds, and the sync route's `{"ok":true,"recipes":20}` was TRUE
- a plain UPDATE reports success and changes nothing
- **RETURNING hands back all 20 ids**, so a row count does not catch it either
- `updated_at` moves, because the same trigger sets it

Three "successful" migrations changed nothing before the cause was found, and it
was only found by writing before/updated/after counts into a table and reading
them back. **Checking the error is not enough. Checking the row count is not
enough. Read the value back.**

Fix: library rows (`client_id is null`) are exempt from the guard. A client
cannot create one — the INSERT policy is
`((client_id = my_client_id()) OR is_trainer())` and `NULL = my_client_id()` is
never true. Verified live afterwards that the guard still bites: publishing a
client-owned private recipe as a non-trainer touched 1 row and left it private.

**A prior decision was narrowed with reasoning.** An earlier session diagnosed
this exact bug, added the `recipes_library_read` RLS policy, stopped, and left a
test forbidding any change to the trigger. RLS cannot make a `private` row
satisfy a filter the APP applies. Half a fix reads exactly like a whole one
until somebody opens the screen.

### `8aea0c2` — My Meals splits into Mine and Library

His 3 saved meals sat in a 53-row list with the 50 shared ones and nothing
marking them apart. **The flag was already computed and thrown away**:
`loadMyMeals` set `library: m.client_id == null` with a comment explaining why,
and the `useState` type had no such field.

**Not in the request, and worse:** delete was offered on every row. For a client
RLS refuses it; **for Dustin it succeeds** — removing a meal from all 30 clients
from inside his own list, with an undo that would re-save it as his personal
copy. Two locks now: the button is not rendered, and `deleteMyMeal` refuses
before it touches anything.

### `3f831cc` — the message itself

`docs/GROUP-MESSAGE-READY-2026-08-17.md`. Version A, his choice, with the iPhone
line kept (he confirmed a mix of platforms). Changes from the 16 Aug draft:
recipe count 20 → **34**; "you'll see the full panel" → "tap Show nutrients"
(it is collapsed behind a button); the "faster" line now says what actually made
it faster; two lines added for today's work.

**STILL NOT SENT. He sends it.**

### New mutation harnesses

```
bash tests/mutate-recipe-publish.sh   # 9 mutations, all caught
bash tests/mutate-mymeals.sh          # 10 mutations, all caught
```

One `mutate-mymeals` case initially failed to APPLY rather than failing the
suite — bash expands `${...}` inside double quotes, so it died as a "bad
substitution" and was skipped, scoring 9/9 instead of 9/10. **Read the harness
output, not just its total.** Third instance today of a mutation that proved
nothing.


---

# PART 2c — TWO LOGGER FAULTS, ONE FIXED AND ONE STILL OPEN

### `7d3f53c` — finishing a workout credited the wrong DATE (FIXED)

Dustin finished Upper Push and the app marked the session dated **10 August**
done, leaving today's open and the week at 0%. At 17:02, mid-session, the day
was forked (`origin: 'library_fork'`) and today's row repointed at the copy,
while the logger still held the day id it loaded with at 16:15. The day_id
lookup found nothing and the make-up fallback reached back a week.

The page already resolves the exact row as `scheduledWorkoutId` and
completeWorkout never used it. A row id survives a fork; day_id does not.

### 🔴 STILL OPEN — a completed workout wrote NOTHING

His Stair Master, same day. In his words: *"Tapped Start on the home card, then
finished it"*, 30 minutes. The database had **no trace of it anywhere**:

- no `workout_logs` row (last one 6 Aug)
- no `set_logs`, no `offplan_workout_logs`, no cardio row

**This is not a missed tap.** `completeWorkout` calls `ensureWorkoutLog()`,
which INSERTS a log when none exists, so reaching Complete at all should have
produced a row. And on every previous Stair Master session the log was created
the moment the screen opened — 6 Aug shows created and completed two seconds
apart.

**Not diagnosed. Do not guess in a commit.** What was ruled out: the day has a
section with 1 exercise, so the logger renders normally; the day is his own
(`client_owner_id` = Dustin) so no fork was involved; he has completed this
exact day five times before.

What would settle it: the browser console from a repeat attempt, or a
`query_logs` sweep of `postgrest_logs`/`edge_logs` around the attempt for a
refused INSERT on `workout_logs`. Ask him to try it once and screenshot anything
that appears.

**Partial mitigation already shipped in `7d3f53c`:** the completion now checks
which rows it actually changed and throws a visible message when nothing did. A
silent "finished but nothing happened" should now say so on screen. It does NOT
fix a log that was never created — that is upstream of the guard.

**His data was corrected by hand**, backed up in
`bak_sw_misdated_completion_20260817` and `bak_stair_master_recovery_20260817`:
Upper Push credited to today, 10 August released, and the Stair Master recorded
as 30 minutes on his word with a note on the log saying so.


---

# PART 3 — OPEN, IN ORDER

## 1. 🔴 See PART 2c — a completed workout wrote nothing. Not diagnosed.

## 2. 🟠 Run the generator — HIS DECISION, ASKED AND NOT YET ANSWERED

A dry run says **58 inserts** over five weeks: 51 are the ordinary September
backlog already waiting, plus the 7 the fix unblocked. Generation is **not on
cron**; he runs it by hand. Materialising 58 rows onto real clients' calendars
is his call.

```sql
select * from generate_scheduled_workouts(5, false);   -- p_dry_run = false
```

Dry-run first and show him the list. Do not run it unprompted.

## 2. 🟡 The group message — WRITTEN AND FACT-CHECKED, NOT SENT

`docs/GROUP-MESSAGE-READY-2026-08-17.md`. Version A, every claim verified,
iPhone line kept. **He sends it. Claude never messages a client.** Do not
re-verify it — the evidence for each line is in that file.

Expect push subscriptions to climb over days, not at once. 0 for an hour after
he posts is normal, not a fault.

## 3. 🟡 A backup that Supabase does not control

Managed daily backups are now on, so this dropped from emergency to hygiene. The
permanent path is a nightly GitHub Action running the three `supabase db dump`
commands — **in a NEW PRIVATE repo.** `symmetry-app` is public and committing
`data.sql` there would publish 30 clients' body-composition data to the open
internet. His interactive step (creating the private repo, adding the DB_URL
secret) comes FIRST; do not design a plan whose last step is Claude signing in.

Free and still worth doing: point Vercel at the **transaction pooler, port
6543** (prepared statements off). That targets the reconnect storm that
triggered this morning's outage.

## 4. 🟡 Does the AI coach pick up a goal change?

Still unconfirmed either way. His screenshots were at 8:12 and he changed the
goal at 8:15, so that card was correct when it rendered. Ask him to open the
coach card; if it still quotes 185 lb by 30 Sep rather than 235 lb by 29 Nov,
it is real. `goalContextBlock` reads live, so start by looking for caching
between the context and the rendered card.

## 5. 🟢 The overshoot threshold

`overshooting` trips at a quarter of the journey past target, floored at one
unit. Flagged to him; his case was 60% past so it was right. One constant in
`src/lib/goals.ts` if he wants it tighter.

## 6. 🟢 An active goal with no readings renders nothing

`GoalCard` returns `null` when the metric has no readings — no card, no hint the
goal exists. Nobody is in that state today. It becomes real the first time
someone sets a lean-mass goal before their first InBody.

---

# PART 4 — MUTATION HARNESSES

Not run by `npm run test:unit`. Invoke by hand. Three new ones today:

```
bash tests/mutate-replace.sh      # 17 mutations, all caught
bash tests/mutate-generation.sh   # 10 mutations, all caught
bash tests/mutate-servings.sh     # 16 mutations, all caught
```

Plus the existing `mutate-detector.sh`, `mutate-move.sh`, `mutate-push.sh`,
`mutate-homework.sh`, `mutate-clientview.sh`, `mutate-coachself.sh`,
`mutate-notifier.sh`.

**Two of today's mutations were BAD mutations rather than coverage gaps**, and
both were fixed rather than deleted:

- one was a no-op from mis-escaped quoting through bash → Python `eval`
- one removed a guard whose job a second guard was also doing, so behaviour did
  not change

A mutation that changes nothing proves nothing. The harnesses assert the file
actually changed, which is what surfaced both.

---

# PART 5 — THINGS THAT COST TIME TODAY

- **`split_part(sql, '$function$', 2)` picked the wrong segment** when verifying
  a deployed function against its migration file, because the file's *comment*
  quoted `$function$` in prose. Use the last pair, or do not write the marker in
  prose. The comment was reworded.
- **The log's CHECK constraint listed three actions** and would have rejected a
  new one outright. A new enum-ish value in a function means checking the
  constraint on the table it writes to, in the same migration, before the body.
- **`foods` and `food_catalog` are different tables.** `foods` (1,339 rows) has
  a free-text `serving` and no gram weights; `food_catalog` (574,617) has
  `serving_grams` and `serving_options`. Looking at the wrong one first suggests
  this feature needs a data migration. It does not.
- Everything in Part 5 of `docs/HANDOFF-COMPLETE-8-17.md` still applies —
  WebFetch caching, Supabase reporting `ACTIVE_HEALTHY` during an outage, the
  793-videos non-regression.

---

*Dustin Gautreaux · Symmetry Personal Training · 17 Aug 2026, afternoon*
