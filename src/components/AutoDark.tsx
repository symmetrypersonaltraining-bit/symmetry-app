"use client";

import { useEffect } from "react";

/**
 * AutoDark — follows the phone's light/dark setting. 2026-07-25.
 *
 * Clients train at 5am and 9pm; a full-white screen at either hour is
 * unpleasant. The session logger is already dark, the rest of the app isn't.
 *
 * SAFETY — the important part:
 * Several of the 21 themes (midnight, carbonneon, berry, plumdusk…) are ALREADY
 * dark. Blindly applying a dark override to those would double-darken them into
 * mush. So instead of hardcoding a list of theme names (which drifts the moment
 * a theme is added), this measures the theme's actual --brand-bg luminance at
 * runtime and only opts in when the active theme is genuinely light.
 *
 * Sets data-appearance="dark" on <html>; all the styling lives in globals.css
 * under [data-appearance="dark"]. Removing this component reverts the app to
 * its current always-light behaviour with no other change.
 *
 * Respects an explicit user choice via localStorage symmetry_appearance:
 *   "auto" (default) | "light" | "dark"
 */
export default function AutoDark() {
  useEffect(() => {
    const root = document.documentElement;

    // Relative luminance of the theme's background. < 0.5 => already dark.
    const themeIsLight = (): boolean => {
      try {
        const raw = getComputedStyle(root).getPropertyValue("--brand-bg").trim();
        if (!raw) return true;
        let r = 0, g = 0, b = 0;
        if (raw.startsWith("#")) {
          const h = raw.length === 4
            ? raw.slice(1).split("").map((c) => c + c).join("")
            : raw.slice(1);
          if (h.length < 6) return true;
          r = parseInt(h.slice(0, 2), 16);
          g = parseInt(h.slice(2, 4), 16);
          b = parseInt(h.slice(4, 6), 16);
        } else {
          const m = raw.match(/\d+/g);
          if (!m || m.length < 3) return true;
          [r, g, b] = m.slice(0, 3).map(Number);
        }
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 >= 0.5;
      } catch {
        return true; // unknown => treat as light, i.e. allow the override
      }
    };

    const apply = () => {
      try {
        const pref = window.localStorage.getItem("symmetry_appearance") || "auto";
        let wantDark = false;
        if (pref === "dark") wantDark = true;
        else if (pref === "light") wantDark = false;
        else wantDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

        // Never re-darken a theme that is already dark.
        if (wantDark && themeIsLight()) root.setAttribute("data-appearance", "dark");
        else root.removeAttribute("data-appearance");

        // Feedback f6d884cd — "white background with white text". Tell the
        // browser how dark the surface actually is so IT draws its own widgets
        // to match: the <select> dropdown sheet, the date/time picker panels,
        // scrollbars. Without this a dark theme renders those popups white
        // while inheriting our near-white --brand-text — invisible text.
        //
        // Derived from the SAME luminance measurement as above rather than a
        // theme-name list, so it stays correct as themes are added, and it
        // covers BOTH cases the block above splits apart: a light theme being
        // overridden dark, and a theme that was dark to begin with.
        root.style.colorScheme = wantDark || !themeIsLight() ? "dark" : "light";
      } catch {
        /* an appearance tweak must never break the app */
      }
    };

    apply();

    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
    } catch {
      mq = null;
    }
    // The theme can change without a reload (ThemeProvider swaps data-theme),
    // so re-evaluate lightness when that attribute changes.
    const obs = new MutationObserver(apply);
    try {
      obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    } catch {
      /* noop */
    }
    window.addEventListener("storage", apply);

    return () => {
      try { mq?.removeEventListener("change", apply); } catch { /* noop */ }
      try { obs.disconnect(); } catch { /* noop */ }
      window.removeEventListener("storage", apply);
    };
  }, []);

  return null;
}
