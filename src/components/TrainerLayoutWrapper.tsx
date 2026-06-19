"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TrainerSidebar from "./TrainerSidebar";
import AIAssistant from "./AIAssistant";

interface Props {
  children: React.ReactNode;
}

export default function TrainerLayoutWrapper({ children }: Props) {
  const [clientMode, setClientMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("symmetry_view_mode");
    if (stored === "client") setClientMode(true);
  }, []);

  function handleToggleMode() {
    const next = !clientMode;
    setClientMode(next);
    localStorage.setItem("symmetry_view_mode", next ? "client" : "trainer");
    if (next) {
      router.push("/workout");
    } else {
      router.push("/home");
    }
  }

  if (clientMode) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-bg)" }}>
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: "var(--brand-primary)" }}
        >
          <button
            onClick={handleToggleMode}
            className="flex items-center gap-2 text-sm text-white/80 px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <i className="ti ti-arrow-left text-sm" />
            Trainer View
          </button>
          <div className="flex-1 text-center text-white font-medium text-sm">
            My Client App
          </div>
          <div className="w-24" />
        </div>
        <div className="pb-6">{children}</div>
        <AIAssistant isTrainer={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--brand-bg)" }}>
      <TrainerSidebar
        clientMode={clientMode}
        onToggleClientMode={handleToggleMode}
        userName="Dustin Gautreaux"
        userInitials="DG"
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="lg:hidden h-14" />
        {children}
      </div>
      <AIAssistant isTrainer={true} />
    </div>
  );
}
