import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fetchAllRows, POSTGREST_MAX_ROWS } from "../../src/lib/fetchAllRows";

/**
 * THE 1,000-ROW CEILING, AND THE TEST THAT SHOULD HAVE EXISTED IN JULY.
 *
 * Dustin, 24 Aug 2026, 8:04am: "major issue here. we just programmed through i
 * think sept, maybe firther?? where the hell did that progrsmking go!?"
 *
 * Nothing had gone anywhere. PostgREST caps every response at 1,000 rows no
 * matter what `.limit()` asks for. The coverage check pulled every scheduled
 * workout past the horizon — 1,611 rows — and counted them in the browser, so
 * 611 never arrived and nine clients looked unprogrammed.
 *
 * The part worth building a test around is not the bug, it is the FIX THAT
 * CAME BEFORE IT. The same line had truncated once already and the response
 * had been to raise `.limit()` from 5,000 to 20,000. That reads like someone
 * bounding a query. It is a number the server has never once honoured, and it
 * left the code looking more careful than it was — which is why the second
 * failure took a morning to believe rather than a minute to spot.
 *
 * So: a literal `.limit(n)` above the server's own cap is banned outright.
 * Either the answer belongs in SQL (`programming_coverage()`, the digest's
 * food-logger count, /settings/ai-health) or the rows are paged through
 * `fetchAllRows`. There is no third option, and "a bigger number" is not one.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Comments out, then string and template literals out.
 *
 * Both halves earn their place. This very file, and the call sites it polices,
 * explain the ban in prose that quotes `.limit(20000)` — a scanner that reads
 * comments would flag the explanation of the rule as a breach of it. And a
 * previous source-reading test in this suite passed against broken code for
 * exactly that reason: it matched its own comment.
 *
 * Order matters. Strings are stripped after comments, because a `//` inside a
 * string literal is not a comment and stripping strings first would leave the
 * rest of that line looking like one.
 */
function stripCommentsAndStrings(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  const noLine = noBlock.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return noLine
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

const FILES = walk(SRC);

test("no source file asks PostgREST for more rows than it will ever return", () => {
  const offenders: string[] = [];

  for (const file of FILES) {
    const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      // Underscores because 20_000 is as much a lie as 20000.
      const m = /\.limit\(\s*([0-9_]+)\s*\)/.exec(line);
      if (!m) return;
      const n = Number(m[1].replace(/_/g, ""));
      if (n > POSTGREST_MAX_ROWS) {
        offenders.push(`${relative(ROOT, file)}:${i + 1} → .limit(${n})`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "A .limit() above " +
      POSTGREST_MAX_ROWS +
      " is not a bound, it is a comment shaped like one — the server ignores " +
      "the excess and hands back 1,000 rows with no error. Aggregate in SQL, " +
      "or page the read with fetchAllRows():\n  " +
      offenders.join("\n  "),
  );
});

test("the guard reads code, not the prose that describes it", () => {
  // The failure mode of every source-scanning test: it flags the sentence
  // explaining the rule. Both of these lines exist in this repository.
  const decoy = [
    "// the old fix was to raise it to .limit(20000), which the server ignored",
    "/* .limit(5000) bounded nothing */",
    'const msg = "use .limit(20000)";',
    "const q = sql`select 1 -- .limit(9999)`;",
  ].join("\n");
  assert.doesNotMatch(
    stripCommentsAndStrings(decoy),
    /\.limit\(\s*[0-9_]+\s*\)/,
    "the scanner is reading comments and string literals — it will fail on its own documentation",
  );

  // And it must still see the real thing, including an underscored literal.
  assert.match(
    stripCommentsAndStrings("const { data } = await db.from('x').select('*').limit(20_000);"),
    /\.limit\(\s*20_000\s*\)/,
    "the scanner strips too much and would miss a live breach",
  );
});

// ── fetchAllRows itself ──────────────────────────────────────────────────────

/** A fake table of `n` rows that honours .range() the way PostgREST does. */
function fakeTable(n: number, cap = POSTGREST_MAX_ROWS) {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const make = () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      const width = Math.min(to - from + 1, cap);
      return Promise.resolve({ data: rows.slice(from, from + width), error: null });
    },
  });
  return { make, calls };
}

test("it returns every row, not the first thousand", async () => {
  const { make, calls } = fakeTable(1611); // the exact size of the coverage read
  const got = await fetchAllRows<{ id: number }>(make, { label: "test" });
  assert.equal(got.length, 1611);
  assert.equal(got[0].id, 0);
  assert.equal(got[1610].id, 1610);
  assert.equal(calls.length, 2, "1,611 rows is two pages");
});

test("a full last page costs one more round trip rather than a guess", async () => {
  const { make, calls } = fakeTable(2000);
  const got = await fetchAllRows<{ id: number }>(make, { label: "test" });
  assert.equal(got.length, 2000);
  assert.equal(calls.length, 3, "an exact multiple must be confirmed empty, not assumed complete");
});

test("it never asks for more than the server will give, whatever the caller wants", async () => {
  const { make, calls } = fakeTable(50);
  await fetchAllRows(make, { label: "test", pageSize: 99999 });
  assert.equal(calls[0][1] - calls[0][0] + 1, POSTGREST_MAX_ROWS);
});

test("hitting the ceiling throws, and says which screen", async () => {
  const { make } = fakeTable(5000);
  await assert.rejects(
    () => fetchAllRows(make, { label: "SomeScreen.read", max: 2000 }),
    /SomeScreen\.read.*more than 2000 rows/s,
    "a read too big to page must fail loudly — silence is what cost the morning",
  );
});

test("an error is raised, not swallowed into a short list", async () => {
  const make = () => ({
    range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  });
  await assert.rejects(() => fetchAllRows(make, { label: "X" }), /fetchAllRows\(X\): boom/);
});

test("every fetchAllRows call site orders its query", () => {
  // A paged read with no ORDER BY is not safer than a truncated one. Postgres
  // may return pages in any order it likes, so a row can land in two pages and
  // another in none — and the total would still look right.
  const bad: string[] = [];
  for (const file of FILES) {
    const raw = readFileSync(file, "utf8");
    if (!raw.includes("fetchAllRows(") && !raw.includes("fetchAllRows<")) continue;
    if (relative(ROOT, file).endsWith("lib/fetchAllRows.ts")) continue;
    const code = stripCommentsAndStrings(raw);
    // Each call is `fetchAllRows[<T>](() => <query>, { label ... })`. Chunks
    // that do not begin with `<` or `(` are the import, not a call.
    for (const chunk of code.split("fetchAllRows").slice(1)) {
      if (!/^\s*[<(]/.test(chunk)) continue;
      const query = chunk.split("{ label")[0];
      if (query === chunk) {
        bad.push(`${relative(ROOT, file)} (no label)`);
        continue;
      }
      if (/\.order\(/.test(query)) continue;
      // The one accepted alternative: an RPC that orders inside the function,
      // where there is no `.order()` for a scanner to see. It has to SAY so.
      const options = chunk.slice(query.length).split(")")[0];
      if (/orderedBy\s*:/.test(options)) continue;
      bad.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(bad, [], `paged reads with no .order() — pages can overlap and skip: ${bad.join(", ")}`);
});
