import test from "node:test";
import assert from "node:assert/strict";
import { accessDecision, accessHasEnded, GRACE_DAYS } from "../../src/lib/access/archivedAccess.ts";

/**
 * AN ARCHIVED CLIENT LOSES THE APP 30 DAYS AFTER THEIR LAST PAYMENT.
 *
 * Dustin's rule, 9 Sep 2026. The cases below are the real ones — every date
 * here came off the live database on the night the rule was written, because a
 * rule about cutting real people off is not a place for invented examples.
 */

const BOBBIE = { archivedAt: "2026-08-31T11:40:00.139022+00:00", lastPaidDueDate: "2026-08-01", overrideUntil: null };

test("the rule is last paid due_date plus thirty days", () => {
  const d = accessDecision(BOBBIE, "2026-09-09");
  assert.equal(d.endsOn, "2026-08-31", "1 Aug + 30 days is 31 Aug");
  assert.equal(d.basis, "last-paid");
});

test("thirty is his number and it is not inlined anywhere else", () => {
  assert.equal(GRACE_DAYS, 30);
});

test("an active client is never in scope, whatever their payment history", () => {
  // The job filters on archived_at, but the rule has to be safe on its own —
  // this is the single most expensive thing to get wrong in this whole change.
  const active = { archivedAt: null, lastPaidDueDate: "2020-01-01", overrideUntil: null };
  const d = accessDecision(active, "2026-09-09");
  assert.equal(d.basis, "active");
  assert.equal(d.endsOn, null);
  assert.equal(d.shouldRevoke, false, "an active client must never be revoked, ever");
});

test("access ends the day AFTER endsOn, not on it", () => {
  // Off-by-one here takes a day of paid-for access off every client.
  assert.equal(accessHasEnded(BOBBIE, "2026-08-30"), false, "still inside the 30 days");
  assert.equal(accessHasEnded(BOBBIE, "2026-08-31"), false, "the last day is still theirs");
  assert.equal(accessHasEnded(BOBBIE, "2026-09-01"), true, "the day after is when it ends");
});

test("no paid invoice ever falls back to archived_at + 30", () => {
  // Jada Cook, Tania Millan and Brooke Reynolds are all in this state.
  const jada = { archivedAt: "2026-08-13T18:56:30.032221+00:00", lastPaidDueDate: null, overrideUntil: null };
  const d = accessDecision(jada, "2026-09-09");
  assert.equal(d.endsOn, "2026-09-12");
  assert.equal(d.basis, "archived-fallback");
  assert.equal(d.shouldRevoke, false, "still inside her thirty days on 9 Sep");
});

test("the archived_at fallback is read in Central, not UTC", () => {
  // Archived at 8pm Central = 01:00 UTC the NEXT day. Counting from the UTC
  // date hands out a free extra day, and this is the exact class of bug
  // CLAUDE.md names: "after 7pm Central the UTC date is already tomorrow".
  const eveningArchive = { archivedAt: "2026-08-13T01:00:00+00:00", lastPaidDueDate: null, overrideUntil: null };
  const d = accessDecision(eveningArchive, "2026-09-09");
  assert.equal(d.endsOn, "2026-09-11", "12 Aug Central + 30, not 13 Aug UTC + 30");
});

test("his override extends someone past the rule — Bobbie until 1 Oct", () => {
  // The live case. The rule would have cut her off on 31 Aug; he is giving her
  // until 1 Oct, and the job must not shorten that.
  const withOverride = { ...BOBBIE, overrideUntil: "2026-10-01" };
  const d = accessDecision(withOverride, "2026-09-09");
  assert.equal(d.endsOn, "2026-10-01");
  assert.equal(d.basis, "override");
  assert.equal(d.shouldRevoke, false, "9 Sep is inside her extension");
  assert.equal(accessHasEnded(withOverride, "2026-10-01"), false, "1 Oct is still hers");
  assert.equal(accessHasEnded(withOverride, "2026-10-02"), true, "2 Oct is when it ends");
});

test("an override EARLIER than the rule is ignored, never honoured", () => {
  // An override can only ever extend. A stale date left in that column must not
  // be able to end somebody's access sooner than the rule already would.
  const stale = { ...BOBBIE, overrideUntil: "2026-08-05" };
  const d = accessDecision(stale, "2026-09-09");
  assert.equal(d.endsOn, "2026-08-31", "the rule's date stands");
  assert.equal(d.basis, "last-paid");
});

