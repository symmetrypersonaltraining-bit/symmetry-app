"use client";

// A TRAINER'S FACE LIBRARY.
//
// Dustin, 21 Aug: trainers get "their own avatar / bot persona set".
// Dustin, 23 Aug: "can we create a library in all trainer apps to upload
// avatars to be cycled through? a section for each type: group msg bot, ai
// cards, celebrations, etc. needs to be coded so that you use those avatars in
// appropriate places w proper emotions."
//
// Three things that were not true before and are now:
//
//   1. MANY PER SLOT. This was one file per slug, upserted — a second upload
//      replaced the first. A slot now holds as many as you like and the app
//      rotates through them, so a coach with five neutrals does not look like a
//      coach with one.
//   2. SECTIONS. Twenty named slots in one grid is a chore with no shape. They
//      are grouped by where they appear — everyday cards, celebrations,
//      check-ins, the group bot, topics — and ordered so the ones the app draws
//      constantly come first. "Which five tonight?" now has an answer.
//   3. THE FALLBACK IS REAL. The old copy promised that anything not uploaded
//      fell back to the standard set. It did not: the resolver picked ONE
//      directory for the whole set, so a half-finished set rendered broken
//      images on the client's screen. faceSrc resolves per slug now, so a
//      part-finished library is an ordinary state — which is what makes "a few
//      now, the rest later" honest advice rather than a trap.
//
// NAMED slots, not a free-for-all, because the app asks for faces by emotional
// register — it needs to know which picture means "you have gone quiet" and
// which means "that was a personal record". Each slot says WHEN the app uses
// it, because "stern" alone is not enough to know what to pose for.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UPLOADABLE_SECTIONS, faceSlot, FACE_SLOTS } from "@/lib/ai/faceSlots";

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

interface Variant { id: string; slug: string; path: string }

