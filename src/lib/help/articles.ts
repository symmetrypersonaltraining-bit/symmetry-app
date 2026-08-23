// ============================================================================
// In-app Help & Tutorials — content source of truth.
//
// HISTORY, because it explains the shape of this file. This shipped as a PATCH
// on 7 Aug 2026 and was applied to Dylan's fork, never to this repo. So the
// tutorials that guide a trainer through running the app lived only in the copy
// we are now retiring — retiring that fork would have deleted them. Landing it
// here means both instances get it and it stays current with the code.
//
// Pure data + a pure `filterArticles` search function so it can be unit-tested
// with no browser/network (tests/unit/helpArticles.test.ts).
//
// AUDIENCE GATING: clients must never see trainer-only articles, and NASM /
// corrective-method language never appears in ANY article here (all copy is
// client-safe). The trainer surface can see everything.
//
// INSTANCE-NEUTRAL: no article names a person or a studio directly. The coach
// is "your coach"; the product name comes from BUSINESS_NAME. A tutorial that
// tells another trainer's client to contact Dustin is worse than no tutorial.
//
// KEEP THIS UPDATED AS FEATURES SHIP. When a feature lands, add or edit its
// article in the same commit.
// ============================================================================

import { BUSINESS_NAME } from "@/lib/trainer";

export type HelpAudience = "all" | "client" | "trainer";

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  audience: HelpAudience;
  /** Tabler icon name, e.g. "apple" → <i className="ti ti-apple" /> */
  icon: string;
  /** Extra search terms that may not appear verbatim in the title/steps. */
  keywords: string[];
  /** One-line summary shown under the title. */
  intro: string;
  /** Ordered, plain-English how-to. Each string is one step. */
  steps: string[];
}

