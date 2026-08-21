import { COACH_FIRST_NAME } from "./trainer";
// Who has a birthday, and what the group chat says about it.
//
// Dustin, 2026-08-04: "lets activate an automatic fun bday msg for everyone in
// the group chat on the app." Coach Bot's voice, not Dustin's — the app being
// honestly the app rather than putting warm words in his mouth automatically.
//
// Split out of the route so the date maths and the wording rules can be tested
// without a database or a model.

/** Central time, because that is where the gym is and where the day turns. */
export function centralToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** "MM-DD" for a YYYY-MM-DD date, which is all a birthday comparison needs. */
export function monthDay(iso: string): string {
  return (iso || "").slice(5, 10);
}

/** The day after an ISO date, in ISO. Used for the evening-before heads-up. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/**
 * 29 February.
 *
 * Four out of five years it does not exist, and a client born on it would
 * silently never get a birthday message — the exact failure this feature is
 * supposed to prevent. In a non-leap year they are wished on the 28th, which is
 * what most people do and what nobody has ever objected to.
 */
export function effectiveMonthDay(dobMonthDay: string, todayIso: string): string {
  if (dobMonthDay !== "02-29") return dobMonthDay;
  const year = Number(todayIso.slice(0, 4));
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? "02-29" : "02-28";
}

export interface BirthdayPerson {
  id: string;
  firstName: string;
}

/**
 * The message, when the model is unavailable or says something we won't print.
 *
 * A birthday message that does not arrive is a worse failure than a birthday
 * message that is merely nice, so there is always something to fall back to.
 * Varied by name length rather than at random, because a workflow that cannot
 * call Math.random still has to not repeat itself all year.
 */
export function fallbackLine(people: BirthdayPerson[]): string {
  const names = joinNames(people.map((p) => p.firstName));
  const options = [
    `🎂 It's ${names}'s birthday. Everybody be nice for exactly one day.`,
    `🎂 Birthday alert: ${names}. Rest day granted, and only because we like you.`,
    `🎂 ${names} has a birthday today. The gym will still be here tomorrow.`,
    `🎂 Today belongs to ${names}. Cake is a macro if you're brave enough.`,
  ];
  const pick = (names.length + people.length) % options.length;
  return options[pick];
}

/** "Stacie", "Stacie and Gerard", "Stacie, Gerard and Todd". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Things a birthday message in a fitness group chat must never do.
 *
 * The prompt asks; this decides. Same rule as Coach Bot: a prompt is a request,
 * a filter is a guarantee.
 *
 *   AGE. Nobody agreed to have their age announced to thirty-five people. The
 *        date of birth is in the app so we know WHEN, never so we can publish
 *        HOW OLD. This is also why the intake asks for it and the group post
 *        never repeats it.
 *   BODY. Weight, size, shape, what they eat. Not on a birthday, not ever.
 *   BACKHANDED. "Finally showing up for once" is not a birthday wish.
 */
const BANNED = [
  /\b\d{1,3}\s*(?:st|nd|rd|th)?\s*(?:birthday|years?\s*old|yo)\b/i,
  /\bturn(?:s|ing|ed)?\s+\d{1,3}\b/i,
  /\bage(?:d)?\s+\d{1,3}\b/i,
  /\bhalf\s*a\s*century|\bover\s*the\s*hill\b|\bancient\b|\bold\s*(?:man|lady|timer)\b/i,
  /\b(?:weight|weigh|pounds\s+lighter|fat|skinny|chubby|belly|gut)\b/i,
  /\b(?:finally|for once|actually)\s+(?:showed|shows|showing|turned)\s*up\b/i,
];

export function isPrintable(message: string, people: BirthdayPerson[]): boolean {
  const m = (message || "").trim();
  if (m.length < 8 || m.length > 240) return false;
  for (const re of BANNED) if (re.test(m)) return false;
  // It has to actually name the person. A birthday message that doesn't say
  // whose birthday it is has no reason to exist.
  return people.some((p) => m.toLowerCase().includes(p.firstName.toLowerCase()));
}

// A function taking the OWNER's name, which the caller resolves from the
// trainers table. The group chat is shared by decision — Dustin, 20 Aug: "let's
// keep the group chat the same. All clients can go in there" — so one bot, one
// voice, and the business owner is whose gym it describes. That is a DECISION,
// and it should read like one: a module constant here would give the same
// answer today by accident and the wrong one the moment the constant changes.
export const BIRTHDAY_SYSTEM = (coachFirstName: string) => `You are "Coach Bot" in the group chat of Symmetry Personal Training — a small gym run by ${coachFirstName}, about thirty-five clients who mostly know each other and train together.

Today is someone's birthday. Write the group chat message.

TONE
- Warm first, funny second. This is a birthday, not a roast. The person should smile, not brace.
- One or two sentences. Short is funnier and reads better on a phone.
- Gym humour is welcome — rest days, cake as a macro, the squat rack observing a moment of silence.
- Use their first name, exactly as given.

NEVER
- Never mention or imply their age, what year they were born, or how many birthdays this is. You are not told their age and must not guess at one.
- Never mention weight, body size, shape, or what they eat, even as a compliment.
- Never make it backhanded — nothing about them finally showing up, or being overdue.
- No hashtags. No "let's crush it". No motivational-poster language. At most one emoji.

If more than one person shares the day, wish them together in one message; do not write two.

Respond with ONLY valid JSON — no markdown, no fences:
{"message": string}`;
