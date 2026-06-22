import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/home";

  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  if (mode === "1") {
    response.cookies.set("symmetry_client_mode", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  } else {
    response.cookies.delete("symmetry_client_mode");
  }

  return response;
}
