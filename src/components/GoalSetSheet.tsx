"use client";

// SETTING A GOAL — the sheet, and the two things it refuses to do.
//
// It will not let somebody type a number into a box and walk away with no idea
// whether it is reachable. The moment there is a target and a date it says, in
// their own numbers, what that asks of them per week — and if their recent pace
// is already known it says whether that is faster or slower than what they have
// been doing. A goal that turns out to have been impossible three months later
// is worse than no goal, and this is the only moment it is cheap to say so.
//
// And it will not editorialise about the number itself. Suggesting "how about
// 175 instead" from a chart is the app having an opinion it has not earned; the
// person who gets to say that is the coach, in a message, with a reason.

import { useMemo, useState } from "react";
import { UNITS, METRIC_LABEL, kcalPerDayFor, recentRate, type GoalMetric, type Reading } from "@/lib/goals";

const DAY = 86_400_000;
const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

export default function GoalSetSheet({
  clientId, metric, readings, today, existing, onClose, onSaved,
}: {
  clientId: string;
  metric: GoalMetric;
  readings: Reading[];
  today: string;
  /** Present when adjusting rather than setting. */
  existing?: { id: string; targetValue: number; targetDate: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const unit = UNITS[metric];
  const now = readings.length ? readings[readings.length - 1].value : null;

  const [value, setValue] = useState(existing ? String(existing.targetValue) : "");
  const [date, setDate] = useState(
    existing ? existing.targetDate : new Date(ms(today) + 84 * DAY).toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // What this asks of them, said before they commit rather than after.
  const reality = useMemo(() => {
    // AN EMPTY BOX IS NOT A TARGET OF ZERO.
    //
    // `value` starts as "" for a new goal, and Number("") is 0, which
    // Number.isFinite happily accepts. So before the person had typed anything
    // the sheet computed a goal of ZERO and told them, in a box on screen:
    //
    //   "That's 9.72 lb a week for 12 weeks — roughly 4850 kcal a day below
    //    maintenance."
    //
    // 4850 under maintenance is not a diet, it is a number that should never
    // have been printed. It came from |116.7 - 0| / 12 weeks. Dustin saw it on
    // 22 Aug while setting a goal of 107.
    //
    // A blank box means "not yet", and a body weight, body fat percentage or
    // lean mass of zero or less is not a goal anybody can hold, so neither says
    // anything until there is a real number to say it about.
    if (!value.trim()) return null;
    const tv = Number(value);
    if (!Number.isFinite(tv) || tv <= 0) return null;
    if (now == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const weeks = (ms(date) - ms(today)) / (7 * DAY);
    if (weeks <= 0) return null;
    const remaining = Math.abs(now - tv);
    if (remaining === 0) return { line: "You're already there.", tone: "ok" as const };
    const need = remaining / weeks;
    const rate = recentRate(readings);
    const goingDown = now > tv;
    const holding = rate != null && (goingDown ? rate < 0 : rate > 0) ? Math.abs(rate) : 0;

    const needTxt = `That's ${Math.round(need * 100) / 100} ${unit} a week for ${Math.round(weeks)} weeks`;
    // ABOVE or BELOW, taken from the direction of travel.
    //
    // Dustin, 17 Aug, setting a goal to GAIN from 207.2 lb to 235: "That's 1.87
    // lb a week for 15 weeks — roughly 925 kcal a day BELOW maintenance." The
    // number was right (kcalPerDayFor takes an absolute value); the word was
    // hard-coded, because every goal this was written against was a cut. It told
    // him to eat 925 under to gain 28 lb — the exact opposite of the plan.
    //
    // `goingDown` is computed two lines up and already drives the pace copy.
    // This line simply never asked it.
    const kcal = metric === "weight"
      ? ` — roughly ${kcalPerDayFor(need)} kcal a day ${goingDown ? "below" : "above"} maintenance`
      : "";

    // A PACE NOBODY SHOULD BE ASKED TO HOLD.
    //
    // Separate from the stretch check below, which compares against what THEY
    // have been doing — this is about what is sane for anyone. The old code had
    // no ceiling at all, so a date close enough would cheerfully print a
    // four-figure daily deficit as though it were a plan, and the only signal
    // that something was wrong was the size of a number most people cannot
    // judge.
    //
    // ~1% of bodyweight a week is the usual upper bound for weight, and about a
    // point of body fat a week is already fast. Past that the honest answer is
    // that the DATE is wrong, so that is what it says.
    const ceiling = metric === "weight" ? Math.max(2, now * 0.01)
      : metric === "body_fat_pct" ? 1
      : 1;
    if (need > ceiling) {
      return {
        line: `${needTxt}. That's faster than anyone should be asked to go${metric === "weight" ? ` — and it would mean roughly ${kcalPerDayFor(need)} kcal a day ${goingDown ? "below" : "above"} maintenance` : ""}. Give it more time, or pick a smaller change.`,
        tone: "stretch" as const,
      };
    }

    if (holding === 0) {
      return { line: `${needTxt}${kcal}.`, tone: "ok" as const };
    }
    const ratio = need / holding;
    if (ratio > 1.6) {
      return {
        line: `${needTxt}${kcal}. You've been holding about ${Math.round(holding * 100) / 100} ${unit} a week, so this asks for roughly ${Math.round(ratio * 10) / 10}× that. Reachable, but it won't happen on its own.`,
        tone: "stretch" as const,
      };
    }
    if (ratio < 0.55) {
      return { line: `${needTxt}${kcal}. That's inside the pace you've already been holding.`, tone: "ok" as const };
    }
    return { line: `${needTxt}${kcal}. That's about the pace you've been holding.`, tone: "ok" as const };
  }, [value, date, now, readings, today, unit, metric]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          existing
            ? { action: "adjust", goalId: existing.id, targetValue: Number(value), targetDate: date }
            : { action: "set", clientId, metric, targetValue: Number(value), targetDate: date },
        ),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Couldn't save that."); setBusy(false); return; }
      onSaved();
    } catch {
      setErr("Couldn't save that — check your connection.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--brand-surface)",
          borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18,
          paddingBottom: "calc(22px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--brand-border)", margin: "0 auto 14px" }} />
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--brand-text)" }}>
          {existing ? "Adjust your goal" : `Set a ${METRIC_LABEL[metric].toLowerCase()} goal`}
        </h2>
        {now != null && (
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--brand-text-secondary)" }}>
            You&rsquo;re at {now} {unit} today.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
          <label style={{ flex: 1 }}>
            <span style={lbl}>Target</span>
            <input
              inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={now != null ? String(Math.round(now - 10)) : ""}
              style={input}
            />
          </label>
          <label style={{ flex: 1.4 }}>
            <span style={lbl}>By</span>
            <input type="date" value={date} min={new Date(ms(today) + 7 * DAY).toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)} style={input} />
          </label>
        </div>

        {reality && (
          <p style={{
            margin: "12px 0 0", fontSize: 12, lineHeight: 1.6, padding: "10px 12px", borderRadius: 11,
            background: reality.tone === "stretch"
              ? "color-mix(in srgb, #B45309 12%, var(--brand-bg))"
              : "var(--brand-bg)",
            color: reality.tone === "stretch" ? "#B45309" : "var(--brand-text-secondary)",
          }}>
            {reality.line}
          </p>
        )}
        {err && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#DC2626", fontWeight: 700 }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btn, background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !value || !date}
            style={{ ...btn, background: "var(--brand-primary)", color: "#fff", opacity: busy || !value ? 0.55 : 1 }}
          >
            {busy ? "Saving…" : existing ? "Save changes" : "Set the goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6,
  textTransform: "uppercase", color: "var(--brand-text-secondary)", marginBottom: 5,
};
const input: React.CSSProperties = {
  width: "100%", padding: "11px 12px", borderRadius: 11, fontSize: 15, fontWeight: 700,
  border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)",
};
const btn: React.CSSProperties = {
  flex: 1, fontSize: 13, fontWeight: 800, padding: "12px 8px", borderRadius: 12,
  border: "none", minHeight: 46, cursor: "pointer",
};
