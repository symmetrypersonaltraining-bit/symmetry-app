// TWO ROWS THAT COUNTED SOMETHING AND THEN DID NOT SHOW IT.
//
// 1. Dustin, 24 Aug: "'notes needing you' is opening to client list, not the
//    actual notes."
//
//    The reason is written in the app already. When "Needs your eyes" came off
//    Home on 21 Aug the note beside it said it was being replaced by "one
//    counted row in Today's Admin that links to it", and ClientNotesPanel was
//    left "in the repo, unmounted". Nothing was ever built for that row to link
//    to, so its href stayed /clients: it counted six notes and dropped him on
//    the roster.
//
// 2. Dustin, same morning: "i weight in and logged it at 196.2, that should
//    show on the chart but it does not."
//
//    `clients.current_weight` is a PROFILE column. The chart, every trend, the
//    celebration screen and the AI all read `metrics`. Typing a weight into the
//    box labelled "Weight (lbs)" wrote the profile column and nothing else, so
//    the number saved and the chart never moved. The integrity checker already
//    treats the two disagreeing as a fault — the app admitting an invariant it
//    never enforced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ADMIN = read("src/components/TodaysAdmin.tsx");
const NOTES_PAGE = "src/app/(app)/clients/notes/page.tsx";
const PROFILE = read("src/app/(app)/clients/[clientId]/ClientProfileTabs.tsx");

// ── the notes row ──────────────────────────────────────────────────────────

test("the notes row opens the notes", () => {
  const i = ADMIN.indexOf('title: "Client notes needing you"');
  assert.ok(i > 0, "the row has moved");
  const row = ADMIN.slice(i, i + 1400);
  assert.match(row, /href: "\/clients\/notes"/, "it still drops him on the roster");
});

test("that page exists and is a trainer page", () => {
  assert.ok(existsSync(join(ROOT, NOTES_PAGE)), "the row links to a page that was never built");
  const page = read(NOTES_PAGE);
  assert.match(page, /viewerIsTrainer\(supabase, user\)/);
  assert.match(page, /redirect\("\/home"\)/);
});

test("the page counts the same notes the row counts", () => {
  // If the counter says six and the page shows nine, the count is a lie and the
  // page answers a different question.
  const page = read(NOTES_PAGE);
  const grab = (src: string) => {
    const m = src.match(/const ROUTINE = (\/.*\/i);/);
    return m ? m[1] : null;
  };
  const a = grab(ADMIN);
  const b = grab(page);
  assert.ok(a && b, "one of them no longer declares ROUTINE");
  assert.equal(b, a, "the two filters have drifted — the count and the list disagree");
});

test("symptoms are first, by the same words that decide an interrupt", () => {
  const page = read(NOTES_PAGE);
  assert.match(page, /pain\|hurt\|sore\|afraid\|burn\|crack\|swell/);
  assert.match(page, /if \(a\.isSymptom !== b\.isSymptom\) return a\.isSymptom \? -1 : 1;/);
});

test("the page shows all of them, not three behind a tap", () => {
  const page = read(NOTES_PAGE);
  assert.match(page, /showAllByDefault/, "the page would hide what he came for behind 'show more'");
  const panel = read("src/components/ClientNotesPanel.tsx");
  assert.match(panel, /showAllByDefault = false/, "Home must keep the three-at-a-time preview");
  assert.match(panel, /useState\(showAllByDefault\)/);
});

test("it does not go back on Home", () => {
  // The reason it came off stands: 63 notes was taller than the phone and
  // buried a back injury under twelve pull-up weights.
  const home = read("src/app/(app)/home/page.tsx");
  const mounted = home.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  assert.ok(!mounted.some((l) => /<ClientNotesPanel/.test(l)), "the wall is back on Home");
});

// ── the weigh-in ───────────────────────────────────────────────────────────

test("typing a weight on the profile records a weigh-in", () => {
  assert.match(PROFILE, /from\("metrics"\)\.upsert\(/, "the profile still writes only the profile column");
  assert.match(PROFILE, /onConflict: "client_id,metric_date"/, "twice in one day would make two entries");
});

test("it only fires when the number actually changed", () => {
  // Re-saving a phone number must not stamp today with a months-old weight and
  // flatten the chart.
  assert.match(PROFILE, /w !== \(client\.current_weight \?\? null\)/);
  assert.match(PROFILE, /bf !== \(client\.current_body_fat_pct \?\? null\)/);
  assert.match(PROFILE, /if \(changedW \|\| changedBf\)/);
});

test("the source is one the column actually accepts", () => {
  // 'client_app' was rejected by metrics_source_check and the client weigh-in
  // form failed silently for weeks because of it. The vocabulary the column has
  // held is caliper / claude / client / migration / trainer_backfill.
  const i = PROFILE.indexOf('from("metrics").upsert(');
  const block = PROFILE.slice(i, i + 900);
  assert.match(block, /source: "trainer_backfill"/);
  assert.ok(!/source: "trainer"/.test(block), "'trainer' is not in the check constraint");
});

test("lean and fat move with the weigh-in", () => {
  assert.match(PROFILE, /lean_mass: weight != null && pct != null \? weight \* \(1 - pct \/ 100\) : null/);
  assert.match(PROFILE, /fat_mass: weight != null && pct != null \? weight \* \(pct \/ 100\) : null/);
});

test("a weigh-in that did not record says so", () => {
  // Indistinguishable from plain success is how a weight goes in and never
  // reaches the chart — which is the whole fault being fixed.
  assert.match(PROFILE, /profile saved, but the weigh-in did not record/);
  assert.match(PROFILE, /saved \+ logged today's weigh-in/);
  assert.match(PROFILE, /const bad = saveMsg === "error" \|\| saveMsg\.includes\("did not record"\);/);
});

test("the field says what it does", () => {
  assert.match(PROFILE, /Weight \(lbs\) \\u2014 logs a weigh-in/);
});
