# App inventory summary (11 Sep 2026) — from codebase read
- Live single-trainer platform: Next.js 15 / React 19 / Supabase; ~123k lines TS/TSX; 50 user-facing pages; 71 API routes (24 AI-backed); 115 migrations; 103 tables; ~15 pg_cron jobs + 5 Vercel crons; 64 RLS policies; 320 unit test files; Playwright e2e; 3 pre-push gates; CI tutorial-drift check; health endpoint; grouped error log (10 Sep).
- Trainer console: roster, client file, programme calendar + builder, exercise/video/workout/programme libraries, payments ledger + emailed reminders, schedule proposals, assessment incl. camera movement screen (TensorFlow pose), AI health, data health, 59-step trainer tutorial (ships dark).
- Client app: home, workout logger, nutrition (food photo AI, NL parse, coach that edits meals, plan build), progress, messages/group chat/challenges, recipes, body-fat calculator, onboarding/welcome, PWA install.
- AI: Claude Haiku 4.5 + Sonnet 4.6, metered per bucket. Trainer agent with 6 tools (2 write). Measured cost: ~$15 / 30 days for 27 clients (~$0.55/client/month), 1,593 calls / 36 users in 30 days.
- Integrations: Google Calendar OAuth + sync + iCal feed; Resend email; Web Push. SMS not built (twilio dep, no call sites). iOS = Capacitor thin shell, no ios/ folder, Codemagic pipeline, TestFlight checklist only. NO Stripe / no subscriptions / no seats / no tenant model.
- Multi-trainer: is_trainer() reads trainers table but falls back to hardcoded email; adding a trainer = manual SQL; no per-trainer data partition; MULTI-TRAINER-BACKLOG "not started — do this before scaling".
- Gaps: no client tutorial; 2 of 39 screens audited; ~68k food rows "1 serving"; attention routes dead; movement results not persisted; Health sync = plans only.
# Live DB facts (11 Sep)
- 27 active clients (19 in-person, 8 online), 36 all-time; avg 172 days active; 20 logging workouts in last 7 days; 24 in last 30 days.
- Jun/Jul/Aug/Sep(partial): workouts logged 322/453/421/134; meals logged 227/953/861/196; sessions scheduled 125/123/128/151; invoices paid via app $0/$8,992/$8,050/$2,430 (total $19,472 over 41 invoices).
- 1,330 workouts, 13,975 sets, 2,367 meal logs, 737 messages, 81 meal plans, 79 library programmes, 840 exercises, 1,339 foods, 19 client assessments.
- Repo: created 18 Jun 2026; symmetry-app-v2 (dev fork, Phase 0) exists but token can't read it (403).
