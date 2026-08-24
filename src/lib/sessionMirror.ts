/**
 * The mirrored Google calendar — the sessions, on a calendar of their own.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 *
 * Dustin, 24 Aug 2026: "the gym uses pushpress calendar for the trainers. I use
 * gcal for mine. I just need my gcal to sync to a cal in pushpress so they are
 * able to see my schedule."
 *
 * PushPress cannot be written to — its whole public appointment surface is
 * `GET /appts/{id}`. But PushPress GROW can read a Google calendar: its
 * Two-Way and Smart Sync modes pull Google events INTO PushPress, where they
 * appear on the gym's calendar. That is the door.
 *
 * And it is exactly why this file exists rather than pointing PushPress at his
 * own calendar. That sync connects to a Google ACCOUNT, and his primary
 * calendar is his life — the dentist, the school run, his own training. Every
 * bit of it would land on the gym's shared calendar. He asked for "only my
 * client sessions", and the only way to honour that is to publish those
 * sessions onto a calendar that contains nothing else.
 *
 * ── WHAT IT WRITES, AND WHAT IT MUST NEVER TOUCH ─────────────────────────────
 *
 * A secondary calendar, created by us, owned by him, containing nothing but
 * client sessions. THE PRIMARY CALENDAR IS NEVER WRITTEN TO. Not once, not as
 * a fallback, not if the secondary is missing — if we cannot resolve our own
 * calendar id we stop, because the failure mode of getting that wrong is
 * writing rows into the calendar the entire billing system reads.
 *
 * ── WHY THE EVENT IDS ARE DERIVED ────────────────────────────────────────────
 *
 * Google accepts a caller-supplied event id made of lowercase a–v and 0–9. An
 * appointment's uuid with the dashes removed is 32 hex characters, which is
 * inside that alphabet — so every session has ONE id, forever, and a re-run
 * updates the event it wrote last time instead of adding a second copy. A
 * mirror that duplicates on every pass is worse than no mirror: the gym sees
 * the same client three times and stops trusting any of it.
 */

import { gcalFetch } from "@/lib/gcal";

export const MIRROR_CALENDAR_SUMMARY = "Symmetry — Client Sessions";

export type MirrorSession = {
  appointment_id: string;
  starts_at: string;
  ends_at: string;
  cancelled: boolean;
  display_name: string;
};

/** Google's palette. 9 = Blueberry (his blue), 6 = Tangerine (his orange). */
const COLOR_BOOKED = "9";
const COLOR_CANCELLED = "6";

/** uuid → a legal Google event id. Hex is a subset of Google's a–v/0–9. */
export function mirrorEventId(appointmentId: string): string {
  const id = appointmentId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-v]{5,1024}$/.test(id)) {
    throw new Error(`mirrorEventId: ${appointmentId} does not reduce to a legal Google event id`);
  }
  return id;
}

export function mirrorEventBody(s: MirrorSession) {
  return {
    summary: s.cancelled ? `CANCELLED — ${s.display_name}` : s.display_name,
    start: { dateTime: new Date(s.starts_at).toISOString() },
    end: { dateTime: new Date(s.ends_at).toISOString() },
    colorId: s.cancelled ? COLOR_CANCELLED : COLOR_BOOKED,
    // Booked blocks the slot; a cancellation leaves it open. Anyone scanning
    // the gym calendar for a free hour reads that without opening anything.
    transparency: s.cancelled ? "transparent" : "opaque",
    // No guests, ever. An attendee would email the client and, on a Two-Way
    // PushPress sync, create a contact record for them in the gym's CRM.
    attendees: [],
    reminders: { useDefault: false, overrides: [] },
    // Marks ours. The reconcile below deletes only events carrying this, so a
    // note somebody adds to the shared calendar by hand survives.
    extendedProperties: { private: { symmetry_mirror: "1" } },
  };
}