test("the five who would go on the first run, and the three who would not", () => {
  // Read off the live database on 9 Sep. This is the diff Dustin gets to see
  // before the switch is turned on, pinned so it cannot change unnoticed.
  const roster = [
    { name: "Tina Haley",        archivedAt: "2026-08-13T03:00:16+00:00", lastPaidDueDate: "2026-07-12", overrideUntil: null, ends: "2026-08-11", go: true },
    { name: "Christine Latham",  archivedAt: "2026-08-31T23:42:02+00:00", lastPaidDueDate: "2026-07-22", overrideUntil: null, ends: "2026-08-21", go: true },
    // 00:23 UTC is 19:23 CENTRAL THE DAY BEFORE, so her thirty days run from
    // 31 July and not 1 Aug. A `select archived_at::date` says 1 Aug and is
    // wrong by a day — this row is CLAUDE.md's "after 7pm Central the UTC date
    // is already tomorrow" sitting in the live data, and the test is what found
    // it. Both dates are long past, so it changes nobody's outcome today; it
    // would change one the first time somebody is archived in the evening.
    { name: "Brooke Reynolds",   archivedAt: "2026-08-01T00:23:27+00:00", lastPaidDueDate: null,         overrideUntil: null, ends: "2026-08-30", go: true },
    { name: "Robert Miller",     archivedAt: "2026-09-01T11:40:00+00:00", lastPaidDueDate: "2026-08-01", overrideUntil: null, ends: "2026-08-31", go: true },
    { name: "Bobbie Page",       archivedAt: "2026-08-31T11:40:00+00:00", lastPaidDueDate: "2026-08-01", overrideUntil: null, ends: "2026-08-31", go: true },
    { name: "Jada Cook",         archivedAt: "2026-08-13T18:56:30+00:00", lastPaidDueDate: null,         overrideUntil: null, ends: "2026-09-12", go: false },
    { name: "Tania Millan",      archivedAt: "2026-08-13T18:56:30+00:00", lastPaidDueDate: null,         overrideUntil: null, ends: "2026-09-12", go: false },
    { name: "Test Client",       archivedAt: "2026-08-13T23:58:53+00:00", lastPaidDueDate: null,         overrideUntil: null, ends: "2026-09-12", go: false },
  ];
  for (const r of roster) {
    const d = accessDecision(r, "2026-09-09");
    assert.equal(d.endsOn, r.ends, `${r.name} ends on ${r.ends}`);
    assert.equal(d.shouldRevoke, r.go, `${r.name} revoke=${r.go} on 9 Sep`);
  }
  assert.equal(roster.filter((r) => r.go).length, 5, "five, not one — he only flagged Bobbie");
});

test("a date the rule cannot read never costs anyone their access", () => {
  // `new Date("2026-08-13T18:56:30+00")` is Invalid Date in Node — with a "T"
  // present the offset must be "+00:00" or "Z". PostgREST returns the long
  // form so this should not arrive, and it is handled anyway: this threw
  // RangeError out of the middle of the nightly loop until the tests caught it.
  const unreadable = { archivedAt: "2026-08-13T18:56:30.032221+00", lastPaidDueDate: null, overrideUntil: null };
  const d = accessDecision(unreadable, "2026-09-09");
  assert.equal(d.basis, "unreadable");
  assert.equal(d.shouldRevoke, false, "unreadable must fail SAFE — never revoke");
  assert.equal(d.endsOn, null);
});

test("Robert Miller's access ended BEFORE he was archived", () => {
  // Archived 1 Sep, last paid invoice due 1 Aug, so the rule's date is 31 Aug —
  // the day before he was archived at all. Taken literally, as it is here, he
  // gets no grace period whatsoever. It was built literally and put to Dustin
  // rather than quietly softened with a floor.
  //
  // RULED, 9 Sep: no floor. He quit, and being cut off on the first run is
  // correct. The route there is worth keeping, because it nearly went the other
  // way: he first said "Robert still trains, he's still paying" and the row was
  // unarchived, then "robert is archived i forgot he quit!!" and it was put
  // back from bak_robert_miller_unarchive_20260909. Neither the rule nor the
  // row needed changing. Check with him before adding a floor to this rule the
  // next time it looks harsh.
  const robert = { archivedAt: "2026-09-01T11:40:00+00:00", lastPaidDueDate: "2026-08-01", overrideUntil: null };
  const d = accessDecision(robert, "2026-09-09");
  assert.equal(d.endsOn, "2026-08-31");
  assert.ok(d.endsOn < "2026-09-01", "ends before archiving — zero days of grace");
  assert.equal(d.shouldRevoke, true);
});
