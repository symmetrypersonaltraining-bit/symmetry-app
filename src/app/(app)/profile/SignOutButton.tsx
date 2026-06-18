"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="flex items-center gap-3 text-sm w-full"
      style={{ color: "#DC2626" }}
    >
      <i className="ti ti-logout text-lg" />
      Sign out
    </button>
  );
}
