import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookUpMovements } from "../../src/lib/ai/movementContext";

/**
 * ITEM E — THE CLIENT COACH CAN LOOK A MOVEMENT UP.
 *
 * Until this shipped, "why does my knee hurt on lunges" was answered by a coach
 * whose context was food, an assessment and a schedule. It had never been able
 * to reach the movement library, so it answered about lunges in general: not
 * their variation, not the one in their session, and with no way to know the
 * movement was not in their programme at all.
 *
 * What is tested here is not the wording. It is the three things that must
 * never leak, and the one thing that must never be invented:
 *
 *   1. an EXCLUDED movement (rule 13),
 *   2. ANOTHER CLIENT'S own movement (the library-visibility rule, 4 Sep),
 *   3. anything outside a GATED client's cleared pool (Gerard, Sharon),
 *   4. and a movement that is not in the library at all, which must produce
 *      "I can't find that" rather than a description written from memory.
 */

const ROOT = process.cwd();

/** A stub that answers the three tables lookUpMovements touches. */
function db(opts: {
  gated?: boolean;
  exercises: Record<string, unknown>[];
  days?: Record<string, unknown>[];
  onOr?: (arg: string) => void;
}) {
  const chain = (rows: Record<string, unknown>[], single?: Record<string, unknown> | null) => {
    const self: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order", "limit", "gte", "lte"]) self[k] = () => self;
    self.or = (arg: string) => {
      opts.onOr?.(arg);
      return self;
    };
    self.maybeSingle = async () => ({ data: single ?? null, error: null });
    self.then = (res: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
      res({ data: rows, error: null });
    return self;
  };
  return {
    from: (t: string) => {
      if (t === "client_app_settings") return chain([], { ai_pool_only: opts.gated === true });
      if (t === "days") return chain(opts.days || []);
      return chain(opts.exercises);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const CLIENT = "11111111-1111-1111-1111-111111111111";

const REVERSE_LUNGE = {
  id: "ex-lunge",
  name: "Reverse Lunge",
  aliases: ["backward lunge"],
  everfit_name: "Reverse Lunge (DB)",
  modality: "bodybuilding",
  muscle_group: "legs",
  equipment_required: ["dumbbells"],
  video_url: "https://example.com/clip",
  availability_status: "available",
  client_owner_id: null,
};

const EXCLUDED_CLEAN = {
  id: "ex-clean",
  name: "Hang Clean",
  aliases: null,
  everfit_name: null,
  modality: "olympic",
  muscle_group: "full body",
  equipment_required: ["barbell"],
  video_url: null,
  availability_status: "excluded",
  client_owner_id: null,
};

test("it finds their movement and says which of THEIR sessions it is in", async () => {
  const out = await lookUpMovements(
    db({
      exercises: [REVERSE_LUNGE],
      days: [{ label: "Lower Body", sections: [{ prescribed_exercises: [{ exercise_id: "ex-lunge" }] }] }],
    }),
    CLIENT,
    "lunge",
  );
  assert.match(out, /Reverse Lunge/);
  assert.match(out, /IN THEIR OWN SESSIONS: Lower Body/);
  assert.match(out, /demo video/);
});

test("an excluded movement is never described, however directly it is asked for", async () => {
  const out = await lookUpMovements(db({ exercises: [REVERSE_LUNGE, EXCLUDED_CLEAN] }), CLIENT, "hang clean");
  assert.doesNotMatch(out, /Hang Clean/);
  assert.match(out, /nothing in this client's library matches/i);
});

test("the query itself is scoped to the trainer's library plus this client's own", async () => {
  let or = "";
  await lookUpMovements(db({ exercises: [REVERSE_LUNGE], onOr: (a) => (or = a) }), CLIENT, "lunge");
  // Not "it filtered afterwards" — the candidate set never contained another
  // client's row in the first place.
  assert.match(or, /client_owner_id\.is\.null/);
  assert.ok(or.includes(CLIENT), "the client's own rows must be reachable, and only theirs");
});

test("a gated client sees only what is in their cleared pool", async () => {
  // Gated, and their cleared days contain nothing — so the pool is empty and
  // the honest answer is that nothing may be described at all.
  const out = await lookUpMovements(db({ gated: true, exercises: [REVERSE_LUNGE], days: [] }), CLIENT, "lunge");
  assert.match(out, /Do NOT describe or suggest any movement/);
  assert.doesNotMatch(out, /Reverse Lunge/);
});

test("nothing matching produces a refusal to invent, not a description", async () => {
  const out = await lookUpMovements(db({ exercises: [REVERSE_LUNGE] }), CLIENT, "zercher carry");
  assert.match(out, /Do NOT describe it from general knowledge/);
});

test("an exact name outranks an incidental mention", async () => {
  const rowRow = { ...REVERSE_LUNGE, id: "ex-row", name: "Lunge-Stance Cable Row", aliases: null, everfit_name: null };
  const out = await lookUpMovements(db({ exercises: [rowRow, { ...REVERSE_LUNGE, name: "Lunge" }] }), CLIENT, "lunge");
  assert.ok(
    out.indexOf("· Lunge —") < out.indexOf("Lunge-Stance Cable Row"),
    "the movement they named must come first",
  );
});

// ── the wiring, which the behaviour above cannot see ───────────────────────
//
// The tool existing is not the same as the coach reaching for it. The ✦ Coach's
// tool pass is told when to use a tool at all, and that sentence used to end at
// "logging a weigh-in" — so a movement question reached for nothing, came back
// with toolsUsed 0, and fell through to the nutrition coach. Adding the tool
// without widening that sentence would have changed nothing at all.

const ACT = readFileSync(join(ROOT, "src/app/api/nutrition-ai/act/route.ts"), "utf8");
const ACTIONS = readFileSync(join(ROOT, "src/lib/ai/clientActions.ts"), "utf8");

test("the tool is in the client toolset and dispatched", () => {
  assert.match(ACTIONS, /name: "look_up_movement"/);
  assert.match(ACTIONS, /if \(name === "look_up_movement"\)/);
});

test("the coach is told that a movement question is a tool question", () => {
  assert.match(ACT, /NAMES A MOVEMENT/);
  assert.match(ACT, /look_up_movement/);
});
