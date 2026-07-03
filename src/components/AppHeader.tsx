"use client";
import MessagesBell from "./MessagesBell";

import Logo from "./Logo";
import Link from "next/link";

interface AppHeaderProps {
  clientName?: string;
  clientInitials?: string;
  isTrainer?: boolean;
  clients?: { id: string; name: string }[];
  activeClientId?: string;
}

export default function AppHeader({
  clientName,
  clientInitials,
  isTrainer = false,
  clients = [],
  activeClientId,
}: AppHeaderProps) {
  const initials = clientInitials || (clientName ? clientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?");

  return (
    <div style={{ background: "linear-gradient(135deg, #0D3F6E 0%, var(--brand-primary) 60%, #1565C0 100%)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Logo size={38} color="white" />
        <div className="flex-1">
          <div className="text-white font-medium text-base">Symmetry</div>
          <div className="text-white/60 text-xs tracking-widest uppercase">
            Personal Training
          </div>
        </div>
        <MessagesBell />
          {/* User avatar / view label */}
        <div className="flex items-center gap-2">
          {isTrainer && (
            <span
              className="text-xs px-3 py-1 rounded-full border text-white/80"
              style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)" }}
            >
              Trainer
            </span>
          )}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* Client chip switcher (trainer only) */}
      {isTrainer && clients.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
          <Link
            href="/home"
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border"
            style={
              !activeClientId
                ? { background: "rgba(255,255,255,0.25)", color: "white", borderColor: "rgba(255,255,255,0.4)" }
                : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }
            }
          >
            All Clients
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap"
              style={
                activeClientId === c.id
                  ? { background: "rgba(255,255,255,0.25)", color: "white", borderColor: "rgba(255,255,255,0.4)" }
                  : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }
              }
            >
              {c.name.split(" ")[0]} {c.name.split(" ").slice(-1)[0]?.[0]}.
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
