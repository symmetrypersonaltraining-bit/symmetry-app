# Symmetry Personal Training — Deploy to Vercel

## Prerequisites
- Node.js 18+ installed (check: `node --version`)
- A GitHub account
- A Vercel account (free at vercel.com — sign up with GitHub)

---

## Step 1 — Get your Supabase keys

1. Go to https://supabase.com/dashboard/project/mkfiginpiesospsnktea
2. Click **Settings** → **API**
3. Copy:
   - **Project URL**: `https://mkfiginpiesospsnktea.supabase.co`
   - **anon / public key** (the long `eyJ...` string)

---

## Step 2 — Set up the project locally

```bash
# 1. Navigate to the symmetry-app folder
cd symmetry-app

# 2. Copy the env example
cp .env.local.example .env.local

# 3. Edit .env.local and paste your anon key
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your key here...

# 4. Install dependencies
npm install

# 5. Test locally
npm run dev
# Open http://localhost:3000 — you should see the login screen
```

---

## Step 3 — Push to GitHub

```bash
# In the symmetry-app folder:
git init
git add .
git commit -m "Initial commit — Symmetry Personal Training app"

# Create a new repo on github.com (name it: symmetry-app)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/symmetry-app.git
git branch -M main
git push -u origin main
```

---

## Step 4 — Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository** → select `symmetry-app`
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://mkfiginpiesospsnktea.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJ...your anon key...`
4. Click **Deploy**
5. Done — Vercel gives you a live URL like `symmetry-app-xxx.vercel.app`

---

## Step 5 — Configure Supabase auth callback

1. In Supabase dashboard → **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local dev)
3. Set **Site URL** to your Vercel URL

---

## Step 6 — Create your trainer account

1. Go to your live URL
2. Click **Magic link**
3. Enter: `symmetrypersonaltraining@gmail.com`
4. Check your email → click the link → you're in as trainer

---

## Step 7 — Invite clients

For each client:
1. In Supabase dashboard → **Authentication** → **Users** → **Invite User**
2. Enter their email
3. Once they sign up, run this SQL to link them (replace values):

```sql
UPDATE clients
SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'client@email.com')
WHERE name = 'Client Name';
```

Or use the magic link flow — they sign in with their email and you run the link query.

---

## Custom domain (optional)

In Vercel dashboard → your project → **Settings** → **Domains** → add your domain.

---

## Add your real logo

Replace the SVG logo with your actual logo file:
1. Add your logo file to `public/logo.png` (or .svg)
2. In `src/components/Logo.tsx`, replace the SVG with:
   ```tsx
   import Image from "next/image";
   export default function Logo({ size = 40 }) {
     return <Image src="/logo.png" width={size} height={size} alt="Symmetry" />;
   }
   ```

---

## Google Calendar Integration (Phase 3)

This will allow you to schedule client sessions in the app and have them sync to your Google Calendar. We'll implement:
- OAuth 2.0 connection to Google Calendar API
- Two-way sync: sessions created in app → Google Calendar events
- Google Calendar events visible in app Schedule screen
- Client session reminders pushed to your phone calendar

Ready to build when you are — just say "add Google Calendar."

<!-- deploy retrigger 2026-07-03 (webhook missed e2ecc08b) -->
