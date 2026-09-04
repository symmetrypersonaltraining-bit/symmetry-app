/**
 * THE NEW-TRAINER TUTORIAL — the whole app, end to end, in order.
 *
 * This file is content, not machinery. It is deliberately plain data so that
 * the walkthrough can be read, corrected and re-recorded by a human without
 * touching a component.
 *
 * THREE RULES FOR EDITING IT
 *
 * 1. Every step describes what the app ACTUALLY does today. A tutorial that
 *    promises a button which does not exist is worse than no tutorial: the
 *    trainer stops trusting the whole thing at the first one they cannot find.
 *    Where a feature is designed but not built, mark it `status: "preview"` and
 *    say so out loud. Nothing marked "live" may be aspirational.
 *
 * 2. `narration` is spoken aloud. Write it the way you would say it standing
 *    next to somebody, not the way you would write it in a manual. Short
 *    sentences. No bullet points, no parentheses, no "e.g.", no slashes — a
 *    speech synthesiser reads those out and it sounds wrong. Numbers as words
 *    where it matters.
 *
 * 3. `body` is what they read while it talks. It may be denser than the
 *    narration, but it must not contradict it.
 *
 * INSTANCE-NEUTRAL. No step names a person or a studio. A second trainer runs
 * this on their own clients and the words still fit. Where the tutorial needs
 * to refer to whoever owns the instance, it says "the owner".
 *
 * VOICE. `audioUrl` is null everywhere for now and the browser voice reads the
 * narration. When the recordings exist, set the URL on the step and the player
 * plays the recording instead — see src/lib/speech.ts.
 */

export type StepStatus = "live" | "preview";

/** Setup facts the app can verify for itself, rather than asking. */
export type SetupCheckKey =
  | "profile"
  | "pay"
  | "calendar"
  | "client"
  | "program"
  | "message"
  | "push";

export interface TutorialStep {
  id: string;
  title: string;
  /** Paragraphs shown on screen. */
  body: string[];
  /** Spoken aloud. See rule 2 above. */
  narration: string;
  /** A screen to open in a new tab so they can follow along. */
  route?: string;
  routeLabel?: string;
  /** Ties this step to a live setup check on the final checklist. */
  check?: SetupCheckKey;
  /** "live" (default) means it exists today. "preview" means designed, not built. */
  status?: StepStatus;
  /** A pre-recorded narration, when one exists. */
  audioUrl?: string | null;
  /**
   * What to do instead, for a trainer with no AI.
   *
   * Dustin, 21 Aug: a trainer who does not want AI must be shown "how to use
   * the app manually to do all of this" — and he chose the branching version
   * over a bolt-on chapter, so they read ONE coherent walkthrough rather than
   * 51 steps about features they do not have followed by a correction.
   *
   * Replaces `body` when the reader has said they are not using AI. A step
   * with no `manual` reads the same either way, which is most of them.
   */
  manual?: string[];
  /** Spoken instead of `narration` when the reader is not using AI. */
  manualNarration?: string;
  /** True when the step only exists because of AI — hidden entirely without it. */
  aiOnly?: boolean;
  /**
   * A block the trainer copies out of the app — the Gemini prompt for their
   * avatar set.
   *
   * In the step body rather than a link, because the alternative is "ask the
   * owner for the script", which means Dustin relaying a wall of text to four
   * people and one of them getting the old version. The prompt names the exact
   * twenty slots the app looks for, so it has to travel WITH the app.
   */
  copyText?: string;
  copyLabel?: string;
}

export interface TutorialChapter {
  id: string;
  title: string;
  blurb: string;
  steps: TutorialStep[];
}

export const SETUP_CHECKS: { key: SetupCheckKey; label: string; hint: string; route: string }[] = [
  { key: "profile", label: "Your photo is on your profile", hint: "Your clients see this face on every message and every card. Without it they get your initials.", route: "/profile" },
  { key: "pay", label: "You have a way to be paid", hint: "Venmo, Zelle or Cash App. Until one is set, a client tapping Pay has nowhere to go.", route: "/settings" },
  { key: "calendar", label: "Google Calendar is connected", hint: "This is where your sessions come from. Optional, but almost everything on Home is quieter without it.", route: "/settings" },
  { key: "client", label: "You have at least one client", hint: "Add them through the assessment. It builds the profile and the first program recommendation in one pass.", route: "/clients" },
  { key: "program", label: "A client has a program assigned", hint: "A client with no program has nothing to open when they tap Workout.", route: "/clients" },
  { key: "message", label: "You have sent a message", hint: "Say hello in the app once, so they learn that this is where you talk.", route: "/messages" },
  { key: "push", label: "Notifications are on for this device", hint: "Otherwise a client message waits until you next open the app.", route: "/settings" },
];

