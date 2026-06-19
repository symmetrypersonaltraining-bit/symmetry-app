import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--brand-text)" }}>Settings</h1>
      <SettingsClient />
    </div>
  );
}
