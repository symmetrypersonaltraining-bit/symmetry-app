// Global setup — mint Supabase SSR cookie storage-states for the three test
// identities (plan client, open-plan client, trainer) and clean today's logs.
//
// We sign in with @supabase/ssr's createServerClient using a captured cookie
// jar, so the cookie names/chunking/format are EXACTLY what the Next server
// (src/lib/supabase/server.ts + middleware) expects — no hand-rolled cookies.

import fs from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_STATE, E2E_MODE, SUPAMOCK_PORT } from "./env";
import { AUTH_USERS, TRAINER_EMAIL } from "./supamock/seed";
import { resetAllFixtureState } from "./helpers";

async function mintStorageState(email: string, password: string, outFile: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies: { name: string; value: string }[]) => {
        for (const c of cookies) c.value === "" ? jar.delete(c.name) : jar.set(c.name, c.value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`global-setup: sign-in failed for ${email}: ${error.message}`);
  if (jar.size === 0) throw new Error(`global-setup: no auth cookies captured for ${email}`);

  const storageState = {
    cookies: Array.from(jar, ([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 6 * 24 * 3600,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(storageState, null, 2));
}

export default async function globalSetup() {
  if (E2E_MODE === "mock") {
    // Fresh emulator state for the run (webServer may be a reused instance).
    const res = await fetch(`http://localhost:${SUPAMOCK_PORT}/__test/reset`, { method: "POST" });
    if (!res.ok) throw new Error("global-setup: supamock reset failed");
  }

  const plan = AUTH_USERS.find((u) => u.email === "v3plan@symmetrydev.app")!;
  const open = AUTH_USERS.find((u) => u.email === "v3open@symmetrydev.app")!;
  const trainer = AUTH_USERS.find((u) => u.email === TRAINER_EMAIL)!;

  await mintStorageState(plan.email, plan.password, STORAGE_STATE.plan);
  await mintStorageState(open.email, open.password, STORAGE_STATE.open);
  await mintStorageState(trainer.email, trainer.password, STORAGE_STATE.trainer);

  // Real mode: the dev DB persists between runs — clear fixture log rows and
  // any plans a previous save-day-as-plan run created for the open client.
  await resetAllFixtureState();
}
