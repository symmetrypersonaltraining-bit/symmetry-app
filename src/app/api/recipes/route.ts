// /api/recipes — save, submit, review, delete.
//
// Dustin: "they can save to their library and submit to me to be approved for a
// public library fid use by everyone."
//
// One route with an action rather than four, because every one of them needs
// the same two things first: who is calling, and do they own this recipe. Split
// across four files that check would be written four times and drift once.
//
// The macros stored on the recipe row are computed HERE from the ingredients
// that were saved — never taken from the body. A header that disagrees with its
// own ingredient list is the bug this app keeps shipping (a meal card reading
// 593 while listing 393 of food), and the fix is always the same: derive it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRAINER_EMAIL } from "@/lib/ai/scope";
import { cleanRecipe, recipeTotals, validateRecipe, RecipeInput } from "@/lib/recipes";
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function whoami() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const isTrainer = await viewerIsTrainer(sb, user);
  let clientId: string | null = null;
  const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  clientId = (c as { id: string } | null)?.id ?? null;
  if (!clientId && user.email) {
    const { data: c2 } = await sb.from("clients").select("id").eq("email", user.email).maybeSingle();
    clientId = (c2 as { id: string } | null)?.id ?? null;
  }
  return { userId: user.id, email: user.email, isTrainer, clientId };
}

export async function POST(req: NextRequest) {
  const me = await whoami();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: string; recipe?: RecipeInput; id?: string; approve?: boolean; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const action = body.action || "save";
  const admin = createAdminClient();

  // ── review: the trainer publishes or declines ────────────────────────────
  if (action === "review") {
    if (!me.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const { error } = await admin.from("recipes").update({
      visibility: body.approve ? "public" : "rejected",
      reviewed_at: new Date().toISOString(),
      review_note: body.note?.trim() || null,
    }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, visibility: body.approve ? "public" : "rejected" });
  }

  // Everything below is about a recipe the caller owns.
  const ownRecipe = async (id: string) => {
    const { data } = await admin.from("recipes").select("id, client_id, visibility, title").eq("id", id).maybeSingle();
    const r = data as { id: string; client_id: string | null; visibility: string; title: string } | null;
    if (!r) return null;
    if (!me.isTrainer && r.client_id !== me.clientId) return null;
    return r;
  };

  if (action === "submit" || action === "unsubmit" || action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const r = await ownRecipe(body.id);
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "delete") {
      // A published recipe other people are cooking from does not vanish
      // because its author tidied up. It comes down first, and only Dustin
      // can do that.
      if (r.visibility === "public" && !me.isTrainer) {
        return NextResponse.json({ error: "That one is in the shared library \u2014 ask your coach to take it down first." }, { status: 400 });
      }
      const { error } = await admin.from("recipes").delete().eq("id", r.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const submitting = action === "submit";
    const { error } = await admin.from("recipes").update({
      visibility: submitting ? "submitted" : "private",
      submitted_at: submitting ? new Date().toISOString() : null,
      // Re-submitting after a decline starts clean rather than carrying the old
      // verdict next to the new request.
      reviewed_at: null,
      review_note: null,
    }).eq("id", r.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, visibility: submitting ? "submitted" : "private" });
  }

  // ── save (create or update) ──────────────────────────────────────────────
  if (!body.recipe) return NextResponse.json({ error: "Missing recipe" }, { status: 400 });
  const clean = cleanRecipe(body.recipe);
  const problems = validateRecipe(clean);
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const totals = recipeTotals(clean.ingredients);
  const row = {
    title: clean.title,
    description: clean.description,
    servings: Number(clean.servings) || 1,
    prep_minutes: clean.prep_minutes ?? null,
    cook_minutes: clean.cook_minutes ?? null,
    instructions: clean.instructions,
    image_url: clean.image_url ?? null,
    tags: clean.tags ?? [],
    total_kcal: totals.kcal,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fats: totals.fats,
  };

  let recipeId = clean.id ?? null;
  if (recipeId) {
    const existing = await ownRecipe(recipeId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { error } = await admin.from("recipes").update(row).eq("id", recipeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Ingredients are replaced wholesale: the builder always sends the complete
    // list, and diffing rows by index is how you end up with someone else's
    // quantities on your ingredient.
    //
    // CHECKED, because the insert of the new list follows unconditionally. A
    // refused delete plus a successful insert does not lose the edit — it
    // DOUBLES the recipe. Every ingredient twice, every macro twice, and the
    // response says saved. Stop here instead.
    const { error: clearErr } = await admin.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (clearErr) {
      return NextResponse.json(
        { error: `Could not clear the old ingredients, so nothing was changed: ${clearErr.message}` },
        { status: 500 },
      );
    }
  } else {
    const { data, error } = await admin.from("recipes").insert({
      ...row,
      client_id: me.clientId,   // the trainer's own recipes carry his client row
      visibility: "private",
    }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not save" }, { status: 500 });
    recipeId = (data as { id: string }).id;
  }

  if (clean.ingredients.length) {
    const { error } = await admin.from("recipe_ingredients").insert(
      clean.ingredients.map((i, idx) => ({ recipe_id: recipeId, position: idx + 1, ...i })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: recipeId, totals });
}
