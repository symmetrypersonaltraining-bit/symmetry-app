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
