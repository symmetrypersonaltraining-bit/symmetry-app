"use client";
// Shared avatar: photo if clients.avatar_url is set, initials fallback.
// AvatarSelf = self-resolving display + tap-to-upload (used in Settings).
// useMyClientRow = resolve the signed-in user's client row (trainer incl.).
// Read-only everywhere except AvatarSelf's explicit upload action.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient() as any;

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export function initialsOf(name: string): string {
  return (
    (name || "")
      .split(" ")
      .map((n) => n[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  radius?: number;
  className?: string;
  fontSize?: number;
}

export default function Avatar({ name, url, size = 40, radius, className = "", fontSize }: AvatarProps) {
  const r = radius ?? size / 2;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={className}
        style={{ width: size, height: size, borderRadius: r, objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: "var(--brand-primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: fontSize ?? Math.max(11, Math.round(size * 0.38)),
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

export function useMyClientRow(): { id: string | null; avatarUrl: string | null; refresh: () => void } {
  const [id, setId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;
        if (!user) return;
        let rows = (
          await supabase.from("clients").select("id, avatar_url").eq("auth_user_id", user.id).limit(1)
        ).data;
        if ((!rows || !rows.length) && user.email === TRAINER_EMAIL) {
          rows = (
            await supabase.from("clients").select("id, avatar_url").ilike("name", "%Dustin%").limit(1)
          ).data;
        }
        if (!cancelled && rows && rows[0]) {
          setId(rows[0].id as string);
          setAvatarUrl((rows[0].avatar_url as string) || null);
        }
      } catch {
        /* never break the host UI */
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { id, avatarUrl, refresh: () => setTick((t) => t + 1) };
}

async function resizeToJpeg(file: File, max = 512): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b || file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

export function AvatarSelf({ name, size = 48, radius }: { name: string; size?: number; radius?: number }) {
  const { id, avatarUrl, refresh } = useMyClientRow();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = async (f: File | null | undefined) => {
    if (!f || !id) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await resizeToJpeg(f);
      const path = id + "-" + Date.now() + ".jpg";
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub && (pub.publicUrl as string);
      if (!url) throw new Error("no public url");
      const { error: dbErr } = await supabase.from("clients").update({ avatar_url: url }).eq("id", id);
      if (dbErr) throw dbErr;
      refresh();
    } catch {
      setErr("Upload failed — try a different photo.");
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => inputRef.current && inputRef.current.click()}
        disabled={busy || !id}
        style={{ position: "relative", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
        aria-label="Change profile photo"
      >
        <Avatar name={name} url={avatarUrl} size={size} radius={radius} />
        <span
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: "var(--brand-primary)",
            color: "#fff",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--brand-surface)",
          }}
        >
          +
        </span>
      </button>
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={busy || !id}
          style={{
            border: "1px solid var(--brand-border)",
            background: "transparent",
            color: "var(--brand-primary)",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {busy ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
        </button>
        {err && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>{err}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onPick(e.target.files && e.target.files[0])}
      />
    </div>
  );
}
