import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";
import AIAssistant from "@/components/AIAssistant";
import FeedbackButton from "@/components/FeedbackButton";
import ExitClientModeButton from "@/components/ExitClientModeButton";
import { isClientMode } from "@/lib/client-mode";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = user?.email ?? "";
  const isTrainer = email === TRAINER_EMAIL;

  const clientMode = await isClientMode();
  if (isTrainer && !clientMode) {
    return <TrainerLayoutWrapper>{children}</TrainerLayoutWrapper>;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-bg)" }}>
      {isTrainer && clientMode && <ExitClientModeButton />}
      <div className="pb-20">{children}</div>
      <BottomNav />
      <AIAssistant isTrainer={false} />
      <FeedbackButton />
    </div>
  );
}
