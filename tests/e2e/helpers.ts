// Shared E2E helpers — authenticated supabase-js clients for DB assertions and
// state resets. Identical code paths in mock and real mode (in real mode the
// deletes/reads run under RLS as the signed-in user / trainer).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { SUPABASE_URL, SUPABASE_ANON_KEY, todayChicago } from "./env";
import {
  AUTH_USERS, TRAINER_EMAIL, PLAN_CLIENT_ID, OPEN_CLIENT_ID,
} from "./supamock/seed";

export { PLAN_CLIENT_ID, OPEN_CLIENT_ID, todayChicago };
export { MEAL_IDS, PLAN_ID, fixturePlanMeals } from "./supamock/seed";

const cache = new Map<string, SupabaseClient>();

export async function dbAs(email: string): Promise<SupabaseClient> {
  if (cache.has(email)) return cache.get(email)!;
  const user = AUTH_USERS.find((u) => u.email === email);
  if (!user) throw new Error(`unknown test user ${email}`);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: user.password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  cache.set(email, client);
  return client;
}

export const dbPlanClient = () => dbAs("v3plan@symmetrydev.app");
export const dbOpenClient = () => dbAs("v3open@symmetrydev.app");
export const dbTrainer = () => dbAs(TRAINER_EMAIL);

/** Delete every meal_adherence_logs row for a fixture client (all dates). */
export async function resetLogs(clientId: string) {
  const db = await dbTrainer();
  const { error } = await db.from("meal_adherence_logs").delete().eq("client_id", clientId);
  if (error) throw new Error(`resetLogs(${clientId}): ${error.message}`);
}

/** Remove plans/targets that save-day-as-plan tests created for the open client. */
export async function resetOpenClientPlans() {
  const db = await dbTrainer();
  const { data: plans } = await db.from("meal_plans").select("id").eq("client_id", OPEN_CLIENT_ID);
  for (const p of plans || []) {
    const { data: meals } = await db.from("meals").select("id").eq("meal_plan_id", p.id);
    const mealIds = (meals || []).map((m) => m.id);
    if (mealIds.length) await db.from("meal_items").delete().in("meal_id", mealIds);
    await db.from("meals").delete().eq("meal_plan_id", p.id);
  }
  await db.from("meal_plans").delete().eq("client_id", OPEN_CLIENT_ID);
  await db.from("macro_targets").delete().eq("client_id", OPEN_CLIENT_ID);
  await db.from("my_meals").delete().eq("client_id", OPEN_CLIENT_ID);
  await db.from("my_meals").delete().eq("client_id", PLAN_CLIENT_ID);
}

export async function resetAllFixtureState() {
  await resetLogs(PLAN_CLIENT_ID);
  await resetLogs(OPEN_CLIENT_ID);
  await resetOpenClientPlans();
}

/** Today's logs for a client, as the trainer (sees everything). */
export async function logsToday(clientId: string) {
  const db = await dbTrainer();
  const { data, error } = await db
    .from("meal_adherence_logs")
    .select("*")
    .eq("client_id", clientId)
    .eq("log_date", todayChicago())
    .order("meal_position", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function logAtPosition(clientId: string, position: number) {
  const rows = await logsToday(clientId);
  return rows.find((r) => r.meal_position === position) ?? null;
}

/** Poll the DB until `pred` returns truthy (UI writes are async). */
export async function waitForDb<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  let last: T;
  for (;;) {
    last = await fn();
    if (pred(last)) return last;
    if (Date.now() - start > ms) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Kill the AI coach card network chatter so specs stay hermetic. */
export async function muteCoach(page: Page) {
  await page.route("**/api/nutrition-ai/coach", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "muted in E2E" }) })
  );
}

/** Standard mock for the typed-parse endpoint (no ANTHROPIC key in E2E). */
export async function mockParseRoute(
  page: Page,
  items: { name: string; amount: number | null; unit: string | null; kcal: number; p: number; c: number; f: number }[]
) {
  const totals = items.reduce(
    (a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.p, c: a.c + it.c, f: a.f + it.f }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  await page.route("**/api/nutrition-ai/parse", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, totals }) })
  );
}

/** Mock for the photo-analyze endpoint. */
export async function mockAnalyzePhotoRoute(
  page: Page,
  est: { description: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }
) {
  await page.route("**/api/analyze-meal-photo", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(est) })
  );
}

/** 1×1 white JPEG for photo-flow tests. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy" +
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA" +
    "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA" +
    "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3" +
    "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm" +
    "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA" +
    "AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx" +
    "BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK" +
    "U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3" +
    "uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii" +
    "gD//2Q==",
  "base64"
);
