// Guard: local JWT verification is correct, and — more important — it FAILS
// CLOSED to "ask Supabase" rather than ever letting something through.
//
// Written 15 Aug 2026 during the Supabase auth outage, and shipped unattended,
// which is only defensible because of the property the last group of tests
// pins: this code can refuse, but it can never wrongly admit, and when it
// refuses the caller just does what it did before.
//
// Real ES256 keys are generated here with Web Crypto and real tokens are signed
// with them, so the signature path is exercised for real rather than stubbed.
// A verifier tested only against a fake verifier is not tested.
//
// MUTATION-TESTED. Every one of these was confirmed to fail against a
// deliberately broken implementation before being trusted:
//   - accepting header.alg instead of pinning ES256   → "alg is pinned" fails
//   - skipping the signature check                    → "a forged token" fails
//   - dropping the issuer check                       → "wrong issuer" fails
//   - dropping REFRESH_MARGIN_SECONDS                 → "near expiry" fails
//   - sorting cookie chunks as strings                → "ten chunks" fails

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyAccessToken,
  extractAccessToken,
  supabaseAuthUrls,
  REFRESH_MARGIN_SECONDS,
  __setJwksCacheForTests,
} from "../../src/lib/auth/verifyJwt";

const ISSUER = "https://proj.supabase.co/auth/v1";
const JWKS_URL = "https://proj.supabase.co/auth/v1/.well-known/jwks.json";
const KID = "test-key-1";

const b64url = (b: Uint8Array | string) => {
  const bin = typeof b === "string" ? b : String.fromCharCode(...b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function makeKeypair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

async function publicJwk(pair: CryptoKeyPair, kid: string | undefined = KID) {
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Record<string, unknown>;
  return { kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y, alg: "ES256", ...(kid ? { kid } : {}) };
}

async function sign(
  pair: CryptoKeyPair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "ES256", typ: "JWT", kid: KID }
) {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      new TextEncoder().encode(`${h}.${p}`)
    )
  );
  return `${h}.${p}.${b64url(sig)}`;
}

const NOW = 1_786_770_000_000; // fixed; Date.now() would make these flaky
const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  sub: "aaec8ad5-9d01-4110-84f7-a32fa08e8192",
  email: "symmetrypersonaltraining@gmail.com",
  role: "authenticated",
  aud: "authenticated",
  iat: Math.floor(NOW / 1000) - 60,
  exp: Math.floor(NOW / 1000) + 3600,
  ...over,
});

const verify = (token: string, now = NOW) =>
  verifyAccessToken(token, { jwksUrl: JWKS_URL, issuer: ISSUER, now, fetchImpl: notFetched });

// The JWKS cache is primed in each test, so a real fetch means the cache was
// missed — which is itself a failure worth catching.
const notFetched: typeof fetch = async () => {
  throw new Error("network must not be touched: the JWKS cache was primed");
};

// ── the happy path ─────────────────────────────────────────────────────────

test("verifyAccessToken: a genuine token verifies, with its claims", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  const got = await verify(await sign(pair, goodClaims()));
  assert.ok(got, "a genuine token must verify");
  assert.equal(got.sub, "aaec8ad5-9d01-4110-84f7-a32fa08e8192");
  assert.equal(got.email, "symmetrypersonaltraining@gmail.com");
});

// ── it must never wrongly admit ────────────────────────────────────────────

test("verifyAccessToken: a token signed by the WRONG key is refused", async () => {
  const real = await makeKeypair();
  const attacker = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(real)], NOW);
  // Correct claims, correct kid, correct everything — except who signed it.
  assert.equal(await verify(await sign(attacker, goodClaims())), null);
});

test("verifyAccessToken: a tampered payload is refused", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  const token = await sign(pair, goodClaims());
  const [h, , s] = token.split(".");
  const swapped = b64url(JSON.stringify(goodClaims({ email: "someone.else@example.com" })));
  assert.equal(await verify(`${h}.${swapped}.${s}`), null);
});

test("verifyAccessToken: alg is PINNED to ES256, not read from the token", async () => {
  // The classic JWT confusion bug is letting the token choose its own algorithm.
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  for (const alg of ["none", "HS256", "RS256", "ES384"]) {
    const token = await sign(pair, goodClaims(), { alg, typ: "JWT", kid: KID });
    assert.equal(await verify(token), null, `alg "${alg}" must be refused`);
  }
});

test("verifyAccessToken: a token from another project is refused", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  const token = await sign(pair, goodClaims({ iss: "https://someone-else.supabase.co/auth/v1" }));
  assert.equal(await verify(token), null);
});

test("verifyAccessToken: an expired token is refused", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  const token = await sign(pair, goodClaims({ exp: Math.floor(NOW / 1000) - 1 }));
  assert.equal(await verify(token), null);
});

