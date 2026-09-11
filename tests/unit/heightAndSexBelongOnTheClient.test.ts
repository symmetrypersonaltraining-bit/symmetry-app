import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * HEIGHT AND SEX BELONG ON THE CLIENT — and every door in asks for them.
 *
 * Dustin, 11 Sep 2026: *"make sure those missing columns, the height and sex,
 * go into their actual profile page. Also make sure that gets added into the
 * assessment page and the onboarding. Whenever somebody starts the app it
 * should collect all of that information and put it in their profile. If a
 * trainer is starting the app, the assessment should get all of that
 * information and put it in their profile."*
 *
 * Three doors, one record. Each door is pinned here, and so is the rule that
 * sex is never stored as anything but the two the formulas have coefficients
 * for.
 */
const R = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the columns exist in the generated types and the schema fixture", () => {
  const types = R("src/lib/database.types.ts");
  const clients = types.slice(types.indexOf("      clients: {"), types.indexOf("      clients: {") + 40000);
  assert.match(clients, /height_in: number \| null/);
  assert.match(clients, /sex: string \| null/);
  const fixture = JSON.parse(R("tests/fixtures/db-schema.json")) as Record<string, string[]>;
  assert.ok(fixture.clients.includes("height_in") && fixture.clients.includes("sex"), "the schema fixture knows both columns");
});

test("onboarding asks, sends, and the route stores inches and a valid sex only", () => {
  const wiz = code(R("src/app/(app)/onboarding/OnboardingWizard.tsx"));
  assert.match(wiz, /height_ft: "",\s*height_in: "",\s*sex: "",/, "the form carries all three");
  assert.match(wiz, /aria-label="height feet"/);
  assert.match(wiz, /set\("sex", v\)/, "sex is chosen, never typed");
  const route = code(R("src/app/api/complete-onboarding/route.ts"));
  assert.match(route, /updates\.height_in = Math\.round\(ft \* 12/, "feet and inches become inches");
  assert.match(route, /if \(body\.sex === "male" \|\| body\.sex === "female"\) updates\.sex = body\.sex;/, "anything else is dropped");
});

test("the assessment asks, prefills an existing client, and writes both paths", () => {
  const page = code(R("src/app/(app)/assessment/page.tsx"));
  assert.match(page, /height_ft: string;\s*height_in: string;\s*sex: string;/);
  assert.match(page, /<Field label="Height">/);
  assert.match(page, /<Field label="Sex">/);
  assert.match(page, /\.select\("name, email, phone, date_of_birth, height_in, sex,/, "an existing client's values come back into the form");
  assert.match(page, /supabase\.from\('clients'\)\.update\(body\)\.eq\('id', existingClientId\)/, "an existing client's RECORD is updated, not only the assessment row");
  const create = code(R("src/app/api/create-client-from-assessment/route.ts"));
  assert.match(create, /height_in: \(\(\) => \{ const ft = Number\(data\.height_ft\)/, "a new client's row carries inches");
  assert.match(create, /sex: data\.sex === "male" \|\| data\.sex === "female" \? data\.sex : null/);
});

test("the profile lets a client edit exactly these two fields, on their own row", () => {
  const page = code(R("src/app/(app)/profile/page.tsx"));
  assert.match(page, /\.select\("id, name, email, height_in, sex"\)/);
  assert.match(page, /\{client\?\.id && \(\s*<BodyDetailsCard/, "only a client has a row to write");
  const card = code(R("src/app/(app)/profile/BodyDetailsCard.tsx"));
  assert.match(card, /\.from\("clients"\)\.update\(body\)\.eq\("id", clientId\)/);
  assert.match(card, /body\.sex = sexV === "male" \|\| sexV === "female" \? sexV : null/);
  assert.doesNotMatch(card, /date_of_birth|current_weight|phone/, "two fields, nothing else — the page has not been walked");
});

test("the migration constrains sex to the two values the formulas can use", () => {
  const mig = R("supabase/migrations/20260911a_height_and_sex_belong_on_the_client.sql");
  assert.match(mig, /check \(sex is null or sex in \('male', 'female'\)\)/);
  assert.match(mig, /add column if not exists height_in numeric/);
});

test("the trainer tutorial's assessment step says so", () => {
  const tut = R("src/lib/tutorial/script.ts");
  assert.match(tut, /The first step also asks height and sex/);
});
