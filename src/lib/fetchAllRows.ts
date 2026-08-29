/**
 * fetchAllRows — read a whole set out of PostgREST without silently losing most
 * of it.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * 24 Aug 2026, 8:04am: "major issue here. we just programmed through i think
 * sept, maybe firther?? where the hell did that progrsmking go!?"
 *
 * Nothing had gone anywhere. The coverage check fetched every scheduled workout
 * past the horizon and worked the answer out in the browser. That was 1,611
 * rows. **PostgREST caps every response at 1,000 rows no matter what .limit()
 * asks for**, so 611 never arrived, and nine clients appeared to have no
 * programming at all. No error. No warning. Just a smaller number.
 *
 * That was the third time the same shape had bitten in a week — the weekly
 * digest's "ever logs food" (1,829 rows) and /settings/ai-health (1,365) were
 * already over the line and already wrong. And the previous attempt to fix the
 * coverage row had been to raise `.limit()` from 5,000 to 20,000: a bigger
 * number the server has never once honoured.
 *
 * ── THE TWO HONEST OPTIONS ───────────────────────────────────────────────────
 *
 * 1. Aggregate in SQL. Best when the answer is a number or one row per thing —
 *    `programming_coverage()` does this. Prefer it.
 * 2. If the caller genuinely needs every row, ASK FOR THEM A PAGE AT A TIME.
 *    That is this function.
 *
 * What is NOT an option is a large `.limit()`. A limit above the server's cap
 * is not a bound, it is a comment that reads like one.
 *
 * ── WHY IT THROWS ────────────────────────────────────────────────────────────
 *
 * Every one of these faults was silent, and that is the whole cost of them: a
 * screen that says something false looks exactly like a screen that says
 * something true. So when this hits its ceiling it throws, loudly, naming the
 * caller. A crash gets fixed the day it happens. A quietly short list gets
 * fixed after somebody spends a morning believing they lost a month of work.
 */

/** PostgREST's hard ceiling on a single response. Not configurable from here. */
export const POSTGREST_MAX_ROWS = 1000;

/** The default guard. Any read genuinely bigger than this wants SQL, not paging. */
export const DEFAULT_ROW_CEILING = 50_000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * The shape every Supabase/PostgREST query builder satisfies once the filters
 * are on it. Deliberately structural rather than importing the client's types:
 * this is called from browser components, route handlers and the service-role
 * admin client alike, and all three build the same thing.
 */
export type PageableQuery<T> = {
  range(from: number, to: number): PromiseLike<PageResult<T>>;
};

export type FetchAllOptions = {
  /**
   * Names the call site in errors. Required, and not decorative — the point of
   * throwing is that whoever reads the message knows which screen lied.
   */
  label: string;
  /** Rows per request. Never above the server cap; above it the extra is ignored. */
  pageSize?: number;
  /** Refuse rather than page forever. */
  max?: number;
  /**
   * Only for a query whose ordering is not visible at the call site — an RPC
   * with its own ORDER BY, say. Say where the order comes from; the CI guard
   * accepts this in place of a `.order()` it can see, and accepts nothing else.
   */
  orderedBy?: string;
};

/**
 * Read every row a query matches.
 *
 * `makeQuery` is a FACTORY, not a query. A PostgREST builder is single-use once
 * awaited, so each page needs a fresh one — passing the builder itself would
 * work for page one and then quietly return the same page forever, which is the
 * exact class of bug this file is here to end.
 *
 * The query it returns MUST have a deterministic `.order()` on it. Without one
 * Postgres may hand back pages in any order it likes, so a row can appear in
 * two pages and another in none — a paged read with no ORDER BY is not more
 * correct than a truncated one, only slower.
 */
export async function fetchAllRows<T>(
  makeQuery: () => PageableQuery<T>,
  opts: FetchAllOptions,
): Promise<T[]> {
  const pageSize = Math.min(opts.pageSize ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS);
  const max = opts.max ?? DEFAULT_ROW_CEILING;
  const out: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`fetchAllRows(${opts.label}): ${error.message}`);
    }
    const page = data || [];
    out.push(...page);
    // A short page is the end of the set. A full one might be, so we ask again;
    // one extra empty round trip is the price of never guessing.
    if (page.length < pageSize) return out;
    if (out.length >= max) {
      throw new Error(
        `fetchAllRows(${opts.label}): more than ${max} rows. ` +
          `Aggregate this in SQL instead of reading it into the browser.`,
      );
    }
  }
}

/**
 * Read every row, but NEVER take the screen down doing it.
 *
 * ⚠️ WHY THIS EXISTS, 29 Aug 2026, and it is my regression.
 *
 * The truncation sweep replaced reads shaped
 *
 *     const { data } = await supabase.from("scheduled_workouts")...
 *
 * with `await fetchAllRows(...)`. That fixed the trainer calendar showing
 * nothing since 29 July -- and quietly changed the failure mode from
 * DEGRADE to DIE. The old form destructured `data` and ignored `error`
 * entirely, so a failed read rendered an empty calendar and the page still
 * came up. fetchAllRows THROWS, and an uncaught throw in a server component
 * is a 500 on the trainer's main screen.
 *
 * On the client side it was worse: two `.then()` chains had no `.catch()`,
 * because the old builder never rejected. A rejection there leaves the
 * loading flag set and the page spins forever.
 *
 * Dustin, 29 Aug: "coaches app won't pull up, its staying on client view."
 *
 * So: correctness of the DATA is worth paging for; correctness of the PAGE is
 * not worth dying for. This returns whatever arrived, reports the failure, and
 * lets the screen render. A short calendar is a bug. A blank app is an outage.
 */
export async function fetchAllRowsSafe<T>(
  makeQuery: () => PageableQuery<T>,
  opts: FetchAllOptions,
): Promise<T[]> {
  try {
    return await fetchAllRows<T>(makeQuery, opts);
  } catch (e) {
    // Deliberately console.error and carry on: the caller renders with what it
    // has. Silence here would recreate the original bug -- a short read that
    // looks like a complete one -- so it must be loud in the log and harmless
    // on screen.
    console.error(`fetchAllRowsSafe(${opts.label}) failed; rendering with partial data`, e);
    return [];
  }
}
