// /clients/notes — the notes the counter has been counting.
//
// Dustin, 24 Aug: "'notes needing you' is opening to client list, not the
// actual notes."
//
// He is right, and the reason is written in the app already. When "Needs your
// eyes" came off Home on 21 Aug the note beside it said the panel was being
// replaced by "one counted row in Today's Admin that links to it" — and
// ClientNotesPanel was left "in the repo, unmounted". Nothing was ever built
// for that row to link to, so its href stayed at /clients: it counted six notes
// and then dropped him on the roster with no way to find any of them.
//
// So this is the destination that was always implied. The panel already
// existed, already sorted symptoms first, and already had resolve and undo
// wired to noteActions — it just had no page. It gets one.
//
// This deliberately does NOT go back on Home. The reason it came off stands:
// with 63 open notes it was taller than the phone and buried a client's back
// injury under twelve pull-up weights. A counted row that says "6, two mention
// pain" and opens a full list on demand is the shape he asked for.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import ClientNotesPanel, { type ClientNote } from "@/components/ClientNotesPanel";

export const dynamic = "force-dynamic";

/**
 * Notes that are not really notes.
 *
 * Kept character-for-character in step with TodaysAdmin's copy of it: if the
 * counter says six and this page shows nine, the count is a lie and the page
 * is a different question. There is a test that fails if they drift.
 */
const ROUTINE = /^\s*\d+\s*#?\s*(assist|second set|s3)?\s*$|at pf|pf chin|assist first set|# second set|# s3|^elliptical$|^stairs$|stair master|1 mile|^medium band$/i;

const SYMPTOM = /pain|hurt|sore|afraid|burn|crack|swell/i;

export default async function ClientNotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!(await viewerIsTrainer(supabase, user))) redirect("/home");

  // RLS scopes this to the viewer's own clients (trainer_all_exercise_notes →
  // trainer_can_see_client), so a trainer sees their own roster's notes and the
  // owner sees everyone's — the same rule as the counter on Home.
  const { data } = await supabase
    .from("exercise_notes")
    .select("id, note, author, log_date, day_id, client_id, clients(name), exercises(name)")
    .not("resolved", "is", true)
    .order("log_date", { ascending: false, nullsFirst: false })
    .limit(300);

  type Row = {
    id: string; note: string | null; author: string | null;
    log_date: string | null; day_id: string | null; client_id: string;
    clients?: { name?: string | null } | null;
    exercises?: { name?: string | null } | null;
  };

  const notes: ClientNote[] = ((data as Row[] | null) || [])
    .filter((r) => !ROUTINE.test((r.note || "").trim()))
    .map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.clients?.name || "Client",
      exerciseName: r.exercises?.name || "—",
      note: r.note || "",
      author: r.author || "client",
      logDate: r.log_date,
      dayId: r.day_id,
      isSymptom: SYMPTOM.test(r.note || ""),
    }))
    // Symptoms first, by the same vocabulary that decides whether a note
    // interrupts him — so "worth waking him for" and "worth showing him first"
    // cannot drift apart. Then newest.
    .sort((a, b) => {
      if (a.isSymptom !== b.isSymptom) return a.isSymptom ? -1 : 1;
      return (b.logDate || "").localeCompare(a.logDate || "");
    });

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/home" className="text-sm" style={{ color: "var(--brand-text-secondary)", textDecoration: "none" }}>
          ‹ Home
        </Link>
      </div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>Client notes</h1>
      <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)" }}>
        What clients wrote in the logger that nobody has closed out. Symptoms first.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-2xl mt-4 px-4 py-8 text-center"
             style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>All caught up.</p>
          <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
            Nothing is waiting on you.
          </p>
        </div>
      ) : (
        // showAllByDefault: on Home the panel showed three, because it was one
        // block among ten and a long list there is a wall. This page IS the
        // list — hiding all but three behind "show more" would be the same
        // dead end he just reported, one screen further in.
        <ClientNotesPanel notes={notes} showAllByDefault />
      )}
    </div>
  );
}
