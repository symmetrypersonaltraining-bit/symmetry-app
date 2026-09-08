// WHAT A MOVEMENT ACTUALLY IS — the library, reachable from a client's chat.
//
// Item E of the AI programme (docs/audit/AI-CONTRACT.md), and the last of the
// four big ones. Until this shipped, a client asking about a MOVEMENT was
// answered by a coach that had never been able to look one up. It knew what
// they ate, what they weighed, what was on their schedule and — since 5 Sep —
// how they move. It did not know what a Reverse Lunge is.
//
// So "why does my knee hurt on lunges" was answered from the model's own
// general knowledge of lunges rather than from the movement in front of them:
// not their variation, not the one in their session, not the one with the demo
// video sitting in the app, and with no way to say "that one isn't in your
// programme at all — you're thinking of the split squat on Day 2."
//
// ── WHAT THIS FILE HANDS THE COACH, AND WHAT IT DELIBERATELY DOES NOT ───────
//
// It hands over the library as DATA — name, what it works, what it needs,
// whether there is a demo video, whether it is in this client's own sessions.
// It does not hand over coaching. The reasoning stays with the model, because
// the reasoning has to combine the movement with THIS person's assessment, and
// no row in a table can do that.
//
// ── THE THREE THINGS IT MUST NOT LEAK ──────────────────────────────────────
//
// 1. AN EXCLUDED MOVEMENT. Rule 13: an excluded movement must never be
//    programmable, described or suggested from ANY surface. The MovementPicker
//    filters them; a chat box that did not would be the way round it.
//
// 2. ANOTHER CLIENT'S OWN MOVEMENT. The library-visibility rule, locked 4 Sep:
//    "i want all workouts from my library visible for all clients. for workouts
//    created and saved by a client it should only be visible to that client in
//    their personal library." So: trainer-owned rows for everyone, a client's
//    own rows for that client, nobody else's ever.
//
// 3. ANYTHING OUTSIDE A GATED CLIENT'S CLEARED POOL. Gerard and Sharon are
//    handed the cleared set and nothing else — "not to improvise a new workout"
//    covers describing one just as much as programming it. The filter happens
//    HERE, in the candidate set, not in the prompt; see lib/ai/workoutPool.ts
//    for why that distinction is the whole design. Fails closed with the pool.
//
// The client id is never a tool argument, here as everywhere else in the client
// toolset: it is resolved from the session by the route and passed in. There is
// nothing for a model to get wrong or a user to talk it into changing.

import type { Db } from "@/lib/ai/scope";
import { clearedPoolFor } from "@/lib/ai/workoutPool";

interface ExerciseRow {
  id: string;
  name: string;
  aliases: string[] | null;
  everfit_name: string | null;
  modality: string | null;
  muscle_group: string | null;
  equipment_required: string[] | null;
  video_url: string | null;
  availability_status: string | null;
  client_owner_id: string | null;
}

const MAX_HITS = 8;

