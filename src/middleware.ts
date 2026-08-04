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

  // For clients: if onboarding not complete, redirect to onboarding wizard
  if (pathname.startsWith("/")) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("onboarding_complete")
      .eq("email", user.email!)
      .maybeSingle();

    if (clientRow && clientRow.onboarding_complete === false) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
