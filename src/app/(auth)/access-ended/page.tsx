"use client";

import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import KeyboardSafeArea from "@/components/KeyboardSafeArea";

/**
 * WHERE A CLIENT LANDS WHEN THEIR ACCESS HAS ENDED.
 *
 * Dustin's rule: an archived client keeps the app for 30 days after their last
 * payment. This is the screen at the end of that, and the spec asks for one
 * thing in particular — "a clear message, not a silent failure".
 *
 * So it says what happened, it does not imply they did something wrong, and it
 * points at the one thing that can change it: talking to their trainer. It does
 * NOT say "your subscription expired" or anything else transactional. These are
 * people who trained with him for months, and some of them will come back.
 *
 * IT NAMES NOBODY. The obvious warm touch here is the trainer's first name,
 * and `coachIdentityPerViewer.test.ts` is right to refuse it: the build-time
 * COACH_FIRST_NAME is the instance OWNER, and this app now has more than one
 * trainer, so a second trainer's client would be told to go and talk to Dustin.
 * Resolving the real coach needs a session, which is the one thing somebody
 * bounced off the front door may not have. "Your trainer" is correct for
 * everybody.
 *
 * Nothing they did is gone. Their logs, sets, meals and measurements are all
 * still on file — revoking access is not deleting the client — and restoring
 * them is two reversible writes.
 */
export default function AccessEndedPage() {
  async function signOut() {
    // The client is built HERE rather than at render time on purpose. Building
    // it in the component body runs `createClient()` during prerender, where
    // there are no Supabase env vars, and the export step fails the whole
    // build on this page. Nothing on this screen needs a client until the
    // button is pressed.
    //
    // Clears the stale session that got them here. The auth user is banned, so
    // signing back in will not work either — this is tidiness, not a gate.
    try { await createClient().auth.signOut(); } catch { /* leaving anyway */ }
    window.location.href = "/login";
  }

  return (
    <KeyboardSafeArea className="flex flex-col" style={{ background: "#0F4C81" }}>
      <div className="flex flex-col items-center pt-16 pb-10 px-6">
        <Logo size={80} color="white" />
        <h1
          className="text-2xl font-medium text-white mt-4 tracking-wide symmetry-title-dark"
          style={{ letterSpacing: "0.5px" }}
        >
          Symmetry
        </h1>
      </div>

      <div
        className="rounded-t-3xl px-6 pt-10 pb-10 text-center"
        style={{ background: "#EDF2F7", flex: "1 0 auto" }}
      >
        <div
          className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5"
          style={{ background: "#DDEEFF" }}
        >
          <i className="ti ti-lock text-3xl" style={{ color: "#0F4C81" }} />
        </div>

        <h2 className="text-lg font-medium mb-3" style={{ color: "#0D1B2E" }}>
          Your app access has ended
        </h2>

        <p className="text-sm leading-relaxed mb-4" style={{ color: "#4E6080" }}>
          Access to the Symmetry app runs for 30 days after your last payment.
          That window has now closed, so this is as far as the app goes.
        </p>

        <p className="text-sm leading-relaxed mb-6" style={{ color: "#4E6080" }}>
          <strong style={{ color: "#0D1B2E" }}>Nothing you logged has been deleted.</strong>{" "}
          Every workout, set, meal and measurement is still on file, exactly as
          you left it. If you come back, it is all still here.
        </p>

        <p className="text-sm leading-relaxed" style={{ color: "#4E6080" }}>
          If this looks wrong, or you would like to pick training back up, talk
          to your trainer — they can turn it straight back on.
        </p>

        <button
          onClick={signOut}
          className="w-full rounded-lg py-3 text-sm font-medium text-white mt-8"
          style={{ background: "#0F4C81" }}
        >
          Sign out
        </button>
      </div>
    </KeyboardSafeArea>
  );
}