/**
 * Find our calendar in this account, or make it.
 *
 * Matched by id when we already hold one, and only then by name — a name match
 * alone would adopt any calendar somebody happened to call the same thing, and
 * then start deleting events out of it.
 */
export async function ensureMirrorCalendar(
  token: string,
  knownId: string | null,
): Promise<{ calendarId: string; created: boolean }> {
  if (knownId) {
    try {
      const cal = await gcalFetch(token, `/calendars/${encodeURIComponent(knownId)}`);
      if (cal?.id) return { calendarId: cal.id, created: false };
    } catch {
      // Deleted at Google, or unshared. Fall through and make a new one.
    }
  }

  const created = await gcalFetch(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: MIRROR_CALENDAR_SUMMARY,
      description:
        "Client sessions only, published automatically by the Symmetry app. " +
        "Do not edit by hand — changes here are overwritten. Edit the session " +
        "in your main calendar instead.",
      timeZone: "America/Chicago",
    }),
  });
  if (!created?.id) throw new Error("Could not create the mirror calendar");
  return { calendarId: created.id, created: true };
}

type Existing = { id: string; mine: boolean };

/** Every event we previously wrote into the mirror, inside the window. */
async function listMirrored(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<Map<string, Existing>> {
  const out = new Map<string, Existing>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      maxResults: "2500",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gcalFetch(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );
    for (const ev of data?.items || []) {
      if (!ev?.id) continue;
      out.set(ev.id, { id: ev.id, mine: ev.extendedProperties?.private?.symmetry_mirror === "1" });
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return out;
}

export type MirrorResult = {
  calendarId: string;
  createdCalendar: boolean;
  written: number;
  removed: number;
  errors: string[];
};

/**
 * Make the mirror calendar say exactly what `sessions` says, and nothing else.
 *
 * `sessions` must already be the complete set for the window — a partial list
 * here does not under-publish, it DELETES, because anything of ours not in the
 * list is treated as a session that no longer exists. The caller pages its read
 * for that reason.
 */
export async function mirrorSessions(opts: {
  token: string;
  calendarId: string | null;
  sessions: MirrorSession[];
  windowStart: Date;
  windowEnd: Date;
}): Promise<MirrorResult> {
  const { calendarId, created } = await ensureMirrorCalendar(opts.token, opts.calendarId);
  const errors: string[] = [];
  let written = 0;
  let removed = 0;

  const wanted = new Map<string, MirrorSession>();
  for (const s of opts.sessions) {
    try {
      wanted.set(mirrorEventId(s.appointment_id), s);
    } catch (e) {
      errors.push(String((e as Error).message));
    }
  }

  const existing = created
    ? new Map<string, Existing>()
    : await listMirrored(
        opts.token,
        calendarId,
        opts.windowStart.toISOString(),
        opts.windowEnd.toISOString(),
      );

  for (const [eventId, session] of wanted) {
    const body = JSON.stringify(mirrorEventBody(session));
    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;
    try {
      if (existing.has(eventId)) {
        await gcalFetch(opts.token, path, { method: "PUT", body });
      } else {
        // Insert with our own id. `import` rather than `insert` would need an
        // iCalUID and organizer; a PUT to a not-yet-existing id creates it.
        await gcalFetch(opts.token, path, { method: "PUT", body });
      }
      written += 1;
    } catch (e) {
      errors.push(`${session.display_name} ${session.starts_at}: ${(e as Error).message}`);
    }
  }

  // Anything of OURS in the window that is no longer a session. A cancelled
  // session is still a session and is still in `wanted` — this is for the ones
  // deleted from his calendar outright, which must not linger on the gym's.
  for (const [eventId, row] of existing) {
    if (wanted.has(eventId)) continue;
    if (!row.mine) continue; // never touch an event we did not write
    try {
      await gcalFetch(opts.token, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
        method: "DELETE",
      });
      removed += 1;
    } catch (e) {
      errors.push(`remove ${eventId}: ${(e as Error).message}`);
    }
  }

  return { calendarId, createdCalendar: created, written, removed, errors };
}
