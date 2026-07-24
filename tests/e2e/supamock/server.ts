// ============================================================================
// supamock — a minimal local Supabase emulator (GoTrue + PostgREST + Storage)
// for E2E tests.
//
// WHY THIS EXISTS: this build environment's egress proxy hard-blocks
// *.supabase.co (403 CONNECT, org policy), so neither the Next server nor the
// browser can reach the real DEV project (giiovjfpbuzmrvpdglhv) from here.
// The suite therefore runs full-stack against this in-memory emulator seeded
// with the SAME fixtures (same UUIDs/rows) that were seeded into the real dev
// project. Set E2E_SUPABASE=real (with network access) to run the identical
// specs against real dev Supabase instead — see playwright.config.ts.
//
// Implements just enough of the wire protocol for @supabase/ssr + supabase-js:
//   POST /auth/v1/token?grant_type=password|refresh_token
//   GET  /auth/v1/user            POST /auth/v1/logout
//   /rest/v1/:table — select (incl. embedded resources), eq/neq/gt/gte/lt/lte/
//                     ilike/in filters, order, limit, insert, upsert
//                     (on_conflict + merge-duplicates), patch, delete,
//                     single-object Accept handling.
//   POST /storage/v1/object/**    (accepts anything, returns a Key)
//   GET  /__test/health           POST /__test/reset
// ============================================================================

import http from "node:http";
import crypto from "node:crypto";
import { buildSeedTables, AUTH_USERS } from "./seed";

const PORT = Number(process.env.SUPAMOCK_PORT || 54999);
const JWT_SECRET = "supamock-jwt-secret";

let tables = buildSeedTables();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}
function signJwt(payload: Row): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function decodeJwt(token: string): Row | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}
function userJson(u: { id: string; email: string }) {
  const t = "2026-01-01T00:00:00.000Z";
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: t, phone: "", confirmed_at: t, last_sign_in_at: t,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { email: u.email, email_verified: true, sub: u.id },
    identities: [], created_at: t, updated_at: t, is_anonymous: false,
  };
}
function sessionJson(u: { id: string; email: string }) {
  const expiresIn = 60 * 60 * 24 * 7;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const access_token = signJwt({
    iss: `http://localhost:${PORT}/auth/v1`, sub: u.id, aud: "authenticated",
    exp: expiresAt, iat: Math.floor(Date.now() / 1000), email: u.email,
    role: "authenticated", session_id: crypto.randomUUID(), is_anonymous: false,
    app_metadata: { provider: "email" }, user_metadata: { email: u.email },
  });
  return {
    access_token, token_type: "bearer", expires_in: expiresIn, expires_at: expiresAt,
    refresh_token: `rt-${u.id}`, user: userJson(u),
  };
}

// --- mini-PostgREST query engine -------------------------------------------
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "apikey"]);

interface Filter { col: string; op: string; val: string }

function parseFilters(sp: URLSearchParams): Filter[] {
  const out: Filter[] = [];
  for (const [key, raw] of sp.entries()) {
    if (RESERVED.has(key)) continue;
    const dot = raw.indexOf(".");
    if (dot < 0) continue;
    out.push({ col: key, op: raw.slice(0, dot), val: raw.slice(dot + 1) });
  }
  return out;
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === String(a) && String(nb) === String(b)) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case "eq": return String(v) === f.val && v != null;
    case "neq": return String(v) !== f.val;
    case "gt": return v != null && cmp(v, coerce(f.val)) > 0;
    case "gte": return v != null && cmp(v, coerce(f.val)) >= 0;
    case "lt": return v != null && cmp(v, coerce(f.val)) < 0;
    case "lte": return v != null && cmp(v, coerce(f.val)) <= 0;
    case "is": return f.val === "null" ? v == null : String(v) === f.val;
    case "in": {
      const list = f.val.replace(/^\(/, "").replace(/\)$/, "").split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
      return list.includes(String(v));
    }
    case "ilike": {
      const rx = new RegExp("^" + f.val.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".") + "$", "i");
      return rx.test(String(v ?? ""));
    }
    default: return true;
  }
}
function coerce(s: string): unknown {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s; // dates compare as strings
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

// Embedded resources — relationship map (child table + FK on the child).
const RELS: Record<string, Record<string, { table: string; fk: string }>> = {
  meal_plans: { meals: { table: "meals", fk: "meal_plan_id" } },
  meals: { meal_items: { table: "meal_items", fk: "meal_id" } },
};

// Split a select string on top-level commas.
function splitSelect(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function projectRow(table: string, row: Row, select: string): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const part of splitSelect(select)) {
    const m = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/);
    if (m) {
      const [, rel, sub] = m;
      const relDef = RELS[table]?.[rel];
      if (!relDef) { out[rel] = []; continue; }
      const kids = (tables[relDef.table] || []).filter((k) => String(k[relDef.fk]) === String(row.id));
      out[rel] = kids.map((k) => projectRow(relDef.table, k, sub));
    } else if (part === "*") {
      Object.assign(out, row);
    } else {
      out[part] = row[part as keyof typeof row] ?? null;
    }
  }
  return out;
}

function runSelect(table: string, sp: URLSearchParams): Row[] {
  let rows = [...(tables[table] || [])];
  for (const f of parseFilters(sp)) rows = rows.filter((r) => matches(r, f));
  const order = sp.get("order");
  if (order) {
    const clauses = order.split(",").map((o) => {
      const bits = o.split(".");
      return { col: bits[0], desc: bits.includes("desc") };
    });
    rows.sort((a, b) => {
      for (const c of clauses) {
        const d = cmp(a[c.col], b[c.col]);
        if (d !== 0) return c.desc ? -d : d;
      }
      return 0;
    });
  }
  const limit = sp.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  const select = sp.get("select") || "*";
  return rows.map((r) => projectRow(table, r, select));
}

