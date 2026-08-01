"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const THEMES = [
  { id: "pastel", label: "Soft Pastel", primary: "#7c9cf5", bg: "#f4f6fb" }, { id: "navy", label: "Navy Blue", primary: "#0F4C81", bg: "#EDF2F7" },
  { id: "charcoal", label: "Charcoal", primary: "#2D2D2D", bg: "#F0F0F0" },
  { id: "forest", label: "Forest Green", primary: "#1B5E20", bg: "#F0F7F0" },
  { id: "gunmetal", label: "Gunmetal", primary: "#37474F", bg: "#EAEEF2" },
  { id: "purple", label: "Deep Purple", primary: "#4A148C", bg: "#F3F0F8" },
  { id: "orange", label: "Burnt Orange", primary: "#BF360C", bg: "#FFF3E0" },
  { id: "rose", label: "Rose", primary: "#880E4F", bg: "#FFF0F3" }, { id: "blush", label: "Blush", primary: "#C2185B", bg: "#FFF0F5" },
    { id: "lagoon", label: "Lagoon", primary: "#0E7C86", bg: "#EEF8F8" },
    { id: "orchid", label: "Orchid", primary: "#8E2DAF", bg: "#FAF4FB" },
    { id: "berry", label: "Berry", primary: "#B0306A", bg: "#FBF1F5" },
    { id: "slatepop", label: "Slate Pop", primary: "#2E4374", bg: "#F2F4F8" },
    { id: "plumdusk", label: "Plum Dusk", primary: "#5E3A87", bg: "#F6F2F8" },
    { id: "carbonneon", label: "Carbon Neon", primary: "#00C2A8", bg: "#14161C" },
  { id: "midnight", label: "Midnight", primary: "#58A6FF", bg: "#0D1117" },
  { id: "sunsetcoral", label: "Sunset Coral", primary: "#ff6b6b", bg: "#fff6f3" },
  { id: "aurora", label: "Aurora", primary: "#3aa8c1", bg: "#f3f7fb" },
  { id: "citrus", label: "Citrus Punch", primary: "#5bbf3a", bg: "#fbfdf3" },
  { id: "berrynoir", label: "Berry Noir", primary: "#b5379a", bg: "#f7f4fb" },
  { id: "oceandusk", label: "Ocean Dusk", primary: "#1f7a8c", bg: "#f2f6f8" },

  // ── Added 2026-08-01 ────────────────────────────────────────────────────
  // The first schemes built on THREE colours. `a2` is the third; it is optional
  // and every scheme above renders exactly as before without it. The real
  // tokens live in globals.css — what is here is only what the settings swatch
  // needs to draw a preview.
  { id: "midnightaurora", label: "Midnight Aurora", primary: "#1D4ED8", bg: "#0D1117", a: "#22D3EE", a2: "#A78BFA" },
  { id: "midnightember",  label: "Midnight Ember",  primary: "#1D4ED8", bg: "#0B0E14", a: "#FB7185", a2: "#FBBF24" },
  { id: "midnightcitrus", label: "Midnight Citrus", primary: "#1D4ED8", bg: "#0D1117", a: "#38BDF8", a2: "#A3E635" },
  { id: "midnightorchid", label: "Midnight Orchid", primary: "#1D4ED8", bg: "#0C0F17", a: "#7C3AED", a2: "#E879F9" },
  { id: "violetdawn",     label: "Violet Dawn",     primary: "#1D4ED8", bg: "#F4F3FC", a: "#6D28D9", a2: "#C4B5FD" },
  { id: "sunsetdrift",    label: "Sunset Drift",    primary: "#BE185D", bg: "#FFF6F2", a: "#F97316", a2: "#FBBF24" },
  { id: "deepreef",       label: "Deep Reef",       primary: "#0E7490", bg: "#0A1418", a: "#14B8A6", a2: "#A855F7" },
  { id: "blushcloud",     label: "Blush Cloud",     primary: "#E1789F", bg: "#FFF5F8", a: "#F9A8D4", a2: "#FBCFE8" },
  { id: "hotpink",        label: "Hot Pink",        primary: "#FF1F8F", bg: "#FFF0F7", a: "#FF6FB5", a2: "#7C3AED" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/**
 * Depth & glow strength. 0 is off; the rest are "how much deeper", and the
 * NUMBER IS THE CONTRACT — 35 means the mix shares scale by 1.35, and the CSS
 * block in globals.css is keyed off exactly these values via data-deep.
 *
 * Adding a level means adding it here AND adding its block to globals.css.
 * Anything the app does not recognise falls back to off rather than erroring,
 * so a stale value from an older client is harmless.
 */
export const DEPTH_LEVELS = [
  { value: 0,  label: "Off",  hint: "Flat and clean" },
  { value: 20, label: "20%",  hint: "Subtle" },
  { value: 35, label: "35%",  hint: "Balanced" },
  { value: 50, label: "50%",  hint: "Strongest" },
] as const;

export type DepthLevel = (typeof DEPTH_LEVELS)[number]["value"];

export function isDepthLevel(n: unknown): n is DepthLevel {
  return typeof n === "number" && DEPTH_LEVELS.some((l) => l.value === n);
}

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  /** Deeper colour + a glow behind every block. 0 = off. Opt-in. */
  depth: DepthLevel;
  setDepth: (level: DepthLevel) => void;
}>({ theme: "pastel", setTheme: () => {}, depth: 0, setDepth: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("pastel");
  const [depth, setDepthState] = useState<DepthLevel>(0);
  const [clientId, setClientId] = useState<string | null>(null);

  function applyTheme(t: ThemeId) {
    setThemeState(t);
    localStorage.setItem("symmetry_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  /**
   * Depth & glow lives on <html> next to data-theme, for the same reason: the
   * styling is one CSS block keyed off the attribute, so nothing else in the
   * app has to know this setting exists, and it survives client-side
   * navigation because the attribute outlives any individual page.
   *
   * Off is written as an explicit "off" rather than removing the attribute, so
   * a rule can target either state later without needing :not().
   */
  function applyDepth(level: DepthLevel) {
    setDepthState(level);
    localStorage.setItem("symmetry_depth_level", String(level));
    document.documentElement.setAttribute("data-deep", level === 0 ? "off" : String(level));
  }

  /**
   * This setting shipped as a boolean a few hours before it became a scale, so
   * a device that opted in during that window has "1" under the old key. Map it
   * to 35, which is what that device was actually rendering — the on-state was
   * at 1.35x by then. Read once and rewritten under the new key, so this only
   * matters for one visit per device.
   */
  function readStoredDepth(): DepthLevel {
    const current = Number(localStorage.getItem("symmetry_depth_level"));
    if (isDepthLevel(current)) return current;
    return localStorage.getItem("symmetry_depth_glow") === "1" ? 35 : 0;
  }

  useEffect(() => {
    // Instant paint from localStorage, then account-level settings from the DB
    // win. Both are read before the network call so the first frame is already
    // correct on a repeat visit and nothing flashes.
    const stored = localStorage.getItem("symmetry_theme") as ThemeId | null;
    if (stored && THEMES.find((t) => t.id === stored)) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    applyDepth(readStoredDepth());
    (async () => {
      try {
        const sb: any = createClient();
        const { data: auth } = await sb.auth.getUser();
        if (!auth?.user) return;
        let { data: c } = await sb.from("clients").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
        if (!c && auth.user.email) {
          const { data: c2 } = await sb.from("clients").select("id").eq("email", auth.user.email).maybeSingle();
          c = c2;
        }
        if (!c?.id) return;
        setClientId(c.id);
        const { data: settings } = await sb
          .from("client_app_settings")
          .select("theme, depth_level")
          .eq("client_id", c.id)
          .maybeSingle();
        const dbTheme = settings?.theme as ThemeId | undefined;
        if (dbTheme && THEMES.find((t) => t.id === dbTheme)) {
          applyTheme(dbTheme);
        }
        // NULL means "never chosen" and must leave the local setting alone —
        // same rule as the theme. Only an explicit level from the account
        // overrides what this device is already showing. An unrecognised value
        // (a level this build does not know) is ignored rather than treated as
        // off, for the same reason.
        if (isDepthLevel(settings?.depth_level)) {
          applyDepth(settings.depth_level);
        }
      } catch {}
    })();
  }, []);

  function setTheme(t: ThemeId) {
    applyTheme(t);
    // Persist to the account so it survives logout/login on any device.
    //
    // The `.then(() => {})` that used to be here threw the result away, and
    // that is how this feature stayed broken for months: a CHECK constraint on
    // client_app_settings.theme still listed a RETIRED set of theme ids
    // ('steel_sky', 'iron_ember'…), so Postgres rejected every single write
    // from this picker. All 35 rows were still the column default — nobody's
    // theme had ever reached their account. The theme only lived in
    // localStorage, which is why an app update wiped everyone back to default.
    //
    // The constraint is gone (migration 2026-08-01), but the reason this went
    // unnoticed was the swallowed error, not the constraint. So the result is
    // read now. This is a preference, not a transaction — a failed save must
    // not throw a dialog at someone who just picked a colour — but it must not
    // be invisible either.
    try {
      if (clientId) {
        const sb: any = createClient();
        sb.from("client_app_settings")
          .upsert({ client_id: clientId, theme: t }, { onConflict: "client_id" })
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.error("[theme] save failed — theme is local-only on this device", error);
            }
          });
      }
    } catch (err) {
      console.error("[theme] save threw", err);
    }
  }

  function setDepth(level: DepthLevel) {
    applyDepth(level);
    // Same persistence contract as setTheme, including reading the result.
    try {
      if (clientId) {
        const sb: any = createClient();
        sb.from("client_app_settings")
          .upsert({ client_id: clientId, depth_level: level }, { onConflict: "client_id" })
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.error("[theme] depth level save failed — local-only on this device", error);
            }
          });
      }
    } catch (err) {
      console.error("[theme] depth level save threw", err);
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, depth, setDepth }}>
      {children}
    </ThemeContext.Provider>
  );
}
