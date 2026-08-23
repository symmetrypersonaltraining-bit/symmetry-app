// Whose hands are allowed on a meal plan.
//
// Dustin: "I need to be able to change any part of my meal plan through that
// project and the app should never change it period. i plan it, I schedule it,
// i change it all from that project period... the app does not design my mesl
// plan, I do."
//
// The real enforcement is in the database: guard_locked_meal_plan() rejects
// every PostgREST-originated write to meal_plans / meals / meal_items /
// macro_targets for a client whose clients.plan_locked is true, and lets a
// direct database session (the Command Center chat) through. See migration
// 20260822g. That trigger is the guarantee; it holds even if a future route
// forgets this file exists.
//
// This helper exists only so the person on the screen gets a sentence instead
// of a 500. Check it, return the message, skip the write.

const LOCKED_MESSAGE =
  "This meal plan is written outside the app and can't be changed here. Ask for the change in the Command Center chat and it will show up in the app.";

type MaybeSingle = PromiseLike<{ data: unknown; error?: unknown }>;
type LockDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => MaybeSingle };
    };
  };
};

/** True when this client's plan is authored outside the app. */
export async function planIsLocked(db: unknown, clientId: string | null | undefined): Promise<boolean> {
  if (!clientId) return false;
  const { data } = await (db as LockDb).from("clients").select("plan_locked").eq("id", clientId).maybeSingle();
  return (data as { plan_locked?: boolean } | null)?.plan_locked === true;
}

/** The sentence to show when a write is refused. */
export function lockedPlanMessage(): string {
  return LOCKED_MESSAGE;
}
