import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { trainerForAuthUser } from "@/lib/trainerResolve";

/**
 * Add a trainer, and send them a way in.
 *
 * Until this route existed there was NO WAY to add a trainer at all — no API,
 * no screen. Both existing trainer rows were typed into SQL by hand, which is
 * fine for two and impossible for a test group. Dustin, 22 Aug: "i want to send
 * out the forms to collect trainer info in the morning and get them on the app
 * and testing by tomorrow."
 *
 * OWNER ONLY. This creates somebody who can see client health data and be paid
 * by clients; a trainer must not be able to mint another trainer.
 *
 * Deliberately mirrors invite-client rather than inventing a second flow: same
 * one-tap recovery link, same temp-password fallback, same /welcome landing.
 * The failure mode it avoids is the one Dustin named on 4 Aug about clients —
 * reading a ten-character password out of an email and typing it into a phone
 * keyboard is where people give up.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app-omega.vercel.app";

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(digits), pick(digits),
    ...Array.from({ length: 6 }, () => pick(lower))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function emailHtml(o: { firstName: string; email: string; tempPassword: string; oneTapUrl: string | null; appUrl: string }): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#16161a">
    <h2 style="margin:0 0 12px">You're set up on the Symmetry app, ${o.firstName}</h2>
    <p style="margin:0 0 14px;line-height:1.55">This is the trainer side — your clients, your programming, your schedule. It runs in a browser; there is nothing to install.</p>
    ${o.oneTapUrl ? `<p style="margin:0 0 18px"><a href="${o.oneTapUrl}" style="background:#e53935;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Open the app and set your password</a></p>` : ""}
    <p style="margin:0 0 6px;line-height:1.55"><strong>If that button has expired</strong>, go to <a href="${o.appUrl}/login">${o.appUrl}/login</a> and sign in with:</p>
    <p style="margin:0 0 18px;line-height:1.7">Email: <strong>${o.email}</strong><br>Temporary password: <strong>${o.tempPassword}</strong></p>
    <p style="margin:0 0 14px;line-height:1.55">First thing inside, open <strong>Setup guide</strong> in the sidebar. It walks you through the whole app and takes about twenty minutes — including setting your photo and how clients pay you.</p>
    <p style="margin:0;line-height:1.55;color:#55555f;font-size:14px">This is a test build and we want to hear what is wrong with it. There is a feedback button on every screen — please use it.</p>
  </div>`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // OWNER only, resolved from the database rather than from an email constant —
  // the same resolver every other trainer-aware surface uses.
  const me = await trainerForAuthUser(supabase, user.id);
  if (!me?.isOwner) {
    return NextResponse.json({ error: "Only the owner can add a trainer." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.firstName || "").trim() || name.split(/\s+/)[0] || "there";

  if (!name || !email) {
    return NextResponse.json({ error: "A name and an email are both required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Already a trainer? Say so rather than making a second row with the same
  // email — my_trainer_id() resolves by email as well as auth id, so two rows
  // would make "who is this" ambiguous for every query in the app.
  const { data: existing } = await admin.from("trainers").select("id, name").ilike("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({
      error: `${(existing as { name?: string }).name || email} is already a trainer on this app.`,
    }, { status: 409 });
  }

  const tempPassword = generateTempPassword();

  // ── The auth user ────────────────────────────────────────────────────────
  // They may already have a login as a CLIENT — Stephanie does. Reuse it
  // rather than failing: one person, one login, two roles.
  let authUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (created?.user) {
    authUserId = created.user.id;
  } else if (createErr) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const hit = (list?.users || []).find((u) => (u.email || "").toLowerCase() === email);
    if (!hit) {
      return NextResponse.json({ error: `Could not create their login: ${createErr.message}` }, { status: 500 });
    }
    authUserId = hit.id;
    await admin.auth.admin.updateUserById(hit.id, { password: tempPassword });
  }

  // ── The trainer row ──────────────────────────────────────────────────────
  const { data: row, error: insErr } = await admin
    .from("trainers")
    .insert({ email, name, first_name: firstName, role: "trainer", active: true, auth_user_id: authUserId })
    .select("id")
    .maybeSingle();
  if (insErr) {
    return NextResponse.json({ error: `Could not create the trainer: ${insErr.message}` }, { status: 500 });
  }
  const trainerId = (row as { id?: string } | null)?.id || null;

  // Everything on by default, so their app behaves like his until they change
  // it. A missing row already reads as ON, but writing it means the settings
  // screen shows real switches rather than inferred ones.
  if (trainerId) {
    const { error: featErr } = await admin
      .from("trainer_features")
      .upsert({ trainer_id: trainerId }, { onConflict: "trainer_id" });
    // Not fatal — a missing row already reads as "everything on", which is the
    // same behaviour. But it must not fail SILENTLY: their settings screen
    // would then show switches with nothing behind them, and the first one they
    // flipped would be the first anyone knew.
    if (featErr) {
      console.error("invite-trainer: feature defaults not written for", trainerId, featErr.message);
    }
  }

  // ── Their own client view ────────────────────────────────────────────────
  //
  // Dustin: "when I add a new trainer, they should already have that toggle,
  // and they should already have a client view for themselves. It needs to be
  // set up that way to begin with."
  //
  // He and Steph are each a trainer AND a client on the SAME auth user, and
  // that second row is what the Client View toggle reads. Four trainers were
  // created without one: the toggle still appeared, and flipping it showed an
  // empty app — no coach avatar, no week summary, no macros card. It does not
  // error, it is just blank.
  //
  // The work is a database function so that every path that ever creates a
  // trainer gets it, and so it could be run against the four already in.
  if (trainerId) {
    const { error: selfErr } = await admin.rpc("ensure_trainer_self_client", { p_trainer: trainerId });
    if (selfErr) {
      // Checked, and loudly: a trainer whose client view is missing looks like
      // a broken app rather than a missing row, and they will report it as
      // "the client side doesn't work".
      return NextResponse.json({
        error: `${name} was created, but their own client view could not be set up: ${selfErr.message}. `
             + `Do not re-send the invite — the login already exists. This needs the client row adding first.`,
      }, { status: 500 });
    }
  }

  // ── The one-tap link ─────────────────────────────────────────────────────
  let oneTapUrl: string | null = null;
  try {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      // /welcome, not /tutorial: it is what makes them replace the temporary
      // password that was just emailed to them in plain text. It hands off to
      // the walkthrough at the end.
      options: { redirectTo: `${APP_URL}/auth/callback?next=/welcome` },
    });
    oneTapUrl = link?.properties?.action_link ?? null;
  } catch { /* the temp password below still works */ }

  const resendKey = process.env.RESEND_API_KEY;
  let emailSent = false;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
        to: email,
        subject: "You're set up on the Symmetry trainer app",
        html: emailHtml({ firstName, email, tempPassword, oneTapUrl, appUrl: APP_URL }),
      });
      emailSent = true;
    } catch { /* reported below; the credentials still work */ }
  }

  return NextResponse.json({
    success: true,
    trainerId,
    email,
    name,
    emailSent,
    // Always returned, not just when mail is unconfigured: if the email bounces
    // or lands in spam he needs to be able to read it out over the phone.
    tempPassword,
    oneTapUrl,
    loginUrl: `${APP_URL}/login`,
  });
}
