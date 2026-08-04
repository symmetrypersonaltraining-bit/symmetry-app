import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

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

  const { data: { user } } = await supabase.auth.getUser();
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
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".glb") ||
    pathname.endsWith(".wasm")
  ) {
    return supabaseResponse;
  }

  // Login page
  if (pathname === "/login") {
    if (user) return NextResponse.redirect(new URL("/home", request.url));
    return supabaseResponse;
  }

  // Protected — must be logged in
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Trainer skips all client checks
  if (user.email === TRAINER_EMAIL) {
    return supabaseResponse;
  }

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

  // For clients: first run, then the intake wizard, then the app.
  //
  // One query, not two — middleware runs on every navigation and this already
  // cost a round trip.
  if (pathname.startsWith("/")) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("onboarding_complete, client_app_settings(first_login_completed)")
      .eq("email", user.email!)
      .maybeSingle();

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
        return NextResponse.redirect(new URL("/welcome", request.url));
      }

      if (clientRow.onboarding_complete === false) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
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
