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
  /**
   * When the appointment last changed. Drives the incremental pass — an event
   * already on the calendar and untouched since the last clean publish is
   * skipped rather than rewritten.
   */
  updated_at?: string | null;
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
  /** Already correct, so not rewritten. The normal case on a routine run. */
  unchanged: number;
  /** True when maxWrites stopped the pass early — the next run finishes it. */
  cappedAt: number | null;
  errors: string[];
};

/**
 * Make the mirror calendar say exactly what `sessions` says, and nothing else.
 *
 * `sessions` must already be the complete set for the window — a partial list
 * here does not under-publish, it DELETES, because anything of ours not in the
 * list is treated as a session that no longer exists. The caller pages its read
 * for that reason.
 *
 * ── WHY IT IS INCREMENTAL ────────────────────────────────────────────────────
 *
 * Dustin has 721 sessions in the window. Rewriting all of them is 721 Google
 * calls — well over a minute, and this has to finish inside the sync's budget
 * if a cancellation is going to reach the gym without anyone pressing a button.
 *
 * So: LISTING is one request per 2,500 events and always happens, because that
 * is what makes a deletion detectable. WRITING is skipped for any event that
 * already exists and whose appointment has not been touched since the last
 * successful pass. A routine run writes the handful that actually moved.
 *
 * `since` must be the last SUCCESSFUL publish. Pass null to rewrite everything
 * — first run, or when something has been edited on the mirror by hand.
 */
export async function mirrorSessions(opts: {
  token: string;
  calendarId: string | null;
  sessions: MirrorSession[];
  windowStart: Date;
  windowEnd: Date;
  /** Skip events unchanged since this. null = rewrite the lot. */
  since?: Date | null;
  /** Stop after this many writes so a big first run cannot blow the budget. */
  maxWrites?: number;
  /**
   * Wall-clock stop, as an epoch ms. A write count is a poor proxy for time —
   * 200 calls is fine at 40 ms each and fatal at 400 ms — and it was the write
   * count alone that let this overrun and take the calendar sync with it.
   */
  deadlineMs?: number;
}): Promise<MirrorResult> {
  const { calendarId, created } = await ensureMirrorCalendar(opts.token, opts.calendarId);
  const errors: string[] = [];
  const maxWrites = opts.maxWrites ?? Number.POSITIVE_INFINITY;
  let written = 0;
  let unchanged = 0;
  let removed = 0;
  let cappedAt: number | null = null;

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
    // Skipped only when the event is ALREADY THERE and untouched. A session
    // that has never been published is written however old it is — otherwise a
    // `since` in the future would quietly publish nothing at all.
    if (
      opts.since &&
      existing.has(eventId) &&
      new Date(session.updated_at || 0) <= opts.since
    ) {
      unchanged += 1;
      continue;
    }
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) {
      cappedAt = written;
      break;
    }
    if (written >= maxWrites) {
      // Named, not silent. A capped run that reported success would look
      // identical to a complete one, and the gym would be missing sessions
      // nobody knew were missing.
      cappedAt = maxWrites;
      break;
    }
    // CREATE IS A POST, UPDATE IS A PUT — and getting that wrong is what broke
    // this on 25 Aug. The original code PUT everything on the belief that a PUT
    // to a not-yet-existing id creates it. It does not: Google answers 404, so
    // EVERY event failed, nothing was ever created, and because nothing
    // succeeded the next run retried all of them. Two hundred doomed calls an
    // hour, inside the calendar sync's own time budget, which is what took the
    // sync down. Google's events.insert takes a caller-supplied `id` in the
    // BODY; events.update needs the event to already exist.
    const payload = mirrorEventBody(session);
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
    try {
      if (existing.has(eventId)) {
        await gcalFetch(opts.token, `${base}/${eventId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        try {
          await gcalFetch(opts.token, base, {
            method: "POST",
            body: JSON.stringify({ ...payload, id: eventId }),
          });
        } catch (e) {
          // 409 = the id is already taken, which happens when a previous run
          // created it and our listing missed it (a cancelled event, a paging
          // edge). Updating it is the right answer, not reporting a failure.
          if (!/\b409\b/.test((e as Error).message)) throw e;
          await gcalFetch(opts.token, `${base}/${eventId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
      }
      written += 1;
    } catch (e) {
      errors.push(`${session.display_name} ${session.starts_at}: ${(e as Error).message}`);
    }
  }

  // Anything of OURS in the window that is no longer a session. A cancelled
  // session is still a session and is still in `wanted` — this is for the ones
  // deleted from his calendar outright, which must not linger on the gym's.
  //
  // Runs even when the write pass was capped: a deletion is one call and it is
  // the change people most need to see, so it is never the thing that waits.
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

  return { calendarId, createdCalendar: created, written, unchanged, removed, cappedAt, errors };
}
