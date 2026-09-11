import test from "node:test";
import assert from "node:assert/strict";
import {
  ageFrom, activityFactor, bmrFor, expenditureFor, missingForExpenditure,
  recommendTargets, FLOOR_KCAL, OCCUPATION_FACTOR,
} from "../../src/lib/nutrition/expenditure";

/**
 * Dustin, 11 Sep 2026: *"Where is it getting my total calorie expenditure
 * from? Because I never put my height in the test client app, and it needs my
 * height to be able to figure out that number accurately. So something is
 * missing."*
 *
 * It was getting it from nowhere — the model invented it. These pin the
 * arithmetic that replaced the invention, and the rule that it STOPS rather
 * than guessing when an input is absent.
 */

const HIM = { sex: "male" as const, ageYears: 44, heightIn: 72, weightLb: 200, bodyFatPct: 28 };

test("it refuses to proceed on a missing input rather than defaulting one", () => {
  // The body-fat screen's standing bug is exactly this: age defaults to 38 and
  // sex to "male", and a wrong sex there read 21.1% instead of 27.8%.
  assert.deepEqual(missingForExpenditure({}), ["sex", "age", "height", "weight"]);
  assert.deepEqual(missingForExpenditure({ ...HIM, heightIn: 0 }), ["height"], "his exact case — no height on file");
  assert.deepEqual(missingForExpenditure(HIM), []);
});

test("sex is never inferred, and getting it wrong is worth about 160 kcal", () => {
  const noBf = { ...HIM, bodyFatPct: null };
  const m = bmrFor(noBf).value;
  const f = bmrFor({ ...noBf, sex: "female" }).value;
  assert.equal(m - f, 166, "Mifflin's own constant — the reason it has to be asked for");
});

test("body fat picks the better formula, and says which one ran", () => {
  assert.equal(bmrFor(HIM).basis, "katch-mcardle", "lean mass is known, so use it");
  assert.equal(bmrFor({ ...HIM, bodyFatPct: null }).basis, "mifflin-st-jeor");
  // 200 lb at 28% = 144 lb lean = 65.3 kg. 370 + 21.6 × 65.3 ≈ 1781.
  assert.ok(Math.abs(bmrFor(HIM).value - 1781) <= 2, `got ${bmrFor(HIM).value}`);
});

test("a desk job and five sessions is not the same day as being on your feet", () => {
  // One "activity level" dropdown cannot say this, which is why there are two
  // inputs. Both are on this roster.
  const desk5 = activityFactor("desk", 5);
  const feet0 = activityFactor("feet", 0);
  assert.equal(desk5, OCCUPATION_FACTOR.desk + 0.125);
  assert.equal(feet0, OCCUPATION_FACTOR.feet);
  assert.ok(feet0 > desk5, "on your feet all day outweighs five gym hours — it is sixteen waking hours");
});

test("the activity factor cannot run away", () => {
  assert.ok(activityFactor("feet", 7) <= 2, "nobody filling in three chips is a tour cyclist");
});

test("the same inputs give the same answer every time", () => {
  // The complaint underneath all of this: two clients with identical stats got
  // different targets on different days, because a model was deciding.
  const a = recommendTargets(HIM, "desk", 4, "lose", "aggressive");
  const b = recommendTargets(HIM, "desk", 4, "lose", "aggressive");
  assert.deepEqual(a.targets, b.targets);
});

test("his own case: a real TDEE, and a deficit measured against it", () => {
  const r = recommendTargets(HIM, "desk", 4, "lose", "aggressive");
  const { tdee } = r.expenditure;
  assert.ok(tdee > 2200 && tdee < 2600, `TDEE ${tdee} — the model had guessed "2400-2500"`);
  assert.ok(Math.abs(r.targets.kcal - tdee * 0.75) <= 2, "25% under, not a flat number pulled from the air");
  assert.equal(r.targets.p, 144, "1 g per lb of the 144 lb of lean mass");
});

test("the deficit is a share of expenditure, not a flat 500", () => {
  // 500 off 3,600 is a nudge; off 1,700 it is a crash. A percentage says the
  // same thing to both.
  const big = recommendTargets({ ...HIM, weightLb: 300 }, "feet", 6, "lose", "steady");
  const small = recommendTargets({ sex: "female", ageYears: 55, heightIn: 62, weightLb: 130 }, "desk", 2, "lose", "steady");
  assert.ok(big.expenditure.tdee - big.targets.kcal > small.expenditure.tdee - small.targets.kcal);
});

test("nobody is sent below the floor, and is told when the floor caught it", () => {
  const tiny = recommendTargets({ sex: "female", ageYears: 70, heightIn: 58, weightLb: 95 }, "desk", 0, "lose", "aggressive");
  assert.ok(tiny.targets.kcal >= FLOOR_KCAL.female);
  if (tiny.flooredAt) assert.match(tiny.reasoning, /below the 1200 kcal floor/);
});

test("the macros add up to the calories they were split from", () => {
  for (const goal of ["lose", "recomp", "build"] as const) {
    const r = recommendTargets(HIM, "mixed", 4, goal, "steady");
    const fromMacros = r.targets.p * 4 + r.targets.c * 4 + r.targets.f * 9;
    assert.ok(Math.abs(fromMacros - r.targets.kcal) <= 4, `${goal}: ${fromMacros} vs ${r.targets.kcal}`);
  }
});

test("fat never drops below the floor, whatever the deficit", () => {
  const r = recommendTargets(HIM, "desk", 6, "lose", "aggressive");
  assert.ok(r.targets.f >= Math.round(HIM.weightLb * 0.3), "0.3 g/lb — hormones and adherence both live here");
});

test("the reasoning is built from the numbers it used, not written about them", () => {
  const r = recommendTargets(HIM, "desk", 4, "lose", "aggressive");
  assert.match(r.reasoning, new RegExp(String(r.expenditure.bmr)), "the real BMR appears");
  assert.match(r.reasoning, new RegExp(String(r.expenditure.tdee)), "so does the real TDEE");
  assert.match(r.reasoning, new RegExp(String(r.targets.kcal)));
  assert.match(r.reasoning, /estimates from published formulas/, "and it says plainly that it is an estimate");
});

test("age comes from a birthday, and a nonsense one is refused", () => {
  assert.equal(ageFrom("1982-03-15", "2026-09-11"), 44);
  assert.equal(ageFrom("1982-12-15", "2026-09-11"), 43, "the birthday has not come round yet");
  assert.equal(ageFrom(null, "2026-09-11"), null);
  assert.equal(ageFrom("2026-08-04", "2026-09-11"), null, "Madeleine's 23-day-old record must not become an age");
});
