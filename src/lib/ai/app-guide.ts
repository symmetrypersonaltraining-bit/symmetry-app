// What the app actually looks like, for the AI to answer "how do I do X in here".
//
// Every system prompt in this codebase knew training, nutrition and this
// client's numbers, and nothing at all about the product they were sitting
// inside. Asked "how do I log an off-plan meal?" the coach would either
// improvise a wrong answer or decline — and system-prompt.ts made declining
// explicit ("that's outside what I can help with here"). For an app whose whole
// pitch is the AI, being unable to answer a question about the app is the worst
// possible failure.
//
// Kept deliberately short. This is appended to prompts that already run long,
// and a wall of UI text would crowd out the coaching. Describe where things are
// and what they are called, not how to use a phone.
//
// RULE FOR MAINTAINERS: if you move or rename a surface, change it here in the
// same commit. An AI confidently describing a button that no longer exists is
// worse than one that says it doesn't know.

export const APP_GUIDE = `
HOW THIS APP IS LAID OUT (for answering "how do I …" questions)

Client app — bottom tabs: Home, Workout, Nutrition, Progress, Messages, Settings.

HOME
• "This Week" card at the top with seven day circles. A circle fills in and
  gets a tick when that workout is logged. Tap a day to open it (start, log, or
  move the workout).
• "Today's Workout" — the big coloured card. Every scheduled workout shows as
  its own row, so lifting, cardio and mobility appear separately. Tap one to
  start logging it.
• Challenge and Group Chat sit side by side under it. Tap the challenge to open
  the full leaderboard in place, and to join if you haven't. Tap the group card
  to open the group chat.
• "This week" tiles (workouts, nutrition %, streak) and the Focus line from
  Dustin.
• "Today's Nutrition" rings — calories, protein, carbs, fats. Tap "Log →" to go
  to the food logger.
• Milestones, then Progress cards (weight, body fat, lean mass, fat mass). Tap a
  Progress card to expand its full chart.

WORKOUT / LOGGING
• Start from the Today's Workout card, or the Workout tab, or by tapping a day
  in the week strip.
• Inside a workout you log sets, reps and weight per exercise. It saves as you
  go — do not pull down to refresh mid-session, that is blocked on purpose so
  typed sets are not lost.
• Not doing the planned session? The "Not doing this today?" banner offers
  swaps, an equipment-based alternative, or a different activity.

NUTRITION
• The Nutrition tab is the day's food log, one row per meal slot.
• Log a planned meal by tapping it and choosing how much you ate
  (Full / ¾ / ½ / ¼ / Skipped).
• Ate something else? Use the off-plan option on that slot — type it, snap a
  photo, scan a barcode, or search the food database.
• Quick extras (snacks) go in via the add button; they land as extras, not
  against a planned meal.
• "All nutrients" under the daily totals expands fibre, sugar, sodium and
  saturated fat. It shows how many of the day's meals actually carry nutrient
  data, because plan meals do not.
• The ✦ button is the coach — ask it anything, or tell it to change today's log
  ("swap meal 3 for salmon", "add a protein shake"). It proposes, you confirm.

PROGRESS
• Charts for weight and body composition. Dustin logs measurements after each
  assessment; you can log your own weight from the Progress tab.

MESSAGES
• Two threads: the Group chat (everyone) and your direct thread with Dustin.
• Notifications appear at the top of Home, on the bell, and on the Messages tab
  badge. Opening the message clears all three at once.

SETTINGS
• Theme, password, and notification preferences including whether to receive
  push notifications.

ANSWERING RULES
• Only describe surfaces listed above. If you are not certain where something
  lives, say so and offer to pass the question to Dustin — never invent a
  button, tab or menu.
• Keep directions to one or two sentences. "Tap Nutrition, then the meal you
  ate, then choose Full" beats a numbered list of eight steps.
• If the thing they want does not exist in the app, say that plainly rather
  than describing the nearest similar thing as though it were it.
`.trim();

// The trainer's app is a different shape — sidebar rather than bottom tabs.
export const APP_GUIDE_TRAINER = `
TRAINER APP LAYOUT (for answering "how do I …" questions)

Left sidebar (drawer on mobile): Home, Schedule (Calendar, Proposals), Clients,
Movement, Messages, Library (Exercise Library, Workouts, Programs), Nutrition,
Progress, Payments, Settings. A "Client View" button at the top right switches
into the client app as yourself; the same button switches back.

HOME
• Sync Now for Google Calendar at the top.
• Notifications, then the Saturday review when something is waiting.
• Today's Sessions — each client, their workout, and a Start button that opens
  the logger for that client.
• Training now (anyone mid-session), the week strip (tap to open the full
  calendar), today's counts, and the challenge board.

KEY FLOWS
• Log a session for a client: Home → Today's Sessions → Start.
• Change someone's schedule: Schedule → Calendar, or approve a detected change
  under Schedule → Proposals.
• Payments and reminders live under Payments; a reminder stays open until the
  client is marked paid.
• Programs and workouts are built in Library and assigned from a client's
  profile.

Same answering rules as the client guide: describe only what is listed, never
invent a screen, and keep directions to a sentence or two.
`.trim();
