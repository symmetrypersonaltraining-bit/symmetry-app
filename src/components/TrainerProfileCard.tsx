"use client";

// A trainer sets up their own name, photo and payment handles.
//
// Dustin, 21 Aug: "there has to be a way for a trainer to set up their own
// payment details, their name, their photo, all of this stuff... this needs to
// be set up exactly like mine."
//
// There was no "like mine" to copy. NOTHING in this app has ever written to the
// trainers table — not one insert, not one update. Both existing trainer rows
// were typed into SQL by hand, the Settings "Profile" card is read-only text,
// and two items on the tutorial's own setup checklist (profile photo, payment
// details) could not be ticked by anybody, owner included. This is the first
// time it exists, and it exists for everyone at once.
//
// Writes go through the update_my_trainer_profile RPC rather than a table
// update, and that is a security decision rather than a style one. RLS is
// row-level: a policy permitting a trainer to edit their own row permits them
// to edit every COLUMN of it, including `role` — which is how is_owner()
// decides who runs the business — and `email`, which is how my_trainer_id()
// decides who they are. The RPC writes eight columns and cannot be talked into
// a ninth.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { payDestinationFor } from "@/lib/payDest";
import Avatar from "@/components/Avatar";

interface Profile {
  name: string;
  first_name: string;
  avatar_url: string | null;
  venmo_username: string;
  zelle_email: string;
  cashapp_handle: string;
  pay_phone: string;
  pay_display_name: string;
}

const EMPTY: Profile = {
  name: "", first_name: "", avatar_url: null,
  venmo_username: "", zelle_email: "", cashapp_handle: "",
  pay_phone: "", pay_display_name: "",
};

