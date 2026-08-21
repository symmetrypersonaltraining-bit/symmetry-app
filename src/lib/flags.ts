/**
 * app_flags, read in one place.
 *
 * Before this, every consumer wrote its own
 * `.from("app_flags").select("enabled").eq("key", k).maybeSingle()` and
 * interpreted a missing row differently each time. The rule here is the safe
 * one and it is not negotiable: a flag that cannot be read is OFF. A missing
 * row is OFF. An error is OFF. A feature nobody has switched on must never
 * appear because a query failed.
 */

export type FlagKey = "nudges_live" | "coachbot_live" | "birthday_bot_live" | "trainer_tutorial_live";

interface FlagDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * `db` is deliberately `unknown` at the boundary. The generated Supabase
 * client types are deep enough that checking a real client against a
 * structural interface makes tsc bail with "type instantiation is excessively
 * deep" in any file that also runs a few queries of its own. One cast here
 * means every caller passes its client without ceremony.
 */
export async function readFlag(db: unknown, key: FlagKey): Promise<boolean> {
  try {
    const { data, error } = await (db as FlagDb)
      .from("app_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error) return false;
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}
