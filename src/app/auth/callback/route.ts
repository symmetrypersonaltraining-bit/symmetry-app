import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      // A trainer must not be routed through the CLIENT temp-password flow.
      // The check was isTrainerEmail() alone — a build-time list — so a trainer
      // added from inside the app who also has a client row was sent to
      // /set-password instead of into the app, on the very link their invite
      // email told them to click.
      if (user && !(await viewerIsTrainer(supabase, user))) {
        const { data: clientRec } = await supabase
          .from("clients")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (clientRec) {
          const { data: settings } = await supabase
            .from("client_app_settings")
            .select("password_is_temporary")
            .eq("client_id", clientRec.id)
            .maybeSingle();
          if (settings?.password_is_temporary) {
            return NextResponse.redirect(`${origin}/set-password`);
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
