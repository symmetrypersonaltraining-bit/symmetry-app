"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Guard: only clients with a temp password should land here
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      if (user.email === "symmetrypersonaltraining@gmail.com") { router.replace("/home"); return; }

      const { data: clientRec } = await supabase
        .from("clients")
        .select("id, onboarding_complete")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!clientRec) { router.replace("/home"); return; }

      const { data: settings } = await supabase
        .from("client_app_settings")
        .select("password_is_temporary")
        .eq("client_id", clientRec.id)
        .maybeSingle();

      const isRecovery = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("recovery") === "1";
      if (!isRecovery && !settings?.password_is_temporary && clientRec?.onboarding_complete) { router.replace("/home"); return; }
      setChecking(false);
    }
    check();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      // 1. Update password in Supabase auth
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;

      // 2. Look up client and clear the temp flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: clientRec } = await supabase
          .from("clients")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (clientRec) {
          await supabase
            .from("client_app_settings")
            .update({ password_is_temporary: false, first_login_completed: true })
            .eq("client_id", clientRec.id);
        }
      }

      setDone(true);
      window.location.href = "/onboarding";
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F4C81" }}>
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0F4C81" }}>
      {/* Branding */}
      <div className="flex flex-col items-center pt-16 pb-10 px-6">
        <Logo size={72} color="white" />
        <h1 className="text-2xl font-medium text-white mt-4 tracking-wide">Symmetry</h1>
        <p className="text-white/60 text-sm tracking-widest mt-1 uppercase">Corrective</p>
      </div>

      {/* Card */}
      <div className="flex-1 rounded-t-3xl px-6 pt-8 pb-10" style={{ background: "#EDF2F7" }}>
        {done ? (
          <div className="flex flex-col items-center pt-8 gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: "#0F4C81" }}
            >
              ✓
            </div>
            <p className="text-lg font-semibold text-center" style={{ color: "#0D1B2E" }}>
              Password set!
            </p>
            <p className="text-sm text-center" style={{ color: "#4E6080" }}>
              Taking you to your dashboard…
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>Set your password</h2>
              <p className="text-sm mt-1" style={{ color: "#4E6080" }}>
                You're logged in with a temporary password. Choose a permanent one to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#4E6080" }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="w-full rounded-lg px-4 py-3 text-sm border"
                  style={{ background: "white", borderColor: "#C8D8EC", color: "#0D1B2E" }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#4E6080" }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  className="w-full rounded-lg px-4 py-3 text-sm border"
                  style={{ background: "white", borderColor: "#C8D8EC", color: "#0D1B2E" }}
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-3 text-sm font-medium text-white mt-2 disabled:opacity-60"
                style={{ background: "#0F4C81" }}
              >
                {loading ? "Saving…" : "Set Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