export const TUTORIAL: TutorialChapter[] = [
  {
    id: "start",
    title: "Start here",
    blurb: "What this app is, and how the next hour goes.",
    steps: [
      {
        id: "start-what",
        title: "What you are looking at",
        body: [
          "This is a training app with two faces. The one you are in now is the trainer side: your roster, your programming, your schedule, your money. The other is what your clients see on their phones, and it is a different app entirely from their point of view.",
          "Everything a client does — logging a workout, logging a meal, weighing in, messaging you — lands here. You do not chase it. It arrives.",
        ],
        narration:
          "This app has two faces. The one you are in now is the trainer side. Your roster, your programming, your schedule, and your money. The other face is what your clients see on their phones. Everything they do lands here on its own. You do not have to chase any of it.",
        audioUrl: null,
      },
      {
        id: "start-how",
        title: "How this tutorial works",
        body: [
          "Every step has a voice you can turn off, and most have a button that opens the real screen in a new tab so you can follow along on your own account rather than watching a video of somebody else's.",
          "You cannot break anything by looking. The only steps that change something are the ones that say so.",
          "It saves your place. Close it, come back next week, carry on.",
        ],
        narration:
          "Every step reads itself out loud, and you can turn that off at any time. Most steps open the real screen in a second tab, so you are learning on your own account instead of watching a video of somebody else's. You cannot break anything by looking. And it remembers where you stopped.",
        audioUrl: null,
      },
      {
        id: "start-boundary",
        title: "What you can and cannot see",
        body: [
          "If there is more than one trainer on this instance, you see your clients and only your clients. Their payments, their reminders, their appointments, their notifications — none of it crosses over. That is enforced in the database, not in the screens, so it holds even somewhere the interface forgot to check.",
          "Three things are deliberately shared: the exercise library, the workout and program library, and the group chat. Everybody draws from the same movements, and the group chat is the whole gym.",
          "The owner of the instance can see everything. That is the one asymmetry, and it is intentional.",
        ],
        narration:
          "If there is more than one trainer here, you see your clients and only your clients. Payments, reminders, appointments, notifications. None of it crosses over, and that is enforced down in the database rather than in the screens, so it holds everywhere. Three things are shared on purpose. The exercise library, the workout library, and the group chat. The owner of the instance can see everything. That is the one asymmetry and it is deliberate.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "account",
    title: "Your account",
    blurb: "Fifteen minutes that make everything after it work properly.",
    steps: [
      {
        id: "account-profile",
        title: "Your name and your face",
        body: [
          "Settings, then the group called You. Your name, what clients call you, and your photo all live there, and you set them yourself.",
          "This is what every client sees — on your messages, on their coach card, on the celebration screens when they hit a personal best. If you have no photo they get your initials in a circle. It works, but a face is the difference between an app and a person.",
          "Your email is shown but locked, because it is your login. Ask the owner if it needs changing.",
        ],
        narration:
          "Settings, then the group called You. Your name, what clients call you, and your photo all live there, and you set them yourself. This is what every client sees. On your messages, on their coach card, and on the celebration screens when they hit a personal best. Without a photo they get your initials in a circle. It works, but a face is the difference between an app and a person. Your email is shown but locked, because it is your login.",
        route: "/settings",
        routeLabel: "Open Settings",
        check: "profile",
        audioUrl: null,
      },
      {
        id: "account-password",
        title: "Your password",
        body: [
          "Settings, then Security. If you were set up by somebody else, change it now — a password another person chose is a password another person knows.",
          "There is no password reset email on this app yet. If you lock yourself out, the owner resets it for you.",
        ],
        narration:
          "Settings, then Security. If somebody else set your account up, change your password now. A password another person chose is a password another person knows. And note that there is no reset email on this app yet. If you lock yourself out, the owner resets it for you.",
        route: "/settings",
        routeLabel: "Open Settings",
        audioUrl: null,
      },
      {
        id: "account-pay",
        title: "How you get paid",
        body: [
          "Same group in Settings, under your photo. Put in whichever of Venmo, Zelle or Cash App you actually use.",
          "This is only the handle a client sends money to — no bank details, no card numbers, no logins. The app never touches the payment; your clients pay you in their own app exactly as they do now.",
          "It is not decoration, though. When a client taps to pay, the button goes wherever this says. If it is empty it goes nowhere, and you will hear about it on the first of the month.",
          "Nobody else can see these. Not the other trainers, not the owner.",
        ],
        narration:
          "Same group in Settings, under your photo. Put in whichever of Venmo, Zelle, or Cash App you actually use. This is only the handle a client sends money to. No bank details, no card numbers, no logins, and the app never touches the payment itself. It is not decoration though. When a client taps to pay you, the button sends them wherever this says, and if it is empty it sends them nowhere. Nobody else can see these. Not the other trainers, not the owner.",
        route: "/settings",
        routeLabel: "Open Settings",
        check: "pay",
        audioUrl: null,
      },
      {
        id: "account-avatar",
        title: "Your own face library",
        body: [
          "The app has a cartoon of the coach that appears whenever it speaks — twenty of them, one per situation. Celebrating a personal best, checking in after a quiet week, explaining a screen. Right now your clients see the standard set.",
          "You can have your own. Settings, Bots and AI, Your avatar library. It is grouped by where the faces appear — everyday cards, celebrations, check-ins, your group bot, topics — and the two marked start here are most of what anyone actually sees.",
          "Copy the script below and paste it into Gemini. It names all twenty poses in the order the app expects, so the pictures come back matching the slots.",
          "Then upload a few photos of yourself — face, build, your usual hair — and tell it you are done. It draws the set. Upload each one into the matching slot.",
          "Put more than one in a slot if you have them. The app rotates through what is there, so five different neutrals means your clients are not looking at the same picture all week.",
          "You do not need all twenty to start. Any slot you leave empty uses the standard face for that one slot, so five tonight and the rest at the weekend is completely fine.",
        ],
        narration:
          "The app has a cartoon of the coach that appears whenever it speaks. Twenty of them, one per situation. A personal best, a quiet week, explaining a screen. You can have your own. Settings, Bots and AI, Your avatar library. It is grouped by where the faces appear, and the two sections marked start here are most of what anyone sees. Copy the script below into Gemini, upload some photos of yourself, and it draws the twenty. Put more than one in a slot and the app rotates through them. Any slot you leave empty uses the standard face for that slot.",
        route: "/settings",
        routeLabel: "Open Settings",
        copyLabel: "Copy the Gemini script",
        copyText:
          "I'm a trainer onboarding onto the Symmetry Personal Training app and I need a set of 20 AI bot personas of myself. Do not generate anything yet.\n\nART STYLE\n- High-resolution, stylised, bold-line comic-book illustration. Clean sticker style, transparent or plain background.\n- Functional athletic gym wear.\n- The \"Symmetry Personal Training\" circular logo on the chest of every outfit \u2014 white logo on dark clothing, dark navy or gold on light clothing so it reads.\n- Colour-match each panel's outfit differently (charcoal and crimson, teal and silver, and so on).\n- Same face, same build, same hairstyle in all twenty. Consistency across the set matters more than any single panel.\n\nTHE 20 PANELS, IN THIS EXACT ORDER. Number each one. These map to specific slots in the app, so all twenty are needed and the order matters:\n1. neutral \u2014 relaxed, approachable, resting expression. Head and shoulders. This is the default and gets used most.\n2. thinking \u2014 hand on chin, analysing, looking slightly off-camera.\n3. explaining \u2014 mid-sentence, gesturing with one open hand, teaching.\n4. plan \u2014 holding a clipboard or tablet, reviewing a programme.\n5. happy \u2014 genuine warm smile, arms relaxed.\n6. hype \u2014 celebrating, both arms raised, big energy.\n7. pr \u2014 fists clenched, triumphant, just hit a personal record.\n8. flex \u2014 flexing a bicep, confident and playful.\n9. cool \u2014 arms crossed, calm, slight smirk. Understated.\n10. streak \u2014 pointing at the viewer approvingly, \"you're on a roll\".\n11. concerned \u2014 brow slightly furrowed, checking on someone. Caring, not angry.\n12. stern \u2014 serious, arms crossed, no smile. Firm but not hostile.\n13. callout \u2014 one hand cupped beside the mouth, calling across the gym.\n14. nutrition \u2014 holding or gesturing at food, or a shaker.\n15. hydrate \u2014 holding a water bottle, mid-drink or offering it.\n16. lifting \u2014 actively lifting: a dumbbell curl or a kettlebell.\n17. rest \u2014 hands on knees catching breath, or sitting on a bench.\n18. tips \u2014 index finger raised, \"here's a tip\".\n19. messages \u2014 looking at a phone, replying to someone.\n20. confident \u2014 hands on hips, standing tall, chest open.\n\nNEXT: I'm going to upload reference photos of my face, physique and usual hairstyle, possibly in several batches. Generate nothing until I say \"I'm done uploading.\" Then produce the 20 panels in the numbered order above, named 1-neutral through 20-confident.\n\nDo you understand?",
        audioUrl: null,
      },
      {
        id: "account-bots",
        title: "Which bots run in your app",
        body: [
          "Settings, Bots and AI, Your bots. Three switches, and they affect your clients only — every trainer sets their own.",
          "Coach Bot posts light smack talk about the challenge in your group chat. Birthday messages go to your clients, and you get a quiet heads-up the evening before. The weekly focus writes each of your clients one line for the week ahead, late on Saturday.",
          "All three start on. Turn any of them off and nothing about your clients changes except that.",
        ],
        narration:
          "Settings, Bots and AI, Your bots. Three switches, and they affect your clients only. Every trainer sets their own. Coach Bot posts light smack talk about the challenge in your group chat. Birthday messages go to your clients, and you get a quiet heads-up the evening before. And the weekly focus writes each of your clients one line for the week ahead, late on Saturday. All three start on.",
        route: "/settings",
        routeLabel: "Open Settings",
        audioUrl: null,
      },
      {
        id: "account-notifications",
        title: "Notifications",
        body: [
          "Settings, then Notifications. Turn on push for this device, then choose what reaches you.",
          "Messages from clients is the one that matters. Announcements cannot be turned off — those are gym-wide and rare by design.",
          "Do this on the phone you actually carry, not only on a laptop. Push is per device.",
        ],
        narration:
          "Settings, then Notifications. Turn on push for this device, then pick what reaches you. Messages from clients is the one that matters. Announcements cannot be switched off, because those are gym wide and rare on purpose. And do this on the phone you actually carry, not just on a laptop. Push is per device.",
        route: "/settings",
        routeLabel: "Open Settings",
        check: "push",
        audioUrl: null,
      },
      {
        id: "account-appearance",
        title: "Make it yours",
        body: [
          "Settings has a colour theme picker and a depth setting that controls how much glow and shadow the interface uses. Both are yours alone — a client never sees your theme.",
          "Sounds and vibration are in the Experience card, also device-local. Turn them off if you train in a quiet room.",
        ],
        narration:
          "Settings has a colour theme picker, and a depth setting that controls how much glow and shadow the interface uses. Both are yours alone. Your clients never see your theme. Sounds and vibration are in the Experience card, and they are per device too. Turn them off if you train somewhere quiet.",
        route: "/settings",
        routeLabel: "Open Settings",
        audioUrl: null,
      },
    ],
  },

  {
    id: "around",
    title: "Getting around",
    blurb: "The sidebar, and the one toggle worth knowing early.",
    steps: [
      {
        id: "around-sidebar",
        title: "The sidebar",
        body: [
          "Home, Schedule, Clients, Movement, Messages, Library, Nutrition, Progress, Payments, Settings. Schedule and Library open into sub-items.",
          "On a phone the sidebar becomes a hamburger in the top bar. On a desktop you can collapse it to icons with the arrow at the top.",
          "One quirk to know now: tapping Calendar under Schedule brings you back to Home. That is not a bug you have hit — the trainer calendar lives on Home, and that link is a leftover. Use the calendar panel on Home instead.",
        ],
        narration:
          "Home, Schedule, Clients, Movement, Messages, Library, Nutrition, Progress, Payments, and Settings. Schedule and Library open into sub items. On a phone the sidebar becomes a hamburger in the top bar. One quirk worth knowing now. Tapping Calendar under Schedule brings you straight back to Home. That is a leftover link, not something you did. The trainer calendar lives on Home.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "around-clientview",
        title: "Client View",
        body: [
          "At the bottom of the sidebar there is a Client View toggle. Tap it and the whole app becomes what your clients see, running against your own client record.",
          "Use it constantly. Before you tell somebody where a button is, go look at their app and check that it is where you think.",
          "Tap it again to come back. It survives a refresh, so if the app looks wrong one morning, check whether you left yourself in client mode.",
        ],
        narration:
          "At the bottom of the sidebar there is a Client View toggle. Tap it, and the whole app becomes what your clients see, running against your own client record. Use it constantly. Before you tell somebody where a button is, go and look at their app and check that it is where you think it is. Tap it again to come back. It survives a refresh, so if the app looks wrong one morning, check whether you left yourself in client mode.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "around-clienthome",
        title: "What your clients actually see",
        body: [
          "Flip into Client View and their Home reads in this order.",
          "A header banner with the greeting and their streak. Then anything they owe you, which sits above everything else because it is the only thing on that screen with a deadline attached.",
          "Then This Week. Then today's workout, the challenge and group cards, their weekly focus, today's nutrition, and their progress charts.",
        ],
        narration:
          "Flip into Client View and their Home reads in this order. A header banner with the greeting and their streak. Then anything they owe you, which sits above everything else, because it is the only thing on that screen with a deadline attached. Then This Week. Then today's workout, the challenge and group cards, their weekly focus, today's nutrition, and their progress charts.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "around-clientweek",
        title: "The percentage on their week",
        body: [
          "This Week shows a circle for every session and an adherence percentage.",
          "That percentage counts only the days that have already happened, including today. So somebody who has done everything asked of them so far reads one hundred percent on a Tuesday, rather than forty.",
          "There is no Add Workout button on their Home. That one lives on the Workout tab, which is where anybody actually starts a session.",
        ],
        narration:
          "This Week shows a circle for every session, and an adherence percentage. That percentage counts only the days that have already happened, including today. So somebody who has done everything asked of them so far reads one hundred percent on a Tuesday, rather than forty. One more thing. There is no Add Workout button on their Home. That one lives on the Workout tab, which is where anybody actually starts a session.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "around-adherence",
        title: "Swapping versus skipping",
        body: [
          "These are two different things and the app now counts them differently.",
          "If somebody swaps a walk for the stair climber, they trained. The original is marked replaced, it leaves the adherence sum entirely, and the session they actually did is what counts. Swapping never costs them anything.",
          "If they simply do not do it, and do not move it, and do not log it, that counts against them. Nothing needs marking. A session in the past that nobody logged is a missed one.",
        ],
        narration:
          "Swapping and skipping are two different things, and the app now counts them differently. If somebody swaps a walk for the stair climber, they trained. The original is marked replaced, it leaves the adherence sum entirely, and the session they actually did is what counts. Swapping never costs them anything. If they simply do not do it, and do not move it, and do not log it, then that counts against them. Nothing needs marking. A session in the past that nobody logged is a missed one.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "around-library-access",
        title: "Your clients can search your whole library",
        body: [
          "When a client taps Add Workout, the search covers every workout in the house library, not just the ones they have been given.",
          "Until the third of September it only showed them workouts already on their own plan, which made the search look broken. It was a permission, not a search fault.",
          "They can find and add anything from the library. They cannot see another client's personal copy of anything, and they cannot edit the library itself.",
        ],
        narration:
          "When a client taps Add Workout, the search covers every workout in the house library, not only the ones they have already been given. Until the third of September it showed them just the workouts on their own plan, which made the search look broken. It was a permission, not a search fault. They can find and add anything from the library. They cannot see another client's personal copy of anything, and they cannot edit the library itself.",
        route: "/workout",
        routeLabel: "Open Workout",
        audioUrl: null,
      },
      {
        id: "around-workout-tile-format",
        title: "The Workout tab, and the shape everything is moving to",
        body: [
          "Every day is a tile: a gradient bar across the top, the day written out with an icon on the left, the session count on the right. Inside it, each workout is the same shape at a smaller size.",
          "Today is that same tile filled bright, and it sits first — above the past strip, not buried in date order. Its top bar is the only thing on the screen that moves.",
          "Every workout has Start and View. View opens the overview and waits, on a light screen; Start drops straight into the session, which is dark. A finished one offers View only.",
          "Past workouts stay collapsed until you open them, reach back two weeks, and never say missed. The shape comes from the Weekly Focus card on Home, and it is being rolled out screen by screen as each one is walked.",
        ],
        narration:
          "The Workout tab is the first screen on the app's new shape, and the shape is not new. It is the Weekly Focus card on your Home screen. Every day is that tile now, and each workout inside it is the same object at a smaller size. Today is the same tile filled bright, and it sits first rather than buried in date order. Past workouts stay collapsed and reach back two weeks. View opens the overview on a light screen, Start opens the session on a dark one, so the two are never mistaken for each other.",
        route: "/workout",
        routeLabel: "Open Workout",
        audioUrl: null,
      },
      {
        id: "around-moving-a-logged-workout",
        title: "Moving a workout you have already done",
        body: [
          "An unfinished workout moves. Drag it onto another day, or use the calendar button on the card.",
          "One you have already logged does not move. It stays on the day you trained it, with its log, and a copy of the workout lands on the date you picked.",
          "The app says so when it happens. There is no dialog, because there is only one right answer.",
        ],
        narration:
          "Moving a workout works two ways, depending on whether it has been done. An unfinished one moves, and its log moves with it. A workout you have already logged does not move at all. It stays on the day you trained it, with its log, and a fresh copy lands on the date you picked. You cannot move history, and deleting the log to tidy it up is never the right answer. The app tells you which of the two happened, and there is no dialog, because there is only one correct outcome.",
        route: "/workout",
        routeLabel: "Open Workout",
        audioUrl: null,
      },
      {
        id: "around-reprogramming-live",
        title: "Reprogramming somebody who is mid workout",
        body: [
          "You can rewrite a day whenever you want, including one somebody is training right now. That has not changed.",
          "What changed on the third of September is what the client sees. If you replace the workout under them, their next tap says your coach just updated this workout, and it reloads onto the new one.",
          "It does not move their finished sets across. If you replaced the session, those sets belong to movements that are no longer there, and guessing where they go would invent training that never happened.",
          "Every change you make to a day, a section or an exercise is now recorded, whoever made it and however.",
        ],
        narration:
          "You can rewrite a day whenever you want, including one somebody is training right now. That has not changed. What changed is what the client sees. If you replace the workout under them, their next tap tells them their coach just updated it, and it reloads onto the new one. It does not move their finished sets across. If you replaced the session, those sets belong to movements that are no longer there, and guessing where they go would invent training that never happened. Every change to a day, a section or an exercise is now recorded, whoever made it and however.",
        route: "/clients",
        routeLabel: "Open Clients",
        audioUrl: null,
      },
      {
        id: "around-header",
        title: "The two buttons in the corner",
        body: [
          "The star opens feedback. Type or dictate what is wrong, attach a screenshot, send. It goes straight into the queue with your name and which app it came from attached, so a bug you file is not filed as somebody else's.",
          "The AI button opens the assistant drawer. That gets its own chapter.",
          "The bell is your notification centre.",
        ],
        narration:
          "The star in the corner opens feedback. Type it or dictate it, attach a screenshot, send. It goes into the queue tagged with your name and which app it came from, so a bug you report is not filed as somebody else's. The A I button opens the assistant drawer, and that gets its own chapter. The bell is your notification centre.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "home",
    title: "Home",
    blurb: "The screen you will live on. Read it top to bottom once.",
    steps: [
      {
        id: "home-sessions",
        title: "Today's Sessions",
        body: [
          "Everything you are training today, merged from your calendar and from what is programmed. Tap a row to start the session.",
          "If a client has more than one thing scheduled — a lift and a walk, say — you get a chooser. The app picks the supervised session first, because that is the one you are standing there for.",
          "Rows read Start, Choose, Done or Cancelled, so you can see at a glance what is left.",
        ],
        narration:
          "Everything you are training today, merged from your calendar and from what is programmed. Tap a row to start the session. If a client has more than one thing scheduled, a lift and a walk for example, you get a chooser, and the app puts the supervised session first, because that is the one you are standing there for. Rows read Start, Choose, Done, or Cancelled, so you can see what is left at a glance.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "home-focus",
        title: "The weekly focus line",
        body: [
          "Each client carries one focus line for the week, and their app shows it. It is written for you late on Saturday night, after the week has finished, from that client's real numbers — sessions done, how they logged, which way the scale went.",
          "It publishes straight to them. There is nothing to approve. If you want to write one yourself, do it and the sweep will leave it alone for that week.",
          "The card on Home tells you whether it worked and how many clients have one, and the lines are one tap away so you can read what they were told. If it ever fails you get an email — a client sees no focus at all rather than last week's, because a stale line presented as this week's is worse than none.",
        ],
        narration:
          "Each client carries one focus line for the week, and their app shows it. It is written late on Saturday night, after the week has finished, from that client's real numbers. It publishes straight to them, and there is nothing for you to approve. Write one yourself and the automatic one leaves it alone that week. The card on Home tells you whether it worked, with the lines one tap away so you can read what they were told. If it ever fails you get an email, and a client sees no focus rather than last week's, because a stale line presented as this week's is worse than none.",
        route: "/home",
        routeLabel: "Open Home",
        manual: [
          "Each client carries one focus line for the week and their app shows it. Without AI, nobody writes it but you.",
          "Open a client, write the line, and it stays until you change it. One sentence about the week ahead is enough — it is the first thing they read when they open the app.",
          "The card on Home tells you which clients have one for this week and which do not, so you can see at a glance who is still waiting.",
        ],
        manualNarration:
          "Each client carries one focus line for the week and their app shows it. Without the AI, nobody writes it but you. Open a client, write the line, and it stays until you change it. One sentence about the week ahead is enough. The card on Home tells you which clients have one for this week and which do not.",
        audioUrl: null,
      },
      {
        id: "home-notes",
        title: "Needs your eyes",
        body: [
          "When a client leaves a note on an exercise, it surfaces here. Anything that reads like pain or a symptom sorts to the top.",
          "Three show at a time. The count in the corner is the real total, and the button at the bottom opens the rest and closes it again.",
          "Mark it done when you have dealt with it. That is the whole workflow — the list only shrinks when you shrink it.",
        ],
        narration:
          "When a client leaves a note on an exercise, it shows up here, and anything that reads like pain or a symptom sorts to the top. Three show at a time. The count in the corner is the real total, and the button at the bottom opens the rest and closes it again. Mark it done once you have dealt with it. That is the whole workflow. The list only shrinks when you shrink it.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
      {
        id: "home-rest",
        title: "The rest of Home",
        body: [
          "Training right now shows anyone with a session open, which is useful when you have two going at once.",
          "The community panel previews the group chat and the consistency board.",
          "Upcoming payments shows the next thirty days. It is a preview — the sending happens on the Payments screen.",
          "The calendar panel is a week strip that expands to the full calendar.",
        ],
        narration:
          "Training right now shows anyone with a session open, which helps when you have two going at once. The community panel previews the group chat and the consistency board. Upcoming payments shows the next thirty days, but it is only a preview. The sending happens on the Payments screen. And the calendar panel is a week strip that expands into the full calendar.",
        route: "/home",
        routeLabel: "Open Home",
        audioUrl: null,
      },
    ],
  },

  {
    id: "clients",
    title: "Adding and running clients",
    blurb: "The assessment, the client file, and the six tabs inside it.",
    steps: [
      {
        id: "clients-add",
        title: "Adding a client",
        body: [
          "Clients, then Add Client. That opens the assessment rather than a name-and-email box, and that is deliberate: the assessment builds the profile, the movement screen and the first program recommendation in one pass.",
          "Seven steps — personal info, medical history, movement screen, training profile, goals, lifestyle, and a recommendation at the end. You can dictate any of the text fields instead of typing.",
          "If you genuinely only need a name and an email, there is a quick New Client option on the Clients screen too. You will still want the assessment before you program anything.",
        ],
        narration:
          "Clients, then Add Client. That opens the assessment rather than a name and email box, and that is deliberate. The assessment builds the profile, the movement screen, and the first program recommendation, all in one pass. Seven steps. Personal info, medical history, movement screen, training profile, goals, lifestyle, and a recommendation at the end. You can dictate any text field instead of typing it. If you only need a name and an email there is a quick option on the Clients screen, but you will still want the assessment before you program anything.",
        route: "/clients",
        routeLabel: "Open Clients",
        check: "client",
        audioUrl: null,
      },
      {
        id: "clients-screen",
        title: "The movement screen inside the assessment",
        body: [
          "The third step is an overhead squat assessment. You tick what you actually see: feet turning out, forward lean, knees caving, low back arching, arms falling forward, forward head, lateral shift, balance.",
          "This drives the recommendation at the end. Tick honestly and skip nothing — an assessment filled in from memory produces a program built on a guess.",
        ],
        narration:
          "The third step is an overhead squat assessment. You tick what you actually see. Feet turning out, forward lean, knees caving, low back arching, arms falling forward, forward head, a lateral shift, balance. This drives the recommendation at the end, so tick it honestly and skip nothing. An assessment filled in from memory produces a program built on a guess.",
        audioUrl: null,
      },
      {
        id: "clients-invite",
        title: "Getting them into the app",
        body: [
          "Open the client and use Invite. They get a link, set a password, and land in their own first-run flow — password, install to home screen, notifications, then a short intake.",
          "Reset login is there for when they forget. Archive takes somebody off the roster without deleting a thing; their history stays and they can be brought back.",
          "There is an install QR in Settings for when you are standing next to them.",
        ],
        narration:
          "Open the client and use Invite. They get a link, set a password, and land in their own first run flow. Password, install to home screen, notifications, then a short intake. Reset login is there for when they forget. Archive takes somebody off the roster without deleting anything. Their history stays and you can bring them back. And there is an install Q R code in Settings for when you are standing right next to them.",
        route: "/clients",
        routeLabel: "Open Clients",
        audioUrl: null,
      },
      {
        id: "clients-tabs",
        title: "The client file",
        body: [
          "Six tabs. Overview is the summary — recent sessions, weight and body fat trends. Training is their calendar. Billing is their schedule and reminders. Assessment is the clinical record, including the contraindicated movements list. Progress is charts. Info is the editable profile.",
          "Two fields on Info matter more than they look. Contraindicated movements is a hard never — put anything there that must not be programmed, ever. And trainer notes are internal; the client never sees them.",
        ],
        narration:
          "Six tabs. Overview is the summary, with recent sessions and their weight and body fat trends. Training is their calendar. Billing is their schedule and reminders. Assessment is the clinical record. Progress is charts. Info is the editable profile. Two fields matter more than they look. Contraindicated movements is a hard never. Put anything there that must not be programmed under any circumstances. And trainer notes are internal. The client never sees them.",
        audioUrl: null,
      },
      {
        id: "clients-ai-assist",
        title: "AI Workout Assist",
        body: [
          "On the client's page there is a chat that knows this client — their assessment, their history, their limits. Ask it for a workout or a change and it comes back with a proposed change you tap Apply on.",
          "Nothing happens until you tap Apply. When you do, it makes a copy of the library day for this client rather than editing the shared one, so you cannot accidentally change a workout for everybody.",
        ],
        narration:
          "On the client's page there is a chat that already knows this client. Their assessment, their history, their limits. Ask it for a workout or a change, and it comes back with a proposed change that you tap Apply on. Nothing happens until you tap Apply. And when you do, it makes a copy of the library day just for this client, rather than editing the shared one, so you cannot accidentally change a workout for everybody at once.",
        manual: [
          "Adding a client without AI is the assessment form, filled in with them.",
          "Work down it — the movement screen, their injuries, their goal, how many days they can train. It takes about fifteen minutes and it is the same information you would gather in a first session anyway.",
          "At the end you pick their programme yourself from the library, rather than being handed a recommendation. Everything after that is identical.",
        ],
        manualNarration:
          "Adding a client without the AI is the assessment form, filled in with them. Work down it. The movement screen, their injuries, their goal, how many days they can train. About fifteen minutes, and it is the same information you would gather in a first session anyway. At the end you pick their programme yourself from the library rather than being handed a recommendation. Everything after that is identical.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "programming",
    title: "Programming",
    blurb: "The part you will spend the most time in.",
    steps: [
      {
        id: "prog-calendar",
        title: "The program calendar",
        body: [
          "Open a client, then Program. This is a week view you move through with the arrows, and every workout sits on a date.",
          "The Library panel on the right is your workout library. Search it, tap a day, and it lands on the date you chose.",
          "Each scheduled card has a menu: copy it, delete it, or edit it.",
        ],
        narration:
          "Open a client, then Program. It is a week view you move through with the arrows, and every workout sits on a date. The Library panel on the right is your workout library. Search it, tap a day, and it lands on the date you chose. Each card has a menu to copy it, delete it, or edit it.",
        check: "program",
        audioUrl: null,
      },
      {
        id: "prog-copyweek",
        title: "Copy Week",
        body: [
          "Copy Week takes the week you are looking at and pastes it forward as many weeks as you ask for, up to fifty-two.",
          "This is the single biggest time saver in the app. Build one good week, paste it for the block, then adjust the weeks that need adjusting.",
          "It will not create duplicates on a day that already has that workout.",
        ],
        narration:
          "Copy Week takes the week you are looking at and pastes it forward as many weeks as you ask for, up to fifty two. This is the single biggest time saver in the app. Build one good week, paste it across the block, then go back and adjust only the weeks that need adjusting. And it will not create duplicates on a day that already has that workout on it.",
        audioUrl: null,
      },
      {
        id: "prog-editor",
        title: "Building a workout",
        body: [
          "The editor has three tabs. Program assigns an existing library day. Create builds one from scratch — name it, add sections, add exercises, and you can dictate instead of typing. Edit changes the one already assigned.",
          "Per exercise you set sets, volume, volume type, rest and a cue. Volume type is what lets one field hold twelve reps, twelve to fifteen, thirty seconds, or three sets of twenty second holds, without lying about any of them.",
          "Sets, reps and load edit inline and save when you click away. There is no separate save button on those.",
          "Added a row you did not want? Each exercise row has a small × on the right. Tap it and the row is gone.",
        ],
        narration:
          "The editor has three tabs. Program assigns an existing library day. Create builds one from scratch. Edit changes the one already assigned. For each exercise you set sets, volume, volume type, rest, and a cue. Volume type is what lets a single field hold twelve reps, or twelve to fifteen, or thirty seconds, or three sets of twenty second holds, without lying about any of them. Sets, reps, and load save when you click away. And if you add a row you did not want, each row has a small cross on the right. Tap it and it is gone.",
        audioUrl: null,
      },
      {
        id: "prog-duplicate",
        title: "Starting from one of the gym's programmes",
        body: [
          "There are ready-made programmes in the library — the corrective tracks, the splits, the solo plans. You can assign any of them as they are.",
          "If you want to change one, duplicate it first. That gives you your own copy to edit however you like, and leaves the original alone for everyone else.",
          "The copy arrives as a draft, not live, so nothing reaches a client until you say so.",
          "You cannot edit the gym's originals directly, and that is deliberate: they are running on other trainers' clients right now.",
        ],
        narration:
          "There are ready-made programmes in the library. The corrective tracks, the splits, the solo plans. You can assign any of them as they are. If you want to change one, duplicate it first. That gives you your own copy to edit however you like, and leaves the original alone for everybody else. The copy arrives as a draft, not live, so nothing reaches a client until you say so. You cannot edit the gym's originals directly, and that is deliberate. They are running on other trainers' clients right now.",
        route: "/library/programs",
        routeLabel: "Open Programs",
        audioUrl: null,
      },
      {
        id: "prog-launch",
        title: "Running the session",
        body: [
          "Launch Session from the day, or tap the client on Home. That opens the logger, which is what you use standing on the floor with them.",
          "One rule that will save you an argument with the app: reps come from what you programmed, weights come from their history. The logger is not trying to guess the reps for you.",
        ],
        narration:
          "Launch Session from the day, or just tap the client on Home. That opens the logger, which is what you use standing on the floor with them. One rule that will save you an argument with the app. Reps come from what you programmed. Weights come from their history. The logger is not trying to guess reps for you.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "library",
    title: "The library",
    blurb: "Exercises, videos, workouts, programs, recipes. Shared by everyone.",
    steps: [
      {
        id: "lib-exercises",
        title: "Exercises",
        body: [
          "Every movement in the system, with muscle group, modality, equipment and a demo video where one has been attached. Search it before you invent a name — a movement that already exists under a slightly different name is how a library turns to mush.",
          "This library is shared across every trainer on the instance. What you add, everyone can use.",
        ],
        narration:
          "Every movement in the system, with its muscle group, modality, equipment, and a demo video where one has been attached. Search before you invent a name. A movement that already exists under a slightly different name is how a library turns to mush. And remember this library is shared with every trainer here. What you add, everyone can use.",
        route: "/library/exercises",
        routeLabel: "Open Exercise Library",
        audioUrl: null,
      },
      {
        id: "lib-mine",
        title: "This library is yours",
        body: [
          "You start with every movement the gym has built up — hundreds of them, with the videos already attached. Nothing is empty on your first day.",
          "But it is your copy. Rename something, swap a video, change the equipment, delete one you never use: it changes for you and for nobody else. No other trainer sees it, and the original stays as it was for them.",
          "That works the other way too. If the owner adds a movement or fixes a bad video, you get it — unless you have already changed that particular one yourself, in which case yours wins.",
          "Add anything you are missing. Yours stay yours.",
        ],
        narration:
          "You start with every movement the gym has built up. Hundreds of them, videos already attached, nothing empty on your first day. But it is your copy. Rename something, swap a video, change the equipment, delete one you never use, and it changes for you and nobody else. The original stays as it was for every other trainer. That works the other way too. If the owner adds a movement or fixes a bad video you get it, unless you have already changed that particular one yourself, in which case yours wins.",
        route: "/library/exercises",
        routeLabel: "Open the library",
        audioUrl: null,
      },
      {
        id: "lib-videos",
        title: "Exercise videos",
        body: [
          "Videos get found and attached automatically. This screen is the review queue, newest first, and every row has a one-tap undo.",
          "It is inverted on purpose: things go live and you take down the wrong ones, rather than four hundred videos waiting on somebody to approve them one at a time.",
        ],
        narration:
          "Videos get found and attached automatically. This screen is the review queue, newest first, and every row has a one tap undo. It works that way on purpose. Things go live and you take down the wrong ones, rather than four hundred videos sitting in a queue waiting for somebody to approve them one at a time.",
        route: "/library/videos",
        routeLabel: "Open Video Queue",
        audioUrl: null,
      },
      {
        id: "lib-workouts",
        title: "Workouts and programs",
        body: [
          "Workouts are single days. Programs are the structures those days sit inside — phases, levels, blocks, whatever the structure calls for.",
          "The app does not force one shape of program on you. A three-phase corrective track, a five-day split, a single maintenance session — all of them fit.",
          "One thing to know: the New Program button on the programs screen does nothing yet. Programs get created through assigning and building, not from that button.",
        ],
        narration:
          "Workouts are single days. Programs are the structures those days sit inside. Phases, levels, blocks, whatever the structure calls for. The app does not force one shape of program on you. A three phase corrective track, a five day split, a single maintenance session, they all fit. One thing to know. The New Program button on the programs screen does nothing yet. Programs get created by assigning and building, not from that button.",
        route: "/library/programs",
        routeLabel: "Open Programs",
        audioUrl: null,
      },
      {
        id: "lib-recipes",
        title: "Recipes",
        body: [
          "Build a recipe from the food database so the macros are real, or just type it out when you are in a hurry. Set servings and it does the per-serving maths.",
          "Clients can submit recipes. Those wait for a trainer to approve them before anyone else sees them.",
        ],
        narration:
          "Build a recipe from the food database so the macros are real, or just type it out when you are in a hurry. Set the servings and it does the per serving maths for you. Clients can submit their own recipes, and those wait for a trainer to approve them before anyone else sees them.",
        route: "/recipes",
        routeLabel: "Open Recipes",
        audioUrl: null,
      },
    ],
  },

  {
    id: "nutrition",
    title: "Nutrition",
    blurb: "Plans, targets, logging, and the printable version.",
    steps: [
      {
        // Brooke Orton's first question, 23 Aug: "How do I set nutrition" /
        // "Macros and cals". The walkthrough went straight to meal plans and
        // never said where the numbers themselves come from — which is the step
        // before, and the one everything else is measured against.
        id: "nut-targets",
        title: "Setting the numbers",
        body: [
          "Open the client, then Nutrition, then Set targets. Protein, carbs and fat are the numbers you decide; type them and the calories fill themselves in at 4, 4 and 9. You can still type calories directly if you want to override it.",
          "These targets are yours. Nothing in the app changes a number you set — not the AI, not a new plan, not a weigh-in. Everything else measures against them.",
          "Change them whenever you like. The old set is kept with its date, so you can see what the numbers were when a stretch of results happened.",
        ],
        narration:
          "Open the client, then Nutrition, then Set targets. Protein, carbs and fat are the numbers you decide. Type them and the calories fill themselves in, at four, four and nine. You can still type calories directly if you want to override that. These targets are yours: nothing in the app changes a number you set, not the A I, not a new plan, not a weigh in. Everything else is measured against them. Change them whenever you like. The old set is kept with its date, so you can see what the numbers were when a stretch of results happened.",
        route: "/nutrition",
        routeLabel: "Open Nutrition",
        manual: [
          "Same screen either way — Set targets is a plain form. The calories still calculate themselves from the macros.",
        ],
        manualNarration:
          "Same screen either way. Set targets is a plain form, and the calories still calculate themselves from the macros.",
        audioUrl: null,
      },
      {
        id: "nut-plans",
        title: "Meal plans",
        body: [
          "Pick a client at the top of the Nutrition screen. Their plan is a set of meals, each with items and macros, and it is versioned — you can see what changed and when.",
          "Plans can be dated to start in the future. One flips to live on its start date without you doing anything.",
          "If you have the AI build the plan, it has to land on the targets you set — within about 3% on calories and 5g on each macro. The draft screen prints what the plan actually comes to next to the target, and if it could not hit them it says so in orange rather than handing you a plan that quietly disagrees with itself.",
        ],
        narration:
          "Pick a client at the top of the Nutrition screen. Their plan is a set of meals, each with its items and macros, and it is versioned, so you can see what changed and when. Plans can be dated to start in the future, and one flips over to live on its start date. If you have the A I build the plan, it has to land on the targets you set, within about three percent on calories and five grams on each macro. The draft prints what the plan comes to next to the target, and says so in orange if it could not hit them.",
        route: "/nutrition",
        routeLabel: "Open Nutrition",
        manual: [
          "Build the plan by hand: add each meal, then the foods in it, and the macros total themselves as you go.",
          "Save a meal you use often to the library and it drops into the next plan in one tap. After a few clients you will have most of what you need already saved.",
        ],
        manualNarration:
          "Build the plan by hand. Add each meal, then the foods in it, and the macros total themselves as you go. Save a meal you use often to the library and it drops into the next plan in one tap. After a few clients you will have most of what you need already saved.",
        audioUrl: null,
      },
      {
        id: "nut-logging",
        title: "What the client does",
        body: [
          "They log each meal as eaten, partial, off-plan or skipped, and they can photograph anything off-plan. The header on their app counts calories and macros against target as the day goes.",
          "Off-plan meals get estimated so their numbers are not simply blank for the day.",
        ],
        narration:
          "They log each meal as eaten, partial, off plan, or skipped, and they can photograph anything off plan. The header of their app counts calories and macros against target as the day goes on. Off plan meals get estimated, so their numbers are not simply blank for the day.",
        audioUrl: null,
      },
      {
        id: "nut-print",
        title: "Printing it",
        body: [
          "There is a print export on the nutrition screen that produces a real PDF of the plan.",
          "Some clients want paper on the fridge. Give them paper on the fridge.",
        ],
        narration:
          "There is a print export on the nutrition screen that produces a real P D F of the plan. Some clients want paper on the fridge. Give them paper on the fridge.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "progress",
    title: "Progress and measurement",
    blurb: "Charts, body fat, photos, and the movement screen.",
    steps: [
      {
        id: "prog-charts",
        title: "Progress",
        body: [
          "Pick a client and you get weight, body fat, lean mass and fat mass over time, plus goals, a consistency calendar, personal bests, and a then-versus-now comparison.",
          "Progress photos live here too. They are private to the client and to you.",
        ],
        narration:
          "Pick a client and you get weight, body fat, lean mass, and fat mass over time. Plus goals, a consistency calendar, personal bests, and a then versus now comparison. Progress photos live here as well, and they are private to the client and to you.",
        route: "/progress",
        routeLabel: "Open Progress",
        audioUrl: null,
      },
      {
        id: "prog-bodyfat",
        title: "Body fat",
        body: [
          "The body fat screen takes seven-site or four-site caliper readings and does the maths, with a diagram showing you each site.",
          "Use the same method every time on the same person. A number from a different protocol is not comparable, and a trend built out of two protocols is worse than no trend.",
        ],
        narration:
          "The body fat screen takes seven site or four site caliper readings and does the maths, with a diagram showing you each site. Use the same method every time on the same person. A number from a different protocol is not comparable, and a trend built out of two different protocols is worse than having no trend at all.",
        route: "/log-bodyfat",
        routeLabel: "Open Body Fat",
        audioUrl: null,
      },
      {
        id: "prog-movement",
        title: "The movement screen",
        body: [
          "This is a camera-based movement capture with a voice coach that talks the person into position. You can run it on yourself, or on a client from their page.",
          "Clients can only run it themselves if you have switched it on for them, which you do from Movement, then Testers.",
        ],
        narration:
          "This is a camera based movement capture, with a voice coach that talks the person into position. You can run it on yourself, or on a client from their page. Clients can only run it themselves if you switch it on for them, and you do that from Movement, then Testers.",
        route: "/movement/testers",
        routeLabel: "Open Movement Testers",
        audioUrl: null,
      },
    ],
  },

  {
    id: "schedule",
    title: "Schedule and calendar",
    blurb: "Where your sessions come from, and what to do when they move.",
    steps: [
      {
        id: "sched-gcal",
        title: "Connecting Google Calendar",
        body: [
          "Settings, Integrations, Connect. Once connected, your calendar events become appointments in the app, and events that look like payments become payment records.",
          "It syncs twice a day in full, with a narrower catch-up every hour for same-day moves. Sync Now is there when you cannot wait.",
          "Your calendar is yours. Another trainer's sync cannot see it and yours cannot see theirs.",
        ],
        narration:
          "Settings, Integrations, Connect. Once it is connected, your calendar events become appointments in the app, and events that look like payments become payment records. It syncs twice a day in full, with a narrower catch up every hour to pick up same day moves. Sync Now is there for when you cannot wait. And your calendar is yours. Another trainer's sync cannot see it, and yours cannot see theirs.",
        route: "/settings",
        routeLabel: "Open Settings",
        check: "calendar",
        audioUrl: null,
      },
      {
        id: "sched-proposals",
        title: "Proposals",
        body: [
          "When the app notices a session appears to have moved, been cancelled or gone missing, it does not act. It writes a proposal and waits for you.",
          "Schedule, then Proposals. Approve or reject each one. Nothing moves without you.",
          "Check it weekly. They accumulate quietly, and a backlog of eighty is not useful to anybody.",
        ],
        narration:
          "When the app notices that a session appears to have moved, been cancelled, or gone missing, it does not act on it. It writes a proposal and waits for you. Schedule, then Proposals. Approve or reject each one. Nothing moves without you. Check it weekly, because they pile up quietly, and a backlog of eighty proposals is not useful to anybody.",
        route: "/schedule/proposals",
        routeLabel: "Open Proposals",
        audioUrl: null,
      },
      {
        id: "sched-reset",
        title: "When the calendar goes wrong",
        body: [
          "There is a Reset and Re-sync in Integrations. It deletes the app's calendar events and pulls them again from scratch.",
          "It is safe, but it is not gentle, and you should try Sync Now first. Disconnect revokes access at Google and deletes the stored token.",
        ],
        narration:
          "There is a Reset and Re sync in Integrations. It deletes the app's calendar events and pulls them again from scratch. It is safe, but it is not gentle, so try Sync Now first. Disconnect revokes access at Google and deletes the stored token.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "money",
    title: "Payments",
    blurb: "Reminders, records, and the rules about who sees what.",
    steps: [
      {
        id: "money-screen",
        title: "The payments screen",
        body: [
          "One card per client. You can create a payment record with an amount, a due date and a note, edit an amount inline, and delete one.",
          "Send Payment Reminder emails them. There is an email preview first — read it before you send it. If a client has no email on file the button tells you rather than failing silently.",
        ],
        narration:
          "One card per client. You can create a payment record with an amount, a due date, and a note. You can edit an amount by clicking it, and you can delete one. Send Payment Reminder emails them, and there is a preview first. Read it before you send it. If a client has no email on file, the button tells you, rather than failing quietly.",
        route: "/payments",
        routeLabel: "Open Payments",
        audioUrl: null,
      },
      {
        id: "money-auto",
        title: "What happens on its own",
        body: [
          "Reminders for what is due are generated once a day. Amounts get recalculated three times a day off the calendar, so a week where somebody trained four times instead of six is right by the time you look at it.",
          "Nothing is emailed automatically. Generating a reminder and sending it are two different things, and the second one is you.",
        ],
        narration:
          "Reminders for what is due get generated once a day. Amounts are recalculated three times a day off the calendar, so a week where somebody trained four times instead of six is already correct by the time you look at it. But nothing is emailed automatically. Generating a reminder and sending it are two different things, and the second one is you.",
        audioUrl: null,
      },
      {
        id: "money-privacy",
        title: "Money never crosses over",
        body: [
          "Your payments, your reminders, your billing adjustments — only yours. Another trainer opening this same screen sees their own and nothing of yours.",
          "This one was checked directly against the database rather than assumed, because it is the thing that would matter most if it were wrong.",
        ],
        narration:
          "Your payments, your reminders, and your billing adjustments are yours only. Another trainer opening this same screen sees their own, and nothing of yours. This one was checked directly against the database rather than assumed, because it is the thing that would matter most if it were wrong.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "messages",
    title: "Messages",
    blurb: "One to one, the group, and announcements.",
    steps: [
      {
        id: "msg-inbox",
        title: "Your inbox",
        body: [
          "A thread per client, plus the group tab. Individual threads are private between you and that client — no other trainer sees them.",
          "This is where clients will ask you things. Answer here rather than by text, so the context stays with the app.",
        ],
        narration:
          "A thread per client, plus the group tab. Individual threads are private between you and that client. No other trainer sees them. This is where clients will ask you things, so answer here rather than by text message, and the context stays with the app.",
        route: "/messages",
        routeLabel: "Open Messages",
        check: "message",
        audioUrl: null,
      },
      {
        id: "msg-group",
        title: "Your group chat",
        body: [
          "You have a group chat of your own — you and your clients, nobody else's. Another trainer's clients are not in it and cannot see it.",
          "Whoever posts shows up as themselves, with their own name and face. Your weekly challenge and its board live alongside it.",
        ],
        narration:
          "You have a group chat of your own. You and your clients, nobody else's. Another trainer's clients are not in it and cannot see it. Whoever posts shows up as themselves, with their own name and their own face. Your weekly challenge and its board live alongside it.",
        audioUrl: null,
      },
      {
        id: "msg-challenge",
        title: "The weekly challenge",
        body: [
          "A new one starts in your group every Monday and scores through Sunday. It rotates through four kinds — most days trained, log every day, and so on — and your rotation is yours, so two coaches are not stuck running the same one.",
          "Everyone in your group is on the board whether they tap Join or not; joining is how a client says they want to be in it, and the board only names the people who opted in. There is an anonymous group total so it looks alive on day one.",
          "Sunday evening it scores itself, announces the winner in your chat, and starts next week's. You can also start one by hand from the group thread, or end the running one early — that only ever touches your group.",
          "You are on your own board's roster for the group total but never ranked. It is your clients' board.",
        ],
        narration:
          "A new challenge starts in your group every Monday and scores through Sunday. It rotates through four kinds, and your rotation is your own. Everyone in your group is on the board whether they tap join or not. Joining is how a client says they want to be named on it. There is an anonymous group total as well, so it looks alive from day one. On Sunday evening it scores itself, announces the winner in your chat, and starts next week's. You can also start one by hand, or end the running one early, and that only ever touches your group. You are never ranked on it. It is your clients' board.",
        audioUrl: null,
      },
      {
        id: "msg-announce",
        title: "Announcements",
        body: [
          "An announcement reaches every client on the instance, not only yours, and clients cannot turn announcements off.",
          "That is correct — announcements are gym-wide news. It also means the bar for sending one is high. If it applies only to your clients, message them, do not announce it.",
        ],
        narration:
          "An announcement reaches every client on the instance, not only yours, and clients cannot switch announcements off. That is correct, because announcements are gym wide news. It also means the bar for sending one is high. If it only applies to your clients, message them. Do not announce it.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "ai",
    title: "The AI",
    blurb: "What it can do, where it draws the line, and what it costs.",
    steps: [
      {
        id: "ai-drawer",
        title: "The assistant",
        body: [
          "The AI button in the corner opens an assistant that can read your data and act on it. Ask it to write a workout, look up a client's history, or explain what it is seeing in somebody's numbers.",
          "It is scoped to you. It can find your clients and nobody else's, and it refuses rather than guessing when it is asked about a client who is not on your roster.",
        ],
        narration:
          "The A I button in the corner opens an assistant that can read your data and act on it. Ask it to write a workout, look up a client's history, or explain what it is seeing in somebody's numbers. It is scoped to you. It can find your clients and nobody else's, and if it is asked about a client who is not on your roster, it refuses rather than guessing.",
        aiOnly: true,
        audioUrl: null,
      },
      {
        id: "ai-where",
        title: "Where else it turns up",
        body: [
          "The recommendation at the end of an assessment. The workout assist on a client's page. The meal plan builder. The Saturday focus lines. The video matching in the library.",
          "Every one of them proposes. None of them publishes to a client on its own.",
        ],
        narration:
          "It also turns up in the recommendation at the end of an assessment, the workout assist on a client's page, the meal plan builder, the Saturday focus lines, and the video matching in the library. Every one of them proposes. None of them publishes anything to a client on its own.",
        aiOnly: true,
        audioUrl: null,
      },
      {
        id: "ai-health",
        title: "AI health",
        body: [
          "Settings, then AI. It shows every AI surface in the app: what ran, what failed, what has never been used, and the spend against the monthly cap.",
          "There is a hard cap. When it is reached, AI features stop rather than quietly running up a bill.",
        ],
        narration:
          "Settings, then A I. It shows every A I surface in the app. What has run, what has failed, what has never been used, and the spend against the monthly cap. There is a hard cap, and when it is reached, the A I features stop, rather than quietly running up a bill.",
        route: "/settings/ai-health",
        routeLabel: "Open AI Health",
        aiOnly: true,
        audioUrl: null,
      },
      {
        id: "ai-own-account",
        title: "Using your own Claude account",
        body: [
          "The AI built into the app runs on the instance owner's account and against their cap. That is fine for normal use.",
          "If you want to work the way the owner does — a Claude conversation that can read and write your side of the app directly — you connect your own Claude account, and your usage is billed to you rather than to the instance.",
          "This is designed and not yet built. It is here so you know it is coming and do not go looking for the button.",
        ],
        narration:
          "The A I built into the app runs on the instance owner's account, against their cap, and that is fine for normal use. If you want to work the way the owner does, with a Claude conversation that can read and write your side of the app directly, you connect your own Claude account, and your usage is billed to you rather than to the instance. This part is designed and not yet built. It is mentioned here so you know it is coming and do not go looking for a button that is not there.",
        status: "preview",
        audioUrl: null,
      },
      {
        id: "ai-no-claude",
        title: "If you do not want a Claude account",
        body: [
          "You do not need one. Everything in this tutorial works without it. The connected account is a power tool, not a requirement.",
          "Trainers who skip it lose nothing on any screen — they simply do their thinking in the app instead of in a chat window.",
        ],
        narration:
          "And you do not need one. Everything in this tutorial works without it. A connected account is a power tool, not a requirement. Trainers who skip it lose nothing on any screen. They just do their thinking inside the app instead of in a chat window.",
        audioUrl: null,
      },
    ],
  },

  {
    id: "finish",
    title: "Going live",
    blurb: "The checklist, and the honest list of rough edges.",
    steps: [
      {
        id: "finish-checklist",
        title: "Your setup checklist",
        body: [
          "The checklist on this screen is not a list of boxes you tick. It reads your actual account and tells you what is genuinely done.",
          "Anything still open has a link straight to the screen that fixes it.",
        ],
        narration:
          "The checklist on this screen is not a list of boxes you tick yourself. It reads your actual account and tells you what is genuinely done. Anything still open has a link straight to the screen that fixes it.",
        audioUrl: null,
      },
      {
        id: "finish-rough",
        title: "Known rough edges",
        body: [
          "Calendar in the sidebar takes you to Home — that is where your calendar already is, so it is redundant rather than broken.",
          "None of these will hurt you. They are listed so that when you hit one you know it is the app and not you.",
        ],
        narration:
          "One thing is known to be rough. Calendar in the sidebar takes you to Home, which is where your calendar already is, so it is redundant rather than broken. It will not hurt you. It is listed here so that when you hit it, you know it is the app and not you.",
        audioUrl: null,
      },
      {
        id: "finish-help",
        title: "Where to go next",
        body: [
          "Settings has a searchable help centre with a short article per feature. It is the reference; this was the walkthrough.",
          "The star in the corner reports anything wrong. Use it liberally — a bug nobody reports is a bug nobody fixes.",
        ],
        narration:
          "Settings has a searchable help centre with a short article for each feature. That is the reference. This was the walkthrough. And the star in the corner reports anything that is wrong. Use it liberally. A bug nobody reports is a bug nobody fixes.",
        route: "/settings",
        routeLabel: "Open Settings",
        audioUrl: null,
      },
    ],
  },
];

/** Every step, flattened, in the order a trainer walks them. */
export function allSteps(
  opts?: { usesAi?: boolean },
): (TutorialStep & { chapterId: string; chapterTitle: string })[] {
  // Default true. Somebody who has not answered yet reads the walkthrough the
  // app actually ships with, rather than the stripped one.
  const usesAi = opts?.usesAi !== false;
  return TUTORIAL.flatMap((c) =>
    c.steps
      // A step that exists only because of AI is removed, not rewritten —
      // there is no manual equivalent of "here is the AI drawer", and leaving
      // it in with an apology attached is exactly the walkthrough-with-holes
      // Dustin rejected.
      .filter((s) => usesAi || !s.aiOnly)
      .map((s) => {
        const st = { ...s, chapterId: c.id, chapterTitle: c.title };
        if (usesAi || !s.manual) return st;
        // The manual twin takes over the step entirely, so the reader never
        // sees a description of a feature they do not have.
        return { ...st, body: s.manual, narration: s.manualNarration || s.narration };
      }),
  );
}

export function stepCount(): number {
  return TUTORIAL.reduce((n, c) => n + c.steps.length, 0);
}
