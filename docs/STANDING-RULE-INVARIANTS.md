<!-- Moved from the Cowork project (`claude/STANDING-RULE-INVARIANTS.md`) on
     10 Sep 2026 so Claude Code sessions can read it. CLAUDE.md sections 0 and 6
     both require it. The project copy is history; this is the live one. -->

# Standing rule: why bugs kept coming back, and what stops it

> "this is the 3rd time dealing w this shit, I need to move the app forward
> figure out a way for bugs to not reoccur over n over" — Dustin, 1 Sep 2026

## Why they came back

Every recurrence had the same shape. A rule was fixed **in one code path**, and
then broken from a different one that did not know about it.

- **Cross-client edits.** `swap_prescribed_exercise` was taught to fork before
  writing. `clients/[clientId]/program`, `WorkoutDayEditor` and
  `lib/ai/workoutAdjust` were not — they still wrote to `prescribed_exercises`
  by id. And a direct SQL session answers to none of them.
- **Programme assignment.** The in-app AI's `assign_program` deactivates the old
  assignment first and logs the action. A direct SQL write did neither, which is
  how a copy of Dustin's own cut ended up assigned to Jennifer with no record.
- **Scheduling.** Seven code paths move a workout. Six set `moved_from_date`;
  one did not, and separately every one of them rewrote the workout_log's date,
  which is what broke Jenn's history.

App-side checks cannot hold a rule that any new file, any AI tool, or any
console session can walk around.

## The rule

**An invariant that matters goes in the database, not the app.**

A trigger or constraint binds every writer — the app, the AI, a cron job, a
Claude session with the Supabase MCP, a future file nobody has written yet. App
code then agrees with it for the sake of good errors, but is not what enforces
it.

Three tests before shipping one:

1. **Is it an invariant or a preference?** "A log's date is not rewritten by a
   scheduling action" is an invariant. "A completed workout cannot move forward"
   is a preference — and it was wrong, because it removed control Dustin has
   said repeatedly that he and his clients must have. Enforce invariants; never
   encode a preference as a constraint.
2. **Prove it fires.** Attempt the bad write and confirm it is refused. A guard
   nobody has seen reject anything is a guard that may not work.
3. **Prove the fix was needed.** Run the new test against the unfixed file and
   watch it fail. `docs/AUDIT.md`: "a check that cannot fail is not a check."

## The four layers now in place

| layer | what it does | example |
|---|---|---|
| **Trigger** | refuses the bad write, whoever makes it | `pe_block_cross_client_edit`, `sw_enforce_day_isolation`, `metrics_sync_client_weight` |
| **Check** | reports drift twice daily if a trigger is dropped, disabled or bypassed | `integrity_checks_12h` |
| **Test** | stops the app code regressing to a shape the trigger would now reject | `tests/unit/*.test.ts`, verified red-first |
| **CI** | *(added 3 Sep)* runs the type checker over `src/` and the unit suite on every push | `.github/workflows/syntax-check.yml` |

`integrity_checks_12h` now runs, in order: `run_integrity_checks` →
`run_scheduling_integrity_checks` → `run_nutrition_integrity_checks` →
`run_programme_ownership_checks` → `run_workout_name_checks` →
`run_day_isolation_checks` → `run_scheduling_invariant_checks`.

**The CI layer is new and it matters.** Until 3 Sep nothing in continuous
integration ran the type checker or the tests — both were rules a person was
expected to remember before pushing. That is not a layer, that is a hope.

## A check nobody acts on is worse than no check

The first cut of `workout_log_date_disagrees_with_schedule` reported **85** rows,
almost all harmless July drift from before the 6 Aug logger fix. That is a check
that gets ignored, and an ignored check hides the real one. It was narrowed to
`workout_log_dated_in_the_future` — no legitimate case, currently 0.

Same reason `client_named_programme_is_house_template` matches a first name on a
word boundary rather than a substring: `ilike '%Art%'` was flagging
"Partner Program".

And the same reason `scheduled_workout_null_assignment_id` was **retired** on
3 Sep, and why the two calendar checks became horizon-aware the same day. Both
reported normal work as drift.

## A check can also be blind to its own worst case

`client_coverage_under_14_days` inner-joined a `GROUP BY` over
`scheduled_workouts`. A client with **no** scheduled workout at all therefore
produced no row to compare, and could never be flagged — the worst coverage in
the system was the only kind the check could not see. Fixed 3 Sep with a left
join, and it immediately surfaced a client nobody had noticed.

**Generalise this:** any check built on a group-by over the thing being checked
is blind to total absence. There may be others.

## And a check can ask the wrong question entirely

`supervised_workout_no_appointment` is named for "no appointment" but its
predicate is `appointment_id is null` — which is a *link*, not an appointment.
189 of the 207 it reported had a real appointment on the correct day and were
merely unlinked. A check whose name and predicate disagree will be misread by
everyone, including whoever wrote it.

## What is NOT enforced, on purpose

