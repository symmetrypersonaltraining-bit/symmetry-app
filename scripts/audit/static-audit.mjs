#!/usr/bin/env node
/**
 * THE STATIC HALF OF THE AUDIT — faults you can find without a database.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Dustin, 27 Aug 2026: "These are the types of mistakes that could completely
 * destroy the success of this app ... it should have been tested somehow."
 *
 * On the morning every one of the following was broken, 2,500 unit tests were
 * green:
 *
 *   - "Thomas bagel" found nothing, with nine Thomas' products in the table
 *   - every AI-added food arrived as "100 g" because nothing read
 *     serving_options, populated on 574,515 of 574,650 rows
 *   - the dismiss button on Today's Admin had never worked ONCE
 *   - the Payments header could not report an overdue payment
 *
 * They passed because they assert THAT SOURCE CODE CONTAINS A STRING.
 * `assert.match(CODE, /rpc\("dismiss_admin_row"/)` passes whether or not that
 * RPC does anything. It is a spell-checker.
 *
 * So this file does NOT check for strings that should be present. It looks for
 * SHAPES THAT ARE KNOWN TO FAIL, each one drawn from a fault that actually
 * shipped. The live half — the part that runs real queries and asserts on the
 * answers — is supabase/audit/live_audit.sql, and it is the more important of
 * the two.
 *
 * Run:  node scripts/audit/static-audit.mjs
 * Exit: 0 clean, 1 if anything is flagged.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules" && e !== ".next") walk(p); }
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})(join(ROOT, "src"));

/**
 * COMMENTS OUT, BEFORE ANY RULE RUNS.
 *
 * This codebase documents each bug next to the fix, quoting the broken code
 * verbatim so nobody reinstates it. Read raw, those notes are indistinguishable
 * from the faults they warn about — the first run of this file reported four
 * `.limit(5000)` findings, and all four were comments explaining that
 * `.limit(5000)` does not work.
 *
 * An audit that cries wolf gets ignored, which is worse than no audit. Line
 * numbers are preserved so a finding still points at the right line.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));

const findings = [];
const flag = (severity, rule, file, line, detail) =>
  findings.push({ severity, rule, where: `${relative(ROOT, file)}:${line}`, detail });
const lineOf = (s, i) => s.slice(0, i).split("\n").length;

/**
 * Tables big enough that PostgREST's 1,000-row cap silently truncates them.
 * Update from: select relname, n_live_tup from pg_stat_user_tables order by 2 desc
 */
const BIG_TABLES = {
  food_catalog: 574650, prescribed_exercises: 10866, set_logs: 10779,
  messages: 9999, scheduled_workouts: 5687, appointments: 4389, sections: 3369,
  meal_adherence_logs: 2068, schedule_change_proposals: 2045, meal_items: 1821,
  ai_usage_log: 1545, days: 1167, workout_logs: 1144,
};

for (const file of files) {
  const s = stripComments(readFileSync(file, "utf8"));
  const paged = s.includes("fetchAllRows");

  // ── RULE 1: a read of a big table with no filter and no usable limit ──────
  // PostgREST caps every response at 1,000 rows whatever .limit() says, and
  // returns no error. The Workout Library reads 10,866 prescribed exercises to
  // count them per day; 9% arrive and the counts on screen are simply wrong.
  for (const m of s.matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g)) {
    const tbl = m[1];
    if (!BIG_TABLES[tbl] || paged) continue;
    const chunk = s.slice(m.index, m.index + 700);
    const first = chunk.match(/\.from\([^)]*\)\s*\.\s*(\w+)/);
    if (!first || first[1] !== "select") continue;      // a write, not a read
    if (chunk.includes("head: true")) continue;          // a count
    if (/\.(single|maybeSingle)\(/.test(chunk)) continue;
    const lim = chunk.match(/\.limit\((\d+)\)/);
    if (lim && Number(lim[1]) <= 1000) continue;
    if (/\.(eq|in|gte|lte|gt|lt|or|is|not|contains|overlaps)\(/.test(chunk)) continue;
    flag("high", "read-can-truncate", file, lineOf(s, m.index),
      `${tbl} has ~${BIG_TABLES[tbl]} rows; this read is unfiltered and unpaged, so it stops at 1,000 with no error`);
  }

  // ── RULE 2: a .limit() above the cap, which is a lie ──────────────────────
  for (const m of s.matchAll(/\.limit\((\d{4,})\)/g)) {
    if (Number(m[1]) > 1000) {
      flag("high", "limit-above-cap", file, lineOf(s, m.index),
        `.limit(${m[1]}) — PostgREST returns at most 1,000 rows regardless, so this bounds nothing`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const order = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.where.localeCompare(b.where));
if (!findings.length) {
  console.log("static audit: clean");
  process.exit(0);
}
console.log(`static audit: ${findings.length} finding(s)\n`);
for (const f of findings) console.log(`  [${f.severity}] ${f.rule}\n    ${f.where}\n    ${f.detail}\n`);
process.exit(1);
