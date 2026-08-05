import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bestLoad, compareLoads, isBetterLoad, loadLabel, looksLikeAssistance,
} from "../../src/lib/loadDirection.ts";

/**
 * SOME MACHINES GET EASIER AS THE NUMBER GOES UP.
 *
 * Dustin, 2026-08-05, on Tim Yancey's profile: "prs are not trackjng here, he
 * just went uo on assisted dips".
 *
 * He had. Tim's assisted dip:
 *
 *     Jul  4   140x10, 120x10, 20x10
 *     Jul 22   130x20, 120x20
 *     Aug  5   120x20, 110x20     <- the session Dustin was pointing at
 *
 * On an assisted dip or pull-up the stack counterweights the lifter, so 110 lb
 * of assistance for 20 reps is far stronger than 140 lb for 10. Every "best" in
 * this app was MAX(weight_lbs). So the app decided Tim's best was the 140 from
 * 4 July, called that his PR, and spent a month telling Dustin the lift "hasn't
 * moved" while Tim took 30 lb off the stack and doubled the reps. His real PRs
 * could never fire — `today > previous` is unsatisfiable when progress means
 * going down — and the plateau card was reporting progress as a stall.
 *
 * 148 logged sets across two movements were being read backwards.
 *
 * The direction lives on the exercise row now, and every comparison goes
 * through one module, because four independent "bigger is better" assumptions
 * is exactly the thing that gets fixed in three places and missed in the fourth.
 */

test("the machines where less is more are recognised by name", () => {
  assert.equal(looksLikeAssistance("Assisted Dip"), true);
  assert.equal(looksLikeAssistance("Machine Assisted Pull Up"), true);
  assert.equal(looksLikeAssistance("Counterbalance Squat"), true);
  assert.equal(looksLikeAssistance("counter balance goblet squat"), true);
  // And ordinary movements are left alone.
  for (const n of ["Cable Curl", "Barbell Bench Press", "Dip", "Pull Up", "Assistance Band Row", "Band Assisted Nothing"]) {
    if (n === "Band Assisted Nothing") continue; // that one IS assisted, word-boundaried
    assert.equal(looksLikeAssistance(n), false, `${n} should not be treated as assisted`);
  }
  assert.equal(looksLikeAssistance(null), false);
  assert.equal(looksLikeAssistance(""), false);
});

test("Tim's actual sessions read as progress, not a plateau", () => {
  // The exact numbers from the report.
  assert.equal(isBetterLoad(110, 140, true), true, "110 lb of assist beats 140 lb of assist");
  assert.equal(isBetterLoad(120, 130, true), true);
  assert.equal(isBetterLoad(140, 110, true), false, "more help is not a personal record");
  // And the normal direction is untouched.
  assert.equal(isBetterLoad(225, 205, false), true);
  assert.equal(isBetterLoad(205, 225, false), false);
});

test("matching last week is not a record", () => {
  // Otherwise every repeated session fires a celebration and the word stops
  // meaning anything.
  assert.equal(isBetterLoad(120, 120, true), false);
  assert.equal(isBetterLoad(120, 120, false), false);
});

test("bestLoad picks the stronger effort in both directions", () => {
  assert.equal(bestLoad(110, 140, true), 110);
  assert.equal(bestLoad(140, 110, true), 110);
  assert.equal(bestLoad(225, 205, false), 225);
  assert.equal(bestLoad(205, 225, false), 225);
});

test("a real lift outranks an assistance drop when picking the headline PR", () => {
  // The celebration screen shows ONE PR big. A 225 lb squat is the story; 10 lb
  // off the assist machine is the footnote. Within a kind, ordering flips.
  const sorted = [
    { weight: 110, assistance: true },
    { weight: 225, assistance: false },
    { weight: 130, assistance: true },
    { weight: 315, assistance: false },
  ].sort(compareLoads);
  assert.deepEqual(sorted, [
    { weight: 315, assistance: false },
    { weight: 225, assistance: false },
    { weight: 110, assistance: true },   // less assist ranks above more
    { weight: 130, assistance: true },
  ]);
});

test("the number is never shown without saying which way it runs", () => {
  // "120 lb" on an assisted dip looks like a load. It is help being removed,
  // and without the word the row means the opposite of what it appears to.
  assert.equal(loadLabel(120, true), "120 lb assist");
  assert.equal(loadLabel(225, false), "225 lb");
});

/* ── The call sites ───────────────────────────────────────────────────────── */

const PLATEAUS = readFileSync(join(process.cwd(), "src/app/api/plateaus/route.ts"), "utf8");
const CELEB_API = readFileSync(join(process.cwd(), "src/app/api/celebration/route.ts"), "utf8");
const CELEB_UI = readFileSync(join(process.cwd(), "src/components/CelebrationScreen.tsx"), "utf8");
const SPOTTER = readFileSync(join(process.cwd(), "src/components/PlateauSpotter.tsx"), "utf8");

function code(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("no call site compares loads with a bare > any more", () => {
  // Each of these was its own independent "bigger is better" assumption.
  for (const [name, src] of [["plateaus", PLATEAUS], ["celebration", CELEB_API]] as const) {
    const c = code(src);
    assert.match(c, /isBetterLoad\(/, `${name} must go through lib/loadDirection`);
    assert.ok(!/\bw > cur\.w\b/.test(c), `${name}: bare w > cur.w is the bug`);
    assert.ok(!/\bt\.w > prev\b/.test(c), `${name}: bare t.w > prev is the bug`);
    assert.ok(!/e\.w > runningBest/.test(c), `${name}: bare e.w > runningBest is the bug`);
  }
});

test("the plateau card reads the flag off the exercise, not just the name", () => {
  // The name test is a fallback. A machine can be rigged either way and the
  // word "assisted" is not always in the title, so the row is the truth.
  assert.match(PLATEAUS, /exercises\(name, load_is_assistance\)/);
  assert.match(PLATEAUS, /load_is_assistance \?\? looksLikeAssistance\(name\)/);
  assert.match(CELEB_API, /exercises\(name, load_is_assistance\)/);
});

test("the running best is seeded from the first session, not from zero", () => {
  // Seeding at 0 works only for bigger-is-better. On an assisted movement every
  // real load is worse than zero, so nothing would ever count as an improvement
  // and the lift would silently vanish from the card.
  assert.match(code(PLATEAUS), /let runningBest: number \| null = null;/);
  assert.match(code(PLATEAUS), /runningBest === null \|\| isBetterLoad/);
});

test("both screens say 'assist' rather than showing a bare number", () => {
  assert.match(SPOTTER, /r\.assistance \? " assist" : ""/);
  assert.match(CELEB_UI, /less help/, "'previous best 140 lb' next to '120 lb' reads as a step backwards");
  assert.match(CELEB_UI, /loadLabel\(topPr\.weight/);
});

test("a big PR is measured by the gain, whichever way the gain runs", () => {
  // The floating-head takeover fires on +10 lb or +5%. On an assisted movement
  // that has to be MINUS 10 lb, or the rarest celebration in the app can never
  // fire for these lifts at all.
  const c = code(CELEB_UI);
  assert.match(c, /topPr\.assistance \? topPr\.previous - topPr\.weight : topPr\.weight - topPr\.previous/);
  assert.match(c, /prGain >= 10 \|\| prGain >= topPr\.previous \* 0\.05/);
  assert.ok(
    !/topPr\.weight - topPr\.previous >= 10/.test(c),
    "the one-directional threshold is back",
  );
  assert.match(c, /took \$\{jump\} pound/, "the headline has to describe what actually happened");
});
