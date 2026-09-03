import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Admin client — uses service role key, server-side only
// Required for: creating auth users, sending invites, bypassing RLS
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
