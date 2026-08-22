"use client";

// A trainer uploads their own twenty faces.
//
// Dustin, 21 Aug: trainers get "their own avatar / bot persona set".
//
// Twenty NAMED slots, not a free-for-all, because the app asks for faces by
// name: /bots/<set>/<slug>.webp. The first script sent to trainers asked for
// twenty poses of its own invention, which would have produced twenty good
// images and left seven real slots — hydrate, nutrition, streak, pr, messages,
// plan, tips — empty. Each slot here says WHEN the app uses that face, because
// "stern" alone is not enough to know what to pose for.
//
// A part-finished set works: anything not uploaded falls back to the stock
// face, so a trainer can do five tonight and the rest on Sunday.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FACE_SLOTS } from "@/lib/ai/faceSlots";

const BUCKET = "assets";

/** Square, small, webp — these are drawn at 22–56px on a card. */
async function toWebpSquare(file: File, size = 256): Promise<Blob> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("bad image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // Contain, not cover: a face cropped to a square loses the raised arm that
    // made it "hype".
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.9));
    if (!blob) throw new Error("no blob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function TrainerFaceSetCard() {
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [botSet, setBotSet] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);

  const mySet = useMemo(() => (trainerId ? "u-" + trainerId : null), [trainerId]);
  const usingMine = !!mySet && botSet === mySet;

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data: me } = await sb.from("trainers").select("id, bot_set").eq("auth_user_id", uid).maybeSingle();
      const row = me as { id?: string; bot_set?: string | null } | null;
      if (!row?.id) return;
      setTrainerId(row.id);
      setBotSet(row.bot_set || null);
      const { data: files } = await sb.storage.from(BUCKET).list("bots/u-" + row.id, { limit: 100 });
      setDone(new Set(((files || []) as { name: string }[])
        .map((f) => f.name.replace(/\.webp$/, ""))));
    } catch {
      setErr("Couldn't load your set.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload(slug: string, file: File | null | undefined) {
    if (!file || !trainerId || !mySet) return;
    setBusy(slug);
    setErr(null);
    try {
      const sb = createClient();
      const blob = await toWebpSquare(file);
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(`bots/${mySet}/${slug}.webp`, blob, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      setDone((prev) => new Set(prev).add(slug));
      setStamp(Date.now());   // bust the browser's cache for a replaced face
      // The first face is enough to switch the set on. Waiting for all twenty
      // would mean seeing nothing until the very end.
      if (!usingMine) {
        const { error: setErrDb } = await sb.rpc("set_my_bot_set", { p_bot_set: mySet });
        if (!setErrDb) setBotSet(mySet);
      }
    } catch {
      setErr("That image wouldn't upload. Try a different one.");
    } finally {
      setBusy(null);
    }
  }

  async function useStock() {
    try {
      const sb = createClient();
      const { error } = await sb.rpc("set_my_bot_set", { p_bot_set: "" });
      if (error) throw error;
      setBotSet(null);
    } catch {
      setErr("Couldn't switch back.");
    }
  }

  if (!trainerId) return null;

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") +
    `/storage/v1/object/public/${BUCKET}/bots/${mySet}/`;

  return (
    <section>
      <p className="section-header">Your avatar set</p>
      <div className="card p-4">
        <p className="text-sm mb-1" style={{ color: "var(--brand-text)" }}>
          {done.size} of {FACE_SLOTS.length} uploaded
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
          These are the faces the app uses when it talks to your clients. Anything you
          haven&rsquo;t uploaded falls back to the standard set, so you can do a few now and
          the rest later.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {FACE_SLOTS.map((s) => {
            const have = done.has(s.slug);
            return (
              <label
                key={s.slug}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-center"
                style={{
                  background: "var(--brand-bg)",
                  border: `1px solid ${have ? "var(--brand-primary)" : "var(--brand-border)"}`,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                <span style={{
                  width: 52, height: 52, borderRadius: 12, overflow: "hidden",
                  background: "var(--brand-surface)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {have ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${base}${s.slug}.webp?v=${stamp}`} alt="" width={52} height={52}
                         style={{ objectFit: "contain" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/bots/${s.slug}.webp`} alt="" width={52} height={52}
                         style={{ objectFit: "contain", opacity: 0.35 }} />
                  )}
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                  {busy === s.slug ? "Uploading…" : s.label}
                </span>
                <span className="text-[10px] leading-snug" style={{ color: "var(--brand-text-secondary)" }}>
                  {s.what}
                </span>
                <input type="file" accept="image/*" style={{ display: "none" }}
                       disabled={!!busy}
                       onChange={(e) => upload(s.slug, e.target.files?.[0])} />
              </label>
            );
          })}
        </div>

        {err && <p className="text-xs font-semibold mt-3" style={{ color: "#dc2626" }}>{err}</p>}

        <p className="text-xs mt-4" style={{ color: "var(--brand-text-secondary)" }}>
          {usingMine
            ? "Your clients are seeing your set."
            : "Upload one and your set switches on automatically."}
          {usingMine ? (
            <>
              {" "}
              <button type="button" onClick={useStock}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                               font: "inherit", textDecoration: "underline", color: "inherit" }}>
                Go back to the standard set
              </button>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