- **Moving workouts.** Dustin and his clients move anything anywhere, forward or
  back, completed or not. Stated more than once. A trigger blocking forward
  moves of completed sessions was added on 1 Sep and **dropped the same day** —
  it was solving the symptom by removing control.
- **A client on more than one live programme.** Legitimate combinations exist
  (an assessment can call for two tracks), so this warns and does not block.
- **Duplicate workout copies.** They are the isolation mechanism, not bloat.
  See `docs/WORKOUT-ISOLATION.md`.

---

# Facts about how Dustin works — STOP RE-REPORTING THESE

Each of these has been explained more than once and keeps coming back as a
"finding". They are not findings. They are how the business runs. Anything that
reports them as problems is a broken check, and the fix belongs to the check.

**Before raising any roster or coverage concern, read this section, then apply
the same filters the real checks apply.** This went wrong THREE TIMES in a single
night — the 493 assignment ids, Jerry, and Todd. Every one of them cost Dustin an
explanation he had already given more than once, one of them for the fifth time.

On 3 Sep I reported eight clients with "no future workouts" as though the app had
lost track of them. The app had not: Jerry was already correctly flagged and the
real check already excluded him. My own ad-hoc query was missing the filter. The
system was right and I was the one re-raising it.

**When a check disagrees with how he actually works, the check is what changes.**
Not the client, not the data, and never a request for him to explain again.

## He does not use grouped programmes

> "We're not going by program. We're going by the workout library... I don't
> assign programs that are grouped together. I do custom programming through
> Claude using the workout library." — Dustin, 3 Sep 2026

`scheduled_workout_null_assignment_id` reported **493 rows** as a warning. All
493 were the normal case: sessions built per client from the exercise library do
not hang off a `program_assignments` row and are not meant to. The check was
retired on 3 Sep.

The `programs` / `phases` / `program_assignments` tables still exist and are
still written by the `Personal Workouts` sidecar in `api/workout-manual`. That is
plumbing, not a programme he assigned.

## Jerry Bourgeois does not train — he logs food only

Brother-in-law. Nutrition client. Already flagged `nutrition_only = true`, and
the coverage check already excludes nutrition-only clients. He has no future
workouts because he is not supposed to have any. Noted 3 Sep after coming up
three times.

## Todd Prine books a week at a time — that is not a calendar gap

> "Todd schedules one week at a time so his billing should be set to charge by
> the session rate. thats why he's not in calendar. 4th or 5th time explaining
> this." — Dustin, 3 Sep 2026

His billing was **already** correct: `per_session`, $75, anchor day 9. Nothing
about Todd ever needed changing.

His calendar only ever runs about a week ahead while his programming runs months
ahead, so both calendar checks — which assumed the two match — produced a
permanent, growing false alarm on him. `clients.schedules_week_to_week` is set on
him, and such a client is now judged against **their own booked horizon** (their
latest actual appointment) rather than the full future.

A fixed 7-day window was tried first and was still wrong: booked through the 4th
and programmed through October means a session on the 7th is next week's booking
he has not made yet, not an unbooked session.

## Erin Arit is not a client yet

She has not confirmed signing up ("I have not recieved confirmation she is
actually signing up yet so ill update once she does" — 3 Sep). Left exactly as
she is; no flag invented for someone who may not become a client. She will keep
appearing on `client_coverage_under_14_days` until she signs up or is archived,
and **that is expected, not drift.**

## Most clients with no scheduled workouts are test accounts

`clients.is_test_account` was added 3 Sep and set on: **Alan Meier, Ian
Christman, Justin Ray, Oliver Gergelj, Brooke Orton, Demo Client (Stephanie)**.
There is no UI for it; set it by hand.

**Erin Arit was deliberately NOT flagged** as a test account, and should not be —
see her own section above.

## Placeholder macro targets are not urgent

Eleven clients have carried placeholder macros since 23 July. "Leave them as is
for now. I'm not worried about that." — 3 Sep 2026.

## His weight is whatever he last logged

196.2 lb as of 3 Sep 2026. The most recent weigh-in is the truth and is what must
appear on every screen. `clients.current_weight` is a **cache** of it, never an
independent fact, and `metrics_sync_client_weight` now enforces that.

## Gemini is a second opinion, not a second driver

Read-only audit access, for feedback and backup audits. It gets no credentials of
any kind — that is what makes it read-only, rather than trusting it to behave.
Dustin and Claude keep every decision.

## Shipping runs through his laptop — in Cowork only

Cowork cloud sessions cannot push to GitHub — verified repeatedly, do not
re-diagnose. Work ships as a **thin** git bundle
(`git bundle create f origin/main..main main`) through `outbox\`, pushed by
SHIP-WATCHER on his laptop. The full-history bundle is 22 MB and the bridge caps
at 20 MB, so thin is not optional. The laptop must stay awake for the bridge to
work.

**In Claude Code none of that applies: `git push`.** See
`docs/START-HERE-CLAUDE-CODE.md`.
