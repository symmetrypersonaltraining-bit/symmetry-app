import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "I HAVE ALL NOTIFICATIONS TURNED OFF IN SETTINGS."
 *
 * Jennifer Day, 26 Aug 2026, mid-report about a workout that lost every set:
 * *"About midway through my workout. It wouldn't let me check a completed set.
 * It happened about the same time a notification two group messages ... Strange
 * thing is I have all notifications turned off in settings. I shouldn't be
 * getting any messages."*
 *
 * Both halves were one incident, and both were real.
 *
 *   • Her session ran 10:45–11:12. Exactly two group messages posted at
 *     10:55:26 and 10:55:27 — dead centre.
 *   • She switched Group chat off on 14 August. notification_preferences gated
 *     PUSH only: sendPushToUser checks it, the in-app banner never did.
 *   • She has NO row in push_subscriptions at all, so the only notification the
 *     app could ever deliver to her was the one kind that ignored her settings.
 *     Every toggle on that screen was decorative for her.
 *   • The banner is position:fixed, full width, z-index 3000, and it NAVIGATES
 *     when tapped — sitting over the logger while she tapped set checkboxes.
 *
 * She finished with 27 minutes of work and zero rows in set_logs.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments out — these files explain the rule by naming what it forbids. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const NOTIFIER = code(read("src/components/MessageNotifier.tsx"));
const BANNERS = code(read("src/lib/messageBanners.ts"));
/**
 * 29 Aug: the preference read moved OUT of MessageNotifier into a shared hook,
 * because living in one component is exactly why the bell, the nav badge and
 * the flashing Messages tab carried on ignoring the same setting for another
 * day after the banner was fixed.
 *
 * These assertions used to require the query to be textually inside
 * MessageNotifier.tsx, so moving it broke them while the behaviour improved --
 * a string check failing for the one reason it should not. They now follow the
 * rule to wherever it lives, and the real behaviour is asserted underneath.
 */
const MUTED_HOOK = code(read("src/lib/useMutedEvents.ts"));
const FEED = code(read("src/lib/useNotificationFeed.tsx"));

// ── the settings screen governs every surface ────────────────────────────────

test("the in-app banner reads the same preferences push reads", () => {
  assert.match(MUTED_HOOK, /from\("notification_preferences"\)/,
    "the shared preference reader stopped reading preferences");
  assert.match(MUTED_HOOK, /\.filter\(\(r\) => r\.enabled === false\)/);
  assert.match(NOTIFIER, /useMutedEventKeys\(\)/,
    "the banner stopped consulting the shared preference reader");
});

