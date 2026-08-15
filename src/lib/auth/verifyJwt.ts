// Verify the session token OURSELVES, so Supabase Auth stops being able to
// take the whole app down.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// `supabase.auth.getUser()` makes a NETWORK CALL to Supabase's auth service on
// every request. That is deliberate on their part — it asks the server to
// validate rather than trusting the cookie — and the price is that Supabase
// Auth being reachable AND fast is a hard requirement for this app to render
// anything at all.
//
// On 15 Aug 2026, from 03:32 UTC, it was neither. `GET /user` took 10–65
// seconds and returned 504 for roughly half of all calls, with our database
// idle, the cron jobs off, and 33 rows in `auth.users`. Nothing in this app was
// broken and none of its 1,032 tests could have caught it. Clients got a white
// Vercel error page.
//
// Dustin approved this fix during the incident: "ill say yes now, get it done."
//
// ── WHAT IT DOES ───────────────────────────────────────────────────────────
//
// The access token in the session cookie is a JWT signed by Supabase with
// ES256, and Supabase publishes the public key at a JWKS endpoint. So the
// signature can be checked HERE, with Web Crypto, with no network call in the
// request path. Confirmed against the live project before a line was written:
// alg ES256, kty EC, one key, kid present, issuer
// https://mkfiginpiesospsnktea.supabase.co/auth/v1.
//
// ── THE TRADE-OFF, STATED PLAINLY ──────────────────────────────────────────
//
// A locally-verified token is trusted until it EXPIRES. A session revoked
// server-side — a password change, a forced sign-out — keeps working until
// then. Supabase's default access token life is one hour.
//
// That is a real cost and it was Dustin's call to accept, against an app that
// otherwise goes dark whenever a third party has a bad morning. It is bounded
// by the token lifetime, and shortening that lifetime shortens the window.
//
// ── AND WHY IT CANNOT LOCK ANYONE OUT ──────────────────────────────────────
//
// This is a FAST PATH, not a replacement. Every caller falls back to
// `getUser()` when this returns null, and it returns null for every unhappy
// case: no cookie, a cookie shape it does not recognise, no matching key, a bad
// signature, a token near expiry. So the worst outcome of a bug in this file is
// the behaviour the app had before it — one network call — and never a locked
// door. That property is what made it safe to ship unattended, and any change
// here has to preserve it.

/** The claims we actually use. Supabase sends more; we do not need them. */
export interface VerifiedClaims {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iss: string;
  aud?: string | string[];
}

/**
 * Refresh the token this many seconds before it expires.
 *
 * Inside this window we deliberately fall back to `getUser()` so that
 * @supabase/ssr performs its refresh and rotates the cookie. Without it a
 * session would ride the fast path until the token died and then bounce the
 * person to /login — trading an outage for a worse, quieter bug.
 */
export const REFRESH_MARGIN_SECONDS = 300;

