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

/**
 * PRESET DEFAULTS, AND WEIGHTS THAT REMEMBER THE REP TARGET.
 *
 * Dustin, 2026-08-04: "the app needs to have preset defaults for movements but
 * still able to toggle change them. when we log something the next time that
 * movement comes up it falls back to previously logged w preloaded weights if
 * recorded. the most recent weights for that number of reps for that movement
 * should be preloaded."
 *
 * Two separate things, both asserted here because both were previously a guess:
 *   - a MOVEMENT-level default (exercises.default_tracked_fields) between the
 *     prescription and the heuristic, so a fix set once is inherited by every
 *     program written afterwards;
 *   - prefill matched on REP COUNT, not on set number within the last session.
 *     Last week 3×12 at 40 lb, today 3×8: the old rule offered 40. The number
 *     worth beating is whatever was last done for 8.
 */

test("tracked fields fall back prescription → movement → heuristic", () => {
  const fn = SRC.slice(SRC.indexOf("function defaultTrackedFields"), SRC.indexOf("// Reps that should ALWAYS prefill"));
  const presc = fn.indexOf("pe?.tracked_fields");
  const lib = fn.indexOf("pe?.exercises?.default_tracked_fields");
  const heuristic = fn.indexOf("BW_NAME_RE");
  assert.ok(presc > -1 && lib > -1 && heuristic > -1, "all three levels must be present");
  assert.ok(presc < lib && lib < heuristic, "order decides which wins — most specific first");
});

test("the movement default is only ever written by the trainer", () => {
  const fn = SRC.slice(SRC.indexOf("const persistFields ="), SRC.indexOf("const saveCardioFields"));
  assert.match(fn, /if \(!exerciseId \|\| !isTrainerSession\) return;/);
  assert.ok(
    fn.indexOf("isTrainerSession") < fn.indexOf('from("exercises")'),
    "the library write must sit behind the trainer guard",
  );
});

test("prefill matches the rep target before falling back to the last session", () => {
  const block = SRC.slice(SRC.indexOf("if (row.done || !(row.weight"), SRC.indexOf("// --- end previous weights ---"));
  assert.match(block, /h\.reps === target && h\.weight != null && h\.weight > 0/, "rep-matched, and a 0 is not an answer");
  assert.ok(
    block.indexOf("atReps") < block.indexOf("if (p) {"),
    "the rep-matched hit must be preferred over the last-session fallback",
  );
  // Never overwrite what someone already typed or logged.
  assert.match(block, /if \(row\.done \|\| !\(row\.weight === '' \|\| row\.weight == null\)\) return row;/);
});

/**
 * THE NAME OF THE MOVEMENT CANNOT BE THE THING THAT DISAPPEARS.
 *
 * Gerard, 2026-08-04, mid-session screenshot: sets, Track chips, 11,325 lb
 * moved, a notes box — and nowhere on the screen what exercise it was.
 *
 * Nothing was missing from the data. The header sat inside a `flex-shrink: 1`
 * `min-h-0` scroll box, which is allowed to collapse to zero height when the
 * pinned sets and footer take the space. On his phone it did, and the name went
 * with it: scrolled inside a region with no height, so there was nothing left
 * to scroll to.
 *
 * The layout of this screen has been rebalanced twice already (7/31 Gerard, 8/1
 * Dustin), so the rule is pinned in a test: the name is pinned like the sets,
 * and only the meta pills and cue are allowed to scroll.
 */

test("the exercise name is pinned above the shrinkable region, not inside it", () => {
  const scroll = SRC.indexOf('className="min-h-0 overflow-y-auto"');
  const name = SRC.indexOf("{currentExercise.exercises?.name || \"Exercise\"}");
  assert.ok(scroll > -1 && name > -1);
  assert.ok(name < scroll, "the name must render BEFORE the shrinkable scroll box, not within it");
  const pinned = SRC.slice(SRC.indexOf('<div className="px-5 flex-shrink-0"'), name);
  assert.match(pinned, /flexShrink: 0/, "its container must refuse to compress");
});

test("a very long movement name is clamped, not unbounded", () => {
  // Unbounded height is why it was put in the scroll box in the first place —
  // clamping is what lets it be pinned safely.
  assert.match(SRC, /WebkitLineClamp: 2/);
});
