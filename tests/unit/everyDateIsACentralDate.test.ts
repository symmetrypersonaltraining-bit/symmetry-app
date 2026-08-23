// EVERY DATE IN THIS APP IS A CENTRAL DATE.
//
// Dustin, 22 Aug: "the wrong workout date is an issue. this must be fixed to be
// accurate. everything in th eentire app needs to go by the actual calendar in
// the timezone we are in and must be accurate."
//
// An audit that day found 31 places where a date could come out a day wrong.
// Three shapes caused all of them:
//
//   1. `new Date(created_at).toLocaleDateString(...)` with no timeZone —
//      renders in whatever zone the READER is in. The same assessment printed
//      two different dates on two tabs of one client profile.
//   2. `new Date().toISOString().slice(0,10)` as "today" — that is the UTC
//      date, so from 19:00 Central it is already tomorrow. On the server, which
//      runs UTC, that is every evening.
//   3. `new Date().getDay()` / `.getDate()` to decide the week or the day —
//      the device's weekday, so a Saturday evening rolled the whole view into
//      next week.
//
// None of the three is visible in review: they are correct in Central during
// the day, on the developer's machine, and in every test that does not pin TZ.
// They surface at 7pm, or on a client who travelled. So they get caught here.
//
// The allowlist below is deliberately short and every entry states WHY that
// site is safe. Adding to it should feel like it needs a reason.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/** Files exempt from all rules, with the reason. */
const EXEMPT: Record<string, string> = {
  "src/lib/central-time.ts": "the implementation — it is where the zone lives",
};

/** Specific `file:snippet` pairs that are safe, each with its reason. */
const ALLOW: Array<{ file: string; contains: string; why: string }> = [
  {
    file: "src/app/(app)/home/TrainerCalendar.tsx",
    contains: "function dayStr(d: Date)",
    why: "keys a SYNTHETIC local-midnight anchor, where the local parts are the intended date; real instants go through apptDayStr",
  },
  {
    file: "src/app/(app)/clients/[clientId]/ClientProfileTabs.tsx",
    contains: "function addMonths(",
    why: "pure string arithmetic on YYYY-MM-01, no Date is read",
  },
  {
    file: "src/app/(app)/payments/PaymentsClient.tsx",
    contains: "function addMonthsToDate(",
    why: "pure string arithmetic; the Date.UTC call only counts days in a month",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Strip comments and template-literal-free string bodies so prose cannot trip a rule. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = walk(SRC).map((abs) => {
  const rel = path.relative(ROOT, abs);
  return { rel, code: stripComments(fs.readFileSync(abs, "utf8")) };
}).filter((f) => !EXEMPT[f.rel]);

function violations(re: RegExp): string[] {
  const found: string[] = [];
  for (const { rel, code } of FILES) {
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      if (ALLOW.some((a) => a.file === rel && code.includes(a.contains) && line.includes(a.contains.replace("function ", "")))) return;
      found.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  return found;
}

test("nothing derives today from the UTC date", () => {
  // `new Date().toISOString().slice(0,10)` and friends. Correct for ~19 hours a
  // day, tomorrow for the other five.
  const bad = violations(/new Date\(\)\s*\.toISOString\(\)\s*\.(slice\(\s*0\s*,\s*10\s*\)|split\()/);
  assert.deepEqual(bad, [], `use centralToday() instead:\n  ${bad.join("\n  ")}`);
});

test("nothing reads the weekday or day-of-month off `new Date()`", () => {
  const bad = violations(/new Date\(\)\s*\.get(Day|Date|Month|FullYear|Hours)\(\)/);
  assert.deepEqual(
    bad,
    [],
    `use centralToday() / centralDayOfWeek() / centralWeekStart() / centralHour():\n  ${bad.join("\n  ")}`,
  );
});

test("no locale formatter renders a date without a timeZone", () => {
  // toLocaleDateString / toLocaleTimeString, and toLocaleString when its
  // options actually name a date field — `(1234.5).toLocaleString("en-US")` is
  // money, not a date, and must not be dragged in here.
  //
  // The one shape that passes without a timeZone is the local-midnight round
  // trip, `new Date(d + "T00:00:00").toLocaleDateString(...)`: the parse and
  // the render are both in the viewer's zone, so they cancel and the intended
  // calendar date comes out. It is self-consistent rather than correct, and
  // centralFormatDate is better, but it is not a bug and there are ~25 of them.
  const DATE_FIELD = /weekday|month|day|year|hour|minute|second|dateStyle|timeStyle/;
  const bad: string[] = [];
  for (const { rel, code } of FILES) {
    const re = /\.toLocale(Date|Time)?String\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      let i = re.lastIndex, depth = 1;
      while (i < code.length && depth > 0) {
        if (code[i] === "(") depth++;
        else if (code[i] === ")") depth--;
        i++;
      }
      const args = code.slice(re.lastIndex, i - 1);
      if (/timeZone/.test(args)) continue;
      // Plain toLocaleString with no date field in its options is number or
      // currency formatting.
      if (!m[1] && !DATE_FIELD.test(args)) continue;
      // The local-midnight round trip.
      const before = code.slice(Math.max(0, m.index - 140), m.index);
      if (/new Date\([^()]*\+\s*"T(00:00:00|12:00:00)"\s*\)$/.test(before.trimEnd())) continue;
      const line = code.slice(0, m.index).split("\n").length;
      bad.push(`${rel}:${line}  ${code.slice(Math.max(0, m.index - 40), i).replace(/\s+/g, " ").trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    `pass timeZone, or use centralFormat() / centralFormatDate():\n  ${bad.join("\n  ")}`,
  );
});

test("nothing round-trips a formatted Central string back through Date", () => {
  // `new Date(new Date().toLocaleString("en-US", { timeZone: ... }))` gives the
  // right hour and the WRONG instant, and relies on Date parsing a non-ISO
  // en-US string, which is implementation-defined.
  const bad = violations(/new Date\(\s*\w*\.?toLocaleString\(/);
  assert.deepEqual(bad, [], `use centralHour() / centralToday():\n  ${bad.join("\n  ")}`);
});

test("the allowlist is short, and every entry says why", () => {
  assert.ok(ALLOW.length <= 6, "if this is growing, the helper is missing a case");
  for (const a of ALLOW) assert.ok(a.why.length > 20, `${a.file} needs a real reason`);
  for (const k of Object.keys(EXEMPT)) assert.ok(fs.existsSync(path.join(ROOT, k)), `${k} no longer exists`);
});

test("the Central-today idiom does not spread any further", () => {
  // `new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })`
  // is copied verbatim into 73 files. Every copy is CORRECT — that is the
  // point, and it is why they are not being rewritten: converting 99 correct
  // call sites unreviewed is how a bug gets introduced where none existed.
  //
  // What the copying cost is elsewhere: the pattern spread by being copied
  // rather than imported, so the handful of places that did NOT copy it had no
  // anchor to copy FROM, and those were most of the 31 faults. A ceiling stops
  // it spreading further without touching a line that already works. New code
  // imports centralToday(); if this number goes UP, somebody copied again.
  const CEILING = 99;
  let n = 0;
  for (const { rel, code } of FILES) {
    if (rel === "src/lib/central-time.ts") continue;
    n += (code.match(/toLocaleDateString\(\s*["']en-CA["']\s*,\s*\{\s*timeZone:\s*["']America\/Chicago["']\s*\}\s*\)/g) || []).length;
  }
  assert.ok(
    n <= CEILING,
    `${n} hand-rolled copies of centralToday(), ceiling is ${CEILING}. Import centralToday() from @/lib/central-time instead of copying the idiom again.`,
  );
});
