// One place that turns a Central wall-clock time into an unambiguous instant.
//
// The business runs entirely in America/Chicago. The trainer types "9:00" and
// means 9am Central. Getting that into a `timestamptz` column and into Google
// Calendar are two different problems and both have a sharp edge:
//
//   Google Calendar  accepts a naive dateTime PROVIDED the request also sends
//                    timeZone: 'America/Chicago'. It does, so a naive string is
//                    fine there.
//
//   appointments.scheduled_at  is `timestamptz`. Postgres resolves a naive
//                    string using the CONNECTION's timezone, which on this stack
//                    is UTC. A naive "2026-08-03T09:00:00" therefore lands as
//                    09:00 UTC = 04:00 Central -- every edited appointment
//                    silently moved five hours earlier.
//
// So the string has to carry an explicit offset, and the offset has to be the
// RIGHT one for that date. The previous code hardcoded `-05:00`, which is CDT.
// From the first Sunday in November to the second Sunday in March, Central is
// CST (-06:00), so for roughly four months a year every appointment the trainer
// edited was written an hour early.
//
// Hardcoding either value is wrong half the year. Ask Intl instead -- it knows
// the DST rules and keeps knowing them when Congress next changes them.

/**
 * The UTC offset for America/Chicago on a given calendar date, as "-05:00" or
 * "-06:00".
 *
 * Probes at 12:00 UTC, which is 06:00/07:00 Central on the same calendar date.
 * DST transitions happen at 02:00 local, so a midday probe always sits on the
 * correct side of the change for any session in a training day. (A 00:00-02:00
 * local appointment on a transition date would be ambiguous -- no such session
 * exists, and the ambiguity is inherent to wall-clock time, not to this code.)
 */
export function centralOffsetForDate(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return "-06:00"; // CST, the conservative default
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-06:00";
}

/**
 * "2026-08-03" + "09:00" -> "2026-08-03T09:00:00-05:00"
 *
 * Use this for anything that will be stored in a timestamptz column or sent
 * anywhere the timezone is not stated separately.
 */
export function centralIso(dateStr: string, timeHHmm: string): string {
  return `${dateStr}T${timeHHmm}:00${centralOffsetForDate(dateStr)}`;
}

/**
 * Today's date in Central, as "YYYY-MM-DD".
 *
 * The server runs UTC, so `new Date().toISOString().slice(0,10)` is tomorrow
 * from 19:00 Central onward. This is the only correct way to ask "what day is
 * it" in this codebase.
 */
export function centralToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/**
 * The weekday (0 = Sunday) of a "YYYY-MM-DD" date, in Central.
 *
 * `new Date().getDay()` answers in whatever zone the CODE is running in — UTC
 * on the server, the handset's zone in a browser. Both are wrong here. From
 * 19:00 Central the server's "now" is already tomorrow, so a week that starts
 * on Sunday started on Monday; and a client travelling out of Central had the
 * ring highlight a different day than the date beneath it.
 *
 * Anchored through Date.UTC so the parts go in and come straight back out
 * without a zone ever being consulted.
 */
export function centralDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Sunday that begins the week containing `dateStr`, in Central. */
export function centralWeekStart(dateStr: string): string {
  return shiftDate(dateStr, -centralDayOfWeek(dateStr));
}

/**
 * Calendar arithmetic on a "YYYY-MM-DD" string, in days, without ever touching
 * a timezone. Date.UTC + setUTCDate is exact; `setDate` on a local Date is not.
 */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The one timezone this business runs in. Never inline the string. */
export const CENTRAL = "America/Chicago";

/**
 * Format an INSTANT — a `timestamptz`, a `created_at`, a Date — in Central.
 *
 * `new Date(created_at).toLocaleDateString("en-US", { month: "short", day:
 * "numeric" })` renders in whatever zone the reader is sitting in. An
 * announcement Dustin posted at 8pm Central was captioned with tomorrow's
 * weekday on a phone one zone east, and the same assessment printed a different
 * date on two different tabs of the same client profile — `AssessmentTab` had
 * remembered the timeZone option, `AssessmentPanel` had not.
 *
 * `timeZone` is baked in here rather than left as a caller option, so it cannot
 * be the thing somebody forgets.
 */
export function centralFormat(
  instant: string | number | Date,
  opts: Intl.DateTimeFormatOptions,
  locale: string = "en-US",
): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: CENTRAL }).format(new Date(instant));
}

/**
 * Format a CALENDAR DATE — "YYYY-MM-DD", no instant involved.
 *
 * Anchored through Date.UTC and read back as UTC, so the parts go in and come
 * straight out. That is provably right, where `new Date(d + "T12:00:00")` — the
 * trick used in about twenty places here — is only accidentally right: it
 * happens to survive because noon is far enough from midnight that no viewer's
 * offset can push it across a date boundary. True today, and true only while
 * nobody changes the noon.
 */
export function centralFormatDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions,
  locale: string = "en-US",
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * The Central wall-clock hour right now, 0-23.
 *
 * For greeting buckets and "is it evening yet" gates. Replaces the
 * parse-a-formatted-string round trip (`new Date(new Date().toLocaleString(...))`)
 * which yields the right hour by accident, produces a Date whose instant is
 * wrong by the offset, and relies on Date parsing a non-ISO en-US string, which
 * is implementation-defined.
 */
export function centralHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL, hour: "numeric", hour12: false })
      .format(new Date())
      .replace(/\D/g, ""),
  ) % 24;
}

/**
 * The Central calendar date of an INSTANT, as "YYYY-MM-DD".
 *
 * The half of `centralToday()` that was missing. "Is this message from today"
 * was being asked as `d.toDateString() === new Date().toDateString()`, which
 * compares two device-local days: a message sent at 8pm Central read "Today"
 * in Texas and "Yesterday" one zone east, on the same message.
 */
export function centralDateOf(instant: string | number | Date): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: CENTRAL });
}

/**
 * Minutes past Central midnight for an INSTANT, 0-1439.
 *
 * The trainer calendar positions each session block with
 * `start.getHours() * 60 + start.getMinutes()`, which is the hour on the
 * DEVICE. Off Central the block was drawn in the wrong row of the day, visually
 * contradicting the time printed on it.
 */
export function centralMinutes(instant: string | number | Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL, hour: "numeric", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(instant));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** "HH:mm" in Central for an INSTANT — what a time input expects. */
export function centralTimeHHmm(instant: string | number | Date): string {
  const t = centralMinutes(instant);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
