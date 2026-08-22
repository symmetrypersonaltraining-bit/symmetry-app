/**
 * Is a feature live for a particular trainer?
 *
 * TWO switches have to agree, and keeping them apart is the point:
 *
 *   app_flags.<feature>          — the whole business. Owner only.
 *   trainer_features.<feature>   — this trainer's own app.
 *
 * Dustin, 21 Aug: trainers get "access to decide what bots and cards they use
 * and how they function on their app only". Before this, Coach Bot and the
 * birthday bot were global: a second trainer switching Coach Bot off would
 * have silenced it in Dustin's group chat as well, with nothing recording who
 * did it.
 *
 * The AND means the owner can take a feature off the whole business without
 * visiting three settings screens, and a trainer can decline one the owner has
 * enabled. Neither can force the other's hand.
 *
 * A missing per-trainer row reads as ON, so a trainer added tomorrow behaves
 * normally rather than silently getting nothing. The app-wide flag keeps the
 * opposite default — unreadable means OFF — because that one is the safety
 * switch and this one is a preference.
 */

export type TrainerFeature = "coachbot" | "birthdays" | "weekly_focus";

interface Rpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function trainerFeatureOn(
  db: unknown,
  trainerId: string | null | undefined,
  feature: TrainerFeature,
): Promise<boolean> {
  if (!trainerId) return false;
  try {
    const { data, error } = await (db as Rpc).rpc("trainer_feature_on", {
      p_trainer: trainerId,
      p_feature: feature,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
