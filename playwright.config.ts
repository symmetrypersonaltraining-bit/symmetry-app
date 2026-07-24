// Playwright config — Nutrition Logger v3 E2E suite.
//
// Two web servers:
//   1. supamock (local Supabase emulator) — only in mock mode. This build
//      environment's egress proxy blocks *.supabase.co, so by default the
//      suite runs full-stack against the emulator, seeded with the SAME
//      fixtures (same UUIDs) as the real DEV project giiovjfpbuzmrvpdglhv.
//   2. `next dev` on :3111 pointed at whichever Supabase backend is active.
//
// Run against real DEV Supabase (never prod!) from a network-open machine:
//   E2E_SUPABASE=real E2E_SUPABASE_ANON_KEY=<dev anon key> npm run test:e2e

import { defineConfig, devices } from "@playwright/test";
import { E2E_MODE, SUPABASE_URL, SUPABASE_ANON_KEY, APP_PORT, APP_URL, SUPAMOCK_PORT } from "./tests/e2e/env";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Specs share one dev server + one logical "today" of DB state — serialize.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    // Client logger is a mobile-first UI.
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    isMobile: false, // keep mouse events for the drag tests
    hasTouch: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    ...(E2E_MODE === "mock"
      ? [
          {
            command: "npx tsx tests/e2e/supamock/server.ts",
            url: `http://localhost:${SUPAMOCK_PORT}/__test/health`,
            reuseExistingServer: true,
            timeout: 30_000,
          },
        ]
      : []),
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `${APP_URL}/login`,
      reuseExistingServer: true,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
        NEXT_PUBLIC_APP_URL: APP_URL,
      },
    },
  ],
});
