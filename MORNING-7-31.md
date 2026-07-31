# Morning list — Friday July 31

Overnight run finished 11:04 PM CT Thursday. Every piece of app feedback that
was still open has been read and worked; the feedback table now has exactly
three rows left unresolved, and all three are here because they need you, not
because they're hard.

Nine commits went out, `4c01fcf` → `b6ab7a4`, all pushed to `main` and live on
the web app. Everything client-facing reaches every client app identically —
the shared components serve `/nutrition`, `/schedule`, `/workout` and their
`/client-preview` twins from the same code, including your own.

---

## Needs you

**Robert's meal plan — liquid egg whites, and steak one night a week.**
This is a programming decision, not a code change. Tell me the swap you want
(which meal the egg whites go into and at what amount, which night the steak
replaces and what it replaces) and I'll write it into his plan and log the
change. Feedback `5207214a`, from Jul 26.

**Voice dictation on the feedback button.** The web app can't ask for the
microphone inside the installed APK — the permission has to be declared in the
native shell, which means a Codemagic rebuild and a reinstall on your phone.
Same shape as the camera permission we did for the barcode scanner (`fdc435d`).
Say go and I'll prepare the manifest change; you'll need to run the build and
reinstall. Feedback `16f0c449`.

**Garmin / Apple Health / Google Health.** Real project, not an overnight fix.
Apple Health has no server API at all — data only leaves the phone through a
native iOS app, which we don't have. Garmin needs a developer-program approval,
Google's Health Connect is Android-native. So the honest options are (a) native
apps first, which is the Phase 5 item anyway, or (b) start with Garmin Connect
only, since it's the one with a usable cloud API. Worth a real conversation
before I spend a night on it. Feedback `95f11695`.

---

## Shipped overnight

**Trainer Messages opened the wrong thing.** Tapping Messages auto-selected the
most recent unread client, and on a phone that hides the conversation list —
so you landed inside one thread with no way back to the others. Now the inbox
opens first and only gives way once you pick a thread. This was your 9:33 PM
report, `5d281749`, fixed 13 minutes later.

**Missed workouts move again.** A session missed on Tuesday was frozen on
Tuesday — the board treated "this date has passed" and "this tile is locked"
as the same thing, which stripped the drag handle and both buttons off exactly
the tiles you'd want to reschedule. Past tiles are editable again, missed ones
get a one-tap "→ Today", and the past section auto-expands with an amber count
when something was missed. Peak Week is still genuinely locked and completed
workouts still can't be edited.

**Food amounts are typed, not stepped.** Both pickers were ±0.25-serving
steppers, so a food's stored serving was its minimum — that's why the chili
crisp oil bottomed out at 25 g, about 5 tsp. There's now an amount box and a
unit dropdown; units are filtered to the food's dimension so a gram food offers
g/kg/oz, never tsp, and switching units converts rather than reinterprets.
Logged items read "5 g" instead of "0.2 × 25 g".

**Save any meal to My Meals.** The library existed but the only way in was an
empty slot — every meal actually on the plan, which is every meal worth
keeping, had no route. Wiring it up surfaced a real bug behind it: copying or
saving a meal ignored the day's amount edits, so stepping oats down to half a
cup and copying gave the full cup back while the card you copied from showed
the halved macros. Fixed for both copy and save, with a test asserting a copy
totals what it came from. Saves also report failure honestly now instead of
showing "saved ✓" for a save that never landed, and My Meals has a delete.

**Keyboard no longer covers what you're typing.** Every logging sheet is pinned
to the layout viewport, which doesn't shrink when the keyboard opens. All of
them now lift by the covered height and scroll the focused field into view.

**Dark mode white-on-white.** Not our CSS — the OS draws the dropdown itself
and inherits the text colour, so the client picker on Home was white on white.
The fix (`color-scheme`) was only being applied to one path; it's now derived
from measured theme luminance, so every dark theme is covered with no theme
list to drift out of date. Two hardcoded-white surfaces turned up in the same
sweep and got themed.

**Coach Dustins.** The celebration screen now reads "That's 4.7 coach Dustins
lifted today," using your latest logged weight read live — you're mid-cut, so a
baked-in number would quietly go wrong. It's also a reel on the slot machine
and shows up in the group share line when there's no PR to lead with.

**Group notifications.** Traced end to end; the fan-out and deep links were
already right. One real defect: the banner had a single slot and picked a
winner, so a window with 1 group message and 2 direct messages announced only
the direct ones — and the group message could never be announced later either.
Group and direct are different threads, so they're a short queue now, group
first. Seven unit tests including that exact case.

**Weekly programming brief.** Your request from Jul 27. A card at the top of
the first trainer-run session of each client's week: the week's schedule
grouped by day, what changed since last week, and what to focus on. It's
inline, not a modal — you open it standing next to a client — and it collapses
to a one-tap strip after you've read it, with the read state stored server-side
so it doesn't reopen on the gym iPad after you read it on your phone. Nothing
in it is ever shown to a client.

---

## Things the live data told me — your call

Building the weekly brief meant reading the real schedule rather than the
schema, and it kept contradicting the schema. Four things worth knowing:

**Clients routinely run three programs at once** — a split, a corrective track,
and personal workouts. Nothing wrong with that, but it means anything that
compares "the client's phase" week over week is meaningless. The brief now
tracks phases per program. Worth remembering for anything else we build that
assumes one program per client.

**Program names embed client names inconsistently** — "Bobbie — Personal
Workouts", "Robert Miller — 8-Week Block (Jun 2026)", "Knee Stability &
Strength — Bobbie", "Lauren Standerfer - 8-Week Block" (misspelled). The brief
strips them, but you may want to settle on one convention at the source.

**One program on Sarah Prince's calendar is still titled "Celeste Lennon —
8-Week Hip & Glute Block — Sarah"** — copied from Celeste and never retitled.
Worth fixing at the source; the brief will show it as Celeste's until you do.

**The same session appears on the calendar twice** on several clients, and
daily walk rows make a week ten-plus entries. The brief dedupes and groups by
day so it stays readable, but the duplicates are still really there.

Two more from the notifications pass:

**Group pushes reach every client row with a login**, including former clients
— there's no active/archived column on `clients` to filter on. Adding one is a
roster decision, so I left it. Say the word and it's a small change.

**`my_meals` and six other tables share a permissive RLS policy** (`app_anon_all`).
It's how the app has always worked and nothing is broken, but tightening it is
a project-wide decision, not something to do quietly at 2 AM.

---

## Not touched

The Notion handoff changelog is unwritten for this session — you stopped me
mid-update on that last time and I haven't retried without asking. Say go and
I'll bring it current with everything above.

Still scheduled for Friday: the movement assessment / OHSA screening go-live,
and the searchable in-app Help & Tutorials centre in Settings.

---

*200 unit tests passing. Build clean. All nine commits on `main`.*