function newDefaults(table: string, row: Row): Row {
  const out: Row = { ...row };
  if (out.id == null) out.id = crypto.randomUUID();
  if (out.created_at == null) out.created_at = new Date().toISOString();
  if (table === "meal_adherence_logs" && out.macros_pending == null) out.macros_pending = false;
  return out;
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    ...headers,
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") return send(res, 204, null);

    // ---- test control ----
    if (path === "/__test/health") return send(res, 200, { ok: true });
    if (path === "/__test/reset" && req.method === "POST") {
      tables = buildSeedTables();
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/dump") {
      const t = url.searchParams.get("table") || "";
      return send(res, 200, tables[t] || null);
    }

    // ---- auth (GoTrue) ----
    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = JSON.parse((await readBody(req)) || "{}");
      if (grant === "password") {
        const u = AUTH_USERS.find((x) => x.email === body.email && x.password === body.password);
        if (!u) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        return send(res, 200, sessionJson(u));
      }
      if (grant === "refresh_token") {
        const rt = String(body.refresh_token || "");
        const u = AUTH_USERS.find((x) => rt === `rt-${x.id}`);
        if (!u) return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
        return send(res, 200, sessionJson(u));
      }
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    if (path === "/auth/v1/user" && req.method === "GET") {
      const auth = String(req.headers.authorization || "");
      const token = auth.replace(/^Bearer\s+/i, "");
      const payload = token ? decodeJwt(token) : null;
      const u = payload && AUTH_USERS.find((x) => x.id === payload.sub);
      if (!u) return send(res, 401, { code: 401, msg: "invalid JWT" });
      return send(res, 200, userJson(u));
    }
    if (path === "/auth/v1/logout" && req.method === "POST") return send(res, 204, null);

    // ---- storage ----
    if (path.startsWith("/storage/v1/object/") && (req.method === "POST" || req.method === "PUT")) {
      await readBody(req);
      const key = path.replace("/storage/v1/object/", "");
      return send(res, 200, { Key: key, Id: crypto.randomUUID() });
    }
    if (path.startsWith("/storage/v1/")) return send(res, 200, {});

    // ---- rest (PostgREST) ----
    const rest = path.match(/^\/rest\/v1\/([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (rest) {
      const table = rest[1];
      if (!tables[table]) tables[table] = [];
      const accept = String(req.headers.accept || "");
      const prefer = String(req.headers.prefer || "");
      const wantsObject = accept.includes("vnd.pgrst.object");
      const wantsRepresentation = prefer.includes("return=representation");
      const select = url.searchParams.get("select") || "*";

      const respond = (rows: Row[], status = 200) => {
        if (wantsObject) {
          if (rows.length !== 1) {
            return send(res, 406, {
              code: "PGRST116", details: `Results contain ${rows.length} rows`,
              hint: null, message: "JSON object requested, multiple (or no) rows returned",
            });
          }
          return send(res, status, rows[0]);
        }
        return send(res, status, rows);
      };

      if (req.method === "GET" || req.method === "HEAD") {
        return respond(runSelect(table, url.searchParams));
      }

      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "null");
        const incoming: Row[] = Array.isArray(body) ? body : [body];
        const conflictCols = (url.searchParams.get("on_conflict") || "").split(",").map((s) => s.trim()).filter(Boolean);
        const isUpsert = prefer.includes("resolution=merge-duplicates") && conflictCols.length > 0;
        const results: Row[] = [];
        for (const item of incoming) {
          let target: Row | undefined;
          if (isUpsert) {
            target = (tables[table] || []).find((r) => conflictCols.every((c) => String(r[c]) === String((item as Row)[c])));
          }
          if (target) {
            for (const [k, v] of Object.entries(item as Row)) target[k] = v;
            results.push(target);
          } else {
            const row = newDefaults(table, item as Row);
            tables[table].push(row);
            results.push(row);
          }
        }
        const projected = results.map((r) => projectRow(table, r, select));
        if (!wantsRepresentation) return send(res, 201, null, { "Content-Type": "text/plain" });
        return respond(projected, 201);
      }

      if (req.method === "PATCH") {
        const body = JSON.parse((await readBody(req)) || "{}") as Row;
        const filters = parseFilters(url.searchParams);
        const hit = (tables[table] || []).filter((r) => filters.every((f) => matches(r, f)));
        for (const r of hit) for (const [k, v] of Object.entries(body)) r[k] = v;
        if (!wantsRepresentation) return send(res, 204, null, { "Content-Type": "text/plain" });
        return respond(hit.map((r) => projectRow(table, r, select)));
      }

      if (req.method === "DELETE") {
        const filters = parseFilters(url.searchParams);
        const hit = (tables[table] || []).filter((r) => filters.every((f) => matches(r, f)));
        tables[table] = (tables[table] || []).filter((r) => !hit.includes(r));
        if (!wantsRepresentation) return send(res, 204, null, { "Content-Type": "text/plain" });
        return respond(hit.map((r) => projectRow(table, r, select)));
      }
    }

    return send(res, 404, { message: `supamock: no route for ${req.method} ${path}` });
  } catch (e) {
    return send(res, 500, { message: `supamock error: ${e instanceof Error ? e.message : String(e)}` });
  }
});

server.listen(PORT, () => {
  console.log(`supamock listening on http://localhost:${PORT} (auth+rest+storage, in-memory)`);
});
