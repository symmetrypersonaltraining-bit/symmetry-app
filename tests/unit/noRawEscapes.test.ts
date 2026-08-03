import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `—` IS NOT AN ESCAPE EVERYWHERE.
 *
 * Reported twice now — the second time as "— reintroduced", with a
 * screenshot of the Body Metrics card on a client's profile reading:
 *
 *     Weight   242.4lb        —
 *
 * In a JavaScript string literal, "—" is an em dash. In JSX TEXT and in a
 * JSX ATTRIBUTE value it is not processed at all — those are not JS strings,
 * and the six characters render exactly as typed. So:
 *
 *     const dash = "—";              // — correct
 *     <span>{dash}</span>                 // — correct
 *     <span>—</span>                 // —  BROKEN
 *     <input placeholder="—" />      // —  BROKEN
 *
 * The two forms look identical in a diff and sit on adjacent lines of the same
 * file, which is why this keeps coming back: someone copies a working line into
 * JSX and it silently stops working. There is nothing to notice at author time
 * — no error, no warning, no red squiggle.
 *
 * This test only flags the positions that actually render literally. The ~1,500
 * escapes inside real JS strings are correct and are left alone; failing on
 * those would make the test noise, and a noisy test gets skipped, which is how
 * the first fix stopped protecting anything.
 */

const ROOT = process.cwd();
const ESCAPE = /\\u([0-9a-fA-F]{4})/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

/**
 * Is this escape in a place where JS escape processing does NOT happen?
 *
 * Two cases, both determined from what precedes the match on its own line:
 *   - JSX attribute: an unclosed `="` before it.
 *   - JSX text: we are past a `>` with no `{` opening an expression after it.
 *
 * Line-local and therefore approximate. That is deliberate: the alternative is
 * parsing every file, and the cost of a rare false positive here (someone adds
 * a comment) is far lower than the cost of the bug, which ships to clients.
 */
function rendersLiterally(line: string, at: number): boolean {
  const before = line.slice(0, at);
  if (/=\s*"[^"]*$/.test(before)) return true;
  const afterLastGt = before.split(">").slice(1).join(">");
  if (before.includes(">") && !/[{"']/.test(afterLastGt)) return true;
  return false;
}

test("no \\uXXXX escapes in JSX text or attributes — they render literally", () => {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    const src = readFileSync(join(ROOT, file), "utf8");
    src.split("\n").forEach((line, i) => {
      // Comments explain this bug; they are not shipped to anyone.
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      for (const m of line.matchAll(ESCAPE)) {
        if (rendersLiterally(line, m.index ?? 0)) {
          offenders.push(`${file}:${i + 1}  ${m[0]}  →  ${trimmed.slice(0, 90)}`);
        }
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "These render as the literal characters \\u2014 on a client's screen. JSX text " +
      "and JSX attribute values are not JS strings, so the escape is never " +
      "processed. Paste the real character (— · … → ×) instead:\n  " +
      offenders.join("\n  "),
  );
});
