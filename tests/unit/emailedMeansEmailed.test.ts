// The payments screen said nobody had been emailed.
//
// It read `sms_sent_at` and called the result `emailSentAt`. Nothing in the app
// has ever written `sms_sent_at` — 0 rows of 52 carry one, against 30 that
// carry `email_sent_at` — so the "emailed" line was blank for every client who
// had in fact been emailed. Home reads the right column and showed it, so the
// two screens contradicted each other about the same invoice.
//
// This is a column-name confusion, and the only thing that can catch it is
// reading the source: there is no function to call, the mapping is inline in a
// server component. So that is what this asserts, and it says so plainly rather
// than dressing itself up as a behavioural test.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const SURFACES = [
  "src/app/(app)/payments/page.tsx",
  "src/app/(app)/home/page.tsx",
];

test("no screen calls sms_sent_at an email", () => {
  for (const f of SURFACES) {
    const src = read(f);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/emailSentAt/.test(line) && /sms_sent_at/.test(line)) {
        assert.fail(f + ":" + (i + 1) + " maps emailSentAt from sms_sent_at: " + line.trim());
      }
    });
  }
});

test("every screen showing an email timestamp reads the same column", () => {
  const cols = new Set<string>();
  for (const f of SURFACES) {
    for (const line of read(f).split("\n")) {
      const m = line.match(/emailSentAt:\s*[\w.?]*?\.?(\w*sent_at)/);
      if (m) cols.add(m[1]);
    }
  }
  assert.deepEqual([...cols], ["email_sent_at"],
    "screens disagree about which column means 'we emailed them': " + [...cols].join(", "));
});

test("the payments query actually selects the column it renders", () => {
  const src = read("src/app/(app)/payments/page.tsx");
  const select = src.match(/\.select\("id, client_id, due_date[^"]*"\)/)?.[0] ?? "";
  assert.match(select, /email_sent_at/, "the column is rendered but never fetched");
});
