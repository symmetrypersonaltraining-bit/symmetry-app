// AM I A TRAINER, IN THE TRAINER APP, RIGHT NOW?
//
// ── WHY THIS IS A WATCHER AND NOT A ONE-OFF CHECK ────────────────────────────
//
// Dustin, 9 Sep, on a client's page with the header AI button plainly visible:
// *"trainer ai assistant is gone!!"*
//
// Two components asked this question independently and neither could change its
// mind afterwards:
//
//   HeaderAssist   — draws the AI button. Asked once for `isTrainer`, but
//                    re-read the client-mode cookie every two seconds.
//   AIAssistant    — IS the assistant. Asked once, folded the cookie into the
//                    same answer, and latched. `if (!isTrainer) return null`.
//
// So the button recovers and the drawer does not. Leave Client View and the
// cookie clears; within two seconds the button comes back, and the drawer stays
// gone until the page is fully reloaded — tapping AI does nothing at all. That
// is exactly the screen he sent: the button is there and nothing opens.
//
// The same latch bites a second way. `viewerIsTrainer` documents that it FAILS
// OPEN to the build-time list so a database blip cannot demote the owner in his
// own app — but that only holds when it knows the email. On a cold start
// `supabase.auth.getUser()` can resolve before the session is restored, and
// with no user at all it returns false on the first line, before the fail-open
// is reached. One unlucky moment at mount and the assistant is gone for the
// life of the page.
//
// So: one implementation, and it keeps asking. `onAuthStateChange` is not used
// anywhere else in this app, which is why nothing was listening for the session
// arriving a moment late.

import type { ViewerUser } from "@/lib/auth/viewer";

export interface TrainerModeDeps {
  /** The signed-in user, or null when the session is not (yet) readable. */
  getUser: () => Promise<ViewerUser | null>;
  /** The database's answer for this user. */
  isTrainer: (user: ViewerUser | null) => Promise<boolean>;
  /** Client View: the cookie, or the preview path. Read fresh every time. */
  inClientMode: () => boolean;
  /** Fires when the session changes. Returns its own unsubscribe. */
  onAuthChange?: (cb: () => void) => () => void;
  /** Injected so a test can drive time instead of waiting for it. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /** How often to re-read client mode. Matches HeaderAssist's existing 2s. */
  pollMs?: number;
}

/**
 * Calls `emit` with whether the trainer assistant should be available, now and
 * whenever that answer changes. Returns an unsubscribe.
 *
 * Two rules, and the second is the whole point:
 *
 *  1. Available only when the viewer is a trainer AND is not in Client View —
 *     unchanged, and still only presentation. `/api/agent` authorizes on its
 *     own against an ACTIVE trainers row and refuses client mode.
 *  2. **A "no" is never final.** Client mode is re-read on a timer and the
 *     trainer answer is re-asked whenever the session changes, so a cookie
 *     that clears or a session that arrives late brings the assistant back
 *     without a reload.
 */
export function watchTrainerMode(deps: TrainerModeDeps, emit: (available: boolean) => void): () => void {
  const pollMs = deps.pollMs ?? 2000;
  const setTimer = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));

  let stopped = false;
  let trainer = false;
  let lastEmitted: boolean | null = null;

  const publish = () => {
    if (stopped) return;
    const available = trainer && !deps.inClientMode();
    if (available === lastEmitted) return;
    lastEmitted = available;
    emit(available);
  };

  const askIfTrainer = async () => {
    try {
      const user = await deps.getUser();
      const answer = await deps.isTrainer(user ?? null);
      if (stopped) return;
      // Only ever upgrades. A dropped request is not a logout — the same
      // lesson as d95879cf — and this must not flicker the drawer shut
      // underneath somebody mid-sentence. Signing out unmounts the app.
      if (answer) trainer = true;
    } catch {
      // Keep whatever we already knew and try again on the next signal.
    }
    publish();
  };

  void askIfTrainer();

  // Client mode is the half that changes while the page stays put: the toggle
  // sets and clears a cookie without a navigation.
  const handle = setTimer(publish, pollMs);

  // And this is the half that was never watched at all — the session landing
  // after the first render.
  const offAuth = deps.onAuthChange?.(() => { void askIfTrainer(); });

  return () => {
    stopped = true;
    clearTimer(handle);
    offAuth?.();
  };
}
