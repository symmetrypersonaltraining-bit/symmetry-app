"use client";

import { useState } from "react";
import { scheduleWriteError } from "@/lib/scheduleConflict";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRowsSafe } from "@/lib/fetchAllRows";
import { FunLoader } from "@/components/FunMoments";
import AiBadge from "@/components/AiBadge";
import ManualWorkoutBuilder from "@/components/ManualWorkoutBuilder";

import { useCoach } from "@/lib/useCoach";
import { sessionsReplacedBy, slotForReplacement, skipVerdict, describeReplaced, type DateOccupant } from "@/lib/replaceOnDate";

type LibDay = {
  id: string; label: string; description?: string | null; difficulty?: string | null;
  exercise_count?: number | null; region?: string | null;
  focus_tags?: string[] | null; modality_tags?: string[] | null; intent_tags?: string[] | null;
};

/** One exercise as the preview shows it. */
type PreviewEx = { id: string; name: string; sets: number | null; volume: string | null; cue: string | null };
type PreviewSection = { id: string; name: string; items: PreviewEx[] };

// THE FILTER VOCABULARY, and it is closed on purpose.
//
// Dustin, 4 Sep: "id like that search to have filters. bodypart, difficulty,
// upper, lower, core, cardio, intention fir the workout, any others you can
// think of."
//
// Every value here exists as a column on `days`, precomputed by
// refresh_day_facets() — body part and equipment from the movements actually
// programmed, intention from the label and description, because "what is this
// FOR" is not something a movement list can answer. A glute bridge appears in a
// hypertrophy day and a rehab day alike.
const F_REGION: [string, string][] = [["upper", "Upper"], ["lower", "Lower"], ["core", "Core"], ["full", "Full body"]];
const F_MODALITY: [string, string][] = [["strength", "Strength"], ["cardio", "Cardio"], ["mobility", "Mobility"], ["conditioning", "Conditioning"], ["functional", "Functional"], ["rehab", "Rehab"]];
const F_INTENT: [string, string][] = [["hypertrophy", "Muscle"], ["strength", "Strength"], ["fat-loss", "Fat loss"], ["corrective", "Corrective"], ["rehab", "Rehab / pain"], ["mobility", "Mobility"], ["balance", "Balance"], ["prep", "Show prep"], ["at-home", "At home"], ["solo", "Solo"]];
const F_FOCUS: [string, string][] = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["biceps", "Biceps"], ["triceps", "Triceps"], ["arms", "Arms"], ["core", "Core"], ["glutes", "Glutes"], ["legs", "Legs"], ["hips", "Hips"], ["ankle", "Ankle"], ["neck", "Neck"]];
const F_DIFF: [string, string][] = [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]];

const DAY_COLS = "id, label, description, difficulty, exercise_count, region, focus_tags, modality_tags, intent_tags";

