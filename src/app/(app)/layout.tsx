import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";

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

  if (isTrainer) {
    return <TrainerLayoutWrapper>{children}</TrainerLayoutWrapper>;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-bg)" }}>
      <div className="pb-20">{children}</div>
      <BottomNav />
    </div>
  );
}
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";

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

  if (isTrainer) {
    return <TrainerLayoutWrapper>{children}</TrainerLayoutWrapper>;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-bg)" }}>
      <div className="pb-20">{children}</div>
      <BottomNav />
    </div>
  );
}
