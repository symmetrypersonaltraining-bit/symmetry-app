# Symmetry Trainer App — Handoff, Fri Jul 31 2026

Written at the close of the accuracy session. The next chat is for **the messaging system and the challenge** — everything else Dustin has asked for is captured below so nothing has to be remembered.

Previous handoffs: `claude/HANDOFF-7-23.md`, `claude/HANDOFF-7-20.md`, `claude/OPEN-ITEMS-7-20.md`, `claude/MIGRATION-PAUSED-7-23.md`.

---

## Start here — environment and the loop

Repo lives at `/tmp/symmetry-app`. **The Bash tool resets the working directory to `/home/claude` after every single call**, so every command must begin `cd /tmp/symmetry-app &&`. Deployment is Vercel; the phone app is a Capacitor thin remote shell, so a Vercel deploy reaches the installed APK without a rebuild (a rebuild is only needed when native permissions change — see item #42 below).

Supabase project id is `mkfiginpiesospsnktea`, and both `mcp__Supabase__execute_sql` and `apply_migration` require it passed explicitly. There is no `.env.local` in the working tree, so anything that needs live data gets pulled through the Supabase MCP tool into a JSON file and fed to a local `tsx` script.

The verify loop before any commit, in this order:

```
cd /tmp/symmetry-app && npx tsc --noEmit --skipLibCheck
cd /tmp/symmetry-app && NEXT_PUBLIC_SUPABASE_URL=https://mkfiginpiesospsnktea.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build
cd /tmp/symmetry-app && npx tsx --test tests/unit/*.test.ts
cd /tmp/symmetry-app && git add -A && git commit && git pull --rebase -q && git push
```

Two traps worth knowing. `npm run test:unit` **fails** with `ERR_MODULE_NOT_FOUND: 'tsx'` — always use the `npx tsx --test` form above. And inside test files `import.meta.dirname` is undefined under tsx's CJS transform, so use `const ROOT = process.cwd();`.

`tsc` is never clean — these errors are the expected baseline and should be ignored: everything under `tests/e2e/*`, `capacitor.config.ts(1,38)`, `playwright.config.ts(13,39)`, `client-preview/page.tsx(132,7)` (`clientId`), `client-preview/schedule/page.tsx(91,7)` (`defaultView`), `home/page.tsx(219,32)` (`emailSentAt`), plus the TS5097 `.ts`-extension errors on `tests/unit/*.test.ts`. Anything new on top of that list is real.

Suite currently stands at **254 tests, 254 passing**.

Commit trailers, required on every commit:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nhHXNx2bpVkFCU5LzzmwL
```

---

## Standing rules that outlive any one chat

Every client-facing fix ships to **both** the client app and the `/client-preview/*` twin routes — Dustin's words: *"all fixes go to my client app as well as everyone else, all client apps the same including my own."* Forgetting the twin route is the most common way a fix looks done and isn't.

Nothing goes client-live without Dustin's approval. Version history records cause → effect. One source of truth, no stale duplicates.

Programming never includes Olympic or power lifts (cleans, snatches, jerks, high pulls, push press) or strongman. Pull-ups are **always** Machine Assisted, progressed by reducing the assist — never weighted, never chin-ups. Peptide and anabolic protocols are out of scope for this app entirely. NASM language never appears in client-facing copy.

The week runs **Sunday → Saturday**, and dates are Central Time via `new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })`.

Google and email actions use `symmetrypersonaltraining@gmail.com` only. Scheduled tasks use the `mcp__claude-code-remote__*` trigger tools — never the local `Cron*` tools, which die with the session.

**Do not retry the Notion handoff changelog update without asking Dustin first.** He interrupted that call in an earlier session and it has been left alone since; this session's changelog entry is still unwritten in Notion by design.

---

## Shipped this session

Six commits, all pushed, all through the full verify loop.

`0619948` — **generic program and session names.** No client's name is baked into a program or workout title any more; the client shows as metadata instead. Directly Dustin's ask: *"do not name anyones 'program' after them."*

`91f146d` — **archive a client without losing anything they did.** Archived clients drop out of the active roster and the counts without their history being touched.

`db3b757` — **weekly AI auto-update.** The Sunday sweep writes the weekly focus, the coach's read and the food-logger weekly read. `src/app/api/cron/weekly-ai/route.ts` writes `ai_focus`, `ai_focus_date`, `ai_food_focus` and `ai_food_focus_week` unconditionally; it writes `weekly_focus` / `weekly_focus_week` / `weekly_focus_source = "ai"` only when the trainer doesn't own the focus (trainer ownership = `weekly_focus_source === "trainer"` **and** `weekly_focus_week === week` **and** a non-empty `weekly_focus`). So a focus Dustin wrote himself is never overwritten.

`1796868` and `67be9da` — three silent write failures fixed with a test to keep them gone, and four competing adherence calculations collapsed into one.

`b371c30` — **three real accuracy bugs in the numbers the AI states as fact.** This is the one that matters most, because the block handed to the model carries "these signed deltas are the SOURCE OF TRUTH, do NOT recompute" — so a wrong number becomes wrong coaching, stated confidently.

### The three number bugs, and what they were doing

**Phantom logged days.** `summariseLogRange` counted any date carrying any row as a logged day. On 2026-07-31 Dustin's only row for the day was `{"__removed": true}` — a meal he deleted, not food he ate — so five days of eating were divided by six. It reported **2261 kcal / 246g protein** when the truth was **2713 / 295**. The model was being handed *protein −17 (BELOW target)* when the real answer was *+32 (ABOVE)*. A sign flip, pointing the coaching the wrong way. Fixed by gating on `computeDayTotals(...).loggedCount > 0`.

**Plan slots 6 and 7 misread as snacks.** Plan positions were being inferred per-day from rows carrying a `meal_id`, but an off-plan row has no `meal_id`. Dustin's plan genuinely has seven meals, and `EXTRA_POSITIONS = [6, 7]` — so every time he ate his M5 off plan, `isExtraLog` classified it as a quick-add snack and silently dropped it out of the adherence average. Fixed by computing plan positions **once for the whole range**, seeded from the live plan's own `meals.position`, which meant `fetchPseudoMeals` had to start fetching the `meals` table at all (it previously hard-coded `position: 0`).

**Last week graded against a future target.** `fetchWeeklyComparison` used `.lte("effective_date", to)` where `to` is *this* week's end — a future Saturday. Dustin's targets went 1963/293/120/34 (eff. 07-06) → 1388/263/12/32 (eff. 07-30), so the week of 07-19..07-25 was being judged against a target that took effect **five days after that week closed**. It reported protein *+1 ABOVE* and carbs *+20 ABOVE* when the truth was *−29* and *−88 BELOW*. Fixed with two window-bounded target queries plus an explicit `TARGETS CHANGED between the two weeks` line so a mid-comparison change reads as a change and not as the client slipping.

### How to re-verify when Dustin says the numbers look off

`scripts/verify-weekly.ts` is a documented dev tool that runs the **real** production functions over **real** rows:

```
cd /tmp/symmetry-app && npx tsx scripts/verify-weekly.ts /tmp/<client>.json 2026-07-31
```

The payload is one object — `{ logs, plans, targets }` — pulled with a single `json_build_object` query through the Supabase MCP tool. The header of the script spells out the exact shape. Start here rather than reading code; it prints per-day rows alongside the block the AI is handed, so a discrepancy is visible by eye.

Both clients verified end to end. Dustin now reads last week `2293 kcal 264P/32C/124F @ 99%` and this week `2713 kcal 295P/58C/145F @ 96%`, with week-over-week protein correctly reading **+31g UP (moving the right way)**. Claudine reads `2137 → 1991 kcal` at 75% both weeks.

---

## Things Dustin should know but that are not bugs

**Claudine's adherence can never move.** She logs every meal as "Off-plan", which scores 0.75 under the canonical weights, so her adherence is pinned at exactly 75% every day — despite her logging 7 of 7 days. Arithmetically correct, but the number is inert for anyone who logs that way. Worth a conversation about whether that's how she means to log, or whether Off-plan-on-a-plan-slot should score differently.

**`CRON_SECRET` must be set in Vercel.** `authorised(req)` returns **false when the variable is unset**, which means `/api/cron/weekly-ai` returns 401 to *every* caller including Vercel's own scheduler. The weekly sweep will silently never run until it's set. The cron fires `0 11 * * 0` — 6 AM Central Sunday (`vercel.json` also has `/api/reminders/send` and `/api/gcal-sync` at `0 14 * * *`). To seed a client early without waiting for Sunday, `POST /api/cron/weekly-ai` with `Authorization: Bearer <CRON_SECRET>` and an optional `{clientId, today}` body. The same secret gates `/api/reminders/send`, `/api/gcal-sync` and `/api/ai-nudges`.

**`supabase/migrations/20260718_movement_assessments.sql` is written but never applied.** `to_regclass('movement_assessments')` returns null against the live project. The OHSA / movement-assessment go-live is on the Friday scheduled task (`trig_019dNj9f2d9oGbdkHu1PWdSf`, `0 13 * * 5`) along with the searchable in-app Help/Tutorials centre in Settings. `my_meals` **is** applied.

**`dayAdherencePct` in `src/lib/nutrition/dailyTotals.ts` is dead code and a drift hazard.** It has no consumers outside its own file and `tests/unit/dailyTotals.test.ts`, and it divides by **all** plan slots where the canonical `summariseLogRange` divides by **logged** plan meals. Two definitions of the same concept, one of them unused — the next person to reach for it will get a different answer than the app gives. Delete it along with its test, or make it delegate.

**`src/components/nutrition/useNutritionAverages.ts` was deliberately left alone.** It powers the client-visible rolling averages strip (1W/2W/4W/8W). It inherits the `loggedCount` gate and the log-derived plan-position fallback automatically, so bug 1 is fixed there too — but it still builds pseudo-meals with `position: 0` and passes no `excludeDates`. Practically: plan slots 6/7 still rely on the weaker fallback in that strip, and today's half-eaten day still drags those averages down. Worth aligning, but it changes numbers clients can see, so it wants to be a deliberate decision rather than a drive-by.

---

## Money — needs Dustin, deliberately not touched

Two distinct groups turned up, and neither was auto-fixed because it's Dustin's money and he confirms it.

**Reminders switched on, but nothing to remind about.** `payment_reminders_enabled = true`, `session_rate` null, zero rows in `payment_reminders`: **Demo Account, Jerry Bourgeois, Sharon Gautreaux**. Demo Account is presumably intentional; the other two look like real clients whose rate was never entered.

**Paying, but no reminders at all.** `session_rate = 75` monthly, reminders not enabled, zero reminder rows: **Jada Cook, Tania Millan**. These two are being billed $75/month with nothing prompting them.

36 active (non-archived) clients on the roster.

---

## Open feedback — all three need Dustin, not code

Three rows still sit at `status = 'new'` in `app_feedback`:

**#41 · `5207214a`** (2026-07-26, from `/messages`) — *"Add liquid egg whites into my meal plan and add steak one night a week."* That's Robert. It's a real plan change and plan changes are Dustin's call.

**#42 · `16f0c449`** (2026-07-25, trainer app, from a workout page) — *"Voice dictation is not working on feedback button."* This needs the native mic permission, which means a **Codemagic rebuild and a reinstall** — a Vercel deploy alone will not fix it.

**#43 · `95f11695`** (2026-07-29, trainer app) — *"Have app pull info from other fitness apps garmin, Google, apple."* Health-platform integration; a project in its own right, not a fix.

---

## Backlog for the next chats

The next chat is **messaging + the challenge**. Everything below is queued behind that, in Dustin's own words.

**#55 — AI workout builder and meal plan builder.** *"make sure ai workout builder and meal plan builder works properly and efficiently."* Both need an end-to-end check: correct and complete structures out of a plain-English prompt, exclusions respected, exercise library and Sevens Gym equipment only, and finishing without timing out.

**#56 — the AI button on the food logger does nothing.** Either never wired or failing silently. Client app *and* `/client-preview`.

**#57 — food logger scroll is still very laggy.** Needs profiling on a real phone. Likely suspects: every meal card re-rendering on each keystroke, uncompressed photo thumbnails, non-virtualised lists, heavy shadows.

**#58 — copy meals, save meals to library, assign meals from library.** `my_meals` already exists from `7b720b4`; this extends it to duplicating a logged meal into another slot or day, saving any meal to the library, and pulling one back out into a slot.

**#51 — revamp the "Who needs you" and "Week ahead" home blocks.** Both on the trainer home; rework what they surface and how they rank so they're actually actionable.

**#52 — notifications not clearing properly, and unreliable in general.** Full audit: token registration, send path, read-state writes, badge and unread counts, service worker. Trainer app and client app both.

---

## Where the numbers live, if you need to touch them

`src/lib/ai/weekly-numbers.ts` is **pure and fully unit-tested** — every average, delta and direction is computed there and handed to the model as a stated fact, because the model was demonstrably flipping above/below when given raw rows. `src/lib/ai/weekly-context.ts` only fetches. `src/lib/nutrition/dailyTotals.ts` holds `computeDayTotals`, the canonical daily calculator. `src/lib/nutrition/rangeAverages.ts` holds `summariseLogRange`, the canonical range summary — averages **per logged day**, never per calendar day.

Adherence weights, in one place (`ADH_PCT` / `adherencePct()`): Full 1, ¾ 0.75, ½ 0.5, ¼ 0.25, Partial 0.5, Skipped 0, Off-plan `null` (falls back to `est_*`). An Off-plan row sitting on a plan slot scores 0.75.

Persistence bands: plan meals ≤ 20; `EXTRA_POSITIONS = [6, 7]` for quick-add extras (legacy ≥ 101 also counts as extra); `INSERT_POSITION_MIN/MAX = 21/40` for inserted day-custom meals. Structural markers that are **not** food: `__removed`, `__unlogged`, `__custom.unlogged`, `__ord`, `__added`.

If a number is wrong, a unit test should say so before a client does.

---

*Symmetry Personal Training · Dustin Gautreaux · Trainer App · Jul 31 2026*
