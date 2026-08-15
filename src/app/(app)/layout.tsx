import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
import SessionDock from "@/components/SessionDock";
import HeaderAssist from "@/components/HeaderAssist";
import RealtimeScheduleSync from "@/components/RealtimeScheduleSync";
import PushRegister from "@/components/PushRegister";
import MessageNotifier from "@/components/MessageNotifier";
import { NotificationProvider } from "@/lib/useNotificationFeed";
import RefreshHandle from "@/components/RefreshHandle";
import GlobalCoach from "@/components/GlobalCoach";
import { isTrainerEmail } from "@/lib/trainer";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Verifies the session token locally when it can, so a slow or unreachable
  // Supabase Auth cannot stop this layout — and therefore the whole app — from
  // rendering. Falls back to asking Supabase, capped, when it cannot.
  // src/lib/auth/verifyJwt.ts has the incident and the trade-off.
  const {
    data: { user },
  } = await getServerUser(supabase);

  if (!user) redirect("/login");

  const email = user?.email ?? "";
  const isTrainer = isTrainerEmail(email);

  if (isTrainer) {
    return (
      // One provider, wrapping everything that reads unread — the bell in
      // HeaderAssist, the banner, and the nav badge. Mounted here so there can
      // only ever be one of it.
      <NotificationProvider>
        <RealtimeScheduleSync />
        <PushRegister />
        <MessageNotifier />
          <TrainerLayoutWrapper>{children}</TrainerLayoutWrapper>
      </NotificationProvider>
    );
  }

  return (
    <NotificationProvider>
    <div className="min-h-screen app-bg">
      <RealtimeScheduleSync />
      {/* Clients register for push AND get the in-app new-message banner too. */}
      <PushRegister />
      <MessageNotifier />
      {/* Docked feedback strip: reserves its own row in the page flow, so the
          button can NEVER cover content (fixed overlays float over scrolled content). */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", padding: "8px 14px 6px", background: "var(--brand-bg)" }}>
        <HeaderAssist solid />
      </div>
      {/* Deliberate pull-to-refresh. See RefreshHandle for why the old
          swipe-anywhere version was replaced by a handle you have to grab. */}
      <RefreshHandle />
      <div className="pb-20">{children}</div>
      <SessionDock />
      {/* Registers the service worker and offers the install where the
          platform allows it. Renders nothing once installed or dismissed. */}
      <InstallPrompt />
      {/* One coach, every client screen. It steps aside where a screen mounts a
          better-informed one (nutrition) and never appears on the logger — see
          GlobalCoach. */}
      <GlobalCoach />
      <BottomNav />
    </div>
    </NotificationProvider>
  );
}
