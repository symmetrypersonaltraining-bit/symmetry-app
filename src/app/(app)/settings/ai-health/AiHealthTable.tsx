"use client";

// The rendering half of /settings/ai-health. See the page for why this exists;
// the short version is that every AI surface in this app fails silently by
// design, so the only way to notice one is dead is to come and look.

import { useState } from "react";
import AiBadge from "@/components/AiBadge";

export interface FeatureHealth {
  key: string;
  label: string;
  surface: "client" | "trainer" | "scheduled";
  dailyLimit: number | null;
  calls: number;
  failures: number;
  recentFailed: number;
  lastOk: string | null;
  lastErrorAt: string | null;
  lastErrorText: string | null;
  model: string | null;
  usd: number;
  medianMs: number | null;
}

const SURFACE_LABEL: Record<FeatureHealth["surface"], string> = {
  client: "Client app",
  trainer: "Your app",
  scheduled: "Runs on a schedule",
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!isFinite(mins)) return "never";
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** never used → failing → quiet → fine. Worst first, because that is the point. */
function rank(f: FeatureHealth): number {
  if (f.calls === 0) return 0;
  if (f.recentFailed > 0) return 1;
  if (!f.lastOk) return 1;
  return 2;
}

export default function AiHealthTable({
  features,
  monthUsd,
  capUsd,
  windowDays,
}: {
  features: FeatureHealth[];
  monthUsd: number;
  capUsd: number;
  windowDays: number;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const never = features.filter((f) => f.calls === 0);
  const failing = features.filter((f) => f.calls > 0 && (f.recentFailed > 0 || !f.lastOk));
  const working = features
    .filter((f) => rank(f) === 2)
    .sort((a, b) => Date.parse(b.lastOk || "0") - Date.parse(a.lastOk || "0"));

  const pct = Math.min(100, Math.round((monthUsd / capUsd) * 100));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
        <AiBadge size={38} mood={never.length || failing.length ? "concerned" : "confident"} title="" />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>AI health</h1>
          <p style={{ fontSize: 12.5, color: "var(--brand-text-secondary)" }}>
            {features.length} surfaces · last {windowDays} days
          </p>
        </div>
      </div>

      {/* Spend against the kill switch. Not the headline — the kill switch has
          never been close — but it is the number that silently turns everything
          off if it is ever reached, so it belongs above the fold. */}
      <div style={CARD}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "var(--brand-text-secondary)" }}>
            THIS MONTH
          </span>
          <span style={{ fontSize: 13, color: "var(--brand-text-secondary)" }}>
            <strong style={{ color: "var(--brand-text)", fontSize: 17 }}>${monthUsd.toFixed(2)}</strong> of ${capUsd}
          </span>
        </div>
        <div style={{ height: 8, background: "var(--brand-bg)", borderRadius: 6, overflow: "hidden" }}>
          <i style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 6, background: pct > 80 ? "#EA580C" : "var(--brand-primary)" }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 7 }}>
          Everything AI switches off on its own at ${capUsd}. Nothing you log stops working if it does.
        </p>
      </div>

      {never.length > 0 && (
        <Section
          title="Never used"
          tone="warn"
          note="No successful call, ever. Either nobody has found it, or it is broken in a way nothing reports — every AI surface here fails quietly on purpose."
          items={never}
          open={open}
          setOpen={setOpen}
        />
      )}

      {failing.length > 0 && (
        <Section
          title="Failing"
          tone="bad"
          note="Recent calls are erroring. Tap one for the last error."
          items={failing}
          open={open}
          setOpen={setOpen}
        />
      )}

      <Section
        title="Working"
        tone="ok"
        note="Most recently used first."
        items={working}
        open={open}
        setOpen={setOpen}
      />
    </div>
  );
}

function Section({
  title, note, tone, items, open, setOpen,
}: {
  title: string;
  note: string;
  tone: "ok" | "warn" | "bad";
  items: FeatureHealth[];
  open: string | null;
  setOpen: (k: string | null) => void;
}) {
  const colour = tone === "bad" ? "#DC2626" : tone === "warn" ? "#CA8A04" : "#16A34A";
  return (
    <div style={{ marginTop: 18 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colour, display: "block" }} />
        <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.7, color: "var(--brand-text)" }}>
          {title.toUpperCase()} · {items.length}
        </h2>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>{note}</p>
      {items.map((f) => (
        <button
          key={f.key}
          onClick={() => setOpen(open === f.key ? null : f.key)}
          style={{ ...CARD, width: "100%", textAlign: "left", marginBottom: 6, cursor: "pointer" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-text)" }}>{f.label}</span>
            <span style={{ fontSize: 11, color: "var(--brand-text-secondary)", whiteSpace: "nowrap" }}>
              {f.calls === 0 ? "no calls" : ago(f.lastOk)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 3 }}>
            {SURFACE_LABEL[f.surface]}
            {f.calls > 0 && ` · ${f.calls} call${f.calls === 1 ? "" : "s"}`}
            {f.failures > 0 && ` · ${f.failures} failed`}
            {f.usd > 0 && ` · $${f.usd.toFixed(2)}`}
          </div>
          {open === f.key && (
            <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed var(--brand-border)", fontSize: 11.5, color: "var(--brand-text-secondary)", lineHeight: 1.6 }}>
              <div>Feature name: <code>{f.key}</code></div>
              <div>Model: {f.model ?? "—"}</div>
              <div>Daily cap per client: {f.dailyLimit == null ? "none" : f.dailyLimit}</div>
              <div>Typical time: {f.medianMs == null ? "—" : `${(f.medianMs / 1000).toFixed(1)}s`}</div>
              {f.lastErrorText && (
                <div style={{ marginTop: 6, color: "#DC2626" }}>
                  Last error ({ago(f.lastErrorAt)}): {f.lastErrorText.slice(0, 240)}
                </div>
              )}
            </div>
          )}
        </button>
      ))}
      {items.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontStyle: "italic" }}>None.</p>
      )}
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: "var(--brand-surface)",
  border: "1px solid var(--brand-border)",
  borderRadius: 14,
  padding: "12px 14px",
};
