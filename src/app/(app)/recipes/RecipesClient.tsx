"use client";

// The recipe library and the builder.
//
// Three ways to get an ingredient's numbers, because people have three
// different problems:
//   DATABASE — it is a packaged food, the catalog knows it. Best answer.
//   AI       — "2 lb ground beef, a can of black beans, 1 cup rice" typed in one
//              go. A guess, and labelled as one.
//   MANUAL   — they have the box in their hand and would rather type it.
// None of them is a mode you have to choose up front; every row can come from a
// different one, and any row can be edited afterwards.

import { useMemo, useState } from "react";
import NumericInput from "@/components/NumericInput";
import { createClient } from "@/lib/supabase/client";
import { preferredServing, parseServingOption, type ServingOption } from "@/lib/nutrition/foodResolve";

/**
 * The portion a catalogue row should be ADDED at, and how much of the row's
 * stored macros that is.
 *
 * Same chooser the AI path and the manual food sheet use, so all three agree
 * about what one of something is. Before 4 Sep this screen used
 * `serving_desc` — the literal string "100 g" on 574,372 of the 574,650 rows —
 * so "add almonds" put 579 cal and 50 g of fat into a recipe under the label
 * "1 100 g", and "butter" put 717.
 */
function catalogPortion(h: { serving_grams: number | null; serving_options: ServingOption[] | null }):
  { amount: number; unit: string; scale: number } {
  const base = Number(h.serving_grams) > 0 ? Number(h.serving_grams) : 100;
  const one = preferredServing((h.serving_options || []).map(parseServingOption));
  // No countable serving anywhere on the row: grams, said out loud. Honest, and
  // the amount box scales it from here because base_amount travels with it.
  if (!one) return { amount: base, unit: "g", scale: 1 };
  return { amount: 1, unit: one.label, scale: one.gramsEach / base };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

import { useCoach } from "@/lib/useCoach";
import AiBadge from "@/components/AiBadge";
import {
  perServing, recipeTotals, validateRecipe, visibilityLabel,
  type RecipeIngredient, type RecipeVisibility,
} from "@/lib/recipes";

interface RecipeRow {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  instructions: string[] | null;
  image_url: string | null;
  tags: string[] | null;
  visibility: RecipeVisibility;
  review_note: string | null;
  total_kcal: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  clients?: { name: string | null } | null;
}

type Tab = "mine" | "shared" | "pending";

const r0 = (n: number) => Math.round(Number(n) || 0);

export default function RecipesClient({
  clientId, isTrainer, mine, shared, pending, planMeals,
}: {
  clientId: string | null;
  isTrainer: boolean;
  planMeals: { id: string; name: string; position: number }[];
  mine: RecipeRow[];
  shared: RecipeRow[];
  pending: RecipeRow[];
}) {
  const { firstName: coachFirstName } = useCoach();
  const [tab, setTab] = useState<Tab>(mine.length || !shared.length ? "mine" : "shared");
  const [editing, setEditing] = useState<RecipeRow | "new" | null>(null);
  const [viewing, setViewing] = useState<RecipeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const card: React.CSSProperties = {
    background: "var(--brand-surface)", border: "1px solid var(--brand-border)",
    borderRadius: 16, padding: 12, marginBottom: 10,
  };

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setMsg((json && json.error) || "That didn't work — try again."); return false; }
      window.location.reload();
      return true;
    } catch {
      setMsg("Network error — check your connection.");
      return false;
    } finally { setBusy(false); }
  }

  if (editing) {
    return (
      <RecipeBuilder
        clientId={clientId}
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => window.location.reload()}
      />
    );
  }

  const list = tab === "mine" ? mine : tab === "shared" ? shared : pending;

  return (
    <div style={{ padding: "14px 12px 90px", background: "var(--brand-bg)", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: "var(--brand-text)", margin: 0 }}>🍳 Recipes</h1>
        <button
          onClick={() => setEditing("new")}
          style={{
            fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 12, border: "none",
            background: "var(--brand-primary)", color: "#fff", cursor: "pointer",
          }}
        >
          ＋ New recipe
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {([["mine", `Mine (${mine.length})`], ["shared", `Shared library (${shared.length})`],
           ...(isTrainer ? [["pending", `To approve (${pending.length})`]] : [])] as [Tab, string][])
          .map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                fontSize: 12, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                border: "1px solid " + (tab === k ? "var(--brand-primary)" : "var(--brand-border)"),
                background: tab === k ? "var(--brand-primary)" : "var(--brand-card)",
                color: tab === k ? "#fff" : "var(--brand-text)",
              }}>
              {label}
            </button>
          ))}
      </div>

      {msg && <div style={{ ...card, borderColor: "#ef4444", fontSize: 12.5, color: "var(--brand-text)" }}>{msg}</div>}

      {list.length === 0 ? (
        <div style={{ ...card, fontSize: 12.5, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
          {tab === "mine"
            ? "Nothing here yet. Build one — type the ingredients in and let the app work out the numbers, or pull them from the food database."
            : tab === "shared"
            ? `No shared recipes yet. Build one you're proud of and send it to ${coachFirstName}.`
            : "Nothing waiting on you."}
        </div>
      ) : (
        list.map((rec) => {
          const per = { kcal: r0(rec.total_kcal / (Number(rec.servings) || 1)), p: r0(rec.total_protein / (Number(rec.servings) || 1)), c: r0(rec.total_carbs / (Number(rec.servings) || 1)), f: r0(rec.total_fats / (Number(rec.servings) || 1)) };
          const vis = visibilityLabel(rec.visibility);
          return (
            <div key={rec.id} style={card}>
              <button onClick={() => setViewing(rec)} style={{ display: "flex", gap: 10, width: "100%", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                {rec.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rec.image_url} alt="" style={{ width: 58, height: 58, borderRadius: 12, objectFit: "cover", flex: "0 0 auto" }} />
                ) : (
                  <RecipeCover title={rec.title} size={58} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>{rec.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
                    {per.kcal} cal · {per.p}P / {per.c}C / {per.f}F <span style={{ opacity: 0.7 }}>per serving</span>
                    {rec.servings ? ` · makes ${rec.servings}` : ""}
                  </div>
                  {tab !== "shared" && (
                    <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 4, color: vis.tone === "good" ? "#3fb883" : vis.tone === "wait" ? "#e0a83e" : vis.tone === "warn" ? "#ef4444" : "var(--brand-text-secondary)" }}>
                      {vis.text}
                    </div>
                  )}
                  {tab === "pending" && rec.clients?.name && (
                    <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 2 }}>from {rec.clients.name}</div>
                  )}
                </div>
              </button>

              {rec.review_note && rec.visibility === "rejected" && (
                <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 8, paddingLeft: 10, borderLeft: "2px solid var(--brand-border)" }}>
                  {coachFirstName}: {rec.review_note}
                </div>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {tab === "pending" ? (
                  <>
                    <button disabled={busy} onClick={() => act({ action: "review", id: rec.id, approve: true })}
                      style={{ flex: 1, fontSize: 12.5, fontWeight: 800, padding: "9px 10px", borderRadius: 10, border: "none", background: "#3fb883", color: "#fff", cursor: "pointer" }}>
                      ✓ Publish to everyone
                    </button>
                    <button disabled={busy} onClick={() => {
                      const note = window.prompt("Anything to tell them? (optional)") ?? "";
                      act({ action: "review", id: rec.id, approve: false, note });
                    }}
                      style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", cursor: "pointer" }}>
                      Not yet
                    </button>
                  </>
                ) : tab === "mine" ? (
                  <>
                    <button onClick={() => setEditing(rec)}
                      style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text)", cursor: "pointer" }}>
                      Edit
                    </button>
                    {rec.visibility === "submitted" ? (
                      <button disabled={busy} onClick={() => act({ action: "unsubmit", id: rec.id })}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", cursor: "pointer" }}>
                        Withdraw
                      </button>
                    ) : rec.visibility !== "public" ? (
                      <button disabled={busy} onClick={() => act({ action: "submit", id: rec.id })}
                        style={{ flex: 1, fontSize: 12.5, fontWeight: 800, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--brand-primary)", background: "transparent", color: "var(--brand-primary)", cursor: "pointer" }}>
                        Send to {coachFirstName}
                      </button>
                    ) : null}
                    <button disabled={busy} onClick={() => { if (confirm("Delete this recipe?")) act({ action: "delete", id: rec.id }); }}
                      style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "#ef4444", cursor: "pointer" }}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      {viewing && <RecipeView rec={viewing} planMeals={planMeals} onClose={() => setViewing(null)} />}
    </div>
  );
}


/**
 * A cover for a recipe with no photo.
 *
 * Deterministic from the title, so the same dish always looks the same, and two
 * dishes next to each other never look identical. Beats a grey box, costs
 * nothing to store, and a real photo replaces it the moment somebody uploads
 * one from the builder.
 */
function RecipeCover({ title, size }: { title: string; size: number }) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const initials = title.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: size > 100 ? 14 : 12, flex: "0 0 auto",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(140deg, hsl(${hue} 62% 42%), hsl(${(hue + 42) % 360} 58% 28%))`,
      color: "rgba(255,255,255,0.92)", fontWeight: 900, letterSpacing: ".02em",
      fontSize: Math.max(13, Math.round(size * 0.34)),
    }}>
      {initials || "🍽"}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RecipeView({ rec, planMeals, onClose }: { rec: RecipeRow; planMeals: { id: string; name: string; position: number }[]; onClose: () => void }) {
  const { firstName: coachFirstName } = useCoach();
  const [ings, setIngs] = useState<{ food: string; amount: number | null; unit: string | null; protein: number; carbs: number; fats: number; source: string; note: string | null }[] | null>(null);
  const supabase = useMemo(() => createClient(), []);
  // Logging it is the point of having cooked it.
  const [howMany, setHowMany] = useState("1");
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);

  // Make it a meal, not just today's entry. Which slot is the client's call —
  // this is their plan, and a recipe that lands in the wrong one is worse than
  // no button. The server clones a trainer-authored plan before writing, so
  // {coachFirstName}'s original is archived and restorable, never overwritten.
  const [slot, setSlot] = useState("");
  const [planning, setPlanning] = useState(false);
  // The permanent change asks once. See the confirm block below for why.
  const [confirming, setConfirming] = useState(false);

  async function addToPlan() {
    if (!slot || planning || !ings) return;
    setPlanning(true);
    try {
      const s = Number(rec.servings) || 1;
      // Scaled to ONE serving: a plan meal is what you eat, not what the pot
      // holds. A six-serving chili dropped in whole would triple somebody's day.
      const items = ings.map((i) => ({
        food: i.food,
        amount: i.amount == null ? null : Math.round((i.amount / s) * 100) / 100,
        unit: i.unit,
        protein: Math.round(Number(i.protein) / s),
        carbs: Math.round(Number(i.carbs) / s),
        fats: Math.round(Number(i.fats) / s),
      }));
      const res = await fetch("/api/nutrition/plan-edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealId: slot, items }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setLogged((json && json.error) || "Couldn't add that to your plan."); return; }
      setLogged(json.cloned
        ? `Swapped into your plan from today on 📌 — ${coachFirstName}'s version is saved under Plan versions if you want it back`
        : "Swapped into your plan from today on 📌 — the old version is under Plan versions if you want it back");
    } catch {
      setLogged("Network error — check your connection.");
    } finally { setPlanning(false); }
  }

  async function logIt() {
    if (logging) return;
    setLogging(true);
    try {
      const res = await fetch("/api/recipes/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: rec.id, servings: Number(howMany) || 1 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setLogged((json && json.error) || "Couldn't log that."); return; }
      setLogged(`Logged — ${json.macros.kcal} cal added to today ✓`);
    } catch {
      setLogged("Network error — check your connection.");
    } finally { setLogging(false); }
  }

  useMemo(() => {
    (async () => {
      const { data } = await supabase.from("recipe_ingredients")
        // base_amount MUST be read back. Without it a saved recipe re-opens with
        // no basis, every line silently reverts to scale 1, and the totals on the
        // card stop matching the totals that were saved.
        .select("food, amount, unit, base_amount, protein, carbs, fats, source, note")
        .eq("recipe_id", rec.id).order("position");
      setIngs((data as never[]) || []);
    })();
  }, [rec.id, supabase]);

  const s = Number(rec.servings) || 1;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(8,10,18,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "90dvh", overflowY: "auto", background: "var(--brand-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}>
        {rec.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rec.image_url} alt="" style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 14, marginBottom: 12 }} />
        ) : (
          <div style={{ marginBottom: 12 }}><RecipeCover title={rec.title} size={180} /></div>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--brand-text)", margin: "0 0 4px" }}>{rec.title}</h2>
        <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginBottom: 10 }}>
          Makes {rec.servings}
          {rec.prep_minutes ? ` · ${rec.prep_minutes} min prep` : ""}
          {rec.cook_minutes ? ` · ${rec.cook_minutes} min cook` : ""}
        </div>
        {rec.description && <p style={{ fontSize: 13, color: "var(--brand-text)", lineHeight: 1.5, marginTop: 0 }}>{rec.description}</p>}

        <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".07em", color: "var(--brand-text-secondary)", marginBottom: 4 }}>PER SERVING</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-text)" }}>
            {r0(rec.total_kcal / s)} cal · {r0(rec.total_protein / s)}P / {r0(rec.total_carbs / s)}C / {r0(rec.total_fats / s)}F
          </div>
          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 3 }}>
            Whole recipe: {r0(rec.total_kcal)} cal · {r0(rec.total_protein)}P / {r0(rec.total_carbs)}C / {r0(rec.total_fats)}F
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 6 }}>Ingredients</div>
        {(ings || []).map((i, n) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: "var(--brand-text)", padding: "5px 0", borderBottom: "1px solid var(--brand-border)" }}>
            <span>
              {[i.amount, i.unit, i.food].filter(Boolean).join(" ")}
              {i.source === "ai" && <span title="Estimated" style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: "#e0a83e" }}>EST</span>}
              {i.note && <span style={{ display: "block", fontSize: 10.5, color: "var(--brand-text-secondary)" }}>{i.note}</span>}
            </span>
            <span style={{ color: "var(--brand-text-secondary)", fontSize: 11.5, whiteSpace: "nowrap" }}>
              {r0(i.protein)}/{r0(i.carbs)}/{r0(i.fats)}
            </span>
          </div>
        ))}

        {(rec.instructions || []).length > 0 && (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", margin: "14px 0 6px" }}>Method</div>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {(rec.instructions || []).map((step, n) => (
                <li key={n} style={{ fontSize: 13, color: "var(--brand-text)", lineHeight: 1.55, marginBottom: 6 }}>{step}</li>
              ))}
            </ol>
          </>
        )}

        {/* Eat what you cooked. Lands in today as an extra, exactly like the
            in-app "add something" flow — same row shape, so the ring, the day
            total and the adherence percentage all treat it identically. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
          <label style={{ flex: "0 0 auto", fontSize: 11.5, color: "var(--brand-text-secondary)", fontWeight: 700 }}>
            SERVINGS
            <input value={howMany} onChange={(e) => setHowMany(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
              style={{ width: 62, marginLeft: 8, padding: "9px 8px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", fontSize: 13, textAlign: "center" }} />
          </label>
          <button onClick={logIt} disabled={logging}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: logging ? "default" : "pointer", opacity: logging ? 0.6 : 1 }}>
            {logging ? "Logging…" : "🍽️ Log this to today"}
          </button>
        </div>
        {/* THE PERMANENT ONE, AND IT HAS TO LOOK IT.
            Claudine, 13 Aug: "Omfg i replaced one of the meals for a recipe i
            made and the clanker changed ALL the meals not only for today but
            days before." She was not trying to change her plan. She was trying
            to eat this tonight.
            The control she used said "Put it in my plan as…" and "📌 Add" — two
            phrases that describe adding something to a list. What it actually
            did was REPLACE that meal's contents in her plan, from that day
            forward, every day. Nothing on it said replace, nothing said every
            day, and there was no confirm step.
            So: the word is now REPLACE, it names the meal and says how long
            before it will fire, and it asks once. "Log this to today" above is
            the thing most people actually want, and stays the easy one. */}
        {planMeals.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--brand-border)" }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--brand-text-secondary)", margin: "0 0 6px" }}>
              Or make it part of your plan
            </p>
            <select
              value={slot}
              onChange={(e) => { setSlot(e.target.value); setConfirming(false); }}
              style={{ width: "100%", padding: "10px 8px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", fontSize: 12.5 }}
            >
              <option value="">Choose the meal it replaces…</option>
              {planMeals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {slot && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--brand-primary)", background: "transparent", color: "var(--brand-primary)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
              >
                📌 Replace it in my plan — every day
              </button>
            )}
            {slot && confirming && (
              <div style={{ marginTop: 8, padding: 11, borderRadius: 12, background: "var(--brand-card)", border: "1px solid var(--brand-primary)" }}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--brand-text)" }}>
                  This swaps <b>{planMeals.find((m) => m.id === slot)?.name}</b> for <b>{rec.title}</b> in your
                  plan from today on — not just today. Days you&rsquo;ve already logged stay exactly as they were,
                  and your old plan is kept under <b>Plan versions</b> if you want it back.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setConfirming(false)}
                    style={{ flex: 1, padding: "10px 8px", borderRadius: 11, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                    Never mind
                  </button>
                  <button onClick={() => { setConfirming(false); addToPlan(); }} disabled={planning}
                    style={{ flex: 1, padding: "10px 8px", borderRadius: 11, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: planning ? "default" : "pointer", opacity: planning ? 0.6 : 1 }}>
                    {planning ? "Saving…" : "Yes, replace it"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {logged && <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-primary)", textAlign: "center", marginTop: 8 }}>{logged}</p>}

        <button onClick={onClose} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RecipeBuilder({
  clientId, initial, onCancel, onSaved,
}: {
  clientId: string | null;
  initial: RecipeRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { firstName: coachFirstName } = useCoach();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [servings, setServings] = useState(String(initial?.servings ?? 4));
  const [prep, setPrep] = useState(initial?.prep_minutes ? String(initial.prep_minutes) : "");
  const [cook, setCook] = useState(initial?.cook_minutes ? String(initial.cook_minutes) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url || null);
  const [steps, setSteps] = useState<string[]>(initial?.instructions?.length ? initial.instructions : [""]);
  const [ings, setIngs] = useState<RecipeIngredient[]>([]);
  const [loaded, setLoaded] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI + database helpers
  const [aiText, setAiText] = useState("");
  // "Build me one" — Megan Gautreaux, 14 Aug: "would be cool to put in
  // ingredients and have it make the recipe to fit macros."
  const [have, setHave] = useState("");
  const [tP, setTP] = useState("");
  const [tC, setTC] = useState("");
  const [tF, setTF] = useState("");
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildResult, setBuildResult] = useState<{ onTarget: boolean; per: { protein: number; carbs: number; fats: number; kcal: number } } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{
    id: string; name: string; serving_desc: string | null;
    protein: number; carbs: number; fats: number;
    // Read since 4 Sep. Without these the builder could only ever add a food
    // "per 100 g" — the literal serving_desc on 574,372 of 574,650 rows — so
    // "almonds" arrived as 579 cal and "butter" as 717, labelled "1 100 g".
    serving_grams: number | null; serving_options: ServingOption[] | null;
  }[]>([]);

  useMemo(() => {
    if (!initial) return;
    (async () => {
      const { data } = await supabase.from("recipe_ingredients")
        .select("food, amount, unit, base_amount, protein, carbs, fats, food_id, source, note")
        .eq("recipe_id", initial.id).order("position");
      setIngs((data as RecipeIngredient[]) || []);
      setLoaded(true);
    })();
  }, [initial, supabase]);

  const totals = recipeTotals(ings);
  const per = perServing(ings, Number(servings));

  function setIng(i: number, patch: Partial<RecipeIngredient>) {
    setIngs((prev) => prev.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  }
  const addBlank = () => setIngs((p) => [...p, { food: "", amount: null, unit: null, protein: 0, carbs: 0, fats: 0, source: "manual" }]);

  async function runAi() {
    if (!aiText.trim() || aiBusy) return;
    setAiBusy(true); setAiNote(null); setError(null);
    try {
      const res = await fetch("/api/recipes/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ingredients", text: aiText, title }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError((json && json.error) || "Couldn't read that."); return; }
      setIngs((prev) => [...prev, ...(json.ingredients || [])]);
      if (json.servings && !initial) setServings(String(json.servings));
      setAiNote(json.notes || "Added — every one of these is an estimate. Check anything that looks off.");
      setAiText("");
    } catch { setError("Network error."); }
    finally { setAiBusy(false); }
  }

  // Fills the SAME builder the manual and estimate paths fill. The point is
  // that a generated recipe is not a different kind of object — it lands in the
  // form, every quantity is editable, and it is not saved until they say so.
  async function buildForMacros() {
    if (!have.trim() || buildBusy) return;
    const target = { protein: Number(tP) || 0, carbs: Number(tC) || 0, fats: Number(tF) || 0 };
    if (!target.protein && !target.carbs && !target.fats) {
      setError("Put in at least one macro to aim at."); return;
    }
    setBuildBusy(true); setError(null); setAiNote(null); setBuildResult(null);
    try {
      const res = await fetch("/api/recipes/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create", have, target,
          servings: Number(servings) > 0 ? Number(servings) : 1,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError((json && json.error) || "Couldn't build that one."); return; }

      const r = json.recipe || {};
      if (r.title) setTitle(r.title);
      if (r.description) setDescription(r.description);
      if (r.servings) setServings(String(r.servings));
      if (r.prep_minutes) setPrep(String(r.prep_minutes));
      if (r.cook_minutes) setCook(String(r.cook_minutes));
      if (Array.isArray(r.instructions) && r.instructions.length) setSteps(r.instructions);
      // REPLACES the ingredient list rather than appending. This wrote the
      // whole recipe; adding it underneath whatever was already there would
      // double every quantity and quietly ruin the macros it just solved for.
      setIngs(json.ingredients || []);
      setBuildResult({ onTarget: !!json.onTarget, per: json.perServing });
      setAiNote(json.notes || null);
      setHave("");
    } catch { setError("Network error."); }
    finally { setBuildBusy(false); }
  }

  async function search(text: string) {
    setQ(text);
    if (text.trim().length < 2) { setHits([]); return; }
    const { data } = await supabase.from("food_catalog")
      .select("id, name, serving_desc, protein, carbs, fats, serving_grams, serving_options, verified")
      // Verified rows first. The raw ilike order puts a 242 kcal / 14 g-fat
      // "banana" and an 89 kcal "chicken breast" at the top — the exact two
      // rows that made the AI path stop trusting name matching in August.
      .ilike("name", `%${text.trim()}%`)
      .order("verified", { ascending: false })
      .limit(8);
    setHits((data as never[]) || []);
  }

  async function onImage(file: File | null) {
    if (!file || !clientId) return;
    setBusy(true);
    try {
      const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error: upErr } = await supabase.storage.from("recipe-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) { setError("Couldn't upload that photo."); return; }
      const { data } = supabase.storage.from("recipe-photos").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } finally { setBusy(false); }
  }

  async function save(thenSubmit: boolean) {
    const recipe = {
      id: initial?.id,
      title, description, servings: Number(servings) || 1,
      prep_minutes: prep ? Number(prep) : null,
      cook_minutes: cook ? Number(cook) : null,
      instructions: steps, image_url: imageUrl, tags: [],
      ingredients: ings,
    };
    const problems = validateRecipe(recipe);
    if (problems.length) { setError(problems[0]); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", recipe }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError((json && json.error) || "Couldn't save that."); return; }
      if (thenSubmit && json.id) {
        await fetch("/api/recipes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit", id: json.id }),
        });
      }
      onSaved();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 10,
    border: "1px solid var(--brand-border)", background: "var(--brand-card)",
    color: "var(--brand-text)", fontSize: 13, fontFamily: "inherit",
  };
  const box: React.CSSProperties = {
    background: "var(--brand-surface)", border: "1px solid var(--brand-border)",
    borderRadius: 16, padding: 12, marginBottom: 12,
  };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: ".07em", color: "var(--brand-text-secondary)" };

  if (!loaded) return <div style={{ padding: 20, color: "var(--brand-text-secondary)" }}>Loading…</div>;

  return (
    <div style={{ padding: "14px 12px 100px", background: "var(--brand-bg)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: "var(--brand-text)", margin: 0 }}>
          {initial ? "Edit recipe" : "New recipe"}
        </h1>
        <button onClick={onCancel} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", cursor: "pointer" }}>
          Cancel
        </button>
      </div>

      <div style={box}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name — e.g. Steph's turkey chili" style={{ ...input, fontWeight: 800, fontSize: 15, marginBottom: 8 }} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="A line about it (optional)" style={{ ...input, resize: "none", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1 }}><span style={lbl}>SERVINGS</span>
            <input value={servings} onChange={(e) => setServings(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={input} />
          </label>
          <label style={{ flex: 1 }}><span style={lbl}>PREP MIN</span>
            <input value={prep} onChange={(e) => setPrep(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={input} />
          </label>
          <label style={{ flex: 1 }}><span style={lbl}>COOK MIN</span>
            <input value={cook} onChange={(e) => setCook(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={input} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />
          ) : null}
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-primary)", cursor: "pointer" }}>
            {imageUrl ? "Change photo" : "📷 Add a photo"}
            <input type="file" accept="image/*" onChange={(e) => onImage(e.target.files?.[0] || null)} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* ── Ingredients ─────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)" }}>Ingredients</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-primary)" }}>
            {per.kcal} cal / serving
          </div>
        </div>

        {ings.map((it, i) => (
          <div key={i} style={{ border: "1px solid var(--brand-border)", borderRadius: 12, padding: 8, marginBottom: 8, background: "var(--brand-card)" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input value={it.food} onChange={(e) => setIng(i, { food: e.target.value })} placeholder={`Ingredient ${i + 1}`} style={input} />
              <button onClick={() => setIngs((p) => p.filter((_, n) => n !== i))} aria-label="Remove"
                style={{ flex: "0 0 auto", width: 32, height: 32, borderRadius: 9, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "#ef4444", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {/* Claudine, 11 Aug: "cant type decimals in weight for each
                  ingredient." These were controlled straight off the number,
                  so Number("1.") came back 1 and React re-rendered the box as
                  "1" — deleting the decimal point on the keystroke that typed
                  it. NumericInput keeps the text while editing. */}
              <NumericInput value={it.amount} onChange={(n) => setIng(i, { amount: n })} placeholder="amt" style={{ ...input, flex: 0.8 }} />
              <input value={it.unit ?? ""} onChange={(e) => setIng(i, { unit: e.target.value })} placeholder="unit" style={{ ...input, flex: 0.9 }} />
              <NumericInput value={it.protein} emptyAsZero onChange={(n) => setIng(i, { protein: n ?? 0 })} placeholder="P" style={{ ...input, flex: 0.7, textAlign: "center" }} />
              <NumericInput value={it.carbs} emptyAsZero onChange={(n) => setIng(i, { carbs: n ?? 0 })} placeholder="C" style={{ ...input, flex: 0.7, textAlign: "center" }} />
              <NumericInput value={it.fats} emptyAsZero onChange={(n) => setIng(i, { fats: n ?? 0 })} placeholder="F" style={{ ...input, flex: 0.7, textAlign: "center" }} />
            </div>
            {it.source === "ai" && (
              <div style={{ fontSize: 10.5, color: "#e0a83e", fontWeight: 700, marginTop: 5 }}>
                ESTIMATED{it.note ? ` — ${it.note}` : ""}
              </div>
            )}
          </div>
        ))}

        <button onClick={addBlank} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px dashed var(--brand-border)", background: "transparent", color: "var(--brand-text)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          ＋ Add a row by hand
        </button>

        {/* From the food database */}
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>FROM THE FOOD DATABASE</span>
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search foods…" style={{ ...input, marginTop: 4 }} />
          {hits.map((h) => (
            <button key={h.id}
              onClick={() => {
                const q = catalogPortion(h);
                setIngs((p) => [...p, {
                  food: h.name, amount: q.amount, unit: q.unit, base_amount: q.amount,
                  protein: r1((Number(h.protein) || 0) * q.scale),
                  carbs: r1((Number(h.carbs) || 0) * q.scale),
                  fats: r1((Number(h.fats) || 0) * q.scale),
                  food_id: h.id, source: "database",
                }]);
                setQ(""); setHits([]);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginTop: 6, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-card)", color: "var(--brand-text)", fontSize: 12.5, cursor: "pointer" }}>
              {h.name} <span style={{ color: "var(--brand-text-secondary)" }}>· {(() => {
                // The portion it will actually be ADDED at. It used to advertise
                // serving_desc — "100 g" on 574,372 of 574,650 rows — and then
                // add the per-100 g macros under that label.
                const q = catalogPortion(h);
                return `${q.amount} ${q.unit}`;
              })()} · {(() => {
                const q = catalogPortion(h);
                return `${r0(Number(h.protein) * q.scale)}P/${r0(Number(h.carbs) * q.scale)}C/${r0(Number(h.fats) * q.scale)}F`;
              })()}</span>
            </button>
          ))}
        </div>

        {/* BUILD ME ONE — the thing Megan asked for. Sits ABOVE "type it out"
            because it is the more useful of the two when you are standing in
            the kitchen with food and a number to hit. */}
        <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid var(--brand-primary)", background: "color-mix(in srgb, var(--brand-primary) 6%, transparent)" }}>
          <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
            <AiBadge size={17} mood="nutrition" title="" />BUILD ME ONE THAT HITS MY MACROS
          </span>
          <textarea value={have} onChange={(e) => setHave(e.target.value)} rows={3}
            placeholder={"What have you got?\nground beef, rice, black beans, peppers, greek yogurt, olive oil"}
            style={{ ...input, marginTop: 4, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input value={tP} onChange={(e) => setTP(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder="Protein" style={{ ...input, textAlign: "center" }} />
            <input value={tC} onChange={(e) => setTC(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder="Carbs" style={{ ...input, textAlign: "center" }} />
            <input value={tF} onChange={(e) => setTF(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder="Fat" style={{ ...input, textAlign: "center" }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 4 }}>
            Grams, <strong>per serving</strong> — it uses the servings number above.
          </p>
          <button onClick={buildForMacros} disabled={buildBusy || !have.trim()}
            style={{ width: "100%", marginTop: 8, padding: 11, borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: buildBusy ? "default" : "pointer", opacity: buildBusy || !have.trim() ? 0.55 : 1 }}>
            {buildBusy ? "Working out quantities…" : "Build me a recipe →"}
          </button>

          {buildResult && (
            /* The honest bit. The numbers shown are computed from the
               ingredient rows, not taken from the AI — it has been caught
               reporting the target back instead of what it wrote. If it missed,
               it says so here rather than leaving them to do the subtraction. */
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10,
              background: buildResult.onTarget ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.14)",
              border: `1px solid ${buildResult.onTarget ? "rgba(34,197,94,0.45)" : "rgba(245,158,11,0.5)"}` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: buildResult.onTarget ? "#16a34a" : "#b45309" }}>
                {buildResult.onTarget ? "✓ Lands on your target" : "⚠ Close, but not quite"}
              </p>
              <p style={{ fontSize: 12, color: "var(--brand-text)", marginTop: 2 }}>
                Per serving: <strong>{buildResult.per.protein}P · {buildResult.per.carbs}C · {buildResult.per.fats}F</strong> · {buildResult.per.kcal} cal
              </p>
              <p style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 3, lineHeight: 1.4 }}>
                Worked out from the ingredients below, not guessed. Change the amount on a
                database or estimated row and the totals follow; on a row you typed by hand the
                P/C/F you entered IS the line.
              </p>
            </div>
          )}
        </div>

        {/* AI */}
        <div style={{ marginTop: 14 }}>
          <span style={lbl}>OR JUST TYPE IT OUT</span>
          <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} rows={3}
            placeholder={"2 lb ground turkey\n1 can black beans\n1 cup white rice\n2 tbsp olive oil"}
            style={{ ...input, marginTop: 4, resize: "vertical" }} />
          <button onClick={runAi} disabled={aiBusy || !aiText.trim()}
            style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid var(--brand-primary)", background: "transparent", color: "var(--brand-primary)", fontWeight: 800, fontSize: 13, cursor: aiBusy ? "default" : "pointer", opacity: aiBusy || !aiText.trim() ? 0.55 : 1 }}>
            {aiBusy ? "Working out the numbers…" : "Work out the numbers for me"}
          </button>
          {aiNote && (
            <p style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 6, lineHeight: 1.45, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <AiBadge size={17} mood="nutrition" title="" />{aiNote}
            </p>
          )}
        </div>
      </div>

      {/* ── Method ──────────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-text)", marginBottom: 8 }}>Method</div>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
            <span style={{ ...lbl, paddingTop: 10, width: 16, flex: "0 0 auto" }}>{i + 1}</span>
            <textarea value={s} rows={2}
              onChange={(e) => setSteps((p) => p.map((x, n) => (n === i ? e.target.value : x)))}
              placeholder={i === 0 ? "Brown the turkey with the onion…" : "Next step…"}
              style={{ ...input, resize: "vertical" }} />
            {steps.length > 1 && (
              <button onClick={() => setSteps((p) => p.filter((_, n) => n !== i))} aria-label="Remove step"
                style={{ flex: "0 0 auto", width: 32, height: 32, borderRadius: 9, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "#ef4444", cursor: "pointer" }}>×</button>
            )}
          </div>
        ))}
        <button onClick={() => setSteps((p) => [...p, ""])}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px dashed var(--brand-border)", background: "transparent", color: "var(--brand-text)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          ＋ Add a step
        </button>
      </div>

      {/* ── Totals + save ───────────────────────────────────────────── */}
      <div style={{ ...box, position: "sticky", bottom: 84, boxShadow: "0 -6px 20px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginBottom: 8 }}>
          <b style={{ color: "var(--brand-text)" }}>{per.kcal} cal · {per.protein}P / {per.carbs}C / {per.fats}F</b> per serving
          <span style={{ opacity: 0.75 }}> · whole recipe {totals.kcal} cal</span>
        </div>
        {error && <p style={{ fontSize: 12.5, color: "#ef4444", fontWeight: 600, margin: "0 0 8px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save(false)} disabled={busy}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save to my library"}
          </button>
          <button onClick={() => save(true)} disabled={busy}
            style={{ flex: "0 0 auto", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--brand-primary)", background: "transparent", color: "var(--brand-primary)", fontWeight: 800, fontSize: 13, cursor: busy ? "default" : "pointer" }}>
            Save + send to {coachFirstName}
          </button>
        </div>
      </div>
    </div>
  );
}