/** Everything a term could sensibly match on, lower-cased once. */
function haystack(e: ExerciseRow): string {
  return [
    e.name,
    e.everfit_name || "",
    ...(e.aliases || []),
    e.muscle_group || "",
    e.modality || "",
    ...(e.equipment_required || []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Rank, so that "lunge" puts Reverse Lunge above Lunge-Stance Cable Row.
 *
 * An exact name wins, then a name that starts with the query, then a name that
 * contains it, then anything that matched on muscle group or equipment. Ties
 * break alphabetically rather than on insertion order, because insertion order
 * here is whatever the database felt like and a list that reorders itself
 * between two identical questions reads as a bug to the person asking.
 */
function score(e: ExerciseRow, q: string): number {
  const name = e.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  const alias = (e.aliases || []).some((a) => a.toLowerCase().includes(q)) || (e.everfit_name || "").toLowerCase().includes(q);
  if (alias) return 50;
  if (haystack(e).includes(q)) return 20;
  return 0;
}

/**
 * The movements this client's coach may talk about, matching `query`.
 *
 * Returns prompt-ready text, never throws, and says plainly when it found
 * nothing — because "I couldn't find that one in your library" is a true answer
 * and an invented description of a movement they may be about to load their
 * spine with is not. Rule 2 of the contract: "no data" is not "zero".
 */
export async function lookUpMovements(db: Db, clientId: string, query: string): Promise<string> {
  const q = (query || "").trim().toLowerCase();
  if (!q) return "No movement was named. Ask them which movement they mean before answering.";

  try {
    const pool = await clearedPoolFor(db, clientId);
    if (pool.gated && pool.exerciseIds.size === 0) {
      // Same fail-closed wording as my_workout_options: an outage must not
      // quietly ungate the two people this gate exists for.
      return "Their cleared list could not be loaded. Do NOT describe or suggest any movement at all — tell them it isn't loading right now and to check with their coach.";
    }

    const { data } = await db
      .from("exercises")
      .select(
        "id, name, aliases, everfit_name, modality, muscle_group, equipment_required, video_url, availability_status, client_owner_id",
      )
      // Rule 13, and the library-visibility rule, both in the query rather than
      // in a filter afterwards — a candidate that is never selected cannot be
      // leaked by a later mistake.
      .or(`client_owner_id.is.null,client_owner_id.eq.${clientId}`)
      .limit(1000);

    const rows = ((data as ExerciseRow[] | null) || [])
      .filter((e) => (e.availability_status || "available") !== "excluded")
      .filter((e) => !pool.gated || pool.exerciseIds.has(e.id));

    const hits = rows
      .map((e) => ({ e, s: score(e, q) }))
      .filter((h) => h.s > 0)
      .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
      .slice(0, MAX_HITS);

    if (!hits.length) {
      return (
        `MOVEMENT LIBRARY: nothing in this client's library matches "${query}". ` +
        `Say so plainly — "that one isn't in your programme" or "I can't find that in your library" — and ask ` +
        `whether they mean something else, or offer to send it to their trainer. Do NOT describe it from general ` +
        `knowledge: a movement you invented is not a movement they have been cleared for.`
      );
    }

    const mine = await theirOwnMovements(db, clientId);

    const lines = hits.map(({ e }) => {
      const bits: string[] = [];
      if (e.muscle_group) bits.push(e.muscle_group);
      if (e.modality) bits.push(e.modality);
      if (e.equipment_required?.length) bits.push(e.equipment_required.join(" + "));
      const where = mine.get(e.id);
      if (where?.length) bits.push(`IN THEIR OWN SESSIONS: ${where.join(", ")}`);
      else bits.push("not in any of their current sessions");
      if (e.video_url) bits.push("demo video in the app");
      return `· ${e.name} — ${bits.join(" · ")}`;
    });

    return (
      `MOVEMENT LIBRARY — ${hits.length === 1 ? "the match" : `${hits.length} matches`} for "${query}":\n` +
      lines.join("\n") +
      `\n\n${MOVEMENT_RULES}`
    );
  } catch (e) {
    console.error("lookUpMovements failed (continuing without it)", e);
    return `MOVEMENT LIBRARY: could not be read just now. Say you cannot pull their movement list up rather than describing one from memory.`;
  }
}

/**
 * Which of this client's own sessions each movement appears in.
 *
 * The difference between "lunges hurt" answered in general and answered as
 * "that's the Reverse Lunge in your Lower Body day" is the whole point of item
 * E, and it is one query. Best-effort: losing it costs a phrase, not an answer.
 */
async function theirOwnMovements(db: Db, clientId: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    const { data } = await db
      .from("days")
      .select("label, sections(prescribed_exercises(exercise_id))")
      .eq("client_owner_id", clientId)
      .limit(60);
    type Row = { label: string | null; sections: { prescribed_exercises: { exercise_id: string }[] }[] | null };
    for (const d of (data as Row[] | null) || []) {
      const label = (d.label || "Workout").trim();
      for (const s of d.sections || []) {
        for (const p of s.prescribed_exercises || []) {
          const at = map.get(p.exercise_id) || [];
          // The days table has twice been filled by a loop that inserts one row
          // per scheduled date, so the same label arrives many times over.
          if (!at.includes(label)) at.push(label);
          map.set(p.exercise_id, at);
        }
      }
    }
  } catch (e) {
    console.error("theirOwnMovements failed (continuing without it)", e);
  }
  return map;
}

/**
 * How to use what came back. Ships WITH every lookup, the same way
 * ASSESSMENT_RULES ships with the assessment — a list of movements with no
 * instruction attached is a list a model will recite.
 */
export const MOVEMENT_RULES =
  `HOW TO USE THIS:\n` +
  `1. ANSWER ABOUT THEIR MOVEMENT, not the movement in general. If it is in one of their sessions, say which ` +
  `one — "that's the reverse lunge in your Lower Body day" — because that is the difference between a coach ` +
  `who knows them and a search result.\n` +
  `2. READ IT TOGETHER WITH THEIR ASSESSMENT. A knee that hurts on a lunge is usually about the ankle above ` +
  `the foot it is standing on, and their screen findings are in this same context. Explain the connection in ` +
  `plain words — "your ankle's stiff, so your knee travels instead" — and NEVER name the method, the phases, ` +
  `or any of the vocabulary behind it.\n` +
  `3. IF IT IS NOT IN THE LIST, IT IS NOT THEIRS. Do not describe it, do not coach it, do not suggest it as a ` +
  `swap. Say you cannot find it in their library and offer to ask their trainer.\n` +
  `4. POINT AT THE VIDEO when there is one — "there's a clip of it on the movement in the app" — rather than ` +
  `writing three paragraphs of form cues. A thing they can watch beats a thing they have to read.\n` +
  `5. PAIN STILL GOES THROUGH THE PAIN RULES. Up to two questions, then a real answer; and the red-flag list ` +
  `stops everything, whatever the movement is.`;