const B64URL = /-/g;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(B64URL, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

/**
 * Pull the access token out of the Supabase session cookie.
 *
 * @supabase/ssr writes `sb-<ref>-auth-token` holding `base64-` + base64(JSON),
 * and CHUNKS it across `.0`, `.1`, … when it is long. Verified against the live
 * cookie: one chunk at 2,955 characters, keys access_token / token_type /
 * expires_in / expires_at / refresh_token / user.
 *
 * Chunks must be joined in NUMERIC order. Sorting them as strings puts `.10`
 * between `.1` and `.2` and produces base64 that decodes to nonsense — which
 * would fail closed to `getUser()` rather than break anything, but would also
 * silently discard the entire benefit of this file for exactly the biggest
 * sessions.
 */
export function extractAccessToken(cookies: { name: string; value: string }[]): string | null {
  const parts = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  if (!parts.length) return null;

  const chunkIndex = (n: string): number => {
    const m = n.match(/\.(\d+)$/);
    return m ? Number(m[1]) : -1;
  };
  const joined = parts
    .slice()
    .sort((a, b) => chunkIndex(a.name) - chunkIndex(b.name))
    .map((c) => c.value)
    .join("");

  try {
    let v = decodeURIComponent(joined);
    if (v.startsWith("base64-")) {
      const bin = atob(v.slice(7));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      v = new TextDecoder().decode(bytes);
    }
    const obj = JSON.parse(v) as { access_token?: unknown };
    return typeof obj.access_token === "string" && obj.access_token ? obj.access_token : null;
  } catch {
    // An unfamiliar cookie shape is not an error worth surfacing — it is a
    // reason to ask Supabase the slow way.
    return null;
  }
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  crv?: string;
  x?: string;
  y?: string;
}

let jwksCache: { keys: Jwk[]; at: number } | null = null;
/**
 * How long a fetched key set is reused.
 *
 * Long, because these keys rotate rarely and the entire point of this file is
 * to keep the network out of the request path. A rotation is handled by the
 * miss path below, not by expiry.
 */
export const JWKS_TTL_MS = 60 * 60 * 1000;

/** Test seam. Also lets a caller warm the cache at build time if it ever wants to. */
export function __setJwksCacheForTests(keys: Jwk[] | null, at = Date.now()): void {
  jwksCache = keys ? { keys, at } : null;
}

async function getKeys(jwksUrl: string, fetchImpl: typeof fetch): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetchImpl(jwksUrl);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys || [];
  jwksCache = { keys, at: Date.now() };
  return keys;
}

/**
 * Verify an access token locally. Returns its claims, or null.
 *
 * NULL IS NOT AN ERROR SIGNAL. It means "I could not answer this myself", and
 * every caller responds by asking Supabase. Do not change a null here into a
 * thrown error or a redirect.
 */
export async function verifyAccessToken(
  token: string,
  opts: { jwksUrl: string; issuer: string; now?: number; fetchImpl?: typeof fetch }
): Promise<VerifiedClaims | null> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;

    const header = JSON.parse(b64urlToString(h)) as { alg?: string; kid?: string };
    // ES256 only. Accepting `alg` from the token and dispatching on it is the
    // classic JWT confusion bug — an attacker picks the algorithm. We know what
    // Supabase signs with, so anything else is refused outright.
    if (header.alg !== "ES256") return null;

    const claims = JSON.parse(b64urlToString(p)) as VerifiedClaims;
    const now = Math.floor((opts.now ?? Date.now()) / 1000);

    // Checked BEFORE the signature: cheap, and it is the common case that sends
    // us to getUser() for a refresh.
    if (typeof claims.exp !== "number" || claims.exp - REFRESH_MARGIN_SECONDS <= now) return null;
    if (claims.iss !== opts.issuer) return null;
    if (!claims.sub) return null;

    const keys = await getKeys(opts.jwksUrl, opts.fetchImpl ?? fetch);
    let jwk = keys.find((k) => k.kid && k.kid === header.kid);
    if (!jwk && keys.length === 1 && !header.kid) jwk = keys[0];
    if (!jwk || jwk.kty !== "EC") return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: jwk.crv || "P-256", x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: jwk.crv || "P-256" },
      false,
      ["verify"]
    );

    // JWS ES256 signatures are raw r‖s, which is exactly what Web Crypto's
    // ECDSA wants — no DER unwrapping.
    // `.buffer` on both: TypeScript's BufferSource does not accept the
    // Uint8Array<ArrayBufferLike> that TextEncoder and our decoder produce
    // under this lib target, and the underlying buffer is what Web Crypto reads
    // anyway. Both arrays are freshly allocated and not views into a larger
    // buffer, so passing the whole buffer is exact, not a widening.
    const sigBytes = b64urlToBytes(s);
    const signed = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sigBytes.buffer as ArrayBuffer,
      signed.buffer as ArrayBuffer
    );
    if (!ok) return null;

    return claims;
  } catch {
    return null;
  }
}

/** The JWKS and issuer for a Supabase project URL. */
export function supabaseAuthUrls(supabaseUrl: string): { jwksUrl: string; issuer: string } {
  const base = supabaseUrl.replace(/\/+$/, "");
  return {
    jwksUrl: `${base}/auth/v1/.well-known/jwks.json`,
    issuer: `${base}/auth/v1`,
  };
}
