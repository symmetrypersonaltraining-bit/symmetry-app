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

  // Always allow static assets and auth callback
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
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

  // Trainer skips onboarding
  if (user.email === TRAINER_EMAIL) {
    return supabaseResponse;
  }

  // For clients: check onboarding_complete
  // Skip check if already on the onboarding page (prevent redirect loop)
  if (pathname === "/onboarding") {
    return supabaseResponse;
  }

  // Only check on app pages (not API routes already excluded above)
  if (pathname.startsWith("/")) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("onboarding_complete")
      .eq("email", user.email!)
      .maybeSingle();

    // If client exists and hasn't completed onboarding, redirect
    if (clientRow && clientRow.onboarding_complete === false) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
