"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "navy", label: "Navy Blue", primary: "#0F4C81", bg: "#EDF2F7" },
  { id: "charcoal", label: "Charcoal", primary: "#2D2D2D", bg: "#F0F0F0" },
  { id: "forest", label: "Forest Green", primary: "#1B5E20", bg: "#F0F7F0" },
  { id: "gunmetal", label: "Gunmetal", primary: "#37474F", bg: "#EAEEF2" },
  { id: "purple", label: "Deep Purple", primary: "#4A148C", bg: "#F3F0F8" },
  { id: "orange", label: "Burnt Orange", primary: "#BF360C", bg: "#FFF3E0" },
  { id: "rose", label: "Rose", primary: "#880E4F", bg: "#FFF0F3" }, { id: "blush", label: "Blush", primary: "#C2185B", bg: "#FFF0F5" },
    { id: "lagoon", label: "Lagoon", primary: "#0E7C86", bg: "#EEF8F8" },
    { id: "orchid", label: "Orchid", primary: "#8E2DAF", bg: "#FAF4FB" },
    { id: "berry", label: "Berry", primary: "#B0306A", bg: "#FBF1F5" },
  { id: "midnight", label: "Midnight", primary: "#58A6FF", bg: "#0D1117" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}>({ theme: "navy", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("navy");

  useEffect(() => {
    const stored = localStorage.getItem("symmetry_theme") as ThemeId | null;
    if (stored && THEMES.find((t) => t.id === stored)) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function setTheme(t: ThemeId) {
    setThemeState(t);
    localStorage.setItem("symmetry_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
