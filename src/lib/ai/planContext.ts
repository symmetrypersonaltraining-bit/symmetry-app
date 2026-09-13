/**
 * THE STANDING PLAN, AS THE ACTION EXTRACTOR SEES IT.
 *
 * Dustin, 13 Sep, in the coach chat:
 *
 *   him:  "Different one. Look at tomorrow thats the lunch meal im eating
 *          tonight for dinner"
 *   it:   "I can only see today's meals. What's in tomorrow's planned lunch
 *          that you want to eat for dinner tonight?"
 *
 * It was telling the truth. `/nutrition-ai/act` gets DAY CONTEXT — the meals of
 * the day being viewed — and nothing else, and its own prompt sent anything
 * about "a DIFFERENT day, the plan itself, or targets" to chat rather than to
 * an action. So the most ordinary thing a person does with a standing plan,
 * eating tomorrow's lunch tonight, was the one thing it made him type out by
 * hand.
 *
 * His plan is six meals that repeat every day, sitting in meal_items. This is
 * that, rendered for a prompt.
 *
 * ── NO NUMBERS IN HERE, DELIBERATELY ─────────────────────────────────────────
 *
 * The plan's own macros are real, and they are still the wrong thing to put in
 * front of the model: a figure in a prompt is a figure it will quote back at a
 * client, and every number this app says has to come out of the pricer so it
 * can be traced. Foods and amounts only. When the swap is actually made, the
 * items go through priceNamedFoods like everything else.
 */

export interface PlanContextItem {
  food: string;
  amount: number | string | null;
  unit: string | null;
  is_unlimited?: boolean | null;
}

export interface PlanContextMeal {
  position: number;
  name: string;
  timing: string | null;
  items: PlanContextItem[];
}

/** One meal per line: `M3 Lunch (10:30–11:00 AM): chicken 200 g · rice 200 g`. */
export function planContextBlock(meals: PlanContextMeal[]): string {
  if (!meals.length) {
    return "The client has no standing meal plan on file. Only the day's own meals can be acted on.";
  }
  const lines = meals
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => {
      const items = (m.items || [])
        .map((i) => {
          const amt = i.amount == null || i.amount === "" ? null : String(i.amount);
          const measure = i.is_unlimited
            ? `${amt ?? ""}${amt && i.unit ? " " : ""}${i.unit ?? ""} (unlimited)`.trim()
            : [amt, i.unit].filter(Boolean).join(" ");
          return measure ? `${i.food} ${measure}` : i.food;
        })
        .join(" · ");
      const when = m.timing ? ` (${m.timing})` : "";
      return `M${m.position} ${m.name}${when}: ${items || "(no items)"}`;
    });
  return lines.join("\n");
}
