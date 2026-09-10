import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerLayoutWrapper from "@/components/TrainerLayoutWrapper";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
import SessionDock from "@/components/SessionDock";
import ClientTopBar from "@/components/ClientTopBar";
import RealtimeScheduleSync from "@/components/RealtimeScheduleSync";
import RefreshOnReturn from "@/components/RefreshOnReturn";
import PushRegister from "@/components/PushRegister";
// Web Push reaches the installed web app; PushRegister only ever reached the
// Android APK, which on 16 Aug was 2 of 29 clients. Both are mounted: a person
// with the APK and a browser subscription is reached twice, which is a far
// better problem than the one being fixed.
import WebPushRegister from "@/components/WebPushRegister";
import MessageNotifier from "@/components/MessageNotifier";
import { NotificationProvider } from "@/lib/useNotificationFeed";
import RefreshHandle from "@/components/RefreshHandle";
import GlobalCoach from "@/components/GlobalCoach";
import { isTrainerEmail, noteTrainerEmail } from "@/lib/trainer";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { requireUser } from "@/lib/auth/serverUser";
import { coachForViewer } from "@/lib/coachIdentity";
import { CoachProvider } from "@/lib/useCoach";
import { isClientMode } from "@/lib/client-mode";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Verifies the session token locally when it can, so a slow or unreachable
  // Supabase Auth cannot stop this layout — and therefore the whole app — from
  // rendering. Falls back to asking Supabase, capped, when it cannot.
  // src/lib/auth/verifyJwt.ts has the incident and the trade-off.
  // DEGRADED IS NOT SIGNED OUT. requireUser keeps the two apart: an
  // unreachable auth service sends somebody to /reconnecting with their session
  // intact, never to /login. This layout is the gate the whole app passes
  // through, so it is the one that was signing Jenn out on a bad minute of
  // gym wi-fi. See src/lib/auth/serverUser.ts.
  const user = await requireUser(supabase);

  const email = user?.email ?? "";

  // WHOSE COACH. Resolved once, here, and handed to every client component
  // through the provider — 66 files rendered a coach's name from a build-time
  // env var, which one deployment cannot make correct for two trainers.
  // Degrades to the owner's name and NO FACE if it cannot resolve: a generic
  // name is a small wrong, another trainer's photograph is the thing this
  // exists to prevent.
  const coach = await coachForViewer(supabase as never, user?.id);

  // WHICH SHELL. This used to be isTrainerEmail(email) alone — a build-time
  // list of two addresses — while the line above already asked the database the
  // same question and got a better answer. A trainer added from inside the app
  // was therefore handed the CLIENT app on every page: no roster, no dock, no
  // programme builder, over rows RLS would have given them.
  //
  // coach.isSelf is true exactly when a `trainers` row matches this auth user.
  // viewerIsTrainer() covers the row whose auth_user_id was never stamped, and
  // remembers the answer so the client components below — which cannot await
  // anything — see the same thing.
  const isTrainer = isTrainerEmail(email)
    || (coach.isSelf && !!coach.trainerId)
    || (await viewerIsTrainer(supabase, user));
  if (isTrainer) noteTrainerEmail(email);

  if (isTrainer) {
    // THE CHROME STARTS WHERE THE PAGE STARTS. Every page under this layout
    // picks client-vs-trainer from the symmetry_client_mode cookie; the wrapper
    // used to pick from localStorage and could disagree — a client page inside
    // trainer chrome, with no bottom tabs. Dustin, 10 Sep: "my own client view
    // nav tabs r gone!" Handing it the cookie's answer means the two cannot
    // start apart. (A layout cannot see ?as=; the wrapper reconciles that on
    // mount, the same way the pages honour it.)
    const initialClientMode = await isClientMode();
    return (
      // One provider, wrapping everything that reads unread — the bell in
      // HeaderAssist, the banner, and the nav badge. Mounted here so there can
      // only ever be one of it.
      <CoachProvider value={coach}>
      <NotificationProvider>
        <RealtimeScheduleSync />
        <RefreshOnReturn />
        <PushRegister />
        <WebPushRegister />
        <MessageNotifier />
          <TrainerLayoutWrapper initialClientMode={initialClientMode}>{children}</TrainerLayoutWrapper>
      </NotificationProvider>
      </CoachProvider>
    );
  }

  return (
    <CoachProvider value={coach}>
    <NotificationProvider>
    <div className="min-h-screen app-bg">
      <RealtimeScheduleSync />
      <RefreshOnReturn />
      {/* Clients register for push AND get the in-app new-message banner too. */}
      <PushRegister />
      <WebPushRegister />
      <MessageNotifier />
      {/* THE SAME TOP BAR THE TRAINER SEES IN CLIENT VIEW. Dustin, 9 Sep:
          "i def want the branded bar w logo just like mine" -- and, more to the
          point, "we need to make my client app work exactly like any other
          clients so i can test the same exact app they are using."

          This was a bare sticky strip with the feedback button pushed right,
          while Client View had the branded bar. Same app, two different chromes,
          and he only found out by asking. It reserves its own row in the page
          flow exactly as the strip did, so it still cannot cover content. */}
      <ClientTopBar />
      {/* Deliberate pull-to-refresh. See RefreshHandle for why the old
          swipe-anywhere version was replaced by a handle you have to grab. */}
      <RefreshHandle />
      <div className="pb-20">{children}</div>
      <SessionDock />
      {/* Registers the service worker and offers the install where the
          platform allows it. Renders nothing once installed or dismissed. */}
      <InstallPrompt />
      {/* One coach, every client screen. It steps aside where a screen mounts a
          better-informed one (nutrition) and never appears on the logger — see
          GlobalCoach. */}
      <GlobalCoach />
      <BottomNav />
    </div>
    </NotificationProvider>
    </CoachProvider>
  );
}
