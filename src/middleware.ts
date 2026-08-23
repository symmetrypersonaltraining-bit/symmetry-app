import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTrainerEmail, noteTrainerEmail } from "@/lib/trainer";
import { withAuthTimeout } from "@/lib/authTimeout";
import { getUserFast } from "@/lib/auth/getUserFast";

/**
 * Redirect WITHOUT throwing away a freshly-rotated session.
 *
 * Dustin, 2026-08-13: "Can we add a stay signed in function to that app so that
 * I don't have to keep logging in every time."
 *
 * It is not a missing feature, it is this. `supabase.auth.getUser()` below
 * refreshes the access token when it is due, and Supabase ROTATES the refresh
 * token when it does — the old one is spent the moment the new one is issued.
 * The new pair is written onto `supabaseResponse` by the setAll callback.
 *
 * Every redirect in this file used to build a brand-new response and return
 * that instead, silently discarding those cookies. So any navigation that both
 * refreshed the token AND redirected left the browser holding a refresh token
 * that had already been consumed. The next refresh failed, and the app threw
 * them back to /login for no reason they could see. Roughly hourly, and more
 * often for clients, whose every navigation can hit the onboarding redirects.
 *
 * Copying the cookies across is the whole fix. Anything that redirects from
 * here must go through this.
 */
