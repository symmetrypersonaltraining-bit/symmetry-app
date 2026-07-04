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
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}>({ theme: "pastel", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("pastel");
  const [clientId, setClientId] = useState<string | null>(null);

  function applyTheme(t: ThemeId) {
    setThemeState(t);
    localStorage.setItem("symmetry_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  useEffect(() => {
    // Instant paint from localStorage, then account-level theme from DB wins
    const stored = localStorage.getItem("symmetry_theme") as ThemeId | null;
    if (stored && THEMES.find((t) => t.id === stored)) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
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
        const { data: settings } = await sb.from("client_app_settings").select("theme").eq("client_id", c.id).maybeSingle();
        const dbTheme = settings?.theme as ThemeId | undefined;
        if (dbTheme && THEMES.find((t) => t.id === dbTheme)) {
          applyTheme(dbTheme);
        }
      } catch {}
    })();
  }, []);

  function setTheme(t: ThemeId) {
    applyTheme(t);
    // Persist to the account so it survives logout/login on any device
    try {
      if (clientId) {
        const sb: any = createClient();
        sb.from("client_app_settings")
          .upsert({ client_id: clientId, theme: t }, { onConflict: "client_id" })
          .then(() => {});
      }
    } catch {}
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
