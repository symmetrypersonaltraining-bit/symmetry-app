"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * PrivateProfilePanel — trainer-only private profile migrated from Notion.
 * Self-contained: fetches client_private_profiles by clientId. That table is
 * RLS-locked to the trainer's auth uid, so a non-trainer gets zero rows and
 * this renders nothing — safe even though /clients is already trainer-only.
 * Collapsible; returns null until loaded so it can never break the profile page.
 */
export default function PrivateProfilePanel({ clientId }: { clientId: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ source_url?: string | null; updated_at?: string | null } | null>(null);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase: any = createClient();
        const { data } = await supabase
          .from("client_private_profiles")
          .select("content, source_url, updated_at")
          .eq("client_id", clientId)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setContent(data.content || "");
          setMeta({ source_url: data.source_url, updated_at: data.updated_at });
        }
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!loaded) return null;

  return (
    <div
      style={{
        marginTop: 16,
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--brand-text)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          🔒 Private Profile
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand-text-secondary)" }}>trainer only</span>
        </span>
        <span style={{ color: "var(--brand-text-secondary)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {content ? (
            <>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--brand-text)",
                  margin: 0,
                }}
              >
                {content}
              </pre>
              {meta?.source_url ? (
                <a
                  href={meta.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: "var(--brand-primary)", display: "inline-block", marginTop: 10 }}
                >
                  Open in Notion ↗
                </a>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--brand-text-secondary)" }}>No private profile migrated yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
