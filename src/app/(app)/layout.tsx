import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";
import SessionDock from "@/components/SessionDock";
import HeaderAssist from "@/components/HeaderAssist";
import RealtimeScheduleSync from "@/components/RealtimeScheduleSync";
import PushRegister from "@/components/PushRegister";
import MessageNotifier from "@/components/MessageNotifier";
import { NotificationProvider } from "@/lib/useNotificationFeed";
import PullToRefresh from "@/components/PullToRefresh";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = user?.email ?? "";
  const isTrainer = email === TRAINER_EMAIL;

  if (isTrainer) {
    return (
      // One provider, wrapping everything that reads unread — the bell in
      // HeaderAssist, the banner, and the nav badge. Mounted here so there can
      // only ever be one of it.
      <NotificationProvider>
        <RealtimeScheduleSync />
        <PushRegister />
        <MessageNotifier />
        <PullToRefresh />
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
      <PullToRefresh />
      {/* Docked feedback strip: reserves its own row in the page flow, so the
          button can NEVER cover content (fixed overlays float over scrolled content). */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", padding: "8px 14px 6px", background: "var(--brand-bg)" }}>
        <HeaderAssist solid />
      </div>
      <div className="pb-20">{children}</div>
      <SessionDock />
      <BottomNav />
    </div>
    </NotificationProvider>
  );
}
