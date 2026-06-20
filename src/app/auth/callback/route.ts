import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email !== TRAINER_EMAIL) {
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
