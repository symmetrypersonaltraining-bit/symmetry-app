import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * AN INSERT MUST SUPPLY EVERY NOT-NULL COLUMN THAT HAS NO DEFAULT.
 *
 * The third of three checks on the same surface, and the three together are the
 * lesson from 14 Aug:
 *
 *   dbWrites.test.ts                 every key you write is a real COLUMN
 *   dbCheckConstraintValues.test.ts  every literal is a legal VALUE
 *   this file                        every REQUIRED column is present
 *
 * Six writes were found that day which had never once succeeded — all of them
 * the middle case, all of them confirmed by counting rows and finding zero.
 * None was caught by a type checker (the Supabase client is typed `any`), by
 * review, or by ~990 tests. Postgres rejects the whole statement on a 23502
 * exactly as it does on a 23514, and where the caller ignores the error — which
 * is most places — it fails in complete silence.
 *
 * Verified the way the others were: by running the statements against the real
 * database as a real client, under real RLS, inside a transaction ending in
 * RAISE so nothing commits.
 *
 * Regenerate tests/fixtures/db-required-columns.json after a migration:
 *   select table_name, json_agg(column_name order by ordinal_position)
 *   from information_schema.columns
 *   where table_schema='public' and is_nullable='NO'
 *     and column_default is null and is_identity='NO'
 *   group by table_name;
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const REQUIRED: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/db-required-columns.json"), "utf8"),
);

/**
 * Inserts whose required columns are genuinely supplied elsewhere, with the
 * reason. Listed rather than silently skipped — an exemption you have to write
 * a sentence for is one you notice being wrong.
 */
const KNOWN_GOOD = new Set<string>([
  // `days` rows are cloned server-side (phase_id/position copied from the
  // source row), never composed field-by-field in a client insert.
  "days",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(s: string): string {
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

type Finding = { file: string; line: number; table: string; missing: string[] };

/**
 * Only INSERTs — an update legitimately touches one column. Same narrow shape
 * as the CHECK-value scanner: stop at the next `.from(`, read the balanced
 * object literal, and skip anything built from a variable or a spread, because
 * zero false failures on a live app matters more than total coverage.
 */
function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(SRC)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const fromRe = /\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src))) {
      const table = m[1];
      const required = REQUIRED[table];
      if (!required || KNOWN_GOOD.has(table)) continue;

      const nextFrom = src.slice(m.index + 1).search(/\.from\(\s*["'`]/);
      const spanEnd = nextFrom === -1 ? src.length : m.index + 1 + nextFrom;
      const span = src.slice(m.index, spanEnd);

      const w = span.search(/\.insert\(/);
      if (w === -1) continue;

      // `.insert(rows)` / `.insert(payload)` — the argument is a variable or an
      // array built elsewhere. Skip it rather than hunting forward for the next
      // `{`, which is how the first pass "found" a missing column in every
      // messages insert in the app while messages were sending fine all day.
      const after = span.slice(w + ".insert(".length).trimStart();
      if (!after.startsWith("{")) continue;

      const objStart = span.indexOf("{", w);
      if (objStart === -1) continue;
      const obj = balancedObject(span, objStart);
      if (!obj) continue;
      // A spread could supply anything; don't guess.
      if (obj.includes("...")) continue;

      // `body,` and `{ message_id, user_id, emoji }` are ES6 shorthand and are
      // every bit as present as `body: body`. Missing this flagged eight real,
      // working inserts — the exact false-alarm failure that gets a test
      // deleted instead of fixed.
      const missing = required.filter(
        (col) => !new RegExp(`(^|[{,\\s])${col}\\s*(:|,|\\}|$)`).test(obj),
      );
      if (missing.length) {
        findings.push({
          file: path.relative(ROOT, file),
          line: src.slice(0, m.index + objStart).split("\n").length,
          table, missing,
        });
      }
    }
  }
  return findings;
}

test("every insert supplies the columns the database requires", () => {
  const bad = scan();
  const report = bad
    .map((f) => `${f.file}:${f.line}  ${f.table} is missing ${f.missing.map((c) => `"${c}"`).join(", ")}`)
    .join("\n");
  assert.deepEqual(
    bad,
    [],
    `these inserts omit a NOT NULL column that has no default:\n\n${report}\n\n` +
      `Postgres rejects the whole statement (SQLSTATE 23502). The row is not ` +
      `partially written — it is not written at all, and where the error object is ` +
      `ignored nothing anywhere reports it.`,
  );
});
