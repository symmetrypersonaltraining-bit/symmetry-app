/**
 * Light / Dark / Auto — the one place the three values and the storage key are
 * written down. 2026-09-11.
 *
 * The mechanism predates the toggle: <AutoDark/> has read
 * localStorage.symmetry_appearance since 25 Jul, but nothing ever wrote it, so
 * the app always followed the phone. Dustin, 11 Sep: *"There should be a light
 * mode and a dark mode toggle. We do not have that that I'm aware of right
 * now."* He was right — the reader existed, the writer did not.
 *
 * This is deliberately NOT stored on the account the way the theme and depth
 * are. A phone at 9pm and a laptop at 9am want different answers, and "Auto"
 * already gives each device the right one; syncing the override would force
 * one device's choice onto the other.
 */
export const APPEARANCE_KEY = "symmetry_appearance";

/** Fired on window after a write, because `storage` skips the writing tab. */
export const APPEARANCE_EVENT = "symmetry-appearance-change";

export const APPEARANCES = [
  { value: "auto",  label: "Auto",  hint: "Follow phone" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark",  label: "Dark",  hint: "Always dark" },
] as const;

export type Appearance = (typeof APPEARANCES)[number]["value"];

export function isAppearance(v: unknown): v is Appearance {
  return typeof v === "string" && APPEARANCES.some((a) => a.value === v);
}

/** Anything unrecognised — or no storage at all — reads as Auto. */
export function readAppearance(): Appearance {
  try {
    const v = window.localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeAppearance(a: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, a);
    window.dispatchEvent(new Event(APPEARANCE_EVENT));
  } catch {
    /* a preference must never break the app */
  }
}
