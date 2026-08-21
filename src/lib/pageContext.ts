// Where the user actually is, for anything that needs to record it.
//
// app_feedback.client_context defaults to window.location.pathname, which is
// fine for /nutrition and useless for /tutorial: every one of the 51 steps is
// the same URL. A tester reporting "this bit is wrong" from step 34 files a
// report that says "/tutorial" and nothing else, and the person reading it has
// to go and ask which bit.
//
// Dustin, 21 Aug, on the trainers about to test it: "test, adjust, reset and
// test again until it's right." That loop only closes if a report says which
// step it came from.
//
// submitFeedback already accepts a `context` override — the information was
// never missing, just never supplied. A screen sets this while it is mounted,
// and whatever files feedback reads it.
//
// Module-level rather than context/provider: the reader (FloatingDock) is
// mounted in the ROOT layout and the writers are deep inside route trees, so a
// provider covering both would have to wrap the whole app to pass one string.

let current: string | null = null;

/** Set the fine-grained location. Pass null on unmount. */
export function setPageContext(ctx: string | null): void {
  current = ctx;
}

/** The fine-grained location, or null to fall back to the pathname. */
export function getPageContext(): string | null {
  return current;
}
