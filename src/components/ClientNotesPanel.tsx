"use client";

// "Needs your eyes" — the movement notes nobody has closed out.
//
// WHY THIS EXISTS. `exercise_notes.resolved` shipped with the table and nothing
// had ever written it. On 21 Aug: 63 rows, 63 unresolved, 59 of them from
// clients, the oldest 19 July. Sitting in there were "skipped. left knee pain"
// (Claudine, 17 Aug), "lower back hurts a bit" (Claudine, 20 Aug), "Skipped
// today. Still afraid of them." (Bobbie, 17 Aug) and two separate "Could we
// switch to an exercise that doesn't use the ball?" from Sara Prince.
//
// Most of those DID reach him at the time — routeTrainingNote delivers symptoms
// and questions as messages. The gap this closes is not delivery, it is state:
// a message scrolls away, and there has never been a way to ask "which of these
// have I actually done something about?" For a month the answer was that nobody
// could tell.
//
// Symptom notes rank first, by the same vocabulary that decides whether a note
// interrupts him, so "worth waking him for" and "worth showing him first" can
// never drift apart.

import { useState } from "react";
import Link from "next/link";
import { resolveExerciseNote, unresolveExerciseNote } from "@/app/(app)/home/noteActions";

export interface ClientNote {
  id: string;
  clientId: string;
  clientName: string;
  exerciseName: string;
  note: string;
  author: string;
  logDate: string | null;
  dayId: string | null;
  isSymptom: boolean;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso + "T12:00:00Z")) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return days + " days ago";
  if (days < 60) return Math.round(days / 7) + " weeks ago";
  return Math.round(days / 30) + " months ago";
}

export default function ClientNotesPanel({ notes }: { notes: ClientNote[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const open = notes.filter((n) => !done.has(n.id));
  const shown = showAll ? open : open.slice(0, 6);
  const symptomCount = open.filter((n) => n.isSymptom).length;

  async function close(n: ClientNote) {
    setBusy(n.id);
    // Optimistic, but reversible and HONEST: if the write did not land the row
    // comes straight back with the reason, rather than vanishing off a screen
    // while the database still has it open.
    setDone((p) => new Set(p).add(n.id));
    const err = await resolveExerciseNote(n.id);
    if (err) {
      setDone((p) => { const c = new Set(p); c.delete(n.id); return c; });
      if (typeof window !== "undefined") window.alert(err);
    }
    setBusy(null);
  }

  async function undo(id: string) {
    setBusy(id);
    const err = await unresolveExerciseNote(id);
    if (!err) setDone((p) => { const c = new Set(p); c.delete(id); return c; });
    else if (typeof window !== "undefined") window.alert(err);
    setBusy(null);
  }

  if (notes.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden mt-4"
      style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{
          borderBottom: "1px solid var(--brand-border)",
          background: "color-mix(in srgb, var(--brand-primary) 6%, transparent)",
        }}
      >
        <i className="ti ti-notes text-base" style={{ color: "var(--brand-primary)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
          Needs your eyes
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
          style={{
            background: symptomCount
              ? "rgba(239,68,68,.13)"
              : "color-mix(in srgb, var(--brand-primary) 13%, transparent)",
            color: symptomCount ? "#ef4444" : "var(--brand-primary)",
          }}
        >
          {open.length}
          {symptomCount ? ` · ${symptomCount} pain` : ""}
        </span>
      </div>

      {open.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            All caught up.
          </p>
          {done.size > 0 && (
            <button
              onClick={() => undo([...done][done.size - 1])}
              className="text-xs mt-2 underline"
              style={{ color: "var(--brand-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
            >
              Undo the last one
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--brand-border)" }}>
          {shown.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: n.isSymptom
                    ? "rgba(239,68,68,.13)"
                    : "color-mix(in srgb, var(--brand-primary) 13%, transparent)",
                }}
              >
                <i
                  className={"ti " + (n.isSymptom ? "ti-alert-triangle" : "ti-message-2") + " text-sm"}
                  style={{ color: n.isSymptom ? "#ef4444" : "var(--brand-primary)" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                  {n.clientName}
                  <span className="font-normal" style={{ color: "var(--brand-text-secondary)" }}>
                    {" · "}{n.exerciseName}
                  </span>
                </p>
                <p className="text-sm mt-0.5" style={{ color: "var(--brand-text)" }}>
                  &ldquo;{n.note}&rdquo;
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                  {ago(n.logDate)}
                  {n.author === "trainer" ? " · your own note" : ""}
                  {n.dayId ? (
                    <>
                      {" · "}
                      <Link
                        href={`/workout/${n.dayId}?forClient=${n.clientId}`}
                        style={{ color: "var(--brand-primary)" }}
                      >
                        open the workout
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                onClick={() => close(n)}
                disabled={busy === n.id}
                title="Mark dealt with"
                className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--brand-primary) 10%, transparent)",
                  color: "var(--brand-primary)",
                  border: "1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)",
                  cursor: busy === n.id ? "default" : "pointer",
                  opacity: busy === n.id ? 0.6 : 1,
                }}
              >
                Done
              </button>
            </div>
          ))}
          {open.length > shown.length && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2.5 text-xs font-semibold"
              style={{ color: "var(--brand-primary)", background: "none", border: "none", cursor: "pointer" }}
            >
              {`Show the other ${open.length - shown.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
