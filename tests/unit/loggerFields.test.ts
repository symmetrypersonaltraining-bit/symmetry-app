import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A LOGGER THAT THROWS AWAY WHAT YOU TYPED.
 *
 * Jennifer, twice in four minutes on 2026-08-01:
 *   "Needs to be weight and reps"   · "Needs to be sets and weight"
 * Both on the same day sheet, on Dumbbell Sumo Jump Squat and Dumbbell Walking
 * Lunge — two loaded, rep-prescribed movements the exercise library happens to
 * tag modality = "conditioning".
 *
 * The logger's cardio branch offers Time / Speed / HR and no way to turn Weight
 * or Reps on. Worse, logSet nulls weight_lbs and reps for anything it considers
 * cardio, so in session view she could type the numbers, hit the check, and
 * watch them be discarded on save. 36 set_logs are on record with every value
 * NULL — Walking Lunge, Jump Squat with Stabilization, Dumbbell Sumo Jump Squat,
 * Dumbbell Walking Lunge, Walking High Knees, Jump Squats — the most recent
 * 2026-08-03.
 *
 * This predicate has now been narrowed twice (mobility on 7/13, loaded/plyo
 * work here), which is the argument for pinning its shape in a test rather than
 * a third round of adding one more name to a regex.
 *
 * The rule: reps means strength, an explicit tracked_fields wins over the
 * library's guess, and only duration/distance work can be cardio.
 */

const ROOT = process.cwd();
const LOGGER = join(ROOT, "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx");
const PAGE = join(ROOT, "src/app/(app)/workout/[dayId]/page.tsx");
const SRC = readFileSync(LOGGER, "utf8");

/** The real isCardioEx, lifted out of the component and executed. */
function loadIsCardioEx(): (pe: unknown) => boolean {
  const start = SRC.indexOf("const isCardioEx = (pe: any) => {");
  assert.notEqual(start, -1, "isCardioEx must still exist under that name");
  const end = SRC.indexOf("\n  };", start);
  const body = SRC.slice(start, end + 4)
    .replace("const isCardioEx = (pe: any) => {", "return function isCardioEx(pe) {")
    .replace(/: any/g, "")
    .replace(/\(f: string\)/g, "(f)");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(body + "\n")() as (pe: unknown) => boolean;
}

const isCardioEx = loadIsCardioEx();

const ex = (name: string, modality: string) => ({ name, modality });

test("rep-prescribed work is never cardio, whatever the library calls it", () => {
  // Jennifer's two, verbatim from the database.
  assert.equal(isCardioEx({ volume_type: "reps", tracked_fields: null, exercises: ex("Dumbbell Sumo Jump Squat", "conditioning") }), false);
  assert.equal(isCardioEx({ volume_type: "reps", tracked_fields: null, exercises: ex("Dumbbell Walking Lunge", "conditioning") }), false);
  assert.equal(isCardioEx({ volume_type: "rep_range", tracked_fields: null, exercises: ex("Jump Squats", "conditioning") }), false);
});

test("real cardio is still cardio", () => {
  for (const n of ["Treadmill Walk", "Stair Master", "Battle Rope Waves", "Outdoor Walk"]) {
    assert.equal(
      isCardioEx({ volume_type: "duration", tracked_fields: null, exercises: ex(n, "conditioning") }),
      true,
      `${n} must keep Time/Speed/HR`,
    );
  }
  // Mistagged machine cardio is caught by name even when the modality is wrong
  // (the 7/13 narrowing relies on this and must keep working).
  assert.equal(isCardioEx({ volume_type: "duration", tracked_fields: null, exercises: ex("Elliptical", "bodybuilding") }), true);
});

test("an explicit prescription beats the library's guess, both ways", () => {
  // 7 prescriptions already said "weight" and were forced to Speed/HR anyway —
  // which is why backfilling tracked_fields would not have fixed this.
  assert.equal(isCardioEx({ volume_type: "duration", tracked_fields: ["weight", "reps"], exercises: ex("Walking Lunge", "conditioning") }), false);
  // And a genuine cardio prescription stays cardio even if reps sneak in.
  assert.equal(isCardioEx({ volume_type: "reps", tracked_fields: ["time", "speed", "hr"], exercises: ex("Rowing Machine", "conditioning") }), true);
});

test("a stretch is not cardio — the 7/13 fix stays fixed", () => {
  assert.equal(isCardioEx({ volume_type: "duration", tracked_fields: null, exercises: ex("Kneeling Hip Flexor Stretch", "mobility") }), false);
  assert.equal(isCardioEx({ volume_type: "duration", tracked_fields: null, exercises: ex("Foam Roll Quadriceps", "mobility") }), false);
});

test("cardio still nulls weight/reps, and strength no longer does", () => {
  // The write path is gated on the same predicate, so narrowing it is what
  // actually stops the data loss. Assert the gate is still wired to it.
  assert.match(SRC, /weight_lbs: isCardioEx\(/);
  assert.match(SRC, /reps: isCardioEx\(/);
});

test("persistFields can actually see the exercise it is propagating", () => {
  // It never could: every caller passed (pe as any).exercise_id, the page never
  // selected exercise_id, and the cast hid it — so "default bridges to reps
  // only" (7/25) was closed on a propagation that has never once run.
  assert.match(readFileSync(PAGE, "utf8"), /prescribed_exercises\(\s*\n\s*id, position, sets, tracked_fields, volume_type, volume_value, exercise_id,/);
  assert.match(SRC, /exercise_id\?: string \| null;/, "the interface must carry it so no cast is needed");
  assert.doesNotMatch(SRC, /as any\)\.exercise_id/, "an `as any` here is what hid the missing field");
  // Library-wide propagation is the trainer's call, not a client's: a client
  // tapping a chip must not rewrite thirty-four other people's prescriptions.
  assert.match(SRC, /if \(!exerciseId \|\| !isTrainerSession\) return;/);
});
