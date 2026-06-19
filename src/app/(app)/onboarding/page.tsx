import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, date_of_birth, primary_goal, injuries_limitations, experience_level, training_frequency, onboarding_complete")
    .eq("email", user.email!)
    .maybeSingle();

  // If no client record or already onboarded, go home
  if (!client) redirect("/home");
  if (client.onboarding_complete) redirect("/home");

  return (
    <OnboardingWizard
      clientId={client.id}
      prefill={{
        name: client.name || "",
        phone: client.phone || "",
        date_of_birth: client.date_of_birth || "",
        primary_goal: client.primary_goal || "",
        injuries_limitations: client.injuries_limitations || "",
        experience_level: client.experience_level || "",
        training_frequency: client.training_frequency || "",
      }}
    />
  );
}
