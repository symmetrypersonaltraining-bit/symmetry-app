import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * A STRING LITERAL WRITTEN INTO A CHECK-CONSTRAINED COLUMN MUST BE A VALUE THE
 * DATABASE ACCEPTS.
 *
 * dbWrites.test.ts already checks that every key you write is a real COLUMN.
 * This is the other half, and it cost a whole feature:
 *
 *   add_my_workout — the tool built on 14 Aug so the coach could put a second
 *   session on a day — inserted `source: "client"`. That is not one of the four
 *   values scheduled_workouts_source_check allows. EVERY call would have died
 *   with a 23514 the model dutifully reported back as "Couldn't add it: new row
 *   violates check constraint scheduled_workouts_source_check".
 *
 *   The tool was reachable, correctly gated, and right about position — the
 *   failure was the last field of the insert. It survived a code review, a
 *   typecheck, 989 tests and a shipped build, because it had never once been
 *   executed. It was found by running the insert against the real database
 *   inside a transaction that was then rolled back.
 *
 * The trap is specific and worth naming: `source` allows 'client' on
 * workout_logs, cardio_logs, daily_logs, meal_adherence_logs and metrics — but
 * NOT on scheduled_workouts, which wants 'client_self_assign'. Same column
 * name, five tables where the obvious value is right and one where it is
 * silently wrong. AddWorkoutButton had it right the whole time.
 *
 * Regenerate tests/fixtures/db-check-values.json after a migration:
 *   with c as (
 *     select rel.relname tbl,
 *            (regexp_match(pg_get_constraintdef(con.oid),'\(\(?([a-z_]+) = ANY'))[1] col,
 *            array(select trim(both '''' from regexp_replace(x,'::text','','g'))
 *                  from unnest(string_to_array(
 *                    (regexp_match(pg_get_constraintdef(con.oid),'ARRAY\[(.*)\]\)'))[1],', ')) x) vals
 *     from pg_constraint con
 *     join pg_class rel on rel.oid=con.conrelid
 *     join pg_namespace n on n.oid=rel.relnamespace
 *     where n.nspname='public' and con.contype='c'
 *       and pg_get_constraintdef(con.oid) like '%= ANY (ARRAY[%')
 *   select jsonb_pretty(jsonb_object_agg(tbl,cols)) from
 *     (select tbl, jsonb_object_agg(col,to_jsonb(vals)) cols from c
 *      where col is not null group by tbl) t;
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const ALLOWED: Record<string, Record<string, string[]>> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/db-check-values.json"), "utf8"),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(s: string): string {
  // Keep offsets stable so reported line numbers stay honest.
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      out += c; i++;
      while (i < s.length) {
        if (s[i] === "\\") { out += "  "; i += 2; continue; }
        out += s[i];
        if (s[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && s[i + 1] === "*") {
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { out += s[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2; continue;
    }
    out += c; i++;
  }
  return out;
}

type Finding = { file: string; line: number; table: string; column: string; value: string };

/**
 * Read the balanced `{...}` starting at `open`. Returns null if it never
 * closes inside `limit` characters — the scanner would rather see nothing than
 * guess at a boundary.
 */
function balancedObject(src: string, open: number, limit = 4000): string | null {
  if (src[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < Math.min(src.length, open + limit); i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

/**
 * Deliberately narrow, and tightened after a first pass produced eighteen
 * findings of which every one was noise.
 *
 * A fixed-size character window after `.from("t")` is wrong: chained Supabase
 * calls sit close together, so the window from one table's read swallowed the
 * NEXT table's write and reported `offplan_workout_logs.status = "skipped"` at
 * a line that actually writes scheduled_workouts. A test that cries wolf about
 * a live app is worse than no test.
 *
 * So: from each `.from("t")`, stop at the next `.from(`; inside that span find
 * the first insert/update/upsert; read its BALANCED object literal; and check
 * only the keys of that object. Writes assembled from a variable are not seen —
 * the goal is zero false failures, not total coverage. Every real instance of
 * this bug so far has been an inline literal.
 */
function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(SRC)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const fromRe = /\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src))) {
      const table = m[1];
      const cols = ALLOWED[table];
      if (!cols) continue;

      // This table's span ends where the next .from( begins.
      const nextFrom = src.slice(m.index + 1).search(/\.from\(\s*["'`]/);
      const spanEnd = nextFrom === -1 ? src.length : m.index + 1 + nextFrom;
      const span = src.slice(m.index, spanEnd);

      const w = span.search(/\.(insert|update|upsert)\(/);
      if (w === -1) continue;
      const objStart = span.indexOf("{", w);
      if (objStart === -1) continue;
      const obj = balancedObject(span, objStart);
      if (!obj) continue;

      for (const [col, vals] of Object.entries(cols)) {
        const kv = new RegExp(`(^|[{,\\s])${col}\\s*:\\s*["'\`]([^"'\`]*)["'\`]`, "g");
        let k: RegExpExecArray | null;
        while ((k = kv.exec(obj))) {
          const value = k[2];
          if (vals.includes(value)) continue;
          const at = m.index + objStart + k.index;
          findings.push({
            file: path.relative(ROOT, file),
            line: src.slice(0, at).split("\n").length,
            table, column: col, value,
          });
        }
      }
    }
  }
  return findings;
}

test("no write puts a value into a CHECK-constrained column that the database rejects", () => {
  const bad = scan();
  const report = bad
    .map((f) =>
      `${f.file}:${f.line}  ${f.table}.${f.column} = "${f.value}"  — allowed: ` +
      ALLOWED[f.table][f.column].map((v) => `"${v}"`).join(", "),
    )
    .join("\n");
  assert.deepEqual(
    bad,
    [],
    `these writes would be rejected by a CHECK constraint at runtime:\n\n${report}\n\n` +
      `Postgres rejects the whole statement (SQLSTATE 23514), so the write does not ` +
      `half-happen — it does not happen. Where the caller ignores the error, it fails ` +
      `silently; where it surfaces it, the user gets a constraint name as an error message.`,
  );
});

test("the fixture still describes the trap that caused this", () => {
  // If someone widens scheduled_workouts.source to include 'client', this test
  // is the reminder that the ORIGINAL bug becomes invisible again — and that
  // there would then be two spellings of the same thing in one column.
  assert.ok(
    !ALLOWED.scheduled_workouts.source.includes("client"),
    "scheduled_workouts.source now allows 'client' as well as 'client_self_assign'. " +
      "Pick one and migrate the rows — two spellings for 'the client asked for this' " +
      "means every query that filters on source is quietly half-right.",
  );
  assert.ok(
    ALLOWED.workout_logs.source.includes("client"),
    "workout_logs.source no longer allows 'client' — the asymmetry that caused the bug " +
      "has changed shape; re-read the writes before trusting this suite.",
  );
});
