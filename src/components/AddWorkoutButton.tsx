"use client";

import { useState } from "react";
import { scheduleWriteError } from "@/lib/scheduleConflict";
import { createClient } from "@/lib/supabase/client";
import { FunLoader } from "@/components/FunMoments";
import ManualWorkoutBuilder from "@/components/ManualWorkoutBuilder";
import { findSlotToPullForward, type SlotCandidate } from "@/lib/pullForward";

import { useCoach } from "@/lib/useCoach";
import { sessionsReplacedBy, slotForReplacement, skipVerdict, describeReplaced, type DateOccupant } from "@/lib/replaceOnDate";

type LibDay = { id: string; label: string };

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
          const own = await supabase.from("days").select("id, label").in("phase_id", phaseIds as string[]).order("position");
          for (const d of ((own.data as LibDay[]) || [])) days.push(d);
        }
      }
    }
    const shared = await supabase.from("days").select("id, label").order("label").limit(400); // full library (Dustin 7/13)
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
        // Same rule for a finished session: if it was already on the calendar
        // this week, mark THAT one done rather than leaving a duplicate behind.
        const slotDone = await pullForwardSlot(cid, d.id, pickedDate);
        if (slotDone) {
          const mvC = await (supabase as any).from("scheduled_workouts")
            .update({ scheduled_date: pickedDate, moved_from_date: slotDone.scheduled_date, position: pos, status: "completed", workout_log_id: wl.data.id, updated_at: new Date().toISOString() })
            .eq("id", slotDone.id);
          if (mvC.error) { window.alert(scheduleWriteError(mvC.error, "add")); return; }
          window.location.reload();
          return;
        }
        const insC = await (supabase as any).from("scheduled_workouts").insert({ client_id: cid, day_id: d.id, scheduled_date: pickedDate, position: pos, status: "completed", workout_log_id: wl.data.id, source: "trainer" });
        if (insC.error) { window.alert(scheduleWriteError(insC.error, "add")); return; }
        window.location.reload();
        return;
      }
      const slot = await pullForwardSlot(cid, d.id, pickedDate);
      if (slot) {
        const mv = await (supabase as any).from("scheduled_workouts")
          .update({ scheduled_date: pickedDate, moved_from_date: slot.scheduled_date, position: pos, updated_at: new Date().toISOString() })
          .eq("id", slot.id);
        if (mv.error) { window.alert(scheduleWriteError(mv.error, "add")); return; }
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
          .update({ status: "skipped", updated_at: new Date().toISOString() })
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


  // Doing a planned session early consumes its slot instead of adding another.
  // Sara Prince, 11 Aug: mobility done Sunday to get ahead left the same two
  // sessions still sitting later in her week and her adherence reading 30%.
  async function pullForwardSlot(cid: string, dayId: string, date: string) {
    const { data } = await (supabase as any)
      .from("scheduled_workouts")
      .select("id, day_id, scheduled_date, status, deleted_at")
      .eq("client_id", cid)
      .eq("day_id", dayId)
      .eq("status", "scheduled")
      .is("deleted_at", null)
      .gt("scheduled_date", date)
      .order("scheduled_date", { ascending: true })
      .limit(10);
    return findSlotToPullForward((data as SlotCandidate[]) || [], dayId, date);
  }

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

  const filtered = lib.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()));

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
              <input type="date" value={pickedDate} min={minDate} max={maxDate} onChange={(e) => setPickedDate(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", fontSize: 14, fontFamily: "inherit" }} />
              {pickedDate !== ctToday() && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-primary, #7c9cf5)" }}>{pickedDate > ctToday() ? "scheduled ahead" : "backdated"}</span>}
            </div>
            {ask ? (
              /* Replace or add as well — Dustin's answer, 17 Aug. Both wordings
                 name the sessions involved, because "replace" with nothing named
                 is how you clear a day you meant to add to. */
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {pickedDate === ctToday() ? "Today" : pickedDate} already has {describeReplaced(ask.replacing)}.
                </div>
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14, lineHeight: 1.45 }}>
                  What should &ldquo;{ask.day.label}&rdquo; do?
                </div>
                <button disabled={busy} onClick={() => { const a = ask; setAsk(null); addLibrary(a.day, "replace", a.replacing); }}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary, #7c9cf5)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                  Replace it
                </button>
                <div style={{ fontSize: 11.5, opacity: 0.65, margin: "6px 2px 12px", lineHeight: 1.4 }}>
                  {describeReplaced(ask.replacing)} {ask.replacing.length > 1 ? "get" : "gets"} marked skipped. Nothing is deleted, and your programme is unchanged.
                </div>
                <button disabled={busy} onClick={() => { const a = ask; setAsk(null); addLibrary(a.day, "add"); }}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px dashed rgba(140,150,180,.5)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "inherit" }}>
                  Add as well
                </button>
                <div style={{ fontSize: 11.5, opacity: 0.65, margin: "6px 2px 0", lineHeight: 1.4 }}>
                  Two sessions on that day.
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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your workouts" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", marginBottom: 10 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} style={{ width: 16, height: 16 }} />
                  Mark completed on this date (backlog a finished workout)
                </label>
                {loading ? (
                  <FunLoader label="Pulling up your workouts…" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.map((d) => (
                      <button key={d.id} disabled={busy} onClick={() => askOrAdd(d)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(140,150,180,.2)", background: "rgba(140,150,180,.06)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "inherit" }}>{d.label}</button>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>No matching workouts.</div>}
                  </div>
                )}
                {/* Two different jobs, kept as two buttons. "Build" is for a
                    workout you are about to DO and want to log set by set;
                    "type what you did" is for one that already happened and
                    only needs recording. Collapsing them into one flow makes
                    both worse. */}
                <button onClick={() => setBuild(true)} style={{ marginTop: 12, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary)", cursor: "pointer", fontSize: 14, fontWeight: 800, color: "#fff" }}>+ Build my own workout</button>
                <button onClick={() => setCustom(true)} style={{ marginTop: 8, width: "100%", padding: "12px", borderRadius: 12, border: "1px dashed rgba(140,150,180,.5)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "inherit" }}>Just type what I did</button>
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