export const HELP_CATEGORIES = [
  "Getting Started",
  "Nutrition",
  "Workouts",
  "Progress & Photos",
  "Messages & Community",
  "AI Coaching",
  "Trainer Tools",
  "Running Your Own Instance",
  "Account & App",
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // ---- Getting Started ------------------------------------------------------
  {
    id: "install-app",
    title: "Install the app on your phone",
    category: "Getting Started",
    audience: "all",
    icon: "device-mobile-down",
    keywords: ["install", "download", "home screen", "add to home", "apk", "pwa", "iphone", "android"],
    intro: `Add ${BUSINESS_NAME} to your home screen so it opens like a normal app.`,
    steps: [
      "Android: open the download link from your welcome email and install the app, then open it and log in.",
      "iPhone: open the app link in Safari, tap the Share button, then tap \"Add to Home Screen.\"",
      "Once it's on your home screen, open it from that icon — it runs full-screen with no browser bar.",
      "Log in with the email and password from your welcome email. Tap \"Change Password\" in Settings to set your own.",
    ],
  },
  {
    id: "home-overview",
    title: "What's on your home screen",
    category: "Getting Started",
    audience: "client",
    icon: "home",
    keywords: ["dashboard", "today", "overview", "start"],
    intro: "Your home screen is your day at a glance.",
    steps: [
      "The top shows today's date and your streak of days logged.",
      "\"Coach's Read\" is a short AI summary of how your week is going and what to focus on next.",
      "Cards link you straight to today's workout, your meal plan, and logging.",
      "Use the bottom tab bar to move between Home, Nutrition, Workouts, Progress, and Messages.",
    ],
  },

  // ---- Nutrition ------------------------------------------------------------
  {
    id: "log-a-meal",
    title: "Log a meal",
    category: "Nutrition",
    audience: "client",
    icon: "apple",
    keywords: ["nutrition", "food", "meal", "log", "adherence", "macros", "eat", "diet"],
    intro: "Tell the app how each planned meal went so your macros and adherence stay accurate.",
    steps: [
      "Open the Nutrition tab. Your plan shows each meal (M1–M5 and any extras).",
      "Tap a meal, then pick how you ate it: Full, ¾, ½, ¼, Partial, Skipped, or Off-plan.",
      "Full through ¼ means you ate that share of the planned meal. The header calorie and macro totals update as you log.",
      "If you ate something different, choose Off-plan and describe it (see \"Log an off-plan meal\").",
      "Log every meal each day — consistent logging is what drives your adherence number and your coach's adjustments.",
    ],
  },
  {
    id: "meal-amounts",
    title: "Change a food's amount or unit",
    category: "Nutrition",
    audience: "client",
    icon: "scale",
    keywords: ["amount", "grams", "serving", "unit", "ounces", "portion", "quantity"],
    intro: "Type the exact amount you ate instead of stepping by fixed servings.",
    steps: [
      "Open a meal and tap the food you want to adjust.",
      "Type the amount in the amount box and pick a unit from the dropdown.",
      "Units are filtered to that food — a gram-based food offers g, kg, or oz, and switching units converts the amount for you.",
      "The food's macros recalculate from the amount you entered, so \"5 g\" reads as 5 g rather than a fraction of a serving.",
    ],
  },
  {
    id: "off-plan-meal",
    title: "Log an off-plan meal (with a photo)",
    category: "Nutrition",
    audience: "client",
    icon: "camera",
    keywords: ["off plan", "off-plan", "cheat", "photo", "picture", "estimate", "restaurant"],
    intro: "Ate something that wasn't on the plan? Log it so nothing is missed.",
    steps: [
      "Open the meal and choose Off-plan.",
      "Describe what you ate — the dish and roughly how much.",
      "Tap the camera icon to add a photo of the meal if you can. Photos are compressed automatically before upload.",
      "Your coach reviews off-plan meals and fills in estimated macros, which then show up on your totals.",
    ],
  },
  {
    id: "barcode-scan",
    title: "Scan a barcode",
    category: "Nutrition",
    audience: "client",
    icon: "barcode",
    keywords: ["barcode", "scan", "packaged", "camera", "product"],
    intro: "Add a packaged food fast by scanning its barcode.",
    steps: [
      "In the food add sheet, tap the barcode icon.",
      "Allow camera access the first time you use it, then point your camera at the barcode.",
      "The product's macros load automatically — adjust the amount if you ate more or less than one serving.",
    ],
  },
  {
    id: "my-meals",
    title: "Save, copy, and reuse meals (My Meals)",
    category: "Nutrition",
    audience: "client",
    icon: "bookmark",
    keywords: ["my meals", "library", "save meal", "copy meal", "reuse", "favorite", "duplicate"],
    intro: "Build a personal library of meals you eat often.",
    steps: [
      "On any meal, tap the save/bookmark action to add it to My Meals.",
      "To reuse one, open an empty slot or use the copy action and pick a meal from My Meals.",
      "Copying keeps the exact amounts you set — if you halved the oats, the copy is the halved version.",
      "Delete a saved meal from the My Meals list when you no longer need it.",
    ],
  },
  {
    id: "macro-targets",
    title: "Understanding your macro targets",
    category: "Nutrition",
    audience: "client",
    icon: "target",
    keywords: ["targets", "calories", "protein", "carbs", "fat", "goal", "macros"],
    intro: "Your daily calorie and macro targets are set by your coach and adjust over time.",
    steps: [
      "The Nutrition header shows calories and protein/carbs/fat eaten versus your target for today.",
      "Targets change as your weigh-ins come in — your coach updates them and the change is logged.",
      "Adherence rewards both logging every day and landing close to these four targets (calories, protein, carbs, fat).",
      "Tap ALL NUTRIENTS under the totals to see the full panel — fibre, sugars, sodium, and the vitamins and minerals the app knows about for what you logged.",
    ],
  },

  // ---- Workouts -------------------------------------------------------------
  {
    id: "log-workout",
    title: "Log a workout",
    category: "Workouts",
    audience: "client",
    icon: "barbell",
    keywords: ["workout", "training", "sets", "reps", "weight", "log", "exercise", "session"],
    intro: "Record what you actually did so your coach can see your progress.",
    steps: [
      "Open the Workouts tab and tap today's session.",
      "For each exercise, enter the weight and reps you did for each set.",
      "Use the per-exercise note field for anything worth flagging — how it felt, a tweak, or an issue.",
      "Tap Session mode for a distraction-free, one-exercise-at-a-time view during your workout.",
      "When you're done, mark the workout complete. It saves to your history and your coach's view.",
      "If you finish a session and open it again, it will say it is already complete rather than asking you to finish it twice.",
    ],
  },
  {
    id: "exercise-history",
    title: "See your history for one exercise",
    category: "Workouts",
    audience: "client",
    icon: "history",
    keywords: ["history", "previous", "last time", "progress", "exercise", "personal record"],
    intro: "Check what you lifted last time for any movement.",
    steps: [
      "Open a workout and tap the history icon on an exercise.",
      "You'll see your recent sets for that exact movement so you know what to beat.",
    ],
  },
  {
    id: "reschedule-workout",
    title: "Reschedule or move a workout",
    category: "Workouts",
    audience: "client",
    icon: "calendar-event",
    keywords: ["reschedule", "move", "missed", "calendar", "schedule", "drag", "early", "ahead"],
    intro: "Life happens — move a session within the allowed window.",
    steps: [
      "Open your schedule. You can move upcoming sessions within a 14-day window (if your coach enabled it for you).",
      "Drag a session to another day, or use the one-tap \"→ Today\" on a missed session to pull it to today.",
      "A missed session shows in the past section with an amber count so it's easy to catch up.",
      "Doing a session EARLY works too — it uses up that scheduled session rather than adding an extra one, so getting ahead never reads as falling behind.",
      "Completed and locked sessions can't be moved.",
    ],
  },

  // ---- Progress & Photos ----------------------------------------------------
  {
    id: "weigh-in",
    title: "Log your weigh-in",
    category: "Progress & Photos",
    audience: "client",
    icon: "scale",
    keywords: ["weigh in", "weigh-in", "weight", "body fat", "bodyfat", "sunday", "scale", "reminder"],
    intro: "Your weigh-ins drive your charts and your coach's calorie adjustments.",
    steps: [
      "Every Sunday you'll get a full-screen weigh-in reminder — enter your weight and, if you have it, body fat %.",
      "You can also log a weigh-in any time from the Progress tab.",
      "Weigh at a consistent time (usually first thing in the morning) for the cleanest trend.",
    ],
  },
  {
    id: "progress-charts",
    title: "Read your progress charts",
    category: "Progress & Photos",
    audience: "client",
    icon: "chart-line",
    keywords: ["charts", "progress", "trend", "graph", "weight", "body fat", "calories", "adherence"],
    intro: "See how weight, body fat, calories, and adherence are trending.",
    steps: [
      "Open the Progress tab.",
      "Switch the date range (2 weeks, 1 month, 8 weeks) to zoom in or out.",
      "Charts cover your weight trend, body fat %, calories, and how consistently you're hitting your plan.",
      "Look at the direction of the line over weeks, not any single day — day-to-day noise is normal.",
    ],
  },
  {
    id: "progress-photos",
    title: "Progress photos & before/after",
    category: "Progress & Photos",
    audience: "client",
    icon: "photo",
    keywords: ["photos", "progress photo", "before after", "compare", "pose", "share", "transformation"],
    intro: "Take consistent photos and compare your progress side by side.",
    steps: [
      "Open Progress Photos and pick a pose (front, side, back) so shots line up over time.",
      "Take or upload your photo — it's added to your timeline by date.",
      "Use the compare view to put any two dates side by side as a Before/After.",
      "You can share a Before/After card to the group chat if you want — it shows first name only.",
      "Your photos are private to you and your coach unless you choose to share.",
    ],
  },

  // ---- Messages & Community -------------------------------------------------
  {
    id: "messages",
    title: "Message your coach",
    category: "Messages & Community",
    audience: "client",
    icon: "message",
    keywords: ["messages", "chat", "coach", "direct message", "dm", "inbox", "question"],
    intro: "Reach your coach directly and answer their check-in questions.",
    steps: [
      "Open the Messages tab to see your conversation with your coach.",
      "Type a message any time — questions about your plan, a workout, or how you're feeling.",
      "If your coach sends you a weekly question, it lands here in your inbox; just reply.",
    ],
  },
  {
    id: "group-chat",
    title: "Community group chat",
    category: "Messages & Community",
    audience: "client",
    icon: "users",
    keywords: ["group", "community", "chat", "challenge", "leaderboard", "share"],
    intro: "Stay connected with the group and cheer each other on.",
    steps: [
      "Open the group thread from Messages to see community posts.",
      "Share a win, a Before/After, or encouragement.",
      "You'll get a notification for new group messages and direct messages separately.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    category: "Messages & Community",
    audience: "all",
    icon: "bell",
    keywords: ["notifications", "alerts", "push", "badge", "unread", "reminder"],
    intro: "How alerts reach you.",
    steps: [
      "Allow notifications when the app first asks, so messages and reminders reach your phone.",
      "You'll be alerted for new messages, weigh-in reminders, and check-in nudges.",
      "Open the item to mark it read and clear its badge.",
      "You can turn sounds, vibration, and nudges on or off under Settings → Experience.",
    ],
  },

  // ---- AI Coaching ----------------------------------------------------------
  {
    id: "coach-read",
    title: "Coach's Read on your home screen",
    category: "AI Coaching",
    audience: "client",
    icon: "brain",
    keywords: ["coach read", "ai", "focus", "weekly", "summary", "insight"],
    intro: "A short, plain-English read on how your week is going.",
    steps: [
      "Find the \"Coach's Read\" card on your home screen.",
      "It summarizes your recent logging, weight trend, and what to focus on next.",
      "It refreshes each week and reflects your real numbers, so it changes as you do.",
    ],
  },
  {
    id: "nutrition-ai-coach",
    title: "Ask the AI nutrition coach",
    category: "AI Coaching",
    audience: "client",
    icon: "message-chatbot",
    keywords: ["ai coach", "nutrition ai", "chat", "energy balance", "maintenance", "question", "advice"],
    intro: "Get answers about your nutrition based on your own data.",
    steps: [
      "Open the coach chat from the Nutrition tab.",
      "Ask things like why your target changed, how you're tracking, or what to do about a slow week.",
      "It reads your recent logs, weigh-ins, and targets, so the answers are specific to you — not generic advice.",
      "Big plan changes still go through your coach; the AI helps you understand and stay on track.",
    ],
  },

  // ---- Trainer Tools (trainer-only) -----------------------------------------
  {
    id: "trainer-weekly-brief",
    title: "Weekly programming brief",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "clipboard-list",
    keywords: ["weekly brief", "programming", "schedule", "changes", "focus", "trainer"],
    intro: "A per-client card at the top of the week's first session.",
    steps: [
      "Open a client's first session of their week — the brief appears inline at the top.",
      "It shows the week's schedule grouped by day, what changed since last week, and what to focus on.",
      "Tap to collapse it once you've read it; the read state is saved, so it won't reopen on another device.",
      "Phases are tracked per program, since a client can run more than one program at once.",
    ],
  },
  {
    // Replaced 21 Aug 2026. This article described "Who needs you" and "Week
    // ahead". Neither is on the home screen any more — the first was removed
    // earlier, the second at Dustin's request because the function belongs
    // automated rather than as a roster to work through by hand. A help
    // article for a block that is not there sends somebody hunting for it and
    // concluding they cannot find their way around their own app.
    id: "trainer-needs-your-eyes",
    title: "\"Needs your eyes\" on your home screen",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "urgent",
    keywords: ["needs your eyes", "notes", "pain", "symptom", "home", "attention", "flags", "trainer", "week ahead"],
    intro: "The notes your clients left that nobody has closed out.",
    steps: [
      "When a client leaves a note on an exercise — skipped it, something hurt, a question — it lands here.",
      "Anything that reads like pain or a symptom sorts to the top, by the same wording that decides whether a note reaches you as a message.",
      "Three show at a time. The number in the corner is the real total; the button at the bottom opens the rest and closes it again.",
      "Tap \"open the workout\" to see it in context, and \"Done\" once you have dealt with it. The list only shrinks when you shrink it.",
      "There is no longer a \"Week ahead\" roster on this screen. Focus lines for the week are drafted on Saturday and approved from the review panel that appears on Home when there are drafts waiting.",
    ],
  },
  {
    id: "trainer-ai-builders",
    title: "AI workout & meal plan builders",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "wand",
    keywords: ["ai builder", "workout builder", "meal plan builder", "generate", "program", "trainer"],
    intro: "Turn a plain-English prompt into a structured program or plan.",
    steps: [
      "Describe what you want in plain English (the split, the goal, days per week, any constraints).",
      "The builder drafts a structured workout or meal plan you can review and edit.",
      "It draws only from the exercise library and available equipment, and respects your exclusions.",
      "For a meal plan, type the macros and the calories fill themselves in — 4/4/9, so the target you send can never contradict itself.",
      "Under the draft it prints what the plan ACTUALLY comes to. If that misses the target it says so, in amber, with the size of the miss — adjust the amounts before saving, or build it again.",
      "Review and adjust before anything is assigned — nothing goes to a client until you approve it.",
    ],
  },
  {
    id: "trainer-set-macros",
    title: "Set a client's macros and calories",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "target",
    keywords: ["macros", "calories", "targets", "nutrition", "kcal", "protein", "set macros", "trainer"],
    intro: "Where the numbers a client is trying to hit come from.",
    steps: [
      "Open the client, go to Nutrition, and use the ✦ button.",
      "\"Build from my targets\" — type the kcal and P/C/F, and it drafts five meals to match. Saving the plan sets those macros.",
      "\"Recommend my targets\" — three questions, and it proposes the numbers with its reasoning before building anything.",
      "Or tell the coach chat plainly: \"set her macros to 1800, 160 protein, 170 carbs, 55 fat\".",
      "Targets are dated and kept. Setting new ones adds a version rather than overwriting the old, so the history of what somebody was asked to hit stays intact.",
      "The number on a client's daily chart is the macro target you set. A meal plan is built to hit it — it does not replace it.",
    ],
  },
  {
    id: "trainer-build-a-workout",
    title: "Build a workout from scratch",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "barbell",
    keywords: ["build workout", "create workout", "exercises", "sets", "reps", "programming engine", "trainer"],
    intro: "The manual builder, for when you want to type it yourself.",
    steps: [
      "Open the client, then Open Programming Engine, then Create New.",
      "Name the workout and add sections — a warm-up and a strength block, say.",
      "Add exercises row by row: name, sets, reps, weight, rest. The name field autocompletes from the exercise library, and anything new is added to it.",
      "Remove a row you do not want with the × at the end of it. Blank rows are ignored when you save, so an empty one does no harm either way.",
      "Save, then schedule it onto the client's calendar from the Program Days tab.",
    ],
  },
  {
    id: "trainer-scheduling",
    title: "Schedule, copy, and paste a week",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "calendar-plus",
    keywords: ["schedule", "copy week", "paste", "programme", "assign", "duplicate", "trainer"],
    intro: "Build a client's calendar and repeat it forward.",
    steps: [
      "Open a client's programme page to see their calendar.",
      "Copy the current week, then paste it forward over as many weeks as you need.",
      "Pasting over a week that already has sessions tops it up rather than doubling it — the same session can only appear once on a given day.",
      "If you try to add a session a client already has that day, the app tells you instead of creating a duplicate.",
      "Deleted sessions stay deleted: they no longer show on the calendar and are never copied forward.",
    ],
  },
  {
    id: "trainer-payments",
    title: "Set up payments & reminders",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "cash",
    keywords: ["payments", "billing", "session rate", "reminders", "invoice", "money", "trainer"],
    intro: "Track client fees and send payment reminders.",
    steps: [
      "Open Settings → Payments (or a client's profile) to set their session rate.",
      "Turn on payment reminders for a client to notify them in-app before payment is due.",
      "Leave reminders off for clients who don't need them.",
    ],
  },
  {
    id: "trainer-gcal",
    title: "Connect Google Calendar",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "calendar",
    keywords: ["google calendar", "gcal", "sync", "schedule", "integration", "trainer"],
    intro: "Two-way sync between your calendar and the app.",
    steps: [
      "Open Settings → Integrations and tap Connect on Google Calendar, then authorize.",
      "Turn on the sync toggle for ongoing two-way sync.",
      "Use \"Sync Now\" for an immediate pull, or \"Reset & Re-sync\" to rebuild from Google Calendar.",
    ],
  },
  {
    id: "trainer-archive-client",
    title: "Archive a client",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "archive",
    keywords: ["archive", "inactive", "remove client", "roster", "trainer"],
    intro: "Take a client off the active roster without losing their history.",
    steps: [
      "Open the client's profile and choose Archive.",
      "They drop out of your active roster and counts, but all their history is preserved.",
      "Nothing they logged is deleted — archiving is fully reversible.",
    ],
  },

  // ---- Running Your Own Instance (trainer-only) -----------------------------
  //
  // These replace the setup tutorials that lived in the fork. They describe the
  // app as it is NOW — configured, not edited — and every one of them was a
  // code change on 11 Aug 2026.
  {
    id: "instance-what-is-mine",
    title: "What's yours and what's shared",
    category: "Running Your Own Instance",
    audience: "trainer",
    icon: "server",
    keywords: ["instance", "setup", "own app", "separate", "database", "fork", "deploy", "trainer"],
    intro: "Your clients, your data, your AI bill — running the same app as everyone else.",
    steps: [
      "Every instance runs the SAME code from the same repository. You do not edit it to make it yours; you configure it.",
      "Your clients live in your own database. No other instance can see them, and you cannot see theirs.",
      "Your AI usage is billed to your own key and metered against your own monthly cap.",
      "Because the code is shared, every fix and feature reaches you automatically when it ships. Nothing has to be merged across by hand.",
    ],
  },
  {
    id: "trainer-walkthrough",
    title: "The end-to-end walkthrough",
    category: "Trainer Tools",
    audience: "trainer",
    icon: "school",
    keywords: ["tutorial", "walkthrough", "training", "new trainer", "onboarding", "setup", "guide", "tour", "voice"],
    intro: "Every screen and every setting, in order, narrated. Settings, then \"Set up your app\".",
    steps: [
      "It runs about forty steps across thirteen chapters: your account, getting around, Home, clients, programming, the library, nutrition, progress, the calendar, payments, messages, the AI, and going live.",
      "It reads itself out loud if you want it to. Voice is off until you turn it on, and the button is on every step.",
      "Most steps open the real screen in a second tab, so you are learning on your own account rather than watching somebody else's.",
      "It remembers where you stopped. Close it, come back next week, carry on from the same step.",
      "The last chapter checks your actual setup — photo, pay details, calendar, first client, first program, first message, notifications — by reading your account rather than asking you to tick boxes.",
      "If the card is not in your Settings, the walkthrough is switched off for this instance. A trainer can turn it on under Settings, Experience, \"New-trainer walkthrough\".",
    ],
  },
  {
    id: "instance-first-run",
    title: "First-run setup checklist",
    category: "Running Your Own Instance",
    audience: "trainer",
    icon: "checklist",
    keywords: ["setup", "first run", "configure", "environment", "env", "install", "new instance", "trainer"],
    intro: "The handful of settings that make the app yours.",
    steps: [
      "Your name and studio name are settings, not code. Once they're set, every screen and every AI message uses them — clients are never told to contact somebody else's coach.",
      "Your email is registered as a trainer in two places: the app (so trainer controls appear) and the database (so you can actually read your clients' data). Both are required — one without the other gives you a trainer-shaped screen with no data in it.",
      "Add your own AI key. Do not share one with another instance: their usage would count against your monthly cap and could pause AI for YOUR clients.",
      "Set your app's own web address so invite links and calendar connections come back to your app, not somebody else's.",
      "Your client download link must point at YOUR build. The installable app opens a fixed address, so shipping another instance's build sends your clients to their login screen.",
      "Full detail, including exactly what to paste where, is in docs/ADDING-A-TRAINER.md and .env.local.example in the repo.",
    ],
  },
  {
    id: "instance-invite-first-client",
    title: "Add your first client",
    category: "Running Your Own Instance",
    audience: "trainer",
    icon: "user-plus",
    keywords: ["invite", "add client", "welcome email", "first client", "onboard", "trainer"],
    intro: "What happens when you create a client, end to end.",
    steps: [
      "Create the client from your roster. The app makes their login and emails them a welcome with a temporary password.",
      "That email includes the download link for your app and a one-tap link to get started.",
      "They set their own password on first sign-in, then go through a short intake before reaching their programme.",
      "Until you assign a programme and a meal plan, they will see an empty app — worth doing before you send the invite, not after.",
    ],
  },

  // ---- Account & App --------------------------------------------------------
  {
    id: "change-password",
    title: "Change your password",
    category: "Account & App",
    audience: "all",
    icon: "lock",
    keywords: ["password", "security", "login", "change password", "account"],
    intro: "Set your own password from Settings.",
    steps: [
      "Open Settings → Security and tap Change Password.",
      "Enter a new password (at least 6 characters) and confirm it.",
      "Tap Update Password. You'll see a confirmation when it's saved.",
    ],
  },
  {
    id: "themes",
    title: "Change the app color theme",
    category: "Account & App",
    audience: "all",
    icon: "palette",
    keywords: ["theme", "color", "dark mode", "appearance", "look"],
    intro: "Pick the look that suits you.",
    steps: [
      "Open Settings → App Color Theme.",
      "Tap any theme to apply it instantly — the active one is marked.",
    ],
  },
  {
    id: "experience-settings",
    title: "Sound, vibration & nudges",
    category: "Account & App",
    audience: "all",
    icon: "adjustments",
    keywords: ["sound", "vibration", "haptics", "nudges", "leaderboard", "experience", "preferences"],
    intro: "Fine-tune how the app feels and alerts you.",
    steps: [
      "Open Settings → Experience.",
      "Toggle sound effects, vibration/haptics, leaderboard opt-in, and check-in nudges.",
    ],
  },
];

/**
 * Filter help articles by a search query and the viewer's audience.
 * - Clients never see `trainer` articles; the trainer surface sees everything.
 * - Empty query returns all audience-appropriate articles.
 * - Multi-word queries match as AND across title, category, intro, keywords,
 *   and step text (all case-insensitive).
 */
export function filterArticles(
  articles: HelpArticle[],
  query: string,
  isTrainer: boolean,
): HelpArticle[] {
  const audienceOk = (a: HelpArticle) => (isTrainer ? true : a.audience !== "trainer");
  const q = query.trim().toLowerCase();
  const terms = q.length ? q.split(/\s+/) : [];
  return articles.filter((a) => {
    if (!audienceOk(a)) return false;
    if (!terms.length) return true;
    const hay = [a.title, a.category, a.intro, ...a.keywords, ...a.steps]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
