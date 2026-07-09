"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * RealtimeScheduleSync — subscribes to scheduled_workouts changes via Supabase
 * realtime and refreshes the current route when a row changes, so a workout
 * move made on ANY screen or device reflects on every calendar (client home
 * ring, View-Schedule board/month, trainer calendar + client-profile) without
 * a manual reload. Isolated/additive: renders nothing, debounces refreshes, and
 * silently no-ops if realtime is unavailable. Revert = unmount this component.
 */
export default function RealtimeScheduleSync() {
  const router = useRouter();
  useEffect(() => {
    let channel: any = null;
    let t: any = null;
    try {
      const supabase: any = createClient();
      const debouncedRefresh = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          try { router.refresh(); } catch { /* ignore */ }
        }, 500);
      };
      channel = supabase
        .channel("schedule-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_workouts" }, debouncedRefresh)
        .subscribe();
    } catch {
      /* realtime unavailable — safe no-op */
    }
    return () => {
      try {
        clearTimeout(t);
        if (channel) {
          const supabase: any = createClient();
          supabase.removeChannel(channel);
        }
      } catch { /* ignore */ }
    };
  }, [router]);

  return null;
}
