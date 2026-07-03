"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function MessagesBell() {
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
    const iv = setInterval(load, 30000);
    return () => {
      on = false;
      clearInterval(iv);
    };
  }, []);

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
      }}
    >
      <i className="ti ti-bell" style={{ fontSize: 22, color: "var(--brand-text)" }} />
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
