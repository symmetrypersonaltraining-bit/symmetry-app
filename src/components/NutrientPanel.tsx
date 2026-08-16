"use client";

/**
 * The 33-nutrient panel — the screen that "full nutrients" was missing.
 *
 * Dustin, app_feedback 4 Aug: "Need to track full nutrients on everywhere in
 * food logger."
 *
 * ── What was actually missing ─────────────────────────────────────────────
 *
 * Nothing in the data. The registry (`lib/nutrition/nutrients.ts`) defines all
 * 33 with units, groups and reference values. `readNutrients`, `addNutrients`,
 * `scaleNutrients` and `sumNutrients` all exist and are tested. So do
 * `planMealNutrientMap` and `logConsumedNutrientMap`, which compute the whole
 * panel for a meal and for a log row.
 *
 * Both of those functions were called from NOWHERE. The pipeline captured
 * micronutrients, carried them through the AI, and stored them on every write —
 * and not one of them was ever rendered to a client. This component is the
 * missing end.
 *
 * ── The rule that matters most here ───────────────────────────────────────
 *
 * NULL IS UNKNOWN, NEVER ZERO. The registry states it and this component has to
 * honour it visually: a food we have no vitamin K figure for shows a dash, not
 * "0 mcg". Rendering unknown as zero tells a client they ate none of something
 * when the truth is we do not know, and a daily total built from those silently
 * understates every time.
 *
 * That matters more than usual right now — the micronutrient backfill is at
 * ~9% and roughly 180 hours from done, so MOST foods have no micros today. A
 * panel that reads zeros would be actively misleading for months.
 */

import {
  NUTRIENTS,
  NUTRIENT_GROUP_ORDER,
  NUTRIENT_GROUP_LABEL,
  countKnownNutrients,
  roundNutrient,
  type NutrientMap,
  type NutrientDef,
} from "@/lib/nutrition/nutrients";

/** Formatted value, or null when we genuinely do not know. */
export function formatNutrient(def: NutrientDef, value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${roundNutrient(def.key, value)} ${def.unit}`;
}

/**
 * Percent of the adult reference value, when there is one.
 *
 * Deliberately a general figure and never presented as advice — Dustin sets
 * real targets per client in macro_targets, and this is a "is that a lot?"
 * hint, nothing more.
 */
export function percentOfReference(def: NutrientDef, value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || !def.dailyReference) return null;
  return Math.round((value / def.dailyReference) * 100);
}

export default function NutrientPanel({
  nutrients,
  title = "Nutrients",
  /** Hide groups where nothing is known, instead of showing rows of dashes. */
  hideEmptyGroups = true,
}: {
  nutrients: NutrientMap | null | undefined;
  title?: string;
  hideEmptyGroups?: boolean;
}) {
  const map = nutrients || {};
  const known = countKnownNutrients(map);

  // Nothing known at all. Say why rather than showing 33 dashes — most foods
  // have no micros yet and a client should understand that as "not measured",
  // not as "this meal has no nutrients in it".
  if (known === 0) {
    return (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 14,
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>{title}</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)", marginTop: 6 }}>
          No nutrient data for these foods yet. Micronutrients are filled in as the
          food database catches up — the macros above are unaffected.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>{title}</p>
        <span style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
          {known} of {NUTRIENTS.length} known
        </span>
      </div>

      {NUTRIENT_GROUP_ORDER.map((group) => {
        const defs = NUTRIENTS.filter((n) => n.group === group);
        const anyKnown = defs.some((d) => map[d.key] != null);
        if (hideEmptyGroups && !anyKnown) return null;

        return (
          <div key={group} style={{ marginTop: 12 }}>
            <p
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--brand-text-secondary)",
                margin: "0 0 6px",
              }}
            >
              {NUTRIENT_GROUP_LABEL[group]}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {defs.map((def) => {
                const raw = map[def.key];
                const shown = formatNutrient(def, raw);
                const pct = percentOfReference(def, raw);
                return (
                  <div
                    key={def.key}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--brand-text)" }}>{def.label}</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                      {/* A DASH, never a zero. See the header. */}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: shown ? 700 : 400,
                          color: shown ? "var(--brand-text)" : "var(--brand-text-secondary)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {shown ?? "—"}
                      </span>
                      {pct != null && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--brand-text-secondary)",
                            minWidth: 38,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {pct}%
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--brand-text-secondary)", marginTop: 12 }}>
        Percentages are against a general adult reference, not your targets. A dash
        means the food database has no figure for it — not zero.
      </p>
    </div>
  );
}
