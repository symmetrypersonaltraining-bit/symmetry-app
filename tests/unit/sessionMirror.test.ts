import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mirrorEventId, mirrorEventBody, MIRROR_CALENDAR_SUMMARY } from "../../src/lib/sessionMirror";

/**
 * THE MIRRORED GOOGLE CALENDAR.
 *
 * PushPress Grow's Two-Way / Smart Sync reads a Google calendar INTO PushPress,
 * which is how the gym's trainers get to see Dustin's sessions. It connects to
 * a Google ACCOUNT, so pointing it at his primary calendar would put his whole
 * diary on the gym's shared calendar. The app publishes a calendar of its own
 * instead.
 *
 * Three things here would be wrong in a way nobody notices until the damage is
 * done, and they are what this file is about:
 *
 *   1. writing to the primary calendar — the one billing reads
 *   2. an event id that is not stable, so every run adds a duplicate
 *   3. attendees on the event, which on a Two-Way sync emails the client and
 *      creates a contact record for them in the gym's CRM
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/sessionMirror.ts"), "utf8");
const ROUTE = readFileSync(join(process.cwd(), "src/app/api/calendar/mirror/route.ts"), "utf8");

/** Comments out. Half of this file's own prose names the things it forbids. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const s = (over: Record<string, unknown> = {}) => ({
  appointment_id: "11111111-2222-3333-4444-555555555555",
  starts_at: "2026-08-25T14:00:00.000Z",
  ends_at: "2026-08-25T15:00:00.000Z",
  cancelled: false,
  display_name: "Robert Miller",
  ...over,
});

test("nothing in the mirror ever addresses the primary calendar", () => {
  // The one that matters. `/calendars/primary/...` is what the sync reads and
  // what every appointment, and therefore every invoice, comes from.
  assert.doesNotMatch(code(SRC), /primary/, "sessionMirror names the primary calendar");
  assert.doesNotMatch(code(ROUTE), /primary/, "the mirror route names the primary calendar");
});

test("an appointment maps to one Google event id, forever", () => {
  // Google accepts a caller-supplied id of lowercase a–v and 0–9. A uuid with
  // the dashes out is 32 hex characters, which is inside that alphabet — so a
  // re-run updates the event rather than adding a second copy of the client.
  const id = mirrorEventId("11111111-2222-3333-4444-555555555555");
  assert.equal(id, "11111111222233334444555555555555");
  assert.match(id, /^[0-9a-v]{5,1024}$/);
  assert.equal(id, mirrorEventId("11111111-2222-3333-4444-555555555555"));
});

test("uppercase input still yields a legal id", () => {
  assert.equal(mirrorEventId("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"), "aaaaaaaabbbbccccddddeeeeeeeeeeee");
});

test("an id Google would reject is refused here rather than sent", () => {
  // A 400 from Google mid-run leaves the calendar half-published. Better to
  // name the row that cannot be mapped.
  assert.throws(() => mirrorEventId("not-a-uuid!"), /legal Google event id/);
});

test("a booked session is the name, blue, and busy", () => {
  const b = mirrorEventBody(s());
  assert.equal(b.summary, "Robert Miller");
  assert.equal(b.transparency, "opaque");
  assert.equal(b.colorId, "9");
});

test("a cancelled session is marked, orange, and free", () => {
  const b = mirrorEventBody(s({ cancelled: true }));
  assert.equal(b.summary, "CANCELLED — Robert Miller");
  assert.equal(b.transparency, "transparent");
  assert.equal(b.colorId, "6");
});

test("the event never carries attendees", () => {
  // On a Two-Way PushPress sync an attendee becomes a contact record in the
  // gym's CRM, and Google may email them an invitation. Neither was asked for.
  assert.deepEqual(mirrorEventBody(s()).attendees, []);
  assert.deepEqual(mirrorEventBody(s({ cancelled: true })).attendees, []);
});

test("the event fires no reminders", () => {
  // It is somebody else's calendar. It must not buzz their phone.
  const r = mirrorEventBody(s()).reminders;
  assert.equal(r.useDefault, false);
  assert.deepEqual(r.overrides, []);
});

test("every event we write is stamped, because the reconcile deletes", () => {
  // The pass removes anything of OURS in the window that is no longer a
  // session. Without the stamp that rule would reach an event somebody added
  // to the shared calendar by hand.
  assert.equal(mirrorEventBody(s()).extendedProperties.private.symmetry_mirror, "1");
  assert.match(code(SRC), /if \(!row\.mine\) continue/, "the delete pass no longer checks ownership");
});

test("the calendar it creates says not to edit it", () => {
  assert.match(SRC, /Do not edit by hand/);
  assert.equal(MIRROR_CALENDAR_SUMMARY, "Symmetry — Client Sessions");
});
