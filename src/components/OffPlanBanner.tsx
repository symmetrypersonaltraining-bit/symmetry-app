"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startDictation } from "@/lib/dictation";
import { COACH_FIRST_NAME } from "@/lib/trainer";

interface SwapDay { id: string; label: string; }
interface OffPlanRow { id: string; description: string; details: string | null; status: string; }
interface LibDay { id: string; label: string; origin: string | null; }
interface GenResult { title: string; focus: string; rationale: string; duration_min: number | null; sections: { name: string; exercises: { name: string; sets: number; reps: string | null; duration: string | null }[] }[]; }

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export default function OffPlanBanner({ clientId, dayId }: { clientId: string; dayId: string }) {
  const supabase = createClient();
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"closed" | "menu" | "swap" | "type" | "replace" | "equipment" | "activity" | "library">("closed");
  const [library, setLibrary] = useState<SwapDay[]>([]);
  const [myLib, setMyLib] = useState<LibDay[]>([]);
  const [typed, setTyped] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRows, setPendingRows] = useState<OffPlanRow[]>([]);
  // AI flow state
  const [aiPrompt, setAiPrompt] = useState("");
  const [image, setImage] = useState<{ data: string; media_type: string; preview: string } | null>(null);
  const [result, setResult] = useState<(GenResult & { dayId: string; logged: boolean }) | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop?: () => void } | null>(null);

  function toggleMic() {
    if (listening) { try { recRef.current?.stop?.(); } catch { /* noop */ } setListening(false); return; }
    recRef.current = startDictation({
      onResult: (t: string) => setAiPrompt((p) => (p ? p + " " + t : t)),
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
      onUnavailable: () => { setListening(false); alert("Voice isn't available here yet — you can type instead."); },
    }) as { stop?: () => void } | null;
  }

  useEffect(() => {
    let on = true;
    (async () => {
      const [{ data: pend }, { data: flag }] = await Promise.all([
        supabase.from("offplan_workout_logs").select("id, description, details, status").eq("client_id", clientId).eq("log_date", CT_TODAY()),
        supabase.from("client_app_settings").select("workout_ai").eq("client_id", clientId).maybeSingle(),
      ]);
      if (!on) return;
      if (pend) setPendingRows(pend as OffPlanRow[]);
      setAiOn(!!(flag as { workout_ai?: boolean } | null)?.workout_ai);
    })();
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function openSwap() {
    setMode("swap");
    if (library.length === 0) {
      const { data } = await (supabase as any).from("days").select("id, label").eq("swappable", true).is("client_owner_id", null).neq("id", dayId).order("label");
      setLibrary((data as SwapDay[]) || []);
    }
  }

  async function openLibrary() {
    setMode("library");
    const { data } = await (supabase as any).from("days").select("id, label, origin").eq("client_owner_id", clientId).order("created_at", { ascending: false }).limit(30);
    setMyLib((data as LibDay[]) || []);
  }

  async function doSwap(target: SwapDay) {
    if (!window.confirm("Swap today's workout for \"" + target.label + "\"? Your program stays unchanged - this only affects today.")) return;
    setBusy(true);
    try {
      const today = CT_TODAY();
      const { data: origRows } = await (supabase as any).from("scheduled_workouts")
        .select("id, position").eq("client_id", clientId).eq("day_id", dayId)
        .eq("scheduled_date", today).eq("status", "scheduled").order("id");
      const orig = origRows && origRows[0] ? origRows[0] : null;
      await (supabase as any).from("scheduled_workouts").insert({
        client_id: clientId, day_id: target.id, scheduled_date: today,
        status: "scheduled", source: "client_self_assign", position: orig ? orig.position : 0,
      });
      if (orig) await (supabase as any).from("scheduled_workouts").update({ status: "skipped" }).eq("id", orig.id);
      window.location.href = "/workout/" + target.id + window.location.search;
    } finally { setBusy(false); }
  }

  async function saveOffPlan() {
    if (!typed.trim()) return;
    setBusy(true);
    try {
      const today = CT_TODAY();
      const { data } = await supabase.from("offplan_workout_logs").insert({
        client_id: clientId, log_date: today, description: typed.trim(), details: details.trim() || null,
      }).select().single();
      if (data) setPendingRows((prev) => [...prev, data as OffPlanRow]);
      try {
        await (supabase as any).from("scheduled_workouts").update({ status: "skipped" })
          .eq("client_id", clientId).eq("day_id", dayId).eq("scheduled_date", today).eq("status", "scheduled");
      } catch { /* off-plan log still saved even if this fails */ }
      setTyped(""); setDetails(""); setMode("closed");
    } finally { setBusy(false); }
  }

  async function deleteRow(id: string) {
    await supabase.from("offplan_workout_logs").delete().eq("id", id);
    setPendingRows((prev) => prev.filter((r) => r.id !== id));
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      const meta = dataUrl.slice(0, comma);
      const b64 = dataUrl.slice(comma + 1);
      const mt = (meta.match(/data:(.*?);/)?.[1]) || "image/jpeg";
      setImage({ data: b64, media_type: mt, preview: dataUrl });
    };
    reader.readAsDataURL(f);
  }

  async function generate(m: "replace" | "equipment" | "activity") {
    setBusy(true); setAiError(null); setResult(null);
    try {
      const res = await fetch("/api/workout-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, mode: m, dayId, prompt: aiPrompt.trim() || null, image: m === "equipment" && image ? { data: image.data, media_type: image.media_type } : null }),
      });
      const j = await res.json();
      if (!res.ok || j.error) { setAiError(j.error || "Something went wrong."); return; }
      if (j.paused || j.capExceeded) { setAiError(j.error || "AI is taking a break."); return; }
      setResult({ ...(j.workout as GenResult), dayId: j.dayId, logged: !!j.logged });
    } catch {
      setAiError("Couldn't reach the AI — check your connection and try again.");
    } finally { setBusy(false); }
  }

  const box: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18 };
  const field: React.CSSProperties = { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" };

  function reset() { try { recRef.current?.stop?.(); } catch { /* noop */ } setListening(false); setMode("menu"); setAiPrompt(""); setImage(null); setResult(null); setAiError(null); }

  const resultCard = result && (
    <div className="p-3 mt-2" style={box}>
      <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{result.title}</p>
      {result.focus && <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{result.focus}{result.duration_min ? ` · ~${result.duration_min} min` : ""}</p>}
      {result.rationale && <p className="text-xs mt-2 italic" style={{ color: "var(--brand-text-secondary)" }}>“{result.rationale}”</p>}
      <div className="mt-2 space-y-1.5">
        {result.sections.map((s, i) => (
          <div key={i}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--brand-primary)" }}>{s.name}</p>
            {s.exercises.map((e, j) => (
              <p key={j} className="text-xs" style={{ color: "var(--brand-text)" }}>• {e.name} <span style={{ color: "var(--brand-text-secondary)" }}>{e.duration || `${e.sets}×${e.reps || ""}`}</span></p>
            ))}
          </div>
        ))}
      </div>
      {result.logged ? (
        <p className="text-center mt-3 text-xs font-bold" style={{ color: "#22c55e" }}>✓ Logged — it counts toward your training.</p>
      ) : (
        <button onClick={() => { window.location.href = "/workout/" + result.dayId + window.location.search; }}
          className="w-full mt-3 py-2.5 rounded-full text-xs font-bold text-white" style={{ background: "var(--brand-primary)" }}>
          ▶ Start this workout
        </button>
      )}
      <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Saved to your library for next time. {COACH_FIRST_NAME} was notified.</p>
    </div>
  );

  return (
    <div className="px-4 pt-3">
      {pendingRows.map((r) => (
        <div key={r.id} className="flex items-center justify-between p-3 mb-2" style={box}>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate" style={{ color: "var(--brand-text)" }}>Off-plan: {r.description}</p>
            {/* Second copy of the same dead promise — this one on the row
                itself, where it sat next to a PENDING chip that never cleared.
                A status badge that never changes is a bug report waiting to
                happen. */}
            <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Recorded — {COACH_FIRST_NAME} can see it</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-extrabold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a", fontSize: 9 }}>LOGGED</span>
            <button onClick={() => deleteRow(r.id)} aria-label="Delete" style={{ color: "var(--brand-text-secondary)" }}><i className="ti ti-trash text-sm" /></button>
          </div>
        </div>
      ))}

      <button onClick={() => setMode(mode === "closed" ? "menu" : "closed")}
        className="w-full flex items-center justify-between px-3.5 py-2.5"
        style={{ background: "rgba(124,156,245,0.06)", border: "1.5px dashed var(--brand-border)", borderRadius: 16 }}>
        <span className="text-xs font-bold" style={{ color: "var(--brand-text-secondary)" }}>
          {aiOn ? "🏋️ Create / Replace Workout" : "🤔 Not doing this today?"}
        </span>
        <i className={mode === "closed" ? "ti ti-chevron-down" : "ti ti-chevron-up"} style={{ color: "var(--brand-text-secondary)" }} />
      </button>

      {/* ─── AI menu (flag on) ─── */}
      {aiOn && mode === "menu" && (
        <div className="p-2 mt-2" style={box}>
          <button onClick={() => setMode("replace")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#e8edfd" }}>🔄</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Replace today’s workout</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Missed it or traveling — AI builds a substitute that fits your plan</span></span>
          </button>
          <button onClick={() => setMode("equipment")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#dcfce7" }}>📷</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Use what I have</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Photo or describe your equipment — AI designs around it</span></span>
          </button>
          <button onClick={() => setMode("activity")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#fef3c7" }}>✅</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Log something I did</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Volleyball, yoga, a hike — AI records it as a session</span></span>
          </button>
          <button onClick={openLibrary} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#f1f5f9" }}>📚</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>My saved workouts</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Reuse a workout you created before</span></span>
          </button>
        </div>
      )}

      {/* ─── The two NON-AI ways out, shown alongside the AI ones ───
          Lauren Standefer, 2026-08-13, having swapped the stair master for a
          walk outside: "it like wouldn't let me replace it without generating a
          whole thing — is it possible to just add it and not have ai make a
          warm up and all that? Like have the option to generate a workout or
          just switch it to another?"

          Both of those options already existed. They were rendered under
          `!aiOn` — so turning the AI ON took them away, as though generating
          and choosing were rivals. They are not: "build me something" and
          "I'll pick, thanks" are different moods on different days, and a
          client with AI enabled needs the second one MORE often, not less,
          because the AI path is the one that adds a warm-up she did not ask
          for. Same two buttons, no longer an either/or. */}
      {aiOn && mode === "menu" && (
        <div className="p-2 mt-2" style={{ ...box, borderStyle: "dashed" }}>
          <p className="text-[10px] font-extrabold tracking-widest px-2.5 pt-1 pb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
            OR SKIP THE AI
          </p>
          <button onClick={openSwap} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#e8edfd" }}>⇄</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Swap for one I pick</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Choose a cardio or basic session from the library — nothing generated</span></span>
          </button>
          <button onClick={() => setMode("type")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#fef3c7" }}>✍️</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>I did something else</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Type it — recorded straight away, {COACH_FIRST_NAME} sees it. No warm-up invented.</span></span>
          </button>
        </div>
      )}

      {aiOn && (mode === "replace" || mode === "equipment" || mode === "activity") && (
        <div className="p-3 mt-2" style={box}>
          {!result && <>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>
              {mode === "replace" ? "Replace today’s workout" : mode === "equipment" ? "What do you have?" : "What did you do?"}
            </p>
            {mode === "equipment" && (
              <div className="mb-2">
                {image ? (
                  <div className="relative mb-2"><img src={image.preview} alt="equipment" className="w-full rounded-xl" style={{ maxHeight: 160, objectFit: "cover" }} />
                    <button onClick={() => setImage(null)} className="absolute top-1 right-1 w-7 h-7 rounded-full text-white" style={{ background: "rgba(0,0,0,0.6)" }}>✕</button></div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} className="w-full py-2.5 rounded-xl text-xs font-semibold mb-2" style={{ ...field, borderStyle: "dashed" }}>📷 Add a photo of your equipment</button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />
              </div>
            )}
            <div style={{ position: "relative" }}>
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2}
                placeholder={mode === "replace" ? "Speak or type — e.g. In a hotel with dumbbells only, keep it upper body" : mode === "equipment" ? "Speak or type what you have — e.g. Pull-up bar, bands, one 30lb dumbbell" : "Speak or type — e.g. Played beach volleyball for about an hour"}
                className="w-full rounded-2xl p-3 text-sm outline-none resize-none" style={{ ...field, paddingRight: 44 }} />
              <button type="button" onClick={toggleMic} aria-label={listening ? "Stop voice" : "Speak"}
                className="absolute flex items-center justify-center rounded-full"
                style={{ right: 8, bottom: 8, width: 32, height: 32, background: listening ? "#ef4444" : "var(--brand-primary)", border: "none" }}>
                <i className={`ti ${listening ? "ti-player-stop-filled" : "ti-microphone"} text-sm text-white`} />
              </button>
            </div>
            {listening && <p className="text-[11px] mt-1" style={{ color: "var(--brand-primary)" }}>🎤 Listening… tap the mic to stop.</p>}
            {aiError && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{aiError}</p>}
            <button onClick={() => generate(mode)} disabled={busy || (mode !== "replace" && !aiPrompt.trim() && !(mode === "equipment" && image))}
              className="w-full mt-2 py-2.5 rounded-full text-xs font-bold text-white"
              style={{ background: "var(--brand-primary)", opacity: busy ? 0.6 : 1 }}>
              {busy ? "🤖 Designing…" : mode === "activity" ? "Log it with AI ✨" : "Build my workout ✨"}
            </button>
            <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>AI checks your current program so it fits and doesn’t clash with what’s coming up.</p>
          </>}
          {resultCard}
          <button onClick={reset} className="w-full mt-2 py-1.5 text-xs" style={{ color: "var(--brand-text-secondary)" }}>← Back</button>
        </div>
      )}

      {aiOn && mode === "library" && (
        <div className="p-3 mt-2" style={box}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Your saved workouts</p>
          {myLib.length === 0 && <p className="text-xs py-2" style={{ color: "var(--brand-text-secondary)" }}>Nothing saved yet — create one above and it’ll show here.</p>}
          {myLib.map((d) => (
            <button key={d.id} onClick={() => { window.location.href = "/workout/" + d.id + window.location.search; }}
              className="w-full flex items-center justify-between py-2.5 px-1 text-left" style={{ borderBottom: "1px solid var(--brand-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{d.label}</span>
              <i className="ti ti-player-play" style={{ color: "var(--brand-primary)" }} />
            </button>
          ))}
          <button onClick={() => setMode("menu")} className="w-full mt-2 py-1.5 text-xs" style={{ color: "var(--brand-text-secondary)" }}>← Back</button>
        </div>
      )}

      {/* ─── legacy menu (flag off — clients until rollout) ─── */}
      {!aiOn && mode === "menu" && (
        <div className="p-2 mt-2" style={box}>
          <button onClick={openSwap} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#e8edfd" }}>⇄</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Swap from library</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Pick a different cardio or basic workout for today</span></span>
          </button>
          <button onClick={() => setMode("type")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#fef3c7" }}>✍️</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>I did something else</span>
            {/* Was "it becomes a library workout tonight". Nothing had rolled one
                up since 2026-07-29 — the converter is gone, there is no function
                in the database and no route that reads offplan_workout_logs. The
                copy promised a thing that no longer happened, which is worse
                than promising nothing. It is recorded immediately now, and the
                sentence says only what is actually true. */}
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Type it — recorded straight away, {COACH_FIRST_NAME} sees it</span></span>
          </button>
        </div>
      )}
      {mode === "swap" && (
        <div className="p-3 mt-2" style={box}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Swap today for:</p>
          {library.length === 0 && <p className="text-xs py-2" style={{ color: "var(--brand-text-secondary)" }}>Loading…</p>}
          {library.map((d) => (
            <button key={d.id} onClick={() => doSwap(d)} disabled={busy}
              className="w-full flex items-center justify-between py-2.5 px-1 text-left" style={{ borderBottom: "1px solid var(--brand-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{d.label}</span>
              <i className="ti ti-arrows-exchange" style={{ color: "var(--brand-primary)" }} />
            </button>
          ))}
          <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Your programmed workout stays in your plan - this only changes today.</p>
        </div>
      )}
      {mode === "type" && (
        <div className="p-3 mt-2" style={box}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>What did you do?</p>
          <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={2}
            placeholder="e.g. 45 min hike with a 20lb pack, hilly trail"
            className="w-full rounded-2xl p-3 text-sm outline-none resize-none" style={field} />
          <input value={details} onChange={(e) => setDetails(e.target.value)} type="text"
            placeholder="Optional details - duration, intensity, equipment…"
            className="w-full rounded-xl px-3 py-2 mt-2 text-xs outline-none" style={field} />
          <button onClick={saveOffPlan} disabled={busy || !typed.trim()}
            className="w-full mt-2 py-2.5 rounded-full text-xs font-bold text-white"
            style={{ background: "var(--brand-primary)", opacity: typed.trim() ? 1 : 0.5 }}>
            {busy ? "Saving…" : "Log it - I'll take it from here 🌙"}
          </button>
          <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Saved instantly with a pending chip. Tonight it becomes a real library workout logged for today.</p>
        </div>
      )}
    </div>
  );
}
