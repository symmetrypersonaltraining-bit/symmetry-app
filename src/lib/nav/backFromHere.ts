/**
 * A WAY BACK FROM EVERY SCREEN — the decision, kept out of the component so it
 * can be tested without a DOM.
 *
 * Dustin, 11 Sep 2026, from his desktop on /recipes: *"There is no actual back
 * button from desktop… what are your thoughts on putting an actual small back
 * button on everything throughout the entire app so no matter which screen
 * you're in, you always have a way to go back one page?"* — and, confirming:
 * *"Go ahead with the back button. Just be careful on this one. The actual back
 * button on mobile phones still needs to work as it does right now, the same
 * exact way as clicking the in-app back button. Those two buttons should work
 * the exact same way. When you hit either button, it needs to go back one page
 * — the previous screen you were looking at."*
 *
 * So this does EXACTLY what BackButtonGuard does for the Android hardware key,
 * and nothing more: if the history has somewhere to go, go back one entry; if
 * it does not, go Home rather than doing nothing. Same two branches, same
 * fallback. One rule, two buttons.
 *
 * WHAT IT MUST NEVER DO: push an invented history entry so that Back "has
 * somewhere to go". BackButtonGuard v2 and v3 both did that, and a sentinel
 * entry with the same URL re-rendered the identical screen and read as "Back
 * did nothing" — reloads re-armed it until every press was dead. This helper
 * decides; it never writes history.
 */

/**
 * The pages that ARE the bottom nav. Back has no meaning on a tab root — you
 * did not drill into it, you picked it — so the control does not draw there.
 * Client View reaches the same screens under a /client-preview prefix or an
 * ?as=client flag; the prefix is stripped before comparing so both mounts of
 * the one top bar agree (ClientTopBar's whole reason for existing).
 */
export const TAB_ROOTS = ["/home", "/workout", "/nutrition", "/progress", "/messages", "/settings"] as const;

export function isTabRoot(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "").replace(/^\/client-preview(?=\/|$)/, "") || "/";
  return (TAB_ROOTS as readonly string[]).includes(p);
}

/** True when the top bar should draw the back control at all. */
export function showsBack(pathname: string): boolean {
  return !isTabRoot(pathname);
}

/**
 * Where Home is from here. Client View is a mode carried by ?as=client or the
 * /client-preview prefix; leaving it by accident is the boundary the 7 Sep
 * middleware guard exists to hold, so the fallback keeps the mode.
 */
export function homeHref(pathname: string, search: string): string {
  const inClientView = pathname.startsWith("/client-preview") || /(?:^|[?&])as=client(?:&|$)/.test(search);
  return inClientView ? "/home?as=client" : "/home";
}

/**
 * The one decision, as data. `historyLength` is window.history.length; the
 * caller performs the side effect. Mirrors BackButtonGuard:
 *   canGoBack ? history.back() : location.href = "/home"
 */
export function backDecision(
  historyLength: number,
  pathname: string,
  search: string,
): { action: "back" } | { action: "go"; href: string } {
  return historyLength > 1 ? { action: "back" } : { action: "go", href: homeHref(pathname, search) };
}
