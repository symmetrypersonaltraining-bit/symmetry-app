/**
 * The published session feed — one trainer's booked clients, as a calendar
 * anybody can subscribe to.
 *
 * ── WHY A FEED AND NOT A PUSH ────────────────────────────────────────────────
 *
 * Dustin, 24 Aug 2026: "i want only my client sessions synced so that push
 * press calendar (yes for sevens gym) sees where i have cleints so other
 * trainers can see it."
 *
 * PushPress cannot be written to. Its public API (api.pushpress.com/v3) exposes
 * exactly one appointment operation — `GET /appts/{id}` — and the only writes
 * anywhere in it are create-a-customer, create-an-invitation, create-a-key,
 * register-a-webhook and send-a-message. Zapier's PushPress connector runs on
 * that same API, so it cannot do what the API cannot. And Grow's "connect to
 * Google" reads a calendar to block out busy time for its own booking flow; it
 * never shows anyone a client's name.
 *
 * So the sessions get PUBLISHED and subscribed to. One .ics URL works in Google
 * Calendar, Apple Calendar, Outlook, and in PushPress if it ever accepts an
 * external feed — and it needs nobody to sign in to anything.
 *
 * ── WHAT IT PUBLISHES ────────────────────────────────────────────────────────
 *
 * `appointments` is already the right set: it IS the trainer's Google Calendar
 * after the sync has kept only events matching a real client, stripped the
 * payment entries, and mapped orange (colorId 6) to cancelled_client. His own
 * diary, the dentist, the school run — none of it was ever in there. Nothing
 * needs re-filtering here, which is the whole reason this is small.
 *
 * A cancelled session stays in the feed, marked, rather than disappearing: the
 * other trainers want to know the slot exists and is now free, which is exactly
 * what TRANSP says. Booked is OPAQUE (busy), cancelled is TRANSPARENT (free),
 * so a colleague looking for a gap sees one without having to read titles.
 */

export type FeedEvent = {
  appointment_id: string;
  starts_at: string;
  ends_at: string;
  cancelled: boolean;
  display_name: string;
  updated_at: string;
};

/** RFC 5545 TEXT escaping. Backslash first, or it escapes its own escapes. */
function escapeText(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 says no content line may exceed 75 OCTETS, and the count is octets
 * rather than characters — an accented name or an em dash is two or three of
 * them. Folding on character count splits a multi-byte sequence down the middle
 * and hands the subscriber a mojibake title, so this measures bytes and never
 * breaks inside one.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off a continuation byte (10xxxxxx) so a character stays whole.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join("\r\n ");
}

/** `2026-08-24T14:30:00Z` → `20260824T143000Z`. Calendars want UTC basic form. */
export function icsStamp(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type BuildFeedOptions = {
  events: FeedEvent[];
  /** Shown as the calendar's name once subscribed, e.g. "Dustin — Client Sessions". */
  calendarName: string;
  /** Fixed by the caller so the same data serialises identically twice. */
  now: Date;
};

export function buildSessionFeed({ events, calendarName, now }: BuildFeedOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Symmetry Personal Training//Session Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:America/Chicago",
    // Both spellings on purpose. REFRESH-INTERVAL is the standard one (RFC
    // 7986); X-PUBLISHED-TTL is what Outlook actually reads. Neither is binding
    // — Google polls a subscribed URL on its own schedule, which can be hours —
    // and that latency is the reason the mirrored Google calendar exists too.
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const e of events) {
    const summary = e.cancelled ? `CANCELLED — ${e.display_name}` : e.display_name;
    lines.push(
      "BEGIN:VEVENT",
      // Stable for the life of the appointment row, so an edit updates the
      // event a subscriber already has instead of adding a second one.
      `UID:${e.appointment_id}@symmetry-app`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(e.starts_at)}`,
      `DTEND:${icsStamp(e.ends_at)}`,
      `SUMMARY:${escapeText(summary)}`,
      // Deliberately CONFIRMED even when cancelled. STATUS:CANCELLED makes
      // Google and Apple hide the event or strike it through, and the point of
      // keeping it is that another trainer can SEE the slot came free.
      "STATUS:CONFIRMED",
      // The half that makes the feed useful at a glance: a booked session
      // blocks the slot, a cancelled one leaves it open.
      e.cancelled ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
      `LAST-MODIFIED:${icsStamp(e.updated_at || now)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // CRLF, not LF. Half the calendar clients in the world are strict about it.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
