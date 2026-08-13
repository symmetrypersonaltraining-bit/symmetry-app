// Distance as a tracked field.
//
// Dustin, 12 Aug: "suitecase do distance". Loaded carries are programmed by
// distance, not reps — but `distance` was never a field the logger could
// render. Setting it on a movement produced a set row with NO input boxes at
// all, so it had to be wired before it could be used.
//
// UNITS. set_logs.distance_meters already existed and is metric; everything on
// screen in this app is imperial ("Central time, imperial on screen"). Storing
// feet in a column named _meters is the kind of silent unit bug that surfaces
// months later in a chart nobody can explain, so the conversion lives here,
// once, and the column stays honest.

const FEET_PER_METRE = 3.280839895013123;

/** Feet as typed → metres for the database. Null for anything unusable. */
export function feetToMeters(text: string | null | undefined): number | null {
  if (text == null) return null;
  const t = String(text).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  // Three decimals is well under a centimetre and keeps the round trip exact
  // to the tenth of a foot the input actually offers.
  return Math.round((n / FEET_PER_METRE) * 1000) / 1000;
}

/** Metres from the database → feet for the input. "" when unknown. */
export function metersToFeet(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(Number(m))) return "";
  const ft = Number(m) * FEET_PER_METRE;
  // A carry is logged to the foot; .0 on every value is noise.
  const rounded = Math.round(ft * 10) / 10;
  return String(Number.isInteger(rounded) ? rounded : rounded);
}
