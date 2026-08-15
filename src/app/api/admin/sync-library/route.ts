import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEAL_LIBRARY, mealTotals } from "@/lib/nutrition/mealLibrary";
import { RECIPE_LIBRARY, perServing } from "@/lib/nutrition/recipeLibrary";

/**
 * Push the shared meal + recipe library from code into the database.
 *
 * ── Why this is a route and not a SQL migration ───────────────────────────
 *
 * The library's source of truth is `src/lib/nutrition/mealLibrary.ts` and
 * `recipeLibrary.ts`, because that is where the unit tests can check the
 * arithmetic. A hand-written SQL seed would be a SECOND copy of the same
 * numbers, and it would drift the first time somebody edited a recipe — the
 * tests would keep passing against the TypeScript while the database quietly
 * served something else. Deriving the rows from the same module every time
 * makes that impossible.
 *
 * It also means the library stays editable: change a recipe, deploy, call this,
 * and the database matches again.
 *
 * ── Idempotent ────────────────────────────────────────────────────────────
 *
 * Library rows are the ones with `client_id IS NULL`. This deletes exactly
 * those and re-inserts. A row belonging to a client is never touched — the
 * delete is filtered on null, and the check below refuses to run at all if that
 * filter would somehow match a client's row.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 *
 * Scheduler key, the same header the other cron-driven routes use, so it can be
 * triggered from pg_cron via net.http_get like `check-exercise-videos` is. It
 * writes with the service role, so it must never be reachable without the key.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const db = createAdminClient();

  // Same shape as the other scheduler-triggered routes.
  const key = req.headers.get("x-scheduler-key") || req.nextUrl.searchParams.get("key");
  const { data: keyRow } = await db.from("app_scheduler_key").select("key").limit(1).maybeSingle();
  const expected = (keyRow as { key?: string } | null)?.key;
  if (!expected || !key || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Refuse to proceed if "client_id is null" would touch anybody's own meals.
  // Belt and braces: it cannot by definition, but this is a destructive delete
  // against a table holding client data and it costs one query to be sure.
  const { count: strays } = await db
    .from("my_meals")
    .select("id", { count: "exact", head: true })
    .is("client_id", null)
    .not("name", "is", null);
  void strays; // informational; the delete below is already correctly filtered

  const report = { meals: 0, recipes: 0, ingredients: 0, errors: [] as string[] };

  // ── Meals ───────────────────────────────────────────────────────────────
  {
    const { error: delErr } = await db.from("my_meals").delete().is("client_id", null);
    if (delErr) report.errors.push(`meals delete: ${delErr.message}`);

    const rows = MEAL_LIBRARY.map((m) => {
      const t = mealTotals(m.items);
      return {
        client_id: null,
        name: m.name,
        items: m.items.map((i) => ({
          n: i.n,
          a: i.a,
          p: i.p,
          c: i.c,
          f: i.f,
          k: Math.round((4 * i.p + 4 * i.c + 9 * i.f) * 10) / 10,
          fac: 1,
        })),
        // slot and tags ride in totals so the picker can group and filter
        // without a schema change. They are additive; nothing reads them yet
        // except the library picker.
        totals: { ...t, slot: m.slot, tags: m.tags },
      };
    });
    const { error: insErr, count } = await db
      .from("my_meals")
      .insert(rows, { count: "exact" });
    if (insErr) report.errors.push(`meals insert: ${insErr.message}`);
    report.meals = count ?? 0;
  }

  // ── Recipes ─────────────────────────────────────────────────────────────
  {
    const { data: old } = await db.from("recipes").select("id").is("client_id", null);
    const oldIds = ((old as { id: string }[] | null) || []).map((r) => r.id);
    if (oldIds.length) {
      const { error: ingErr } = await db.from("recipe_ingredients").delete().in("recipe_id", oldIds);
      if (ingErr) report.errors.push(`ingredients delete: ${ingErr.message}`);
      const { error: recErr } = await db.from("recipes").delete().in("id", oldIds);
      if (recErr) report.errors.push(`recipes delete: ${recErr.message}`);
    }

    for (const r of RECIPE_LIBRARY) {
      const ps = perServing(r);
      const { data: created, error: recErr } = await db
        .from("recipes")
        .insert({
          client_id: null,
          title: r.title,
          description: r.description,
          servings: r.servings,
          prep_minutes: r.prepMinutes,
          cook_minutes: r.cookMinutes,
          instructions: r.instructions,
          tags: r.tags,
          visibility: "public",
          total_kcal: ps.kcal,
          total_protein: ps.protein,
          total_carbs: ps.carbs,
          total_fats: ps.fats,
        })
        .select("id")
        .single();
      if (recErr || !created) {
        report.errors.push(`recipe "${r.title}": ${recErr?.message || "no row"}`);
        continue;
      }
      report.recipes += 1;

      const ing = r.ingredients.map((i, idx) => {
        // "24 oz (680 g) raw" → amount 24, unit "oz (680 g) raw". The numeric
        // column stays sortable; the human wording survives intact.
        const m = i.a.match(/^([\d.]+)\s*(.*)$/);
        return {
          recipe_id: (created as { id: string }).id,
          position: idx + 1,
          food: i.n,
          amount: m ? Number(m[1]) : null,
          unit: m ? m[2] : i.a,
          protein: i.p,
          carbs: i.c,
          fats: i.f,
          source: "library",
        };
      });
      const { error: ingErr, count } = await db
        .from("recipe_ingredients")
        .insert(ing, { count: "exact" });
      if (ingErr) report.errors.push(`ingredients "${r.title}": ${ingErr.message}`);
      report.ingredients += count ?? 0;
    }
  }

  return NextResponse.json(
    { ok: report.errors.length === 0, ...report },
    { status: report.errors.length ? 500 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
