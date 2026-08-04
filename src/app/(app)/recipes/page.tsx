// /recipes — everyone's recipe library.
//
// Dustin: "I want you to build a recipe builder for everyone… they can save to
// their library and submit to me to be approved for a public library fid use by
// everyone."
//
// Server component: resolve who is asking, hand the client component their own
// recipes, the approved shared library, and — for Dustin — whatever is waiting
// on him. RLS would allow the read either way; doing it here means the page
// arrives populated instead of flashing empty.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RecipesClient from "./RecipesClient";

export const dynamic = "force-dynamic";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  let clientId: string | null = null;
  {
    const { data: c } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    clientId = (c as { id: string } | null)?.id ?? null;
    if (!clientId && user.email) {
      const { data: c2 } = await supabase.from("clients").select("id").eq("email", user.email).maybeSingle();
      clientId = (c2 as { id: string } | null)?.id ?? null;
    }
  }

  const cols = "id, client_id, title, description, servings, prep_minutes, cook_minutes, instructions, image_url, tags, visibility, review_note, total_kcal, total_protein, total_carbs, total_fats, created_at";

  const [mineRes, publicRes, pendingRes] = await Promise.all([
    clientId
      ? supabase.from("recipes").select(cols).eq("client_id", clientId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("recipes").select(cols).eq("visibility", "public").order("title"),
    isTrainer
      ? supabase.from("recipes").select(cols + ", clients(name)").eq("visibility", "submitted").order("submitted_at")
      : Promise.resolve({ data: [] }),
  ]);

  // The client's live plan slots, so a recipe can become a meal without
  // leaving the page. Trainer-authored plans get cloned on write (see
  // /api/nutrition/plan-edit) — nothing here mutates Dustin's original.
  let planMeals: { id: string; name: string; position: number }[] = [];
  if (clientId) {
    const { data: live } = await supabase
      .from("meal_plans").select("id").eq("client_id", clientId).eq("status", "live")
      .order("effective_date", { ascending: false }).limit(1);
    const planId = ((live as { id: string }[]) || [])[0]?.id;
    if (planId) {
      const { data: ms } = await supabase
        .from("meals").select("id, name, position").eq("meal_plan_id", planId).order("position");
      planMeals = (ms as { id: string; name: string; position: number }[]) || [];
    }
  }

  return (
    <RecipesClient
      planMeals={planMeals}
      clientId={clientId}
      isTrainer={isTrainer}
      mine={(mineRes.data as never[]) || []}
      shared={(publicRes.data as never[]) || []}
      pending={(pendingRes.data as never[]) || []}
    />
  );
}
