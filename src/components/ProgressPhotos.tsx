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

// THE MANDATORY POSES, in the order they are called on stage.
//
// Dustin, listing them: "supposed to be front relaxed, front double bicep,
// front lat spread, side chest left, side tricep left, rear double bicep, rear
// lat spread, side chest right, side tricep right, thighs and abs, most
// muscular."
//
// The six that shipped (front relaxed/flexed, side L/R, back relaxed/flexed)
// are general-population progress shots. These eleven are the actual mandatories
// a competitor is judged on, kept in HIS order — a run through this list is a
// rehearsal, so the order is part of the feature, not decoration.
//
// Left and right are shot separately and deliberately: side chest on one side
// only makes a comparison that flatters whichever side is stronger, and this gym
// is called Symmetry.
const POSES: { key: string; label: string; tip: string }[] = [
  { key: "front-relaxed", label: "Front Relaxed", tip: "Face the camera, feet shoulder-width, arms slightly off your sides. Stand tall and breathe normally — do NOT flex. This is your truest week-to-week comparison." },
  { key: "front-double-biceps", label: "Front Double Biceps", tip: "Face on, arms up to shoulder height, elbows level, fists curled in. Squeeze the biceps, flare the lats wide, quads tight and abs braced. Hold 2–3 seconds." },
  { key: "front-lat-spread", label: "Front Lat Spread", tip: "Face on, hands on your waist just above the hips, thumbs behind. Drive the elbows forward and flare the lats out for the widest V you can hold. Chest up, legs tight." },
  { key: "side-chest-left", label: "Side Chest (L)", tip: "Left side to the camera. Near leg forward on the toe, calf flexed. Clasp your hands low, pull across your body and squeeze the chest and near bicep. Ribs up, chest high." },
  { key: "side-triceps-left", label: "Side Triceps (L)", tip: "Same left-side stance. Reach behind your back, clasp your hands and push the near arm straight down to lock the triceps out. Chest up, near leg forward, calf tight." },
  { key: "rear-double-biceps", label: "Rear Double Biceps", tip: "Back to the camera, arms up like the front shot, one foot back on the toe. Squeeze the biceps, then pinch the shoulder blades to bring the back detail out. Back leg tight." },
  { key: "rear-lat-spread", label: "Rear Lat Spread", tip: "Back to the camera, hands on your waist, elbows pushed forward. Flare the lats as wide as they go and hold. One foot back on the toe, hamstrings and calves tight." },
  { key: "side-chest-right", label: "Side Chest (R)", tip: "Right side to the camera — same as the left side chest. Always shoot both sides so the comparison is even." },
  { key: "side-triceps-right", label: "Side Triceps (R)", tip: "Right side to the camera — same as the left triceps shot. Both sides, every time." },
  { key: "abs-and-thighs", label: "Abs & Thighs", tip: "Face on, hands behind your head, one leg forward and locked. Exhale hard, crunch down into the abs and flex the front quad." },
  { key: "most-muscular", label: "Most Muscular", tip: "Your pick — crab, hands-on-hips or arms crossed. Everything on at once, hold 2–3 seconds. Shoot it the SAME way every time or it won't compare." },
];

// Photos taken under the old six-pose list still have to read as what they are.
// Nothing should ever render as a bare "Photo" because the picker changed.
const LEGACY_LABELS: Record<string, string> = {
  "front-flexed": "Front Flexed",
  "side-left": "Side (Left)",
  "side-right": "Side (Right)",
  "back-relaxed": "Back Relaxed",
  "back-flexed": "Back Flexed",
};
const poseLabel = (k: string | null) =>
  POSES.find((p) => p.key === k)?.label || (k ? LEGACY_LABELS[k] : null) || "Photo";

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function pretty(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + day + ", " + y;
}

// Formats a browser can definitely draw in an <img>. Anything else that also
// fails to decode is a file we must NOT store as though it were a JPEG.
const WEB_SAFE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

