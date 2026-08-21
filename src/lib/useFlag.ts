"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FlagKey } from "@/lib/flags";

/**
 * A feature flag, read from the browser.
 *
 * lib/flags.ts is the server half and stays the authority — every gate that
 * decides whether a thing may HAPPEN lives there. This is only for gates that
 * decide whether a link is worth DRAWING, so that a nav entry for something
 * switched off does not sit there dead-ending into a redirect.
 *
 * Same non-negotiable rule as the server: a flag that cannot be read is OFF.
 * Undefined means "not answered yet" and is distinct from false, so a caller
 * can avoid flashing a link on and back off during the first paint.
 */
export function useFlag(key: FlagKey): boolean | undefined {
  const [on, setOn] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("app_flags")
          .select("enabled")
          .eq("key", key)
          .maybeSingle();
        if (!live) return;
        setOn(!error && (data as { enabled?: boolean } | null)?.enabled === true);
      } catch {
        if (live) setOn(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return on;
}
