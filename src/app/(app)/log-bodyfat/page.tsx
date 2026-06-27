"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SITES_7 = ["Chest", "Midaxillary", "Triceps", "Subscapular", "Abdominal", "Suprailiac", "Thigh"];
const SITES_4 = ["Biceps", "Triceps", "Subscapular", "Suprailiac"];

function dwCoef(age: number, male: boolean) {
  const M = [[17, 1.162, 0.063], [20, 1.1631, 0.0632], [30, 1.1422, 0.0544], [40, 1.162, 0.07], [50, 1.1715, 0.0779]];
  const F = [[17, 1.1549, 0.0678], [20, 1.1599, 0.0717], [30, 1.1423, 0.0632], [40, 1.1333, 0.0612], [50, 1.1339, 0.0645]];
  const t = male ? M : F;
  let r = t[0];
  for (const x of t) { if (age >= x[0]) r = x; }
  return { C: r[1], M: r[2] };
}

export default function LogBodyFatPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(params.get("clientId"));
  const [method, setMethod] = useState<"7" | "4">("7");
  const [age, setAge] = useState("38");
  const [sex, setSex] = useState("male");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (clientId) return;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase.from("clients").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
      if (data) setClientId(data.id);
    })();
  }, []);

  const sites = method === "7" ? SITES_7 : SITES_4;
  const sum = sites.reduce((a, s) => a + (parseFloat(vals[s] || "") || 0), 0);
  const male = (sex || "m").trim().toLowerCase().charAt(0) === "m";
  const ageN = parseInt(age) || 30;
  let D = 1;
  if (method === "7") {
    D = male
      ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * ageN
      : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * ageN;
  } else {
    const c = dwCoef(ageN, male);
    D = c.C - c.M * (Math.log(sum) / Math.LN10);
  }
  const bf = sum > 0 ? 495 / D - 450 : 0;
  const bfValid = bf > 0 && bf < 60;

  async function save() {
    if (!clientId || !bfValid || saving) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("skinfold_logs").insert({
      client_id: clientId, log_date: today, method: method + "-site",
      sites: vals, sum_mm: sum, body_density: Number(D.toFixed(4)),
      body_fat_pct: Number(bf.toFixed(1)), age: ageN, sex: male ? "male" : "female",
    });
    await supabase.from("metrics").insert({
      client_id: clientId, metric_date: today, body_fat_pct: Number(bf.toFixed(1)), source: "caliper",
    });
    setDone(true);
    setSaving(false);
    setTimeout(() => router.back(), 700);
  }

  const seg = (active: boolean) => ({
    flex: 1, padding: "11px", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", border: 0,
    background: active ? "var(--brand-primary)" : "transparent",
    color: active ? "#fff" : "var(--brand-text-secondary)",
  });
  const inputStyle = {
    width: "100%", border: "1.5px solid var(--brand-border)", borderRadius: 10, padding: 10,
    fontSize: 14, background: "var(--brand-bg)", color: "var(--brand-text)", marginBottom: 10,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      <div style={{ background: "var(--brand-sidebar)", color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: "rgba(255,255,255,.14)", border: 0, color: "#fff", width: 34, height: 34, borderRadius: 10, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Log Body Fat</div>
      </div>
      <div style={{ padding: 16, maxWidth: 520, margin: "0 auto" }}>
        <p style={{ color: "var(--brand-text-secondary)", fontSize: 13, marginTop: 0 }}>
          Choose a method and enter your caliper sites (mm). Body fat is calculated and logged to your chart, and the raw measurements are saved.
        </p>
        <div style={{ display: "flex", gap: 5, background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: 12, padding: 4, marginBottom: 14 }}>
          <button style={seg(method === "7")} onClick={() => setMethod("7")}>7-site &middot; Jackson-Pollock</button>
          <button style={seg(method === "4")} onClick={() => setMethod("4")}>4-site &middot; Durnin-Womersley</button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-text-secondary)" }}>Age</label>
            <input style={inputStyle} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-text-secondary)" }}>Sex</label>
            <input style={inputStyle} value={sex} onChange={(e) => setSex(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {sites.map((s) => (
            <div key={s}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-text-secondary)" }}>{s} (mm)</label>
              <input style={inputStyle} type="number" inputMode="decimal" value={vals[s] || ""} onChange={(e) => setVals({ ...vals, [s]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "color-mix(in srgb, var(--brand-primary) 9%, transparent)", borderRadius: 14, padding: 14, marginTop: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "var(--brand-primary)" }}>{bfValid ? bf.toFixed(1) + "%" : "\u2014"}</div>
          <div>
            <div style={{ fontWeight: 700 }}>Body fat</div>
            <div style={{ fontSize: 12, color: "var(--brand-text-secondary)" }}>{sum > 0 ? "density " + D.toFixed(4) + " \u00b7 \u03a3 " + sum + "mm" : "enter sites"}</div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={!bfValid || saving || !clientId}
          style={{ width: "100%", marginTop: 14, padding: 14, borderRadius: 13, border: 0, fontWeight: 800, fontSize: 14, color: "#fff", cursor: "pointer", opacity: !bfValid || !clientId ? 0.5 : 1, background: done ? "var(--brand-accent)" : "var(--brand-primary)" }}>
          {done ? "\u2713 Logged to your chart" : saving ? "Saving\u2026" : "Calculate & log body fat"}
        </button>
      </div>
    </div>
  );
}