/** Downscale before upload — a modern phone photo is several megabytes. */
async function resizeToJpeg(file: File, max = 512): Promise<Blob> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("bad image"));
      img.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) throw new Error("no blob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function TrainerProfileCard() {
  const [p, setP] = useState<Profile>(EMPTY);
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const sb = createClient();
        const { data: auth } = await sb.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) { if (on) setReady(true); return; }
        // Own row only — that is all RLS will return now, which is the point.
        //
        // Two reads, not one. The payment columns were revoked from SELECT
        // outright (nobody but a trainer's own clients may see them), so even
        // this trainer's own handles come back through trainer_pay_details(),
        // which allows p_trainer = my_trainer_id(). Selecting them here would
        // fail the whole query and blank the name and photo boxes too.
        const { data } = await sb
          .from("trainers")
          .select("id, name, first_name, avatar_url, email")
          .eq("auth_user_id", uid)
          .maybeSingle();
        if (!on) return;
        const r = (data || {}) as Partial<Profile> & { id?: string; email?: string };
        const pay = await payDestinationFor(sb, r.id);
        if (!on) return;
        setP({
          name: r.name || "",
          first_name: r.first_name || "",
          avatar_url: r.avatar_url || null,
          venmo_username: pay?.venmoUsername || "",
          zelle_email: pay?.zelleEmail || "",
          cashapp_handle: pay?.cashtag || "",
          pay_phone: pay?.zellePhone || "",
          // The RPC coalesces a blank display name to the trainer's name; the
          // box means "only if different", so it must not be pre-filled with a
          // value the trainer never typed.
          pay_display_name: (pay?.recipientName && pay.recipientName !== (r.name || "")) ? pay.recipientName : "",
        });
        setEmail(r.email || auth?.user?.email || "");
      } catch {
        if (on) setErr("Couldn't load your profile.");
      } finally {
        if (on) setReady(true);
      }
    })();
    return () => { on = false; };
  }, []);

  function field(k: keyof Profile) {
    return {
      value: (p[k] as string) || "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setP((prev) => ({ ...prev, [k]: e.target.value }));
        setMsg(null);
      },
    };
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const sb = createClient();
      // Empty string means "clear it" and the RPC honours that; undefined would
      // mean "leave it", which is not what a cleared box should do.
      const { error } = await sb.rpc("update_my_trainer_profile", {
        p_name: p.name,
        p_first_name: p.first_name,
        p_avatar_url: p.avatar_url ?? "",
        p_venmo_username: p.venmo_username,
        p_zelle_email: p.zelle_email,
        p_cashapp_handle: p.cashapp_handle,
        p_pay_phone: p.pay_phone,
        p_pay_display_name: p.pay_display_name,
      });
      if (error) throw error;
      setMsg("Saved");
    } catch {
      setErr("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function pickPhoto(f: File | null | undefined) {
    if (!f) return;
    setBusyPhoto(true);
    setErr(null);
    try {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("no user");
      const blob = await resizeToJpeg(f);
      const path = "trainer-" + uid + "-" + Date.now() + ".jpg";
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error("no url");
      // Saved immediately rather than waiting for the Save button — a photo
      // that looks changed but is not is worse than a slow upload.
      const { error } = await sb.rpc("update_my_trainer_profile", { p_avatar_url: url });
      if (error) throw error;
      setP((prev) => ({ ...prev, avatar_url: url }));
      setMsg("Photo updated");
    } catch {
      setErr("That photo wouldn't upload. Try a different one.");
    } finally {
      setBusyPhoto(false);
    }
  }

  if (!ready) return null;

  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid var(--brand-border)", background: "var(--brand-bg)",
    color: "var(--brand-text)", fontSize: 15, outline: "none",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 12.5, fontWeight: 600,
    color: "var(--brand-text-secondary)", margin: "0 0 4px",
  };

  return (
    <section>
      <p className="section-header">Your profile</p>
      <div className="card p-4 space-y-4">

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busyPhoto}
            style={{ position: "relative", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
            aria-label="Change your photo"
          >
            <Avatar name={p.name} url={p.avatar_url} size={56} radius={16} />
            <span style={{
              position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
              background: "var(--brand-primary)", color: "#fff", fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--brand-surface)",
            }}>+</span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
              {busyPhoto ? "Uploading…" : "Your photo"}
            </p>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              Clients see this next to your messages
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
        </div>

        <div>
          <label style={label} htmlFor="tp-name">Full name</label>
          <input id="tp-name" style={input} {...field("name")} />
        </div>

        <div>
          <label style={label} htmlFor="tp-first">What clients call you</label>
          <input id="tp-first" style={input} placeholder="First name" {...field("first_name")} />
        </div>

        <div>
          <label style={label}>Email</label>
          <input style={{ ...input, opacity: 0.6 }} value={email} disabled readOnly />
          <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
            This is your login. Ask the app owner if it needs changing.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--brand-border)", paddingTop: 14 }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--brand-text)" }}>How clients pay you</p>
          {/* Said plainly, because the question gets asked. */}
          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            Only the handle a client sends money to — no bank details, no card numbers.
            The app shows it to your clients and never touches the payment itself.
            Nobody else can see these. Leave any of them blank.
          </p>

          <div className="space-y-3">
            <div>
              <label style={label} htmlFor="tp-venmo">Venmo username</label>
              <input id="tp-venmo" style={input} placeholder="@yourname" {...field("venmo_username")} />
            </div>
            <div>
              <label style={label} htmlFor="tp-zelle">Zelle — email or phone</label>
              <input id="tp-zelle" style={input} {...field("zelle_email")} />
            </div>
            <div>
              <label style={label} htmlFor="tp-cash">Cash App tag</label>
              <input id="tp-cash" style={input} placeholder="$yourtag" {...field("cashapp_handle")} />
            </div>
            <div>
              <label style={label} htmlFor="tp-payphone">Phone for payment apps</label>
              <input id="tp-payphone" style={input} {...field("pay_phone")} />
            </div>
            <div>
              <label style={label} htmlFor="tp-payname">Name shown when a client pays</label>
              <input id="tp-payname" style={input} placeholder="Only if different from your name" {...field("pay_display_name")} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "var(--brand-primary)", color: "#fff", border: "none", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
          {msg && <span className="text-sm font-semibold" style={{ color: "#16a34a" }}>{msg}</span>}
          {err && <span className="text-sm font-semibold" style={{ color: "#dc2626" }}>{err}</span>}
        </div>
      </div>
    </section>
  );
}