test("the BELL, the nav badge and the Messages tab read it too", () => {
  // Jennifer and Claudine both had group chat off and a red bell for an unread
  // group message anyway. Those three surfaces all render from this one feed,
  // so the check belongs in the feed rather than in each of them.
  assert.match(FEED, /from\("notification_preferences"\)/,
    "the notification feed ignores the settings screen again");
  assert.match(FEED, /NOTIFICATION_EVENTS\.GROUP_MESSAGE\.key/);
  assert.match(FEED, /const groupMuted = mutedKeys\.has\(/,
    "the feed stopped deriving whether group chat is muted");
  assert.match(FEED, /groupMuted[\s\S]{0,400}fetchGroupUnread/,
    "a muted group chat must not even be counted for the bell");
});

test("a banner carries the event that governs it", () => {
  // Worked out where the item's kind is known, not guessed where it is not.
  assert.match(BANNERS, /eventKey\?: string;/);
  assert.match(NOTIFIER, /NOTIFICATION_EVENTS\.GROUP_MESSAGE\.key/);
  assert.match(NOTIFIER, /NOTIFICATION_EVENTS\.MESSAGE_FROM_CLIENT\.key/);
  assert.match(NOTIFIER, /NOTIFICATION_EVENTS\.MESSAGE_FROM_COACH\.key/);
});

test("a muted event does not raise a banner", () => {
  assert.match(NOTIFIER, /!\(b\.eventKey && mutedKeys\.has\(b\.eventKey\)\)/);
});

test("nothing is announced before the preferences are known", () => {
  // Filtering at queue time would show a muted banner during the load window —
  // and once it is on screen it has already interrupted her.
  assert.match(NOTIFIER, /if \(mutedKeys === null\) return;/);
  // ...and the shared reader must FAIL OPEN, on every path. A message that
  // should have been announced and was not is indistinguishable from no
  // message at all, so an error, a missing session or a thrown client all
  // resolve to "nothing is muted" rather than silencing the app.
  assert.match(MUTED_HOOK, /catch \{[\s\S]{0,120}setMuted\(new Set\(\)\)/);
  assert.match(MUTED_HOOK, /if \(error\) \{ if \(on\) setMuted\(new Set\(\)\); return; \}/);
  assert.match(MUTED_HOOK, /if \(!uid\) \{ if \(on\) setMuted\(new Set\(\)\); return; \}/);
  // But a failed read must not silence the app forever, so it settles to empty.
  // (the fail-open assertions moved to MUTED_HOOK above when the reader was
  //  extracted; MessageNotifier no longer owns that code)
});

// ── not over a workout ───────────────────────────────────────────────────────

test("banners do not appear over the logger", () => {
  assert.match(NOTIFIER, /const inWorkout = !!pathname && pathname\.startsWith\("\/workout\/"\);/);
  assert.match(NOTIFIER, /if \(inWorkout\) return;/);
});

test("a held banner is released, not dropped", () => {
  // Dropping it would lose the message outright — the exact failure this
  // component exists to prevent. `inWorkout` in the dependency list is what
  // makes leaving the logger show what was held.
  assert.match(NOTIFIER, /\}, \[banner, tick, inWorkout, mutedKeys\]\);/);
});

test("the hold needs no change inside the logger", () => {
  // Both loggers are off limits without per-item permission, so the rule is
  // keyed on the route rather than on any state the logger would have to expose.
  assert.match(NOTIFIER, /usePathname/);
});

// ── a failed set write now leaves a trace ────────────────────────────────────

const LOGGER = code(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));
const HELPER = code(read("src/lib/logClientError.ts"));

test("a refused set write is recorded, not only shown to the client", () => {
  assert.match(LOGGER, /scope: "set_log"/);
  assert.match(LOGGER, /scope: "bulk_set_log"/);
  // The quiet one: nought rows and NO error is what an RLS refusal returns.
  assert.match(LOGGER, /upsert affected 0 rows/);
});

test("the guards still refuse the tick — the change adds, it does not soften", () => {
  // The tick going green on a failed write is the original sin here. Recording
  // the failure must not become a reason to tolerate it.
  assert.match(LOGGER, /if \(setErr\) \{[\s\S]{0,400}throw setErr;/);
  assert.match(LOGGER, /throw new Error\("That set didn't save\./);
  assert.match(LOGGER, /if \(bulkErr\) \{[\s\S]{0,400}throw bulkErr;/);
});

test("the postgrest code is kept, because that is the part that identifies the fault", () => {
  // `code` separates an RLS refusal from a constraint violation from a dropped
  // request. Not having it is why 26 Aug ended in inference rather than a cause.
  assert.match(HELPER, /code: e\?\.code \?\? null/);
  assert.match(HELPER, /online: typeof navigator !== "undefined" \? navigator\.onLine : null/);
});

test("reporting a failure can never become a second failure", () => {
  assert.match(HELPER, /catch \{/);
  assert.match(HELPER, /if \(!opts\.clientId\) return;/,
    "with no client id the insert is refused by RLS and says nothing");
});

test("clients cannot read the error table, trainers can", () => {
  const SQL = read("supabase/migrations/20260826e_client_error_log.sql");
  assert.match(SQL, /for insert to authenticated\s*\n\s*with check \(client_id = public\.my_client_id\(\)\)/);
  assert.match(SQL, /for select to authenticated\s*\n\s*using \(public\.trainer_can_see_client\(client_id\)\)/);
  assert.doesNotMatch(SQL, /for select[\s\S]{0,80}my_client_id/, "the detail column carries ids");
});