export default function TrainerFaceSetCard() {
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [botSet, setBotSet] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("everyday");

  const mySet = useMemo(() => (trainerId ? "u-" + trainerId : null), [trainerId]);
  const usingMine = !!mySet && botSet === mySet;

  const bySlug = useMemo(() => {
    const m = new Map<string, Variant[]>();
    for (const v of variants) {
      const list = m.get(v.slug) || [];
      list.push(v);
      m.set(v.slug, list);
    }
    return m;
  }, [variants]);

  const filled = useMemo(() => new Set(bySlug.keys()), [bySlug]);

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
      const { data: rows } = await sb
        .from("trainer_face_variants")
        .select("id, slug, storage_path")
        .eq("trainer_id", row.id)
        .order("ord", { ascending: true });
      setVariants(((rows as { id: string; slug: string; storage_path: string }[]) || [])
        .map((r) => ({ id: r.id, slug: r.slug, path: r.storage_path })));
    } catch {
      setErr("Couldn't load your library.");
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
      // A unique name per upload — the old code wrote `<slug>.webp` with
      // upsert, which is exactly why a slot could only ever hold one.
      const path = `bots/${mySet}/${slug}-${Date.now()}.webp`;
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw error;

      // The row is what the app reads. An upload that lands in storage and
      // never gets a row is a file nobody will ever see, so a failure here has
      // to remove the orphan rather than leave it sitting in the bucket.
      const ord = (bySlug.get(slug)?.length || 0);
      const { data: ins, error: rowErr } = await sb
        .from("trainer_face_variants")
        .insert({ trainer_id: trainerId, slug, storage_path: path, ord })
        .select("id")
        .single();
      if (rowErr || !ins) {
        await sb.storage.from(BUCKET).remove([path]);
        throw rowErr || new Error("no row");
      }

      setVariants((prev) => [...prev, { id: (ins as { id: string }).id, slug, path }]);
      // The first face is enough to switch the library on. Waiting for all
      // twenty would mean seeing nothing until the very end.
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

  async function removeVariant(v: Variant) {
    setBusy(v.slug);
    setErr(null);
    try {
      const sb = createClient();
      // Row first. A deleted file with a surviving row is a broken image on a
      // client's screen; a surviving file with no row is invisible and harmless.
      const { error } = await sb.from("trainer_face_variants").delete().eq("id", v.id);
      if (error) throw error;
      await sb.storage.from(BUCKET).remove([v.path]);
      setVariants((prev) => prev.filter((x) => x.id !== v.id));
    } catch {
      setErr("Couldn't remove that one.");
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

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + `/storage/v1/object/public/${BUCKET}/`;

  return (
    <section>
      <p className="section-header">Your avatar library</p>
      <div className="card p-4">
        <p className="text-sm mb-1" style={{ color: "var(--brand-text)" }}>
          {filled.size} of {FACE_SLOTS.length} slots filled
          {variants.length > filled.size ? ` · ${variants.length} images` : ""}
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
          These are the faces the app uses when it talks to your clients. Put several in a
          slot and it rotates through them. Anything you haven&rsquo;t filled uses the
          standard face for that one slot, so a few now and the rest later is fine.
        </p>

        {UPLOADABLE_SECTIONS.map((sec) => {
          const open = openSection === sec.id;
          const filledHere = sec.slugs.filter((x) => filled.has(x)).length;
          return (
            <div key={sec.id} className="mb-2 rounded-xl" style={{ border: "1px solid var(--brand-border)" }}>
              <button
                type="button"
                onClick={() => setOpenSection(open ? null : sec.id)}
                className="w-full flex items-center gap-2 p-3 text-left"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <span className="text-sm font-bold flex-1" style={{ color: "var(--brand-text)" }}>
                  {sec.title}
                  {sec.priority === 1 && !open && filledHere === 0 ? (
                    <span className="text-[10px] font-semibold ml-2 px-1.5 py-0.5 rounded"
                          style={{ background: "color-mix(in srgb, var(--brand-primary) 18%, transparent)", color: "var(--brand-primary)" }}>
                      start here
                    </span>
                  ) : null}
                </span>
                <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {filledHere}/{sec.slugs.length}
                </span>
                <span className={open ? "ti ti-chevron-up" : "ti ti-chevron-down"} aria-hidden
                      style={{ color: "var(--brand-text-secondary)" }} />
              </button>

              {open ? (
                <div className="px-3 pb-3">
                  <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>{sec.blurb}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                    {sec.slugs.map((slug) => {
                      const slot = faceSlot(slug);
                      if (!slot) return null;
                      const mine = bySlug.get(slug) || [];
                      return (
                        <div key={slug} className="p-2.5 rounded-xl"
                             style={{ background: "var(--brand-bg)",
                                      border: `1px solid ${mine.length ? "var(--brand-primary)" : "var(--brand-border)"}` }}>
                          <div className="flex flex-wrap gap-1.5 justify-center mb-1.5" style={{ minHeight: 54 }}>
                            {mine.length === 0 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/bots/${slug}.webp`} alt="" width={52} height={52}
                                   style={{ objectFit: "contain", opacity: 0.35 }} />
                            ) : mine.map((v) => (
                              <span key={v.id} style={{ position: "relative", display: "inline-block" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={base + v.path} alt="" width={52} height={52}
                                     style={{ objectFit: "contain", borderRadius: 10, display: "block" }} />
                                <button type="button" aria-label={`Remove one ${slot.label} face`}
                                        onClick={() => removeVariant(v)} disabled={!!busy}
                                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20,
                                                 borderRadius: 999, border: "1px solid var(--brand-border)",
                                                 background: "var(--brand-card)", color: "var(--brand-text-secondary)",
                                                 cursor: busy ? "default" : "pointer", lineHeight: "18px",
                                                 fontSize: 12, padding: 0 }}>
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <p className="text-xs font-semibold text-center" style={{ color: "var(--brand-text)" }}>
                            {busy === slug ? "Working…" : slot.label}
                          </p>
                          <p className="text-[10px] leading-snug text-center mb-1.5"
                             style={{ color: "var(--brand-text-secondary)" }}>
                            {slot.what}
                          </p>
                          <label className="block text-[11px] font-semibold text-center rounded-lg py-1"
                                 style={{ border: "1px dashed var(--brand-border)",
                                          color: "var(--brand-text-secondary)",
                                          cursor: busy ? "default" : "pointer" }}>
                            {mine.length ? "Add another" : "Upload"}
                            <input type="file" accept="image/*" style={{ display: "none" }}
                                   disabled={!!busy}
                                   onChange={(e) => upload(slug, e.target.files?.[0])} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {err && <p className="text-xs font-semibold mt-3" style={{ color: "#dc2626" }}>{err}</p>}

        <p className="text-xs mt-4" style={{ color: "var(--brand-text-secondary)" }}>
          {usingMine
            ? "Your clients are seeing your faces."
            : "Upload one and your library switches on automatically."}
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
