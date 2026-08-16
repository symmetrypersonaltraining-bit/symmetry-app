// Guard: nobody is half-onboarded and told it worked.
//
// Onboarding is where an unchecked write is worst, because the failures do not
// look like failures — they look like a client who "can't log in", weeks later,
// with nothing in any log to say why.
//
// The one that made this urgent: /api/invite-client created the auth account
// and then linked it to the client row using the CALLER's Supabase client
// rather than `admin` — alone among that route's writes, so RLS could refuse
// it — with the result unchecked. The state that leaves is the expensive kind:
// the login EXISTS but points at nothing. The client gets the email, signs in
// perfectly, and the app cannot find their record. Re-inviting does not help
// either, because createUser now fails with "already registered". Somebody has
// to unpick it in the database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));

const ROUTES = [
  "src/app/api/invite-client/route.ts",
  "src/app/api/create-client/route.ts",
  "src/app/api/create-client-from-assessment/route.ts",
  "src/app/api/complete-onboarding/route.ts",
];

for (const p of ROUTES) {
  test(`every write in ${p.split("/").slice(-2)[0]} is checked`, () => {
    const s = src(p);
    const writes = (s.match(/\.(insert|update|upsert|delete)\(/g) || []).length;
    const checked = (s.match(/const \{ (data: \w+, )?error(?::\s*\w+)? \} = await/g) || []).length;
    assert.ok(writes > 0, "expected writes");
    assert.ok(
      checked >= writes,
      `${writes} writes but only ${checked} captured results — one can still fail in silence`,
    );
  });
}

test("the invite links the login with the ADMIN client, not the caller's", () => {
  // The caller's client is subject to RLS. Every other write in that route uses
  // admin; this one did not, which is how it could be refused at all.
  const s = src("src/app/api/invite-client/route.ts");
  const i = s.indexOf('.update({ auth_user_id: authUserId })');
  assert.ok(i > 0, "the link write is gone — update this test");
  assert.match(s.slice(Math.max(0, i - 120), i), /admin\s*\n?\s*\.from\("clients"\)/);
});

test("a failed link refuses, and says not to re-send the invite", () => {
  // Re-sending is the obvious next move and it makes things worse: the account
  // already exists, so createUser fails and the trainer learns nothing new.
  const s = src("src/app/api/invite-client/route.ts");
  const i = s.indexOf("linkErr");
  assert.ok(i > 0);
  const after = s.slice(i, i + 600);
  assert.match(after, /status: 500/);
  assert.match(after, /Do not re-send the invite/);
});

test("a failed temp-password flag stops the invite going out", () => {
  // Without that row the first-login redirect never fires, so the client keeps
  // the ten-character temporary password and is never asked to change it.
  for (const p of ["src/app/api/invite-client/route.ts", "src/app/api/create-client/route.ts"]) {
    const s = src(p);
    const i = s.indexOf('password_is_temporary: true');
    assert.ok(i > 0, `${p}: flag write missing`);
    assert.match(s.slice(Math.max(0, i - 300), i), /const \{ error: \w+ \} = await/, `${p} unchecked`);
  }
});

test("a failed starting weight is reported, not swallowed", () => {
  // It is the client's first data point. Lost, every "since you started" number
  // is measured from the wrong place and nothing suggests a reading is missing.
  const s = src("src/app/api/complete-onboarding/route.ts");
  const i = s.indexOf('from("metrics").insert');
  assert.ok(i > 0);
  assert.match(s.slice(Math.max(0, i - 200), i), /const \{ error: metricErr \} = await/);
  // 800, not 500: the insert body plus the message runs past the shorter window
  // and the assertion failed for the length of the code rather than its shape.
  assert.match(s.slice(i, i + 800), /status: 500/);
});

test("set-password does not strand a client in a loop", () => {
  // The password is already changed by the time that flag is written. If it
  // stays true, the first-login redirect sends them straight back to this
  // screen — to set a password that is already set — and round again.
  const s = src("src/app/(auth)/set-password/page.tsx");
  const i = s.indexOf("password_is_temporary: false");
  assert.ok(i > 0);
  assert.match(s.slice(Math.max(0, i - 300), i), /const \{ error: flagErr \} = await/);
  const after = s.slice(i, i + 700);
  assert.match(after, /setError\(/);
  assert.match(after, /return;/, "it must not fall through to the success redirect");
});
