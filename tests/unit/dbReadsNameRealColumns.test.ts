// A READ MUST NAME REAL COLUMNS TOO.
//
// The fourth check on the same surface. The other three all guard WRITES:
//
//   dbWrites.test.ts                 every key you write is a real COLUMN
//   dbCheckConstraintValues.test.ts  every literal is a legal VALUE
//   dbInsertsSupplyRequiredColumns   every REQUIRED column is present
//
// Nothing guarded reads, and on 22 Aug that cost every client their schedule.
//
// `src/app/(app)/workout/page.tsx` asked for the newest active assignment with
// `.select("program_id, created_at, …").order("created_at")`. There is no
// `created_at` on `program_assignments` — the column is `assigned_at`.
// PostgREST rejects the whole request for naming a column that does not exist,
// supabase-js returns `{ data: null, error }`, the call site read `data || []`,
// and the page concluded the client had no programme. So EVERY client, on any
// day with nothing scheduled, got "No program assigned — contact your trainer",
// which is also the one branch that rendered no week strip and no schedule
// board. They could not reach their own schedule at all.
//
// It survived review, the type checker (the Supabase client is typed `any`) and
// ~2100 tests, for the same reason the write bugs did: a silently-null query and
// a client with genuinely no programme render identically. Dustin found it by
// opening the app on a rest day.
//
// The fixture is the same one dbWrites uses, so it stays current with the
// schema for free. Regenerate per the instructions in dbWrites.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const SCHEMA: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/db-schema.json"), "utf8"),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Comments stripped first. `ReminderEditor` explains in prose that it REMOVED
 * an `.ilike("status", …)` filter, and a scanner that reads comments reports
 * the explanation as the bug.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
}

/**
 * The method chain that actually belongs to one `.from("t")`.
 *
 * The first version of this bounded each chain at the NEXT `.from(`, which
 * swallowed everything in between and blamed one table for filters belonging to
 * code further down — six false reports out of eight. A chain is
 * `.from("t")` followed by consecutive `.name( … )` calls separated by nothing
 * but whitespace, so it is walked exactly, with balanced parens and string
 * literals respected.
 */
function chainBody(src: string, from: number): string {
  let i = from;
  const end = src.length;
  for (;;) {
    while (i < end && /\s/.test(src[i])) i++;
    if (src[i] !== ".") break;
    let j = i + 1;
    while (j < end && /[a-zA-Z0-9_]/.test(src[j])) j++;
    if (src[j] !== "(") break;
    // Balanced scan to the matching ")", skipping string and template bodies.
    let depth = 0;
    let k = j;
    let quote = "";
    for (; k < end; k++) {
      const ch = src[k];
      if (quote) {
        if (ch === "\\") k++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") { depth--; if (depth === 0) break; }
    }
    if (k >= end) break;
    i = k + 1;
  }
  return src.slice(from, i);
}

function chains(src: string): { table: string; body: string; index: number }[] {
  const out: { table: string; body: string; index: number }[] = [];
  const re = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    out.push({ table: m[1], body: chainBody(src, start), index: m.index });
  }
  return out;
}

const lineOf = (src: string, i: number) => src.slice(0, i).split("\n").length;

// Columns named in an .order()/.eq()/.neq()/.gt()/.gte()/.lt()/.lte()/.is()
// call — always a bare identifier, never an embedded resource, so these can be
// checked without understanding PostgREST's nesting rules.
const FILTERS = /\.(order|eq|neq|gt|gte|lt|lte|is|in|ilike|like)\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;

/**
 * Filters whose "column" is legitimately not one, with the reason. An
 * exemption you have to write a sentence for is one you notice being wrong.
 */
const ALLOWED: Record<string, string> = {
  // PostgREST lets you filter on an embedded resource's column with dotted
  // syntax; the regex above only matches bare identifiers, so nothing dotted
  // reaches here. Left as the place to record one if it ever does.
};

test("every column a read filters or orders on exists on that table", () => {
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const src = code(fs.readFileSync(file, "utf8"));
    for (const { table, body, index } of chains(src)) {
      const cols = SCHEMA[table];
      if (!cols) continue; // not in the fixture — dbWrites documents why
      let f: RegExpExecArray | null;
      FILTERS.lastIndex = 0;
      while ((f = FILTERS.exec(body))) {
        const col = f[2];
        if (cols.includes(col)) continue;
        if (ALLOWED[`${table}.${col}`]) continue;
        const rel = path.relative(ROOT, file);
        bad.push(`${rel}:${lineOf(src, index)}  .${f[1]}("${col}") — no such column on ${table}`);
      }
    }
  }
  assert.deepEqual(
    bad, [],
    "PostgREST rejects the whole request for these, so the query returns null and the " +
    "caller reads it as 'no rows' — a silent, total failure:\n  " + bad.join("\n  "),
  );
});

test("every column a read selects exists on that table", () => {
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const src = code(fs.readFileSync(file, "utf8"));
    for (const { table, body, index } of chains(src)) {
      const cols = SCHEMA[table];
      if (!cols) continue;
      const sel = /\.select\(\s*["'`]([^"'`]*)["'`]/.exec(body);
      if (!sel) continue;
      // `.select(`... ${COLUMN[metric]} ...`)` — the column is chosen at run
      // time from a lookup table. Nothing static can check it; saying so here
      // is better than a permanent false report.
      if (sel[1].includes("${")) continue;
      // Strip embedded resources — `days(label)`, `programs(name, phases(...))`.
      // Those name OTHER tables' columns and are checked when that table's own
      // chain is. Balanced-paren strip so nesting does not leak.
      let flat = "";
      let depth = 0;
      for (const ch of sel[1]) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (depth === 0) flat += ch;
      }
      // Whatever preceded a stripped "(...)" is the relation name, not a column.
      // `program_assignments!left(...)`, `coach:trainers(...)` — the name in
      // front of the paren is a RELATION, and PostgREST allows a !hint and an
      // alias on it. Strip both before comparing.
      const relations = new Set((sel[1].match(/([a-zA-Z0-9_!]+)\s*\(/g) || [])
        .map((r) => r.replace(/\s*\($/, "").split("!")[0]));
      for (const raw of flat.split(",")) {
        const col = raw.trim().replace(/^.*:/, "").split("!")[0]; // alias:column, column!hint
        if (!col || col === "*" || col.includes(".")) continue;
        if (relations.has(col)) continue;
        if (cols.includes(col)) continue;
        if (ALLOWED[`${table}.${col}`]) continue;
        const rel = path.relative(ROOT, file);
        bad.push(`${rel}:${lineOf(src, index)}  .select(… "${col}" …) — no such column on ${table}`);
      }
    }
  }
  assert.deepEqual(bad, [], "these selects fail outright and return null:\n  " + bad.join("\n  "));
});

// Guards the guard, the way dbWrites does: a fixture truncated to a handful of
// tables would make both tests above pass by checking nothing.
test("the schema fixture still covers the tables this app reads", () => {
  assert.ok(Object.keys(SCHEMA).length > 80, "db-schema.json looks truncated");
  for (const t of ["program_assignments", "scheduled_workouts", "clients", "trainers"]) {
    assert.ok(SCHEMA[t]?.length, `${t} missing from the schema fixture`);
  }
  assert.ok(!SCHEMA.program_assignments.includes("created_at"),
    "if program_assignments ever gains created_at, the 22 Aug bug stops being a bug and this note should go");
});