function ctToday() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); }
function daysAheadCT(n: number) {
  const t = ctToday(); const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function daysAgoCT(n: number) {
  const t = ctToday(); const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export default function AddWorkoutButton({ dateStr, label = "+ Add workout", clientId }: { dateStr?: string; label?: string; clientId?: string }) {
  const { firstName: coachFirstName } = useCoach();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState<LibDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const [build, setBuild] = useState(false);
  const [text, setText] = useState("");
  // What was just logged, so the sheet can SAY it landed instead of
  // reloading into an identical-looking screen. See addCustom().
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedDate, setPickedDate] = useState<string>(dateStr || ctToday());
  const [markDone, setMarkDone] = useState(false);
  const [ask, setAsk] = useState<{ day: LibDay; replacing: DateOccupant[] } | null>(null);
  // Filters. Region is single-choice; everything else is a set, because "chest
  // or shoulders" is a real thing to want and "chest AND shoulders" is not how
  // anybody searches a library.
  const [fRegion, setFRegion] = useState<string | null>(null);
  const [fMod, setFMod] = useState<string[]>([]);
  const [fIntent, setFIntent] = useState<string[]>([]);
  const [fFocus, setFFocus] = useState<string[]>([]);
  const [fDiff, setFDiff] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReading, setAiReading] = useState<string>("");
  // The preview is a VIEW, not a navigation. Dustin, 4 Sep: "maje sure we can
  // view, then go back to that screen without dropping the search." Leaving the
  // sheet to look at a workout and coming back to an empty search box is how you
  // make somebody stop looking. Everything above stays mounted; this just draws
  // over it.
  const [preview, setPreview] = useState<{ day: LibDay; sections: PreviewSection[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const filterCount =
    (fRegion ? 1 : 0) + fMod.length + fIntent.length + fFocus.length + fDiff.length;
  function clearFilters() {
    setFRegion(null); setFMod([]); setFIntent([]); setFFocus([]); setFDiff([]); setAiReading("");
  }

  /** Open a workout without leaving the sheet. */
  async function openPreview(d: LibDay) {
    setPreviewBusy(true);
    setPreview({ day: d, sections: [] });
    try {
      const { data } = await (supabase as any)
        .from("sections")
        .select("id, position, client_facing_name, internal_name, prescribed_exercises(id, position, sets, volume_type, volume_value, cue, exercises(name))")
        .eq("day_id", d.id)
        .order("position");
      const sections: PreviewSection[] = ((data as any[]) || []).map((sec) => ({
        id: sec.id,
        // NEVER the internal name. The corrective vocabulary — Inhibit,
        // Lengthen, Activate, Integrate — is the engine, and it is not shown to
        // clients. client_facing_name is what exists for this.
        name: sec.client_facing_name || "Workout",
        items: ((sec.prescribed_exercises as any[]) || [])
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map((pe) => ({
            id: pe.id,
            name: pe.exercises ? pe.exercises.name : "Exercise",
            sets: pe.sets ?? null,
            volume: pe.volume_value ?? null,
            cue: pe.cue ?? null,
          })),
      }));
      setPreview({ day: d, sections });
    } finally { setPreviewBusy(false); }
  }

  /**
   * Hand the sentence to the model, and let it set the CHIPS.
   *
   * It deliberately does not return a shortlist for the screen to show. The
   * point is options you can then adjust: the interpretation lands as filters
   * you can see and tap off, so a near miss costs one tap instead of a
   * rephrase. The route never picks a workout and never writes anything.
   */
  async function askAi() {
    const text = q.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/library-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.filter) {
        setAiReading("Couldn't read that one — try the filters below.");
        return;
      }
      setFRegion(j.filter.region || null);
      setFMod(Array.isArray(j.filter.modality) ? j.filter.modality : []);
      setFIntent(Array.isArray(j.filter.intent) ? j.filter.intent : []);
      setFFocus(Array.isArray(j.filter.focus) ? j.filter.focus : []);
      setFDiff(Array.isArray(j.filter.difficulty) ? j.filter.difficulty : []);
      setAiReading(j.reading || "");
      // The words themselves stop narrowing once the meaning has been turned
      // into filters — otherwise "something easy for my sore back" also has to
      // appear verbatim in a description, and nothing ever matches.
      setQ("");
      setShowFilters(true);
    } catch {
      setAiReading("Couldn't read that one — try the filters below.");
    } finally { setAiBusy(false); }
  }
  const minDate = daysAgoCT(90);
  // FORWARD, not just backward.
  //
  // Dustin, 17 Aug: "I tried to add one to tomorrow, it popped up on today as a
  // 3rd." He was not misreading it — `max` was ctToday(), so the date box could
  // not accept tomorrow at all. A phone clamps an out-of-range date back into
  // range, so picking tomorrow silently became today and the workout landed on
  // the wrong day. Then he deleted the stray one, which is how the rest of that
  // evening happened.
  //
  // The sheet was built for BACKDATING a session already done — 90 days back,
  // a "backdated" label, a "mark completed" checkbox — and nobody ever wired
  // the other direction. Adding a session ahead is the more common thing to
  // want, and generation only materialises five weeks out, so that is the bound.
  const maxDate = daysAheadCT(35);
  // 35 days ahead is right for SCHEDULING and wrong for "already done" -- a
  // session cannot have been completed on a day that has not happened. The
  // server refuses it either way; this stops the picker offering it. One live
  // instance got through: a completed log dated 28 Aug, created on the 25th.
  const todayCT = daysAgoCT(0);

  async function resolveClientId(): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    const uid = u && u.user ? u.user.id : null;
    if (!uid) return null;
    const { data } = await supabase.from("clients").select("id").eq("auth_user_id", uid).limit(1);
    return data && data[0] ? (data[0] as any).id : null;
  }

  // Trainer override: when a clientId is passed (managing a client), act on that
  // client; otherwise fall back to the logged-in user's own profile.
  async function effectiveClientId(): Promise<string | null> {
    return clientId || (await resolveClientId());
  }

  async function openSheet() {
    setOpen(true);
    if (lib.length) return;
    setLoading(true);
    const cid = await effectiveClientId();
    const days: LibDay[] = [];
    if (cid) {
      const asn = await supabase.from("program_assignments").select("program_id").eq("client_id", cid);
      const progIds = Array.from(new Set(((asn.data as any[]) || []).map((a) => a.program_id).filter(Boolean)));
      if (progIds.length) {
        const ph = await supabase.from("phases").select("id").in("program_id", progIds as string[]);
        const phaseIds = ((ph.data as any[]) || []).map((p) => p.id);
        if (phaseIds.length) {
          const own = await supabase.from("days").select(DAY_COLS).in("phase_id", phaseIds as string[]).order("position");
          for (const d of ((own.data as LibDay[]) || [])) days.push(d);
        }
      }
    }
    // THE CAP WAS BELOW THE LIBRARY, SO SEARCH COULD NOT SEE PAST "M".
    //
    // 400 rows, ordered by label, against a library that is now 732 days and
    // 449 distinct names. Everything alphabetically after the cut-off simply did
    // not exist as far as the search box was concerned -- and because the list
    // is ordered by label, the missing part was always the back half of the
    // alphabet, which reads like a broken search rather than a truncated one.
    //
    // fetchAllRowsSafe pages instead of guessing a number. PostgREST caps a
    // single read at 1,000 rows whatever .limit() asks for, so a bigger number
    // here would have been another guess with a cliff behind it.
    const shared = { data: await fetchAllRowsSafe<LibDay>(
      () => supabase.from("days").select(DAY_COLS).order("label"),
      { label: "AddWorkoutButton library" },
    ) };
    for (const s of ((shared.data as LibDay[]) || [])) if (!days.find((d) => d.id === s.id)) days.push(s);
    setLib(days);
    setLoading(false);
  }

  // Adding a workout to a day that already has one is TWO different intentions
  // and the tap alone cannot tell them apart.
  //
  // Dustin, 17 Aug: he came here to *replace* his programmed walk with the
  // stair master — this is where his own saved workouts are searchable, so it
  // is where he looked — and this button has only ever added. He ended the day
  // with both sessions scheduled and reported it as the swap being broken.
  //
  // He chose being asked over always-replace: doubling up on a day and swapping
  // a day out are both things he does, so the app should not guess.
  async function askOrAdd(d: LibDay) {
    if (busy) return;
    // Backlogging a FINISHED workout is never a replacement — it is a record of
    // something that already happened, and it must not clear the day's plan.
    if (markDone) { await addLibrary(d, "add"); return; }
    setBusy(true);
    try {
      const cid = await effectiveClientId();
      if (!cid) { window.alert("Could not find your client profile."); return; }
      const { data, error } = await supabase.from("scheduled_workouts")
        .select("id, day_id, position, status, deleted_at, days(label)")
        .eq("client_id", cid).eq("scheduled_date", pickedDate);
      // A refused read must not silently become "the day is empty", which would
      // skip the question and add — the exact behaviour being fixed.
      if (error) { window.alert("Couldn't check what's already on that day: " + error.message); return; }
      const occupants: DateOccupant[] = ((data as any[]) || []).map((r) => ({
        id: r.id, day_id: r.day_id, position: r.position, status: r.status,
        deleted_at: r.deleted_at, label: r.days ? r.days.label : null,
      }));
      const replacing = sessionsReplacedBy(occupants, d.id);
      if (replacing.length === 0) { setBusy(false); await addLibrary(d, "add"); return; }
      setAsk({ day: d, replacing });
    } finally { setBusy(false); }
  }

  async function addLibrary(d: LibDay, intent: "add" | "replace", replacing: DateOccupant[] = []) {
    if (busy) return;
    setBusy(true);
    try {
      const cid = await effectiveClientId();
      if (!cid) { window.alert("Could not find your client profile."); return; }
      const ex = await supabase.from("scheduled_workouts").select("position").eq("client_id", cid).eq("scheduled_date", pickedDate).order("position", { ascending: false }).limit(1);
      const last = (ex.data as any[]) || [];
      // A replacement takes the slot it displaces so it lands where the old
      // session sat in the day's order; an add goes on the end as before.
      const pos = intent === "replace"
        ? slotForReplacement(replacing)
        : (last[0] && last[0].position ? last[0].position + 1 : 1);
      if (markDone) {
        // Backlog a FINISHED workout: mirror completeWorkout() — write a completed
        // workout_logs row and a completed scheduled_workouts row linked to it, so it
        // counts in history/progress/tracking. Dated to the picked day (noon UTC keeps
        // the same calendar date in Central).
        const completedAt = new Date(pickedDate + "T12:00:00Z").toISOString();
        const wl = await (supabase as any).from("workout_logs").insert({ client_id: cid, day_id: d.id, log_date: pickedDate, completed: true, completed_at: completedAt, started_at: completedAt, status: "Done as planned", source: "trainer_backfill" }).select("id").single();
        if (wl.error || !wl.data) { window.alert("Could not add: " + (wl.error ? wl.error.message : "no log created")); return; }
        const insC = await (supabase as any).from("scheduled_workouts").insert({ client_id: cid, day_id: d.id, scheduled_date: pickedDate, position: pos, status: "completed", workout_log_id: wl.data.id, source: "trainer" });
        if (insC.error) { window.alert(scheduleWriteError(insC.error, "add")); return; }
        window.location.reload();
        return;
      }
      const ins = await (supabase as any).from("scheduled_workouts").insert({ client_id: cid, day_id: d.id, scheduled_date: pickedDate, position: pos, status: "scheduled", source: clientId ? "trainer" : "client_self_assign" });
      if (ins.error) { window.alert(scheduleWriteError(ins.error, "add")); return; }
      if (intent === "replace" && replacing.length) {
        // Order matters: the new session is on the schedule BEFORE anything is
        // cleared, so a failure here can never leave the day empty.
        //
        // `.select("id")` is the whole guard. PostgREST returns its error, it
        // does not throw, and an update matching ZERO rows is not an error at
        // all — so without asking which rows actually changed this would report
        // a replacement it had not made. That is the bug, not a precaution.
        const { data: skipped, error: skipErr } = await (supabase as any).from("scheduled_workouts")
          .update({ status: "replaced", updated_at: new Date().toISOString() })
          .in("id", replacing.map((r) => r.id))
          .eq("status", "scheduled")
          .select("id");
        const verdict = skipErr
          ? `Added, but ${describeReplaced(replacing)} is still on that day too — ${skipErr.message}`
          : skipVerdict(replacing, (((skipped as { id: string }[] | null) || []).map((s) => s.id)));
        if (verdict) window.alert(verdict);
      }
      window.location.reload();
    } finally { setBusy(false); }
  }


  // PULL-FORWARD IS GONE, AND THAT WAS DELIBERATE.
  //
  // Adding a workout used to look 7 days ahead for the same session and MOVE
  // that row onto the chosen date instead of adding a new one. It was added on
  // 11 Aug for Sara Prince, who did Sunday's mobility early and was left with
  // the same two sessions still sitting later in her week and her adherence
  // reading 30%.
  //
  // Dustin, 4 Sep: "3 definitely do not like that, fix it a replace shouod
  // reolace what they said not move anything."
  //
  // So Add adds. Replace replaces what was named, on the day it was named, and
  // nothing else on the calendar moves on its own. The trade-off is real and
  // is his to make: doing Thursday's session on Tuesday now leaves Thursday's
  // copy where it is, and it is on the person to move or remove it.
  //
  // src/lib/pullForward.ts and its tests are left in place — the rule is sound
  // and the completion path still reasons about the same window. Only this
  // surface stopped calling it.

  async function addCustom() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const cid = await effectiveClientId();
      if (!cid) { window.alert("Could not find your client profile."); return; }

      // IT HAS TO LAND ON THE SCHEDULE. Dustin, 14 Aug: "if they add a workout
      // through any route it needs to show up period."
      //
      // This used to insert straight into offplan_workout_logs — a table the
      // schedule does not read and that nothing has processed since
      // 2026-07-29. Todd Prine typed a run into it, saw his week unchanged,
      // and reported it as not saving. He was right about the effect and wrong
      // only about the cause.
      //
      // /api/workout-manual is the one path that writes the full shape: a
      // client-owned day, a completed workout_log carrying the text, and a
      // scheduled_workouts row. Same machinery the manual builder and the AI
      // builder use, so this session is not a second-class one.
      const firstLine = text.trim().split("\n")[0].trim();
      const res = await fetch("/api/workout-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId || undefined,
          title: (firstLine || "Logged workout").slice(0, 120),
          date: pickedDate,
          exercises: [],
          markDone: true,
          note: text.trim(),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        window.alert(j?.error || "Could not save that workout — try again.");
        return;
      }

      // SAY SO. This used to insert and then reload the page, and nothing on
      // Home renders offplan_workout_logs — so the screen came back looking
      // byte-for-byte identical to before. Todd Prine, 14 Aug, two minutes
      // after his run saved perfectly: "Tried to just type my run in for a
      // workout and I don't think it saved."
      //
      // It had saved. The row was there the whole time. A write nobody
      // confirms is a write the person assumes failed — and the next thing
      // they do is either give up or log it twice.
      setSaved(text.trim().slice(0, 60));
      setText("");
    } finally { setBusy(false); }
  }

  // SEARCH THE DESCRIPTION, NOT JUST THE TITLE.
  //
  // Dustin, 3 Sep: "when they search for a workout, it should search the
  // description. that way if they search for chest strength and balance, or
  // something like that it will find the most appropriate workouts. also they
  // can search beginner, intermediate, advanced, hard, easy."
  //
  // This matched d.label alone against 449 distinct names, so a perfect chest
  // session called "Upper Push A" was invisible to anyone searching "chest".
  // The library was there; it could not be reached.
  //
  // EVERY WORD HAS TO MATCH, not the phrase. "chest strength balance" is three
  // requirements, and a substring test on the whole string finds nothing
  // because no description contains that exact run of characters. Splitting on
  // whitespace turns it into what he actually meant: show me the workouts that
  // are all three.
  //
  // Title matches sort first. Somebody typing a name they already know should
  // not have to scroll past nine descriptions that happen to mention it.
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = (d: LibDay) =>
    `${d.label} ${d.description ?? ""} ${d.difficulty ?? ""}`.toLowerCase();
  const hasAny = (tags: string[] | null | undefined, want: string[]) =>
    want.length === 0 || (tags || []).some((t) => want.includes(t));

  const filtered = lib
    .filter((d) => {
      if (fRegion && d.region !== fRegion) return false;
      if (!hasAny(d.modality_tags, fMod)) return false;
      if (!hasAny(d.intent_tags, fIntent)) return false;
      if (!hasAny(d.focus_tags, fFocus)) return false;
      if (fDiff.length && !fDiff.includes((d.difficulty || "").toLowerCase())) return false;
      if (terms.length === 0) return true;
      const h = haystack(d);
      return terms.every((t) => h.includes(t));
    })
    .slice()
    .sort((a, b) => {
      if (terms.length === 0) return 0;
      const score = (d: LibDay) => (terms.every((t) => d.label.toLowerCase().includes(t)) ? 0 : 1);
      return score(a) - score(b);
    });

  function chip(key: string, lab: string, on: boolean, onClick: () => void) {
    return (
      <button key={key} type="button" onClick={onClick}
        style={{
          padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700,
          fontFamily: "inherit", whiteSpace: "nowrap",
          border: on ? "1px solid transparent" : "1px solid rgba(140,150,180,.35)",
          background: on ? "var(--brand-primary)" : "transparent",
          color: on ? "#fff" : "inherit",
        }}>
        {lab}
      </button>
    );
  }
  function chipRow(title: string, opts: [string, string][], sel: string[], set: (v: string[]) => void) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.6, marginBottom: 5 }}>{title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opts.map(([v, lab]) => chip(v, lab, sel.includes(v), () => toggle(sel, v, set)))}
        </div>
      </div>
    );
  }

  return (
    <>
      <button onClick={openSheet} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "var(--brand-primary, #7c9cf5)", color: "#fff" }}>{label}</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--brand-surface, #ffffff)", color: "var(--brand-text, #1c2440)", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 16, paddingBottom: "calc(16px + env(safe-area-inset-bottom))", maxHeight: "85dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Add a workout</div>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", fontSize: 13, cursor: "pointer", color: "inherit", opacity: 0.6 }}>Close</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>Date</label>
              <input type="date" value={pickedDate} min={minDate} max={markDone ? todayCT : maxDate} onChange={(e) => setPickedDate(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", fontSize: 14, fontFamily: "inherit" }} />
              {pickedDate !== ctToday() && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-primary, #7c9cf5)" }}>{pickedDate > ctToday() ? "scheduled ahead" : "backdated"}</span>}
            </div>
            {preview ? (
              /* THE PREVIEW IS A LAYER, NOT A DESTINATION.
                 Everything behind it — the search text, every chip, the scroll
                 position — is still mounted, so Back is genuinely back. */
              <div>
                <button onClick={() => setPreview(null)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "inherit", padding: "2px 0 10px" }}>
                  ← Back to results
                </button>
                <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{preview.day.label}</div>
                {preview.day.description && (
                  <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 5, lineHeight: 1.45 }}>{preview.day.description}</div>
                )}
                <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 6 }}>
                  {(preview.day.exercise_count ?? 0)} exercise{(preview.day.exercise_count ?? 0) === 1 ? "" : "s"}
                  {preview.day.difficulty ? " · " + preview.day.difficulty : ""}
                  {preview.day.region ? " · " + preview.day.region : ""}
                </div>
                {previewBusy && preview.sections.length === 0 ? (
                  <div style={{ padding: "16px 0" }}><FunLoader label="Opening it up…" /></div>
                ) : (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    {preview.sections.map((sec) => (
                      <div key={sec.id}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", opacity: 0.6, marginBottom: 5 }}>{sec.name}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {sec.items.map((it) => (
                            <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "8px 10px", borderRadius: 10, background: "rgba(140,150,180,.08)" }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
                                {it.name}
                                {it.cue && <span style={{ display: "block", fontSize: 11.5, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{it.cue}</span>}
                              </span>
                              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                                {it.sets ? it.sets + " × " : ""}{it.volume || ""}
                              </span>
                            </div>
                          ))}
                          {sec.items.length === 0 && <div style={{ fontSize: 12, opacity: 0.6, padding: "6px 2px" }}>Nothing in this section.</div>}
                        </div>
                      </div>
                    ))}
                    {preview.sections.length === 0 && (
                      <div style={{ fontSize: 13, opacity: 0.7, padding: "8px 2px" }}>This one has no movements saved against it yet.</div>
                    )}
                  </div>
                )}
                <button disabled={busy} onClick={() => { const d = preview.day; setPreview(null); askOrAdd(d); }}
                  style={{ marginTop: 16, width: "100%", padding: 12, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                  Add this workout
                </button>
              </div>
            ) : ask ? (
              /* Replace or add as well — Dustin's answer, 17 Aug. Both wordings
                 name the sessions involved, because "replace" with nothing named
                 is how you clear a day you meant to add to.

                 ADD IS THE PRIMARY BUTTON, 24 Aug. It was the other way round,
                 and the destructive answer was the one styled as the default:
                 solid, brand-coloured, full width, first. Replace was a single
                 tap on the obvious button; "Add as well" was a faint dashed
                 outline underneath it.

                 Robby Burns logged "Volleyball - 2 hours" on the 21st and
                 "2 hours pickleball" on the 23rd. Both times his Ankle & Hip
                 Daily Mobility was marked skipped in the same millisecond, and
                 on the 24th he messaged: "my solo workouts have disappeared?"
                 He had not replaced anything — he had played volleyball AND
                 done his mobility, and the app recorded him as skipping it.

                 Adding is the common case and the safe one; replacing takes
                 something off the day. The safe answer gets the weight. */
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {pickedDate === ctToday() ? "Today" : pickedDate} already has {describeReplaced(ask.replacing)}.
                </div>
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14, lineHeight: 1.45 }}>
                  What should &ldquo;{ask.day.label}&rdquo; do?
                </div>
                <button disabled={busy} onClick={() => { const a = ask; setAsk(null); addLibrary(a.day, "add"); }}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary, #7c9cf5)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                  Add as well
                </button>
                <div style={{ fontSize: 11.5, opacity: 0.65, margin: "6px 2px 12px", lineHeight: 1.4 }}>
                  Both sessions stay on that day. Pick this if you did the extra
                  activity <em>as well as</em> what was planned.
                </div>
                <button disabled={busy} onClick={() => { const a = ask; setAsk(null); addLibrary(a.day, "replace", a.replacing); }}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px dashed rgba(140,150,180,.5)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "inherit" }}>
                  Replace it instead
                </button>
                <div style={{ fontSize: 11.5, opacity: 0.65, margin: "6px 2px 0", lineHeight: 1.4 }}>
                  {describeReplaced(ask.replacing)} {ask.replacing.length > 1 ? "get" : "gets"} marked skipped — only do this if you did <em>not</em> do {ask.replacing.length > 1 ? "them" : "it"}. Nothing is deleted, and your programme is unchanged.
                </div>
                <button onClick={() => setAsk(null)} style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 12, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit", opacity: 0.7 }}>← Back</button>
              </div>
            ) : build ? (
              <ManualWorkoutBuilder
                clientId={clientId}
                date={pickedDate}
                onCancel={() => setBuild(false)}
              />
            ) : !custom ? (
              <>
                {/* THE TWO ENTRY POINTS COME FIRST.
                    Dustin, 4 Sep: "add workouts does not show the type what I
                    did option or manual workout builder, thats the first issue.
                    its there but at the very bottom of 100+ workoyts so Noone
                    has seen it."
                    They were literally below the library — you had to scroll
                    past every workout in the house to find out you could type
                    what you did. They are the first thing on the sheet now. */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setCustom(true)}
                    style={{ flex: 1, padding: "12px 10px", borderRadius: 12, border: "1px solid rgba(140,150,180,.3)", background: "rgba(140,150,180,.08)", cursor: "pointer", color: "inherit", textAlign: "left", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>Type what I did</div>
                    <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2, lineHeight: 1.35 }}>Already done — just record it</div>
                  </button>
                  <button onClick={() => setBuild(true)}
                    style={{ flex: 1, padding: "12px 10px", borderRadius: 12, border: "1px solid rgba(140,150,180,.3)", background: "rgba(140,150,180,.08)", cursor: "pointer", color: "inherit", textAlign: "left", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>Build my own</div>
                    <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2, lineHeight: 1.35 }}>Pick movements set by set</div>
                  </button>
                </div>

                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.55, marginBottom: 7 }}>Or pick from the library</div>

                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") askAi(); }}
                    placeholder="Search, or describe what you want"
                    style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14 }}
                  />
                  {/* Typing filters as you go; this hands the sentence to the AI,
                      which answers by SETTING THE CHIPS rather than returning a
                      shortlist. A near miss then costs one tap instead of a
                      rephrase, and you can always see what it understood. */}
                  <button onClick={askAi} disabled={aiBusy || !q.trim()} title="Let AI read what you asked for"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "10px 13px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: aiBusy || !q.trim() ? "default" : "pointer", opacity: aiBusy || !q.trim() ? 0.5 : 1, fontWeight: 800, fontSize: 13, fontFamily: "inherit" }}>
                    {aiBusy ? "…" : <><AiBadge size={16} mood="neutral" ring={false} title="" /> Ask</>}
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setShowFilters((v) => !v)}
                    style={{ padding: "6px 11px", borderRadius: 999, border: "1px solid rgba(140,150,180,.35)", background: filterCount ? "rgba(140,150,180,.14)" : "transparent", color: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                    {showFilters ? "Hide filters" : "Filters"}{filterCount ? ` · ${filterCount}` : ""}
                  </button>
                  {filterCount > 0 && (
                    <button onClick={clearFilters}
                      style={{ border: "none", background: "transparent", color: "inherit", opacity: 0.65, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                      Clear
                    </button>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11.5, opacity: 0.6, fontWeight: 700 }}>
                    {filtered.length} workout{filtered.length === 1 ? "" : "s"}
                  </span>
                </div>

                {aiReading && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, padding: "9px 11px", borderRadius: 10, marginBottom: 10, background: "color-mix(in srgb, var(--brand-primary) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)" }}>
                    {aiReading}
                  </div>
                )}

                {showFilters && (
                  <div style={{ padding: "10px 0 2px" }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.6, marginBottom: 5 }}>Region</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {F_REGION.map(([v, lab]) => chip(v, lab, fRegion === v, () => setFRegion(fRegion === v ? null : v)))}
                      </div>
                    </div>
                    {chipRow("Body part", F_FOCUS, fFocus, setFFocus)}
                    {chipRow("Type", F_MODALITY, fMod, setFMod)}
                    {chipRow("What it's for", F_INTENT, fIntent, setFIntent)}
                    {chipRow("Difficulty", F_DIFF, fDiff, setFDiff)}
                  </div>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} style={{ width: 16, height: 16 }} />
                  Mark completed on this date (backlog a finished workout)
                </label>

                {loading ? (
                  <FunLoader label="Pulling up your workouts…" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.slice(0, 120).map((d) => (
                      <div key={d.id} style={{ padding: "11px 12px", borderRadius: 12, border: "1px solid rgba(140,150,180,.2)", background: "rgba(140,150,180,.06)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{d.label}</span>
                          {d.difficulty && (
                            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", padding: "2px 7px", borderRadius: 999, background: "rgba(140,150,180,.18)", opacity: 0.85 }}>
                              {d.difficulty}
                            </span>
                          )}
                        </div>
                        {d.description && (
                          <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.45, opacity: 0.72, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {d.description}
                          </div>
                        )}
                        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6, fontWeight: 600 }}>
                          {(d.exercise_count ?? 0)} exercise{(d.exercise_count ?? 0) === 1 ? "" : "s"}
                          {d.region ? " · " + d.region : ""}
                          {(d.modality_tags || []).length ? " · " + (d.modality_tags || []).slice(0, 3).join(", ") : ""}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                          <button disabled={busy} onClick={() => askOrAdd(d)}
                            style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" }}>
                            Add
                          </button>
                          {/* Every result opens. A list of names is a list of
                              guesses; this is how you find out what one is
                              without adding it to your week to look. */}
                          <button onClick={() => openPreview(d)}
                            style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(140,150,180,.35)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <div style={{ padding: 14, opacity: 0.7, fontSize: 13, lineHeight: 1.5 }}>
                        Nothing matches that.{filterCount > 0 ? " Try clearing a filter." : ""}
                      </div>
                    )}
                    {filtered.length > 120 && (
                      <div style={{ padding: "8px 2px", fontSize: 11.5, opacity: 0.6 }}>
                        Showing the first 120 of {filtered.length}. Narrow it with a filter or a word.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {saved ? (
                  <div style={{ padding: "18px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 34, lineHeight: 1 }}>✅</div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginTop: 8 }}>Logged</div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6, lineHeight: 1.45 }}>
                      &ldquo;{saved}&rdquo;
                    </div>
                    <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 10, lineHeight: 1.45 }}>
                      Saved for {pickedDate === ctToday() ? "today" : pickedDate}. {coachFirstName} can see it.
                    </div>
                    <button
                      onClick={() => { setSaved(null); setCustom(false); setOpen(false); window.location.reload(); }}
                      style={{ marginTop: 16, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary, #7c9cf5)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                      Done
                    </button>
                    <button
                      onClick={() => setSaved(null)}
                      style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 12, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit", opacity: 0.7 }}>
                      Log another
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you do? e.g. 30 min incline walk, 3x12 goblet squats" rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", marginBottom: 10, resize: "vertical" }} />
                    <button disabled={busy || !text.trim()} onClick={addCustom} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary, #7c9cf5)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, opacity: busy || !text.trim() ? 0.5 : 1 }}>Add workout</button>
                    <button onClick={() => setCustom(false)} style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 12, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit", opacity: 0.7 }}>Back to library</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
