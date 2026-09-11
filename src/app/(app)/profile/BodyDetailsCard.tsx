"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * HEIGHT AND SEX, EDITABLE ON THE PROFILE.
 *
 * Dustin, 11 Sep 2026: *"make sure those missing columns, the height and sex,
 * go into their actual profile page."* The profile had no editable client
 * fields at all before this; this card adds exactly the two he named and
 * nothing else — the page has not been walked, and rule 6 says it is not ours
 * to change beyond his instruction.
 *
 * Writes the client's own row directly: `client_update_own_clients` lets a
 * client update where auth_user_id = auth.uid(), which is the one row this
 * card can ever touch.
 */
export default function BodyDetailsCard({
  clientId, heightIn, sex,
}: { clientId: string; heightIn: number | null; sex: string | null }) {
  const [ft, setFt] = useState(heightIn != null ? String(Math.floor(heightIn / 12)) : "");
  const [inch, setInch] = useState(heightIn != null ? String(Math.round(heightIn % 12)) : "");
  const [sexV, setSexV] = useState<string>(sex ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setSaving(true); setSaved(null);
    const f = Number(ft), i = Number(inch);
    const body: { height_in?: number | null; sex?: string | null } = {};
    body.height_in = Number.isFinite(f) && f > 0 ? Math.round(f * 12 + (Number.isFinite(i) ? i : 0)) : null;
    body.sex = sexV === "male" || sexV === "female" ? sexV : null;
    const { error } = await createClient().from("clients").update(body).eq("id", clientId);
    setSaving(false);
    setSaved(error ? "Couldn't save — try again" : "Saved");
  }

  const box = "w-full rounded-xl px-4 py-3 text-sm";
  const boxStyle = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" } as const;

  return (
    <>
      <p className="label mt-4">body details</p>
      <div className="card">
        <p className="text-xs mb-3" style={{ color: "#4E6080" }}>
          Height and sex are what the app needs, with your weight and age, to work out how much you burn in a day. It never guesses these.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-xs mb-1" style={{ color: "#4E6080" }}>Height</div>
            <div className="flex gap-2">
              <input type="number" min="3" max="8" inputMode="numeric" placeholder="ft" aria-label="height feet" value={ft} onChange={(e) => setFt(e.target.value)} className={box} style={boxStyle} />
              <input type="number" min="0" max="11" inputMode="numeric" placeholder="in" aria-label="height inches" value={inch} onChange={(e) => setInch(e.target.value)} className={box} style={boxStyle} />
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: "#4E6080" }}>Sex</div>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSexV(v)} aria-pressed={sexV === v}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold capitalize"
                  style={sexV === v ? { background: "var(--brand-primary)", color: "white", border: "1px solid var(--brand-primary)" } : boxStyle}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-xs" style={{ color: saved === "Saved" ? "#0a7d3f" : "#DC2626" }}>{saved}</span>}
        </div>
      </div>
    </>
  );
}
