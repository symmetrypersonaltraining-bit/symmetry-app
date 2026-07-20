"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Registers this device for push notifications and stores the FCM token so the
// server can push to it. Mounted in the TRAINER branch of the app layout only —
// so today only the trainer registers a token (scope: trainer message alerts).
// Fully guarded: no-ops on web/PWA and in any native build that doesn't yet have
// the @capacitor/push-notifications plugin, so it can't affect anyone until push
// is wired end-to-end (see PUSH-NOTIFICATIONS handoff).
export default function PushRegister() {
  useEffect(() => {
    (async () => {
      try {
        const w = window as unknown as {
          Capacitor?: {
            isNativePlatform?: () => boolean;
            Plugins?: {
              PushNotifications?: {
                requestPermissions?: () => Promise<{ receive?: string }>;
                register?: () => Promise<void>;
                addListener?: (event: string, cb: (data: { value?: string }) => void) => void;
              };
            };
          };
        };
        const cap = w.Capacitor;
        const isNative = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
        const PN = cap?.Plugins?.PushNotifications;
        if (!isNative || !PN || typeof PN.register !== "function") return; // web / plugin absent

        if (PN.requestPermissions) {
          const perm = await PN.requestPermissions();
          if (perm && perm.receive && perm.receive !== "granted") return;
        }

        if (PN.addListener) {
          PN.addListener("registration", async (t) => {
            const token = t?.value;
            if (!token) return;
            try {
              const supabase = createClient();
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              await (supabase as any).from("device_tokens").upsert(
                { user_id: user.id, token, platform: "android", updated_at: new Date().toISOString() },
                { onConflict: "token" },
              );
            } catch { /* noop */ }
          });
        }

        await PN.register();
      } catch { /* noop */ }
    })();
  }, []);

  return null;
}
