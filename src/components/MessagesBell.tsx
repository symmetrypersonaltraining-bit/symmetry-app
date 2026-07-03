"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function MessagesBell({ variant = "icon" }: { variant?: "icon" | "banner" }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let on = true;
    const supabase = createClient();
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("to_id", user.id)
        .is("read_at", null);
      if (on) setCount(c || 0);
    }
    load();
    const iv = setInterval(load, 20000);
    return () => {
      on = false;
      clearInterval(iv);
    };
  }, []);

  if (variant === "banner") {
    if (count <= 0) return null;
    return (
      <Link
        href="/messages"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          textDecoration: "none",
          background: "var(--brand-primary)",
          color: "#fff",
          borderRadius: 16,
          padding: "12px 16px",
          boxShadow: "0 6px 20px rgba(124,156,245,0.5)",
          animation: "cw-pulse 1.4s ease-in-out infinite",
        }}
      >
        <span style={{ position: "relative", display: "inline-flex" }}>
          <i className="ti ti-bell" style={{ fontSize: 22 }} />
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ef4444",
              boxShadow: "0 0 0 2px var(--brand-primary)",
            }}
          />
        </span>
        <span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>
          {count} new message{count > 1 ? "s" : ""} — tap to read
        </span>
        <i className="ti ti-chevron-right" style={{ fontSize: 18 }} />
      </Link>
    );
  }

  return (
    <Link
      href="/messages"
      aria-label="Messages"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        borderRadius: 12,
        textDecoration: "none",
        animation: count > 0 ? "cw-pulse 1.4s ease-in-out infinite" : "none",
      }}
    >
      <i
        className="ti ti-bell"
        style={{ fontSize: 22, color: count > 0 ? "var(--brand-primary)" : "var(--brand-text)" }}
      />
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 999,
            background: "#ef4444",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
