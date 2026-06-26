"use client";

import { useEffect, useRef } from "react";

// Auto-update: when a new version has been deployed, reload the app so clients
// never get stuck on a stale cached build. Checks on load, on tab focus /
// becoming visible (covers reopening a phone PWA), and every 5 minutes.
export default function VersionWatcher() {
  const loaded = useRef<string | null>(null);
  const lastReload = useRef<number>(0);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        const sha = data && data.sha;
        if (!sha) return;
        if (loaded.current === null) {
          loaded.current = sha;
          return;
        }
        if (sha !== loaded.current && Date.now() - lastReload.current > 60000) {
          lastReload.current = Date.now();
          window.location.reload();
        }
      } catch {
        /* offline or transient — ignore */
      }
    };

    check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    const id = setInterval(check, 5 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
      clearInterval(id);
    };
  }, []);

  return null;
}
