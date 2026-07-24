// Shared E2E environment resolution — imported by playwright.config.ts,
// global-setup and the specs so every process agrees on mode/URLs/keys.
//
// Modes:
//   mock (default) — local supamock emulator on :54999. Used in this build
//     environment because the egress proxy hard-blocks *.supabase.co.
//   real — the DEV Supabase project (NEVER prod). Requires network access to
//     supabase.co and the dev anon key:
//     E2E_SUPABASE=real E2E_SUPABASE_ANON_KEY=<dev anon key> npm run test:e2e

export const E2E_MODE: "mock" | "real" = process.env.E2E_SUPABASE === "real" ? "real" : "mock";

export const SUPAMOCK_PORT = 54999;
export const APP_PORT = 3111;
export const APP_URL = `http://localhost:${APP_PORT}`;

export const DEV_PROJECT_URL = "https://giiovjfpbuzmrvpdglhv.supabase.co";

export const SUPABASE_URL =
  E2E_MODE === "real"
    ? process.env.E2E_SUPABASE_URL || DEV_PROJECT_URL
    : `http://localhost:${SUPAMOCK_PORT}`;

export const SUPABASE_ANON_KEY =
  E2E_MODE === "real"
    ? process.env.E2E_SUPABASE_ANON_KEY || ""
    : "supamock-anon-key";

if (E2E_MODE === "real" && !SUPABASE_ANON_KEY) {
  throw new Error("E2E_SUPABASE=real requires E2E_SUPABASE_ANON_KEY (the DEV project anon key).");
}

export const STORAGE_STATE = {
  plan: "tests/e2e/.auth/plan.json",
  open: "tests/e2e/.auth/open.json",
  trainer: "tests/e2e/.auth/trainer.json",
};

/** Logical "today" exactly as the app computes it (America/Chicago). */
export function todayChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