test("verifyAccessToken: a token with no subject is refused", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  assert.equal(await verify(await sign(pair, goodClaims({ sub: undefined }))), null);
});

test("verifyAccessToken: rubbish in is null out, never a throw", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  for (const junk of ["", "a", "a.b", "a.b.c", "....", "not-a-jwt-at-all"]) {
    assert.equal(await verify(junk), null, `"${junk}" must be null, not a throw`);
  }
});

// ── the refresh window ─────────────────────────────────────────────────────

test("verifyAccessToken: a token near expiry is refused so it gets REFRESHED", async () => {
  // Not a security rule — a correctness one. Riding the fast path until the
  // token dies would swap an outage for a quieter bug: sessions that stop
  // refreshing and dump people at /login.
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair)], NOW);
  const nearly = await sign(pair, goodClaims({ exp: Math.floor(NOW / 1000) + REFRESH_MARGIN_SECONDS - 10 }));
  assert.equal(await verify(nearly), null, "inside the refresh margin it must defer to getUser()");

  const comfortable = await sign(pair, goodClaims({ exp: Math.floor(NOW / 1000) + REFRESH_MARGIN_SECONDS + 60 }));
  assert.ok(await verify(comfortable), "outside the margin it must verify locally");
});

// ── key selection ──────────────────────────────────────────────────────────

test("verifyAccessToken: the key is chosen by kid, not by being first", async () => {
  const wrong = await makeKeypair();
  const right = await makeKeypair();
  __setJwksCacheForTests(
    [await publicJwk(wrong, "other-key"), await publicJwk(right, KID)],
    NOW
  );
  assert.ok(await verify(await sign(right, goodClaims())), "must pick the key matching kid");
});

test("verifyAccessToken: an unknown kid is refused rather than guessed at", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests([await publicJwk(pair, "some-other-kid")], NOW);
  assert.equal(await verify(await sign(pair, goodClaims())), null);
});

// ── the cookie ─────────────────────────────────────────────────────────────

test("extractAccessToken: reads the real live cookie shape", async () => {
  // Shape confirmed against the deployed app: name sb-<ref>-auth-token, value
  // "base64-" + base64(JSON), JSON carrying access_token among others.
  const session = { access_token: "the.jwt.here", token_type: "bearer", refresh_token: "r", user: {} };
  const value = "base64-" + btoa(JSON.stringify(session));
  assert.equal(
    extractAccessToken([{ name: "sb-mkfiginpiesospsnktea-auth-token", value }]),
    "the.jwt.here"
  );
});

test("extractAccessToken: chunks are joined in NUMERIC order, not string order", async () => {
  // Sorting as strings puts ".10" between ".1" and ".2". The result decodes to
  // nonsense and this file silently stops helping the very sessions that are
  // large enough to be chunked.
  const session = { access_token: "x".repeat(40) };
  const whole = "base64-" + btoa(JSON.stringify(session));
  const size = Math.ceil(whole.length / 11);
  const cookies = [];
  for (let i = 0; i < 11; i++) {
    cookies.push({
      name: `sb-proj-auth-token.${i}`,
      value: whole.slice(i * size, (i + 1) * size),
    });
  }
  // Hand them over shuffled, the way a cookie jar might.
  const shuffled = [...cookies].sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(extractAccessToken(shuffled), "x".repeat(40));
});

test("extractAccessToken: no cookie, or a shape we do not know, is null", () => {
  assert.equal(extractAccessToken([]), null);
  assert.equal(extractAccessToken([{ name: "unrelated", value: "x" }]), null);
  assert.equal(extractAccessToken([{ name: "sb-proj-auth-token", value: "not-base64-json" }]), null);
  assert.equal(
    extractAccessToken([{ name: "sb-proj-auth-token", value: "base64-" + btoa("{}") }]),
    null,
    "valid JSON with no access_token is still null"
  );
});

// ── the safety property the whole design rests on ──────────────────────────

test("a JWKS that cannot be fetched degrades to null, it does not throw", async () => {
  const pair = await makeKeypair();
  __setJwksCacheForTests(null);
  const token = await sign(pair, goodClaims());
  const got = await verifyAccessToken(token, {
    jwksUrl: JWKS_URL,
    issuer: ISSUER,
    now: NOW,
    fetchImpl: (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch,
  });
  assert.equal(got, null, "callers fall back to getUser(); nothing may escape as an exception");
});

test("supabaseAuthUrls: builds the issuer and JWKS url, trailing slash or not", () => {
  for (const url of ["https://proj.supabase.co", "https://proj.supabase.co/"]) {
    const { jwksUrl, issuer } = supabaseAuthUrls(url);
    assert.equal(issuer, ISSUER);
    assert.equal(jwksUrl, JWKS_URL);
  }
});
