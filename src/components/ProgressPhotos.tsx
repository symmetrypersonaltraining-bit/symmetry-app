"use client";

// Progress Photos — a dated physique-photo studio inside the Progress screen.
// Capture with a pose + date, get shooting instructions for consistent photos,
// compare any two dates side by side, and share a single shot or a composited
// before/after straight to the community group chat. Brand-color compliant.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendGroupMessage } from "@/app/(app)/home/messageActions";

interface Photo {
  id: string;
  photo_url: string;
  taken_date: string;
  pose: string | null;
  notes: string | null;
}

const POSES: { key: string; label: string; tip: string }[] = [
  { key: "front-relaxed", label: "Front Relaxed", tip: "Face the camera, feet shoulder-width, arms slightly off your sides. Stand tall and breathe normally — do NOT flex. This is your truest week-to-week comparison." },
  { key: "front-flexed", label: "Front Flexed", tip: "Same front-on stance, but tighten everything at once — quads, abs, arms. Hold it for 2–3 seconds so the shot is sharp." },
  { key: "side-left", label: "Side (Left)", tip: "Turn 90° to your left, arms relaxed at your sides, stand tall. Best angle for waist, posture and stomach changes." },
  { key: "side-right", label: "Side (Right)", tip: "Turn 90° to your right, same relaxed, tall stance as the left side." },
  { key: "back-relaxed", label: "Back Relaxed", tip: "Back to the camera, arms slightly out, stand tall. Shows back width and glutes/hamstrings." },
  { key: "back-flexed", label: "Back Flexed", tip: "Back to camera — squeeze your back and glutes and hold for 2–3 seconds." },
];
const poseLabel = (k: string | null) => POSES.find((p) => p.key === k)?.label || "Photo";

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function pretty(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + day + ", " + y;
}

// Downscale to 1280px JPEG (same pattern as messages) to keep uploads small.
async function compressImage(file: File, max = 1280): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b || file), "image/jpeg", 0.82));
  } catch { return file; }
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

