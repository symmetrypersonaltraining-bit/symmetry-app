# Turning push on — 5 minutes, three env vars, one redeploy

Everything is built, shipped and **inert** until these exist. No client can be
notified until then. Verified live at the time of writing:
`/api/push/subscribe` → `{"configured":false,"publicKey":null}`, 0 rows in
`push_subscriptions`.

Do these in order. Every command is Git Bash, never PowerShell.

---

## 1. Generate the key pair — on your laptop, not through me

Open Git Bash anywhere and run:

```bash
npx web-push generate-vapid-keys
```

Say yes if it offers to install `web-push`. It prints:

```
Public Key:
BN4G...    ← long, starts with B
Private Key:
k3Jd...    ← shorter
```

Leave that window open. You need both values in the next step.

**Generate them on your machine, not in the chat.** The private key is the thing
that proves messages are from you — it should never travel through anything it
does not have to, including me.

---

## 2. Three environment variables in Vercel

**https://vercel.com/dashboard** → click **symmetry-app** (the LIVE one, serving
`symmetry-app-omega.vercel.app` — *not* symmetry-app-v2) → **Settings** →
**Environment Variables**.

Add New, three times. **Tick all three environments** (Production, Preview,
Development) on each one.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the **Public** Key from step 1 |
| `VAPID_PRIVATE_KEY` | the **Private** Key from step 1 |
| `VAPID_SUBJECT` | `mailto:symmetrypersonaltraining@gmail.com` |

Two things that silently break this:

- The `NEXT_PUBLIC_` prefix on the public one is **required** — the browser reads
  that variable directly. The private one must **not** have it.
- Copy the keys with no trailing space or newline. A stray space is the most
  common reason this looks right and does not work.

---

## 3. Redeploy — use the command, not the dashboard button

Vercel only picks up environment variables on a **new deployment**.

In Git Bash:

```bash
cd /c/Users/dusti/Claude/Projects/symmetry-app
git pull
git commit --allow-empty -m "Redeploy: pick up VAPID keys"
git push
```

That deploys whatever is currently on `main`, which is what you want.

**Deliberately not the dashboard's Redeploy button.** On 15 Aug I pointed you at
"the top deployment" on the v2 project, the top one was an old build, and you
promoted the wrong thing. The command above cannot pick the wrong build — there
is only one `main`.

---

## 4. Check it worked — click this

**https://symmetry-app-omega.vercel.app/api/push/subscribe**

Wait for the deploy to finish (~2 min), then open that link. You want:

```json
{"configured":true,"publicKey":"BN4G..."}
```

Still `false`? Almost always the redeploy not having finished, or a typo in a
variable name. Send me what the link says and I will tell you which.

Then open the app → **Settings** → **Notifications**. The "Push notifications
aren't set up yet" box should be gone, replaced by a **Turn on notifications**
button. Press it, allow the browser prompt, and it becomes **✓ Notifications are
on for this device**.

---

## 5. Tell me, and I do the rest

Message me when step 4 shows `configured:true`. I will:

- verify it against the database rather than the response — a row appearing in
  `push_subscriptions` is the first real proof anything can reach a client
- send the group message (Version A in
  `docs/GROUP-MESSAGE-DRAFT-2026-08-16.md`, the one that includes the
  notification ask) once you have okayed the final text

---

## What to expect afterwards

**Nothing reaches a client until THEY press that button on THEIR device.**
Browser permission cannot be granted on someone's behalf, by anyone. That is
what the group message is for.

**It is per device.** Somebody with the app on a phone and a laptop has to press
it in both.

**iPhone:** the app must be added to the home screen before iOS allows
notifications at all — Share → Add to Home Screen. Android has no such
requirement. Worth knowing which your clients are actually on before the message
goes out; if they are mostly Android, that line is noise and should be cut.

**In-app notifications already work and do not depend on any of this.** The
Messages badge, the bell, and the red banner-plus-buzz when a message is from
you all run off a 15-second poll. What push adds is their phone telling them
when the app is **closed** — the difference between a client seeing your message
today and seeing it next time they happen to open the app.
