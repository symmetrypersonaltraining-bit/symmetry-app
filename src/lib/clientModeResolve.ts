// WHICH APP IS THIS — decided the same way on both sides of the wire.
//
// Dustin, 10 Sep, with a screenshot of his own Client View: *"my own client
// view nav tabs r gone!"* The page was the client home. The chrome around it —
// hamburger, the trainer's bell, no bottom tabs — was the trainer's.
//
// Every server page (/home, /workout, /nutrition, /settings, /messages) and the
// middleware decide Client View from the same two inputs, in the same order:
//
//     ?as=trainer  → trainer   (the marker beats the cookie — see the pages)
//     ?as=client   → client
//     cookie = 1   → client
//     otherwise    → trainer
//
// TrainerLayoutWrapper — the one component that draws the top bar and the
// bottom tabs — decided from LOCALSTORAGE instead, and never read either. Its
// own comment records fixing one direction of that (it re-asserted the cookie
// FROM localStorage) and left the other open. Android evicts localStorage under
// storage pressure; cookies are not subject to quota. Once localStorage was
// gone, the cookie lived another 30 days, every page rendered the client app,
// and the wrapper dressed it as the trainer's.
//
// This is that rule, once, pure, so the wrapper can run it in the browser
// against document.cookie and location.search and land on exactly what the
// server landed on. localStorage is no longer an input. It is still WRITTEN,
// because three feedback paths read it for a "client-app"/"trainer-app" label.

export function resolveClientMode(input: {
  /** The `as` query param, if any. */
  as: string | null | undefined;
  /** The symmetry_client_mode cookie value, if present. */
  cookie: string | null | undefined;
}): boolean {
  if (input.as === "trainer") return false;
  if (input.as === "client") return true;
  return input.cookie === "1";
}

/** Read the two inputs off a live document. Never throws — an odd URL or a
 *  blocked cookie jar resolves to trainer, which is the safe default for a
 *  trainer account. */
export function readClientModeInputs(): { as: string | null; cookie: string | null } {
  let as: string | null = null;
  let cookie: string | null = null;
  try {
    as = new URLSearchParams(window.location.search).get("as");
  } catch { /* trainer */ }
  try {
    cookie = document.cookie.split("; ").some((c) => c === "symmetry_client_mode=1") ? "1" : null;
  } catch { /* trainer */ }
  return { as, cookie };
}
