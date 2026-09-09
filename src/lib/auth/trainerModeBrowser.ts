// The browser wiring for watchTrainerMode. Kept apart from the logic so the
// logic can be tested without a DOM, a Supabase client or a two-second wait.

import { createClient } from "@/lib/supabase/client";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { CLIENT_MODE_COOKIE } from "@/lib/ai/trainerGate";
import type { TrainerModeDeps } from "@/lib/auth/trainerMode";

/**
 * Client View, read fresh: the cookie the toggle sets, or the preview path.
 *
 * The cookie constant is shared with the server gate so the drawer, the button
 * and /api/agent cannot drift about what "the trainer app" means.
 */
export function inClientModeNow(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const cookieOn = document.cookie.split("; ").some((c) => c === CLIENT_MODE_COOKIE + "=1");
    const previewPath =
      typeof window !== "undefined" && window.location.pathname.startsWith("/client-preview");
    return cookieOn || previewPath;
  } catch {
    // Unreadable cookies must not silently drop the guard.
    return false;
  }
}

export function browserTrainerModeDeps(): TrainerModeDeps {
  const sb: ReturnType<typeof createClient> = createClient();
  return {
    getUser: async () => {
      const { data } = await (sb as unknown as {
        auth: { getUser: () => Promise<{ data?: { user?: { id?: string; email?: string } | null } }> };
      }).auth.getUser();
      return data?.user ?? null;
    },
    isTrainer: (user) => viewerIsTrainer(sb, user),
    inClientMode: inClientModeNow,
    // The signal nothing in this app was listening for: the session arriving
    // after the first render. Without it a cold start could leave the drawer
    // shut for the life of the page.
    onAuthChange: (cb) => {
      try {
        const { data } = (sb as unknown as {
          auth: { onAuthStateChange: (f: () => void) => { data?: { subscription?: { unsubscribe: () => void } } } };
        }).auth.onAuthStateChange(() => cb());
        return () => { try { data?.subscription?.unsubscribe(); } catch { /* already gone */ } };
      } catch {
        return () => {};
      }
    },
  };
}
