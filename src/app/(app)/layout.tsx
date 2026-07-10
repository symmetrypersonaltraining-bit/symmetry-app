import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";
import SessionDock from "@/components/SessionDock";
import HeaderAssist from "@/components/HeaderAssist";
import RealtimeScheduleSync from "@/components/RealtimeScheduleSync";

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
      <>
        <RealtimeScheduleSync />
        <TrainerLayoutWrapper>{children}</TrainerLayoutWrapper>
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-bg)" }}>
      <RealtimeScheduleSync />
      <div className="pb-20">{children}</div>
      <div style={{ position: "fixed", top: 10, right: 14, zIndex: 950 }}>
        <HeaderAssist solid />
      </div>
      <SessionDock />
      <BottomNav />
    </div>
  );
}
