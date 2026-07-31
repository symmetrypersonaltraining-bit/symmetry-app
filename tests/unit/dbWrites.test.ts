import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Every Supabase write in src/ is checked against the real column list.
 *
 * This exists because three separate live bugs were all the same mistake —
 * writing a key that is not a column:
 *
 *   - ai_usage_log.model      → EVERY logUsage() insert failed with PGRST204, so
 *                               the table sat at 0 rows. The $95/month kill
 *                               switch could never trip and every per-client
 *                               daily AI cap read "0 used" forever.
 *   - payment_reminders.client_name → markClientPaid() deleted the current
 *                               reminder and then failed to write next month's,
 *                               silently wiping a client's billing schedule.
 *   - program_assignments.start_date → assigning a program left the client with
 *                               no active assignment.
 *
 * PostgREST rejects the whole statement on an unknown column, so one stray key
 * kills the entire write. Where the caller ignores the error object — which is
 * most places — it fails completely silently. A type checker cannot see it:
 * the client is typed `any`. So it gets caught here instead.
 *
 * Regenerate tests/fixtures/db-schema.json after a migration:
 *   select json_object_agg(table_name, cols) from (
 *     select table_name, json_agg(column_name order by ordinal_position) cols
 *     from information_schema.columns where table_schema='public'
 *     group by table_name) t;
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const SCHEMA: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/db-schema.json"), "utf8"),
);

/**
 * Tables whose migration is written but not yet applied to the live project.
 * They are legitimately absent from the snapshot, so writes to them are not
 * failures — but they must not be forgotten either, hence the explicit list.
 */
const PENDING_TABLES = new Set(["movement_assessments"]);

// ---- a very small JS scanner ------------------------------------------------
// Enough to find `.from("t")....insert({...})` and pull the top-level keys.
// It is deliberately conservative: anything it cannot read confidently it skips
// rather than reporting a false failure.

function stripComments(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") { out += "  "; i += 2; continue; }
        out += s[i];
        if (s[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        out += s[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Index of the `}` closing the `{` at `start`, or -1. */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < s.length) {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/** Top-level keys of an object literal body. Spreads and computed keys skipped. */
function topLevelKeys(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < body.length) {
        if (body[i] === "\\") { i += 2; continue; }
        if (body[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
    i++;
  }
  parts.push(body.slice(start));

  const keys: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p || p.startsWith("...")) continue;
    const m = /^(?:"([^"]+)"|'([^']+)'|\[([^\]]*)\]|([A-Za-z_$][\w$]*))\s*:/.exec(p);
    if (m) {
      if (m[3] !== undefined) continue; // computed key — can't resolve statically
      keys.push(m[1] || m[2] || m[4]);
      continue;
    }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(p);
    if (shorthand) keys.push(shorthand[1]);
  }
  return keys;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

interface Offence { file: string; line: number; table: string; op: string; keys: string[] }

function scan(): { offences: Offence[]; writes: number } {
  const offences: Offence[] = [];
  let writes = 0;
  for (const file of sourceFiles(SRC)) {
    const raw = fs.readFileSync(file, "utf8");
    const src = stripComments(raw);
    const fromRe = /\.from\(\s*["'](\w+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src))) {
      const table = m[1];
      const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 4000);
      const opM = /\.(insert|update|upsert)\s*\(/.exec(tail);
      if (!opM) continue;
      const nextFrom = /\.from\(/.exec(tail);
      if (nextFrom && nextFrom.index < opM.index) continue; // chain belongs elsewhere

      let j = m.index + m[0].length + opM.index + opM[0].length;
      while (j < src.length && /[\s[]/.test(src[j])) j++;
      if (src[j] !== "{") continue; // a variable, not a literal — nothing to check
      const end = matchBrace(src, j);
      if (end < 0) continue;

      writes++;
      const keys = topLevelKeys(src.slice(j + 1, end));
      const cols = SCHEMA[table];
      if (!cols) {
        if (PENDING_TABLES.has(table)) continue;
        offences.push({ file, line: raw.slice(0, m.index).split("\n").length, table, op: opM[1], keys: ["<table not in schema>"] });
        continue;
      }
      const bad = keys.filter((k) => !cols.includes(k));
      if (bad.length) offences.push({ file, line: raw.slice(0, m.index).split("\n").length, table, op: opM[1], keys: bad });
    }
  }
  return { offences, writes };
}

test("every column written to Supabase actually exists", () => {
  const { offences, writes } = scan();
  assert.ok(writes > 50, `the scanner found only ${writes} writes — it has stopped matching, not the codebase that changed`);
  const report = offences
    .map((o) => `  ${path.relative(ROOT, o.file)}:${o.line}  ${o.op} ${o.table} → ${o.keys.join(", ")}`)
    .join("\n");
  assert.equal(offences.length, 0, `writes to columns that do not exist:\n${report}`);
});

test("the schema snapshot covers the tables the app writes to", () => {
  // Guards the guard: if the fixture were truncated to a handful of tables the
  // check above would still pass by simply skipping everything.
  for (const t of ["clients", "ai_usage_log", "payment_reminders", "program_assignments", "meal_adherence_logs", "scheduled_workouts"]) {
    assert.ok(Array.isArray(SCHEMA[t]) && SCHEMA[t].length > 0, `${t} missing from the schema snapshot`);
  }
  assert.ok(SCHEMA.ai_usage_log.includes("model"), "ai_usage_log.model must exist — logUsage() writes it on every AI call");
  assert.ok(SCHEMA.ai_usage_log.includes("used_on"), "ai_usage_log.used_on backs the daily/monthly spend rollups");
  assert.ok(!SCHEMA.program_assignments.includes("start_date"), "program_assignments has no start_date — the assignment date is assigned_at");
});
