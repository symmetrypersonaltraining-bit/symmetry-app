# Turning push on — the two env vars

Everything is built and shipped. It is **inert** until these exist, and no
client can be notified until then.

## 1. Generate a key pair

Anywhere with Node, or in the symmetry-app folder:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**.

## 2. Put them in Vercel — the LIVE project

https://vercel.com/dashboard → **symmetry-app** → **Settings** →
**Environment Variables** → Add New, three times, all three environments ticked:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the Public Key |
| `VAPID_PRIVATE_KEY` | the Private Key |
| `VAPID_SUBJECT` | `mailto:symmetrypersonaltraining@gmail.com` |

The `NEXT_PUBLIC_` prefix on the public one is required — the browser reads it.
The private one must **not** have it.

## 3. Redeploy

Vercel only picks up environment variables on a **new deployment**. Deployments
tab → top deployment → ⋯ → **Redeploy**.

## 4. Check it worked

Open the app → **Settings** → **Notifications**. There should be a **"Turn on
notifications"** button at the top. Press it, allow the prompt, and it should
change to **"✓ Notifications are on for this device"**.

If it says *"Push notifications aren't set up yet"*, the keys did not take —
usually the redeploy, occasionally a typo in a variable name.

## Then tell people

Nothing reaches a client until **they** press that button on **their** device —
browser permission cannot be granted on someone's behalf, by anyone. That is
what the group message draft is for.

Worth knowing: it is **per device**. Somebody with the app on a phone and a
laptop needs to press it in both.

**iPhone:** the app has to be added to the home screen before iOS will allow
notifications at all. Share → Add to Home Screen. Android has no such
requirement.