function redirectKeepingSession(url: URL, carrying: NextResponse): NextResponse {
  const res = NextResponse.redirect(url);
  for (const cookie of carrying.cookies.getAll()) res.cookies.set(cookie);
  return res;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // Always allow static assets, auth callback, and the public anatomy preview.
  //
  // The four PUBLIC ones added 2026-08-04, after checking what the live site
  // actually served and finding all of them behind the login wall:
  //
  //   /privacy              a privacy policy a store reviewer cannot read is not
  //                         a published privacy policy. Both Apple and Google
  //                         fetch this URL while logged out.
  //   /manifest.webmanifest a phone fetches this with no session. Redirected to
  //                         /login it received HTML, which is not a manifest —
  //                         so Chrome still would not have offered "Install app"
  //                         even after the manifest existed.
  //   /sw.js                a service worker script must return JavaScript.
  //   /icons/               the install prompt and home-screen icon.
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/draco/") ||
    pathname.startsWith("/anatomy-preview") ||
    pathname === "/privacy" ||
    // /install is the QR target. A client scans it while signed OUT — that is
    // the entire scenario — so a login redirect here defeats the purpose.
    pathname === "/install" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".glb") ||
    pathname.endsWith(".wasm")
  ) {
    return supabaseResponse;
  }

  // ── ONLY NOW ask who this is ───────────────────────────────────────────────
  //
  // This check used to sit ABOVE the allowlist, so every request the allowlist
  // was about to wave through paid a network round trip to Supabase Auth first
  // and then threw the answer away. That is not a micro-optimisation: `/api/`
  // is in the list and is not excluded by the matcher, so EVERY API call the
  // app made — every meal logged, every set saved, every poll — spent an extra
  // GoTrue request in middleware before its route handler did its own auth
  // properly. Same for /sw.js, /manifest.webmanifest and every icon fetch.
  //
  // Found while diagnosing the 15 Aug auth outage. It is not the cause, but a
  // service that is already struggling was being asked several times as many
  // questions as it needed to answer.
  //
  // getUserFast verifies the session token LOCALLY when it can — no network
  // call — and only falls back to asking Supabase (capped at 4s) when it
  // cannot. See src/lib/auth/verifyJwt.ts for why, and for the trade-off
  // Dustin accepted during the 15 Aug outage.
  //
  // See src/lib/authTimeout.ts for why passing through on a non-answer is safe:
  // the layout and every page re-check the user, and RLS is the real boundary.
  // This middleware is a convenience, not a gate.
  const auth = await getUserFast(supabase, request.cookies.getAll());
  const user = auth.data.user;

  // Auth did not answer. Hand the request to the page rather than guessing.
  //
  // A guess in either direction is worse than passing through: redirecting to
  // /login signs out somebody who IS signed in, and letting them through to
  // /home shows an app shell to somebody who is not. The page can find out for
  // itself. If it cannot either, it fails somewhere a person can see and act
  // on, which a Vercel 504 never is.
  if (auth.degraded) return supabaseResponse;

  // Login page
  if (pathname === "/login") {
    if (user) return redirectKeepingSession(new URL("/home", request.url), supabaseResponse);
    return supabaseResponse;
  }

  // Protected — must be logged in
  if (!user) {
    return redirectKeepingSession(new URL("/login", request.url), supabaseResponse);
  }

  // Trainer skips all client checks.
  //
  // Resolved against the `trainers` table, not only the build-time list. A
  // trainer added from inside the app is real immediately, and falling past
  // this line put them into the CLIENT onboarding chain below — so somebody
  // invited as a trainer, who also has a client row (Dustin trains himself; it
  // is the normal pattern), was redirected into the client intake wizard on
  // every single navigation and never reached a page at all.
  //
  // Two addresses are on the build-time list and cost nothing to answer, so
  // they short-circuit before any query. Everyone else needs the table asked —
  // and rather than pay a second round trip in series, the trainers lookup is
  // STARTED here and fires alongside the clients lookup further down, which
  // this path was already paying for. Both are network-bound; in parallel the
  // pair costs about what the clients query alone used to.
  const bakedIn = isTrainerEmail(user.email);
  // BY AUTH ID *OR* EMAIL. viewer.ts has always resolved a trainer both ways;
  // this only ever asked for auth_user_id. A trainers row whose auth link was
  // never stamped — one written in SQL rather than through /api/invite-trainer —
  // therefore fell straight through into the CLIENT onboarding chain below and
  // was pushed to /welcome and the intake questionnaire, on every navigation,
  // while every page it eventually reached treated them as a trainer. Two
  // components of the same app disagreeing about who someone is.
  const trainerLookup = bakedIn
    ? null
    : withAuthTimeout(
        supabase
          .from("trainers")
          .select("email, active")
          .or(
            user.email
              ? `auth_user_id.eq.${user.id},email.ilike.${user.email.replace(/[,()]/g, "")}`
              : `auth_user_id.eq.${user.id}`,
          )
          .limit(1)
      );
  if (bakedIn) return supabaseResponse;

  // Skip onboarding check on these pages to prevent redirect loops / flow interruption.
  //
  // /welcome joined them 2026-08-04. It is the FIRST screen a new client sees —
  // password, home-screen install, notifications — and without this line the
  // onboarding redirect below fired first and threw them straight into the goals
  // questionnaire, having never set a password. The two are sequential, not
  // rivals: /welcome sets the app up, then hands off to /onboarding.
  if (pathname === "/onboarding" || pathname === "/set-password" || pathname === "/welcome") {
    return supabaseResponse;
  }

  // Now settle whether they are a trainer after all. Awaited here rather than
  // where it was started so the query ran while the path checks above did.
  const trainerRes = trainerLookup ? await trainerLookup : null;
  if (trainerRes?.degraded) return supabaseResponse;
  const trainerRow = (trainerRes?.value?.data as { email?: string; active?: boolean }[] | null)?.[0] ?? null;
  // active === true, not !== false. `trainers.active` is NOT NULL DEFAULT true
  // so the two agree today, but trainerGate.ts requires === true and this said
  // !== false — a disagreement waiting for the first nullable column change to
  // hand somebody the full trainer shell and a 403 from the AI at the same
  // time. One reading, everywhere.
  if (trainerRow && trainerRow.active === true) {
    // Remembered for the rest of this isolate's life, so the synchronous
    // isTrainerEmail() checks inside the pages themselves agree with what was
    // just read from the table.
    noteTrainerEmail(trainerRow.email || user.email);
    return supabaseResponse;
  }

  // For clients: first run, then the intake wizard, then the app.
  if (pathname.startsWith("/")) {
    // Capped for the same reason as the auth call above. This one is a
    // convenience — it routes a first-run client to /welcome — and a client who
    // reaches /home instead sees their app. A client who reaches a 504 sees
    // nothing at all, so waiting indefinitely for it trades a small wrong
    // destination for a total failure.
    const clientLookup = await withAuthTimeout(
      supabase
        .from("clients")
        .select("onboarding_complete, client_app_settings(first_login_completed)")
        .eq("email", user.email!)
        .maybeSingle()
    );
    if (clientLookup.degraded) return supabaseResponse;
    const clientRow = clientLookup.value?.data ?? null;

    if (clientRow) {
      // /welcome is where the one-tap invite link lands. But links expire, and
      // the invite email carries a temporary password as a fallback — someone
      // signing in that way used to skip first-run entirely and never be asked
      // to choose a password or offered the home-screen install. However they
      // got in, a first-time client sees the same screen.
      const settings = clientRow.client_app_settings as unknown as
        | { first_login_completed: boolean | null }
        | { first_login_completed: boolean | null }[]
        | null;
      const row = Array.isArray(settings) ? settings[0] : settings;
      if (row && row.first_login_completed === false) {
        return redirectKeepingSession(new URL("/welcome", request.url), supabaseResponse);
      }

      if (clientRow.onboarding_complete === false) {
        return redirectKeepingSession(new URL("/onboarding", request.url), supabaseResponse);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
