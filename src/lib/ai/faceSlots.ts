/**
 * The twenty faces a trainer's own set has to fill, in the order the upload
 * screen and the Gemini prompt both use.
 *
 * Dustin, 21 Aug, on trainers having "their own avatar / bot persona set".
 *
 * These are the FILENAMES `faceSrc()` builds a path from — a set lives at
 * /bots/<set>/<slug>.webp — so the list is not decorative. The script first
 * sent to trainers asked for twenty poses of its own invention ("laughing,
 * focused, confused, thumbs up, catching breath"), which meant seven real
 * slots — hydrate, nutrition, streak, pr, messages, plan, tips — would have
 * come back empty while four good images had nowhere to go.
 *
 * The `what` line is what the trainer reads next to the upload box. It says
 * WHEN the app uses that face, because "stern" alone is not enough to know
 * what to pose for.
 *
 * Derived from ART in faces.ts rather than typed twice: a slot added there and
 * not here would be a face nobody could ever upload. The test asserts they
 * agree.
 */

export interface FaceSlot {
  slug: string;
  label: string;
  what: string;
}

export const FACE_SLOTS: FaceSlot[] = [
  { slug: "neutral",    label: "Neutral",     what: "The default — used more than any other. Relaxed and approachable." },
  { slug: "thinking",   label: "Thinking",    what: "Working something out, or the app is generating." },
  { slug: "explaining", label: "Explaining",  what: "Walking somebody through a screen." },
  { slug: "plan",       label: "Plan",        what: "Programmes, the weekly focus, anything scheduled." },
  { slug: "happy",      label: "Happy",       what: "A day logged, a decent week, a small win." },
  { slug: "hype",       label: "Hype",        what: "A goal hit, a milestone. Big energy." },
  { slug: "pr",         label: "Personal record", what: "Specifically a PR." },
  { slug: "flex",       label: "Flex",        what: "Strength progress." },
  { slug: "cool",       label: "Cool",        what: "Everything on rails. Understated." },
  { slug: "streak",     label: "Streak",      what: "A long run of logged days." },
  { slug: "concerned",  label: "Concerned",   what: "Missed a day or two. Caring, not cross." },
  { slug: "stern",      label: "Stern",       what: "A real lapse. Firm, not hostile." },
  { slug: "callout",    label: "Callout",     what: "Pointed. The app uses this one sparingly." },
  { slug: "nutrition",  label: "Nutrition",   what: "Meals and macros." },
  { slug: "hydrate",    label: "Hydrate",     what: "Water and shakes." },
  { slug: "lifting",    label: "Lifting",     what: "A workout in progress." },
  { slug: "rest",       label: "Rest",        what: "Rest days, deloads, recovery." },
  { slug: "tips",       label: "Tips",        what: "App tips and what's new." },
  { slug: "messages",   label: "Messages",    what: "The inbox and replies." },
  { slug: "confident",  label: "Confident",   what: "Signed off, approved, all clear." },
];

export const FACE_SLUGS: string[] = FACE_SLOTS.map((s) => s.slug);

/**
 * The slots grouped by WHERE THEY APPEAR, because that is the question a
 * trainer is actually asking when they sit down to make these.
 *
 * Dustin, 23 Aug: "a section for each type: group msg bot, ai cards,
 * celebrations, etc."
 *
 * A flat list of twenty is a chore with no shape — it does not tell you that
 * four of them are the whole emotional range of a nudge, or that the first
 * five are 60% of everything the app renders. Sections give the work an order:
 * do the ones that show up constantly, then the ones that show up at a moment
 * that matters.
 *
 * `priority` is what the upload screen sorts by and what the copy leans on.
 * "Do these first" is a real answer to "which five tonight?".
 */
export interface FaceSection {
  id: string;
  title: string;
  blurb: string;
  slugs: string[];
  /** 1 = do these first. */
  priority: 1 | 2 | 3;
}

export const FACE_SECTIONS: FaceSection[] = [
  {
    id: "everyday",
    title: "Everyday AI cards",
    blurb:
      "The faces on ordinary app cards — the assistant, the weekly plan, anything being explained or generated. Between them these are most of what anyone sees, so they are the ones worth doing first.",
    slugs: ["neutral", "thinking", "explaining", "plan", "tips"],
    priority: 1,
  },
  {
    id: "celebrations",
    title: "Celebrations and wins",
    blurb:
      "The full-screen moment after a session, a personal record, a streak. These are the ones people screenshot, so they are worth more effort than their frequency suggests.",
    slugs: ["happy", "hype", "pr", "flex", "cool", "streak", "confident"],
    priority: 1,
  },
  {
    id: "checkins",
    title: "Check-ins and nudges",
    blurb:
      "When somebody has gone quiet. The app climbs this ladder gently — caring, then firm — and the face has to climb with it. Nothing here should look angry.",
    slugs: ["concerned", "stern", "callout", "quiet_note"],
    priority: 2,
  },
  {
    id: "group",
    title: "Group chat bot",
    blurb:
      "The face on Coach Bot's posts in your group chat, and on message and inbox cards.",
    slugs: ["messages"],
    priority: 2,
  },
  {
    id: "topics",
    title: "Topics",
    blurb: "Nutrition, training, water, rest days. Used on the screen that matches.",
    slugs: ["nutrition", "hydrate", "lifting", "rest"],
    priority: 3,
  },
];

/**
 * `quiet_note` is a SECTION-ONLY entry, not a slot. The check-in ladder has a
 * third rung — a client who has been silent three weeks and was never a regular
 * logger — and it deliberately reuses `thinking` rather than a disappointed
 * face (see faces.ts). Naming it here keeps the ladder legible on the upload
 * screen; it is filtered out before anything asks for a file.
 */
const NOT_A_SLOT = new Set(["quiet_note"]);

/** The sections with only real, uploadable slugs in them. */
export const UPLOADABLE_SECTIONS: FaceSection[] = FACE_SECTIONS.map((s) => ({
  ...s,
  slugs: s.slugs.filter((x) => !NOT_A_SLOT.has(x)),
}));

const BY_SLUG = new Map(FACE_SLOTS.map((s) => [s.slug, s]));

/** The slot record for a slug, or null if it is not one. */
export function faceSlot(slug: string): FaceSlot | null {
  return BY_SLUG.get(slug) ?? null;
}