export default function ProgressPhotos({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [pose, setPose] = useState<string>("front-relaxed");
  const [date, setDate] = useState<string>(todayCT());
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("progress_photos")
      .select("id, photo_url, taken_date, pose, notes")
      .eq("client_id", clientId)
      .order("taken_date", { ascending: false })
      .order("created_at", { ascending: false });
    const list = (data as Photo[]) || [];
    setPhotos(list);
    // Default compare slots: newest on the right, oldest on the left.
    if (list.length >= 2) {
      setBId((prev) => prev || list[0].id);
      setAId((prev) => prev || list[list.length - 1].id);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  async function onFile(f: File | null) {
    if (!f || uploading) return;
    setUploading(true);
    try {
      const blob = await compressImage(f);
      const path = `${clientId}/${date}-${pose}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) { alert("Upload failed — try again."); return; }
      const { data: pub } = supabase.storage.from("progress-photos").getPublicUrl(path);
      const { error: insErr } = await supabase.from("progress_photos").insert({
        client_id: clientId, photo_url: pub.publicUrl, taken_date: date, pose, notes: notes.trim() || null,
      });
      if (insErr) { alert("Saved the image but couldn't record it — try again."); return; }
      setNotes("");
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(p: Photo) {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    await supabase.from("progress_photos").delete().eq("id", p.id);
    setLightbox(null);
    setPhotos((ps) => ps.filter((x) => x.id !== p.id));
  }

  async function shareSingle(p: Photo) {
    if (sharing) return;
    setSharing(true); setShareMsg(null);
    try {
      const cap = `📸 Progress — ${poseLabel(p.pose)}, ${pretty(p.taken_date)}${clientName ? ` (${clientName.split(/\s+/)[0]})` : ""}`;
      await sendGroupMessage(cap, p.photo_url);
      setShareMsg("Shared to the group chat 💪");
      setLightbox(null);
    } catch { setShareMsg("Couldn't share right now — try again."); }
    finally { setSharing(false); }
  }

  const photoA = photos.find((p) => p.id === aId) || null;
  const photoB = photos.find((p) => p.id === bId) || null;

  // Composite the two compare photos side by side into one image, upload it, and
  // post to the group chat — a real before/after card, not two separate messages.
  async function shareComparison() {
    if (!photoA || !photoB || sharing) return;
    setSharing(true); setShareMsg(null);
    try {
      const [ia, ib] = await Promise.all([loadImg(photoA.photo_url), loadImg(photoB.photo_url)]);
      const H = 900, half = 700, gap = 8, label = 64;
      const cv = document.createElement("canvas");
      cv.width = half * 2 + gap; cv.height = H + label;
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.fillStyle = "#141418"; ctx.fillRect(0, 0, cv.width, cv.height);
      const drawCover = (img: HTMLImageElement, x: number) => {
        const s = Math.max(half / img.width, H / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, 0, half, H); ctx.clip();
        ctx.drawImage(img, x + (half - w) / 2, (H - h) / 2, w, h);
        ctx.restore();
      };
      drawCover(ia, 0);
      drawCover(ib, half + gap);
      ctx.fillStyle = "#fff"; ctx.font = "bold 30px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(pretty(photoA.taken_date), half / 2, H + 42);
      ctx.fillText(pretty(photoB.taken_date), half + gap + half / 2, H + 42);
      const blob = await new Promise<Blob | null>((res) => cv.toBlob((b) => res(b), "image/jpeg", 0.85));
      if (!blob) throw new Error("no blob");
      const path = `${clientId}/compare-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("progress-photos").getPublicUrl(path);
      const first = clientName ? clientName.split(/\s+/)[0] : "";
      await sendGroupMessage(`🔥 Before → After${first ? ` — ${first}` : ""}: ${pretty(photoA.taken_date)} vs ${pretty(photoB.taken_date)}`, pub.publicUrl);
      setShareMsg("Before/after shared to the group chat 🔥");
    } catch { setShareMsg("Couldn't build the comparison — the photos may still be uploading. Try again in a moment."); }
    finally { setSharing(false); }
  }

  const card: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", padding: 14, marginBottom: 14 };
  const chip = (active: boolean): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 999, cursor: "pointer", border: active ? "1px solid var(--brand-primary)" : "1px solid var(--brand-border)", background: active ? "var(--brand-primary)" : "var(--brand-card)", color: active ? "#fff" : "var(--brand-text)" });

  const grouped = useMemo(() => {
    const by: Record<string, Photo[]> = {};
    for (const p of photos) (by[p.taken_date] ||= []).push(p);
    return Object.keys(by).sort((a, b) => (a < b ? 1 : -1)).map((d) => ({ date: d, items: by[d] }));
  }, [photos]);

  return (
    <div>
      {/* Header + shooting guide */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--brand-text)" }}>📸 Progress Photos</div>
          <button onClick={() => setShowGuide((v) => !v)} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-primary)", background: "none", border: "1px solid var(--brand-border)", borderRadius: 9, padding: "5px 9px", cursor: "pointer" }}>
            {showGuide ? "Hide guide" : "How to shoot"}
          </button>
        </div>
        {showGuide && (
          <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55, color: "var(--brand-text)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Make them count — consistency is everything:</div>
            <div style={{ color: "var(--brand-text-secondary)" }}>
              • Same time of day, ideally morning &amp; fasted.<br />
              • Same spot, same lighting — bright, even light, no harsh overhead shadow.<br />
              • Fitted clothing (or the same outfit) so real changes show.<br />
              • Phone at chest height, ~6–8 ft back, full body in frame. Prop it up or use the timer.<br />
              • Shoot every angle the same day; repeat every 1–2 weeks.
            </div>
            <div style={{ fontWeight: 700, margin: "9px 0 4px" }}>The poses:</div>
            {POSES.map((p) => (
              <div key={p.key} style={{ marginBottom: 5 }}>
                <span style={{ fontWeight: 700, color: "var(--brand-text)" }}>{p.label}:</span>{" "}
                <span style={{ color: "var(--brand-text-secondary)" }}>{p.tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Capture */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 8 }}>Add a photo</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {POSES.map((p) => (
            <button key={p.key} onClick={() => setPose(p.key)} style={chip(pose === p.key)}>{p.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginBottom: 10, lineHeight: 1.4 }}>{POSES.find((p) => p.key === pose)?.tip}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)" }}>Date</label>
          <input type="date" value={date} max={todayCT()} onChange={(e) => setDate(e.target.value)}
            style={{ fontSize: 13, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)" }} />
        </div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note (e.g. week 7, morning)…"
          style={{ width: "100%", fontSize: 13, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", marginBottom: 10, outline: "none" }} />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ width: "100%", fontSize: 14, fontWeight: 800, padding: 13, borderRadius: 13, border: "none", color: "#fff", background: "var(--brand-primary)", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
          {uploading ? "Uploading…" : `＋ Capture / Upload ${poseLabel(pose)}`}
        </button>
      </div>

      {/* Compare */}
      {photos.length >= 2 && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 8 }}>Compare side by side</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[{ v: aId, set: setAId, side: "left" }, { v: bId, set: setBId, side: "right" }].map((slot) => (
              <select key={slot.side} value={slot.v} onChange={(e) => slot.set(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: "8px 8px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)" }}>
                <option value="">Select…</option>
                {photos.map((p) => (
                  <option key={p.id} value={p.id}>{pretty(p.taken_date)} · {poseLabel(p.pose)}</option>
                ))}
              </select>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[photoA, photoB].map((p, i) => (
              <div key={i} style={{ background: "var(--brand-card)", borderRadius: 12, overflow: "hidden", aspectRatio: "3/4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : <span style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>Pick a photo</span>}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 11, textAlign: "center", color: "var(--brand-text-secondary)" }}>{photoA ? pretty(photoA.taken_date) : ""}</div>
            <div style={{ fontSize: 11, textAlign: "center", color: "var(--brand-text-secondary)" }}>{photoB ? pretty(photoB.taken_date) : ""}</div>
          </div>
          <button onClick={shareComparison} disabled={!photoA || !photoB || sharing}
            style={{ width: "100%", marginTop: 10, fontSize: 13.5, fontWeight: 800, padding: 12, borderRadius: 12, border: "none", color: "#fff", background: (photoA && photoB) ? "var(--brand-primary)" : "#c7ccd6", cursor: (photoA && photoB && !sharing) ? "pointer" : "default" }}>
            {sharing ? "Sharing…" : "🔥 Share Before / After to Group"}
          </button>
        </div>
      )}

      {/* Gallery */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 8 }}>Your timeline</div>
        {loading ? (
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)" }}>Loading…</div>
        ) : photos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>No photos yet. Snap your first set today — front, sides, and back — and you&rsquo;ll have a real before to look back on.</div>
        ) : (
          grouped.map((g) => (
            <div key={g.date} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-text-secondary)", marginBottom: 6 }}>{pretty(g.date)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {g.items.map((p) => (
                  <button key={p.id} onClick={() => setLightbox(p)} style={{ padding: 0, border: "none", background: "var(--brand-card)", borderRadius: 10, overflow: "hidden", aspectRatio: "3/4", position: "relative", cursor: "pointer" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 9.5, fontWeight: 700, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.6))", padding: "10px 4px 3px", textAlign: "center" }}>{poseLabel(p.pose)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {shareMsg && (
        <div style={{ ...card, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--brand-primary)" }}>{shareMsg}</div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,12,20,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.photo_url} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 12, objectFit: "contain" }} />
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginTop: 10 }}>{poseLabel(lightbox.pose)} · {pretty(lightbox.taken_date)}</div>
          {lightbox.notes && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 3 }}>{lightbox.notes}</div>}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => shareSingle(lightbox)} disabled={sharing} style={{ fontSize: 13, fontWeight: 800, padding: "10px 16px", borderRadius: 12, border: "none", color: "#fff", background: "var(--brand-primary)", cursor: "pointer" }}>{sharing ? "Sharing…" : "Share to Group"}</button>
            <button onClick={() => deletePhoto(lightbox)} style={{ fontSize: 13, fontWeight: 700, padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.3)", color: "#fff", background: "transparent", cursor: "pointer" }}>Delete</button>
            <button onClick={() => setLightbox(null)} style={{ fontSize: 13, fontWeight: 700, padding: "10px 16px", borderRadius: 12, border: "none", color: "#fff", background: "rgba(255,255,255,0.15)", cursor: "pointer" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
