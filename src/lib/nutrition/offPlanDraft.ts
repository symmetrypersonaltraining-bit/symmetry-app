/**
 * THE OFF-PLAN SHEET'S WORK, KEPT WHERE THE PAGE CANNOT TAKE IT.
 *
 * Dustin, 13 Sep 2026, after the previous fix: *"off plan photo still drops
 * off."*
 *
 * The 12 Sep fix stopped `router.refresh()` tearing the sheet down — a real
 * cause, still fixed — but it assumed the React tree survives the camera. On
 * Android it often does not: the OS reclaims the WebView while the camera app
 * is in front and the PWA is RELOADED on return. No amount of care about
 * component identity survives a reload, because there is no component left to
 * be careful about. The same is true of a Capacitor shell restart, a crash, or
 * the app being swiped away mid-analysis.
 *
 * So the in-progress estimate is mirrored out of React and read back on mount.
 * Whatever killed the page, the sheet comes back where it was.
 *
 * ── sessionStorage, deliberately ───────────────────────────────────────────
 *
 * This is work in progress, not a preference. It should survive the camera and
 * it should NOT still be sitting there tomorrow offering to log a meal from
 * yesterday, so it dies with the tab and is cleared the moment the estimate is
 * committed or the sheet is closed.
 *
 * Every read and write is wrapped: a private window, a full quota, or a photo
 * too large to stringify must never break logging a meal. Failing to save the
 * draft costs what the app already did before this file existed.
 */

export interface OffPlanDraft {
  mode: "pick" | "photo" | "typed";
  text: string;
  /** The compressed photo as a data URL — what the preview needs to redraw. */
  photo: string | null;
  est: unknown | null;
  /** When it was stored, so a stale one can be ignored rather than offered. */
  at: number;
}

const KEY = "symmetry_offplan_draft";
/** Long enough to cover a camera, a crash and a relaunch; short enough not to
 *  resurrect yesterday's half-logged snack. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;
/** Past this the photo is dropped from the save rather than failing the write. */
const MAX_PHOTO_CHARS = 3_000_000;

export function saveOffPlanDraft(d: Omit<OffPlanDraft, "at">): void {
  try {
    // Nothing in progress is not worth a row.
    if (d.mode === "pick" && !d.est && !d.photo && !d.text.trim()) {
      clearOffPlanDraft();
      return;
    }
    const photo = d.photo && d.photo.length > MAX_PHOTO_CHARS ? null : d.photo;
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...d, photo, at: Date.now() }));
  } catch {
    /* a lost draft is what happened before this existed */
  }
}

export function readOffPlanDraft(): OffPlanDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<OffPlanDraft>;
    if (!d || typeof d !== "object") return null;
    if (typeof d.at !== "number" || Date.now() - d.at > DRAFT_TTL_MS) {
      clearOffPlanDraft();
      return null;
    }
    const mode = d.mode === "photo" || d.mode === "typed" ? d.mode : "pick";
    return {
      mode,
      text: typeof d.text === "string" ? d.text : "",
      photo: typeof d.photo === "string" ? d.photo : null,
      est: d.est ?? null,
      at: d.at,
    };
  } catch {
    return null;
  }
}

export function clearOffPlanDraft(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
