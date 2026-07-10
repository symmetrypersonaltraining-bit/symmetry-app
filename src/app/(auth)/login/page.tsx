"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicSent, setMagicSent] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Native app (Capacitor) detection: password login works in the WebView,
  // but magic-link opens the external browser and never signs the app in.
  // So inside the native app we hide the magic-link option and use password only.
  const [isNativeApp, setIsNativeApp] = useState(false);
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean } }).Capacitor;
    if (cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.isNative)) {
      setIsNativeApp(true);
      setMode("password");
    }
  }, []);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Check if this is a client with a temporary password
      try {
        const { data: { user: loggedInUser } } = await supabase.auth.getUser();
        if (loggedInUser && loggedInUser.email !== "symmetrypersonaltraining@gmail.com") {
          const { data: clientRec } = await supabase
            .from("clients")
            .select("id")
            .eq("auth_user_id", loggedInUser.id)
            .maybeSingle();
          if (clientRec) {
            const { data: settings } = await supabase
              .from("client_app_settings")
              .select("password_is_temporary")
              .eq("client_id", clientRec.id)
              .maybeSingle();
            if (settings?.password_is_temporary) {
              router.push("/set-password");
              return;
            }
          }
        }
      } catch (_) { /* ignore - just go to home */ }
      router.push("/home");
      router.refresh();
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMagicSent(true);
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0F4C81" }}
    >
      {/* Top branding */}
      <div className="flex flex-col items-center pt-16 pb-10 px-6">
        <Logo size={80} color="white" />
        <h1
          className="text-2xl font-medium text-white mt-4 tracking-wide symmetry-title-dark"
          style={{ letterSpacing: "0.5px" }}
        >
          Symmetry
        </h1>
        <p className="text-white/60 text-sm tracking-widest mt-1 uppercase">
          Personal Training
        </p>
      </div>

      {/* Card */}
      <div
        className="flex-1 rounded-t-3xl px-6 pt-8 pb-10"
        style={{ background: "#EDF2F7" }}
      >
        {magicSent ? (
          <div className="text-center py-8">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
              style={{ background: "#DDEEFF" }}
            >
              <i className="ti ti-mail-check text-3xl" style={{ color: "#0F4C81" }} />
            </div>
            <h2 className="text-lg font-medium mb-2" style={{ color: "#0D1B2E" }}>
              Check your inbox
            </h2>
            <p className="text-sm" style={{ color: "#4E6080" }}>
              We sent a login link to{" "}
              <span className="font-medium">{email}</span>. Click the link to
              sign in - no password needed.
            </p>
            <button
              onClick={() => setMagicSent(false)}
              className="mt-6 text-sm"
              style={{ color: "#0F4C81" }}
            >
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <h2
              className="text-lg font-medium mb-6"
              style={{ color: "#0D1B2E" }}
            >
              Sign in
            </h2>

            {/* Toggle (hidden in the native app - password only there) */}
            {!isNativeApp && (
            <div
              className="flex rounded-lg p-1 mb-6"
              style={{ background: "#DDEEFF" }}
            >
              <button
                onClick={() => setMode("password")}
                className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                style={
                  mode === "password"
                    ? { background: "#0F4C81", color: "white" }
                    : { color: "#4E6080" }
                }
              >
                Password
              </button>
              <button
                onClick={() => setMode("magic")}
                className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                style={
                  mode === "magic"
                    ? { background: "#0F4C81", color: "white" }
                    : { color: "#4E6080" }
                }
              >
                Magic link
              </button>
            </div>
            )}

            <form
              onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}
              className="space-y-4"
            >
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4E6080" }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-lg px-4 py-3 text-sm border"
                  style={{
                    background: "white",
                    borderColor: "#C8D8EC",
                    color: "#0D1B2E",
                  }}
                />
              </div>

              {mode === "password" && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "#4E6080" }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="w-full rounded-lg px-4 py-3 text-sm border"
                    style={{
                      background: "white",
                      borderColor: "#C8D8EC",
                      color: "#0D1B2E",
                    }}
                  />
                </div>
              )}

              {error && (
                <p className="text-sm" style={{ color: "#DC2626" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-3 text-sm font-medium text-white mt-2 disabled:opacity-60"
                style={{ background: "#0F4C81" }}
              >
                {loading
                  ? "Signing in..."
                  : mode === "password"
                  ? "Sign in"
                  : "Send magic link"}
              </button>
            </form>

            <p
              className="text-xs text-center mt-6"
              style={{ color: "#4E6080" }}
            >
              Contact your trainer if you need access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
