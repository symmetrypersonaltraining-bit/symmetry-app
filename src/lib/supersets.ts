// Supersets and circuits: turning a section's flat list into the blocks a
// person actually performs.
//
// Dustin, 1 Sep: "for supersets/circuits, the movements should check off/log in
// proper order they are performed in on 1 screen so its easy to log."
//
// `prescribed_exercises.superset_group` has been written by the trainer, read
// into every query, typed in three files — and never once used. The column was
// plumbed end to end and then dropped on the floor, so five movements that are
// really two pairs and a carry rendered as five identical numbered cards.
//
// ── SCOPE IS THE SECTION, NOT THE DAY ──────────────────────────────────────
//
// Two movements are in the same group when they share a non-null
// `superset_group` AND sit in the same section. Day-scoped grouping is not a
// stylistic choice, it is wrong against data that already exists: on "Gym B —
// Upper (Supported)" the letters A and B are each used once in Primary Strength
// and again in Accessory Strength. Grouping by day would silently weld two
// unrelated pairs into a four-movement block.
//
// ── THE TAG IS NOT THE LABEL ───────────────────────────────────────────────
//
// superset_group is free text and the live data holds three conventions at
// once: bare letters (146 rows), "warmup-A" / "warmup-B" / "cooldown-A" (77),
// and "FIN" (12). Rather than migrate somebody's tagging on a guess — those
// warm-up and finisher circuits are real, and "warmup-A" and "cooldown-A" can
// share a section, so normalising both to "A" would MERGE them — grouping keys
// off the tag exactly as written, and the A1/A2 labels a client sees are
// assigned POSITIONALLY within the section.
//
// So the first group in a section is A, the second B, and so on, whatever the
// tag says. Dustin writes his tags in order, so his A/B/C/D/E come out as
// A/B/C/D/E; a section tagged warmup-A/warmup-B reads A/B; and no two groups
// can ever display the same letter.
//
// ── A GROUP OF ONE IS NOT A SUPERSET ───────────────────────────────────────
//
// Three groups in the live data have a single member — Claudine's Farmer Carry
// and Prone Hamstring Curl among them, tagged C to mark them as the third block
// of the section rather than to pair them with anything. They render as
// ordinary movements. Wrapping one movement in superset chrome would tell the
// client to alternate with nothing.

export interface SupersetPe {
  id: string;
  position: number;
  sets: number | null;
  rest: string | null;
  superset_group: string | null;
}

/** One movement, performed on its own. */
export interface SingleBlock<T> {
  kind: "single";
  pe: T;
}

/** Two or more movements alternated round by round. */
export interface GroupBlock<T> {
  kind: "group";
  /** Display letter, assigned positionally: A, B, C… within this section. */
  label: string;
  /** The tag they actually share, kept for debugging and for the trainer view. */
  tag: string;
  members: T[];
  /**
   * How many times through. The LONGEST member decides: pairing a 3-set
   * movement with a 2-set one is three rounds, and the third has one movement
   * in it. Claudine's D1 Adductor Machine 3x15 / D2 Copenhagen Hold 2x20s is
   * exactly that, so this is not hypothetical.
   */
  rounds: number;
}

export type Block<T> = SingleBlock<T> | GroupBlock<T>;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * A section's movements, in performance order, grouped.
 *
 * Input order is respected throughout: blocks come out in the order their FIRST
 * member appears, and a group's members stay in their own position order. A
 * group whose members are not adjacent still groups — the data is the data —
 * and it takes the place of its first member.
 */
export function groupSection<T extends SupersetPe>(exercises: T[]): Block<T>[] {
  const byTag = new Map<string, T[]>();
  for (const pe of exercises) {
    const tag = (pe.superset_group ?? "").trim();
    if (!tag) continue;
    const list = byTag.get(tag);
    if (list) list.push(pe);
    else byTag.set(tag, [pe]);
  }

  const blocks: Block<T>[] = [];
  const emitted = new Set<string>();
  let nextLetter = 0;

  for (const pe of exercises) {
    const tag = (pe.superset_group ?? "").trim();
    const members = tag ? byTag.get(tag) : undefined;

    // No tag, or the only one wearing it: an ordinary movement.
    if (!members || members.length < 2) {
      blocks.push({ kind: "single", pe });
      continue;
    }
    if (emitted.has(tag)) continue; // already placed at its first member
    emitted.add(tag);
    blocks.push({
      kind: "group",
      label: LETTERS[nextLetter] ?? String(nextLetter + 1),
      tag,
      members,
      rounds: members.reduce((n, m) => Math.max(n, Math.max(1, m.sets ?? 1)), 1),
    });
    nextLetter += 1;
  }
  return blocks;
}

/**
 * "A1", "A2"… for a member of a group.
 */
export function memberLabel(groupLabel: string, index: number): string {
  return groupLabel + String(index + 1);
}

/**
 * Does this rest value mean "no pause, go straight into the next movement"?
 *
 * Dustin's convention is rest = '0' on every movement of a pair except the
 * last. The logger already declined to start a zero-second timer for it — the
 * check at the end of logSet has excluded "0" and "none" from the beginning —
 * but rest was never RENDERED anywhere at all, so the instruction reached the
 * client as silence rather than as a sentence.
 */
export function isImmediate(rest: string | null | undefined): boolean {
  if (rest == null) return false;
  const r = rest.trim().toLowerCase();
  if (!r) return false;
  if (r === "none" || r === "-" || r === "—") return true;
  // "0", "0s", "0 sec", "0 seconds" — a number that is zero, however spelled.
  const m = r.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?$/);
  return m ? Number(m[1]) === 0 : false;
}

/** Human rest text for a movement, or null when there is nothing to say. */
export function restLabel(rest: string | null | undefined): string | null {
  if (rest == null) return null;
  const r = rest.trim();
  if (!r) return null;
  if (isImmediate(r)) return "straight into the next movement";
  // "75s" -> "rest 75s"; anything already wordy is left alone.
  return /^\d/.test(r) ? "rest " + r : r;
}

/**
 * Which members are performed in a given round (0-based).
 *
 * A member with fewer sets than the longest simply drops out of the later
 * rounds rather than showing an input the client cannot fill.
 */
export function membersInRound<T extends SupersetPe>(block: GroupBlock<T>, round: number): T[] {
  return block.members.filter((m) => round < Math.max(1, m.sets ?? 1));
}
