import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionFeed, foldLine, icsStamp, FeedEvent } from "../../src/lib/sessionFeed";

/**
 * THE PUBLISHED SESSION FEED.
 *
 * Dustin, 24 Aug 2026: the other trainers at Sevens need to see where he has
 * clients booked. PushPress cannot be written to — its whole public appointment
 * surface is `GET /appts/{id}` — so the sessions are published as a calendar
 * and subscribed to instead of pushed anywhere.
 *
 * What is worth testing here is not "does it emit iCal". It is the two things
 * that would be wrong in a way nobody notices: a cancelled session that
 * disappears instead of showing as free, and a file a calendar client silently
 * refuses to parse.
 */

const NOW = new Date("2026-08-24T14:00:00.000Z");

const ev = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  appointment_id: "11111111-2222-3333-4444-555555555555",
  starts_at: "2026-08-25T14:00:00.000Z",
  ends_at: "2026-08-25T15:00:00.000Z",
  cancelled: false,
  display_name: "Robert Miller",
  updated_at: "2026-08-24T13:00:00.000Z",
  ...over,
});

function build(events: FeedEvent[]) {
  return buildSessionFeed({ events, calendarName: "Dustin — Client Sessions", now: NOW });
}

test("a booked session is the client's name, and it blocks the slot", () => {
  const ics = build([ev()]);
  assert.match(ics, /SUMMARY:Robert Miller\r\n/);
  assert.match(ics, /TRANSP:OPAQUE/);
  assert.match(ics, /DTSTART:20260825T140000Z/);
  assert.match(ics, /DTEND:20260825T150000Z/);
});

test("a cancelled session stays visible, marked, and reads as free", () => {
  // The whole point of keeping it. Another trainer needs to know the slot
  // exists and just came open — an event that vanishes tells them nothing, and
  // one that still says "busy" tells them something false.
  const ics = build([ev({ cancelled: true })]);
  assert.match(ics, /SUMMARY:CANCELLED — Robert Miller/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
});

test("cancelled is never STATUS:CANCELLED, which is what hides it", () => {
  // Google and Apple strike through or drop STATUS:CANCELLED events. Using it
  // would look correct in the file and delete the feature on screen.
  const ics = build([ev({ cancelled: true })]);
  assert.doesNotMatch(ics, /STATUS:CANCELLED/);
  assert.match(ics, /STATUS:CONFIRMED/);
});

test("the UID is the appointment, so an edit updates rather than duplicates", () => {
  const a = build([ev({ starts_at: "2026-08-25T14:00:00.000Z" })]);
  const b = build([ev({ starts_at: "2026-08-25T16:00:00.000Z" })]);
  const uid = /UID:(.+)\r\n/.exec(a)![1];
  assert.equal(uid, /UID:(.+)\r\n/.exec(b)![1]);
  assert.match(uid, /^11111111-2222-3333-4444-555555555555@/);
});

test("a name with a comma or semicolon does not break the file", () => {
  // Unescaped, a comma ends the property value and the rest of the name becomes
  // a second value — the event parses, with half a name on it.
  const ics = build([ev({ display_name: "Ruiz-Schnitzler, Krysta; PT" })]);
  assert.match(ics, /SUMMARY:Ruiz-Schnitzler\\, Krysta\\; PT/);
});

test("every line ends CRLF and the calendar is closed", () => {
  const ics = build([ev(), ev({ appointment_id: "aaaa", cancelled: true })]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  const bare = ics.split("\r\n").filter(Boolean);
  assert.equal(bare.filter((l) => l === "BEGIN:VEVENT").length, 2);
  assert.equal(bare.filter((l) => l === "END:VEVENT").length, 2);
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/, "a bare LF anywhere is a malformed file");
});

test("an empty diary is still a valid calendar, not an error", () => {
  // A trainer on holiday must not look like a broken subscription.
  const ics = build([]);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});

// ── folding ──────────────────────────────────────────────────────────────────

test("a long line folds at 75 octets with a leading space", () => {
  const line = "SUMMARY:" + "a".repeat(200);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 75, `line too long: ${part.length}`);
  }
  assert.match(folded, /\r\n /);
  // Unfolding must give the original back exactly.
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("folding counts octets, not characters, and never splits one in half", () => {
  // The reason this is not a substring(0, 75): "é" and "—" are two and three
  // bytes. Cutting mid-sequence hands the subscriber a replacement character
  // where a client's name should be, and the file still parses.
  const line = "SUMMARY:" + "é".repeat(60) + "—".repeat(20);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 75);
  }
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.doesNotMatch(folded, /�/, "a character was split across the fold");
});

test("a short line is left alone", () => {
  assert.equal(foldLine("SUMMARY:Robert Miller"), "SUMMARY:Robert Miller");
});

test("timestamps are UTC basic form", () => {
  assert.equal(icsStamp("2026-08-25T14:05:09.123Z"), "20260825T140509Z");
});
