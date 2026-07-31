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
 * Calendar arithmetic on a "YYYY-MM-DD" string, in days, without ever touching
 * a timezone. Date.UTC + setUTCDate is exact; `setDate` on a local Date is not.
 */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