// Downscale to 1280px JPEG (same pattern as messages) to keep uploads small.
//
// Returns null when the file cannot be decoded AND is not already something a
// browser can render — a RAW file off a real camera (.CR2, .NEF, .ARW) uploaded
// under contentType image/jpeg becomes a permanently broken thumbnail in the
// timeline, and the client is never told why. Better to refuse it and say so.
async function compressImage(file: File, max = 1280): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return WEB_SAFE.has(file.type.toLowerCase()) ? file : null;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b || file), "image/jpeg", 0.82));
  } catch {
    return WEB_SAFE.has(file.type.toLowerCase()) ? file : null;
  }
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
  // Two inputs, not one. `capture` is a REQUEST for the camera, and on most
  // Android builds it is honoured by removing the gallery from the picker
  // entirely — which is why a set shot on a real camera and copied to the phone
  // could not be uploaded at all. The camera button keeps capture; the upload
  // button must never have it.
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<{ url: string; file: File; pose: string }[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

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

  /** One photo, one pose. Returns an error string, or null on success. */
  async function uploadOne(f: File, poseKey: string): Promise<string | null> {
    const blob = await compressImage(f);
    if (!blob) {
      return `${f.name || "That file"} isn't an image this app can read. RAW camera files (.CR2, .NEF, .ARW, .DNG) need exporting to JPEG first.`;
    }
    const path = `${clientId}/${date}-${poseKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("progress-photos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) return "Upload failed — try again.";
    const { data: pub } = supabase.storage.from("progress-photos").getPublicUrl(path);
    const { error: insErr } = await supabase.from("progress_photos").insert({
      client_id: clientId, photo_url: pub.publicUrl, taken_date: date, pose: poseKey, notes: notes.trim() || null,
    });
    if (insErr) return "Saved the image but couldn't record it — try again.";
    return null;
  }

  async function onFile(f: File | null) {
    if (!f || uploading) return;
    setUploading(true);
    try {
      const err = await uploadOne(f, pose);
      if (err) { alert(err); return; }
      setNotes("");
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  }

  /**
   * A whole set at once.
   *
   * Eleven mandatories shot on a camera and copied across is the case this
   * exists for — one-at-a-time would be eleven trips through the picker. Poses
   * are pre-assigned in shooting order (the order of POSES, starting from
   * whichever chip is selected) because that is the order they were shot in, and
   * every one stays editable before anything uploads.
   */
  function onFiles(list: FileList | null) {
    const files = Array.from(list || []);
    if (!files.length || uploading) return;
    if (files.length === 1) { void onFile(files[0]); return; }
    const start = Math.max(0, POSES.findIndex((p) => p.key === pose));
    setQueue(
      files.map((file, i) => ({
        file,
        url: URL.createObjectURL(file),
        pose: POSES[Math.min(start + i, POSES.length - 1)].key,
      })),
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  function clearQueue() {
    setQueue((q) => { q.forEach((item) => URL.revokeObjectURL(item.url)); return []; });
  }

  async function uploadQueue() {
    if (!queue.length || uploading) return;
    setUploading(true);
    const failures: string[] = [];
    try {
      // Sequential on purpose: a phone on gym wifi uploading eleven images at
      // once is how you get half a set saved and no idea which half.
      for (let i = 0; i < queue.length; i++) {
        setProgress(`Uploading ${i + 1} of ${queue.length}…`);
        const err = await uploadOne(queue[i].file, queue[i].pose);
        if (err) failures.push(err);
      }
      clearQueue();
      setNotes("");
      await load();
      if (failures.length) alert(failures.join("\n\n"));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  // Object URLs are real memory until they are released.
  useEffect(() => () => { queue.forEach((item) => URL.revokeObjectURL(item.url)); }, [queue]);

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

  // Which poses already exist for the date being shot — drives the ✓ on the
  // chips and the "n of 11" counter.
  const shotOnDate = useMemo(
    () => new Set(photos.filter((p) => p.taken_date === date && p.pose).map((p) => p.pose as string)),
    [photos, date],
  );

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
              • Run the whole set the same day, in the order below — it doubles as posing practice.<br />
              • Shot on a camera instead? Use <b>Upload photos</b> and pick the whole set at once.<br />
              • Repeat every 1–2 weeks.
            </div>
            <div style={{ fontWeight: 700, margin: "9px 0 4px" }}>The poses, in order:</div>
            {POSES.map((p, i) => (
              <div key={p.key} style={{ marginBottom: 5 }}>
                <span style={{ fontWeight: 700, color: "var(--brand-text)" }}>{i + 1}. {p.label}:</span>{" "}
                <span style={{ color: "var(--brand-text-secondary)" }}>{p.tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Capture */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)" }}>Add a photo</div>
          {/* Eleven poses is a set you can lose your place in. This says where
              you are without anyone having to count thumbnails. */}
          <div style={{ fontSize: 11, fontWeight: 700, color: shotOnDate.size === POSES.length ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
            {shotOnDate.size === POSES.length ? `Full set shot ✓` : `${shotOnDate.size} of ${POSES.length} shot`}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {POSES.map((p) => (
            <button key={p.key} onClick={() => setPose(p.key)} style={chip(pose === p.key)}>
              {shotOnDate.has(p.key) ? "✓ " : ""}{p.label}
            </button>
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
        {/* Camera: capture stays. Upload: capture must NOT be here, or Android
            hides the gallery and photos from any other camera cannot get in. */}
        <input ref={camRef} type="file" accept="image/*" capture="environment"
          onChange={(e) => onFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        <input ref={fileRef} type="file" accept="image/*" multiple
          onChange={(e) => onFiles(e.target.files)} style={{ display: "none" }} />

        {queue.length === 0 ? (
          <>
          {/* The pose lives on its own line: "📷 Take Front Double Biceps" wraps
              to two lines inside a half-width button and looks broken. */}
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginBottom: 6 }}>
            Saves as <b style={{ color: "var(--brand-text)" }}>{poseLabel(pose)}</b>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => camRef.current?.click()} disabled={uploading}
              style={{ flex: 1, fontSize: 13.5, fontWeight: 800, padding: 13, borderRadius: 13, border: "none", color: "#fff", background: "var(--brand-primary)", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
              {uploading ? "Uploading…" : "📷 Take photo"}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ flex: 1, fontSize: 13.5, fontWeight: 800, padding: 13, borderRadius: 13, border: "1px solid var(--brand-primary)", color: "var(--brand-primary)", background: "transparent", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
              ⬆︎ Upload photos
            </button>
          </div>
          </>
        ) : (
          // The set, before it is committed. Every pose stays editable — the
          // order is a good guess, not an assumption.
          <div style={{ border: "1px solid var(--brand-primary)", borderRadius: 13, padding: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)", marginBottom: 8 }}>
              {queue.length} photos — check the poses, then upload
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {queue.map((item, i) => (
                <div key={item.url} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" style={{ width: 44, height: 58, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", background: "var(--brand-card)" }} />
                  <select
                    value={item.pose}
                    onChange={(e) => setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, pose: e.target.value } : x)))}
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: "9px 8px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)" }}
                  >
                    {POSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  <button
                    onClick={() => setQueue((q) => { URL.revokeObjectURL(item.url); return q.filter((_, idx) => idx !== i); })}
                    aria-label="Remove this photo"
                    style={{ flex: "0 0 auto", width: 32, height: 32, borderRadius: 9, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "#ef4444", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={clearQueue} disabled={uploading}
                style={{ flex: "0 0 auto", fontSize: 13, fontWeight: 700, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={uploadQueue} disabled={uploading}
                style={{ flex: 1, fontSize: 13.5, fontWeight: 800, padding: 12, borderRadius: 12, border: "none", color: "#fff", background: "var(--brand-primary)", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
                {progress || `Upload ${queue.length} photos`}
              </button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.45 }}>
          Shot on another camera? Upload takes several at once — pick the whole set and label each one.
        </div>
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
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>No photos yet. Run the set today — front, sides, rear, abs and thighs — and you&rsquo;ll have a real before to look back on.</div>
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
          <img src={lightbox.photo_url} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "72dvh", borderRadius: 12, objectFit: "contain" }} />
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
