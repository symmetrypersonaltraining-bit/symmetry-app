// /privacy — the published privacy policy.
//
// This exists because both app stores require a policy at a public URL before
// an app touches health data: Google Play's Health apps declaration form asks
// for the URL, and Apple will not grant the HealthKit entitlement without one.
// We had no policy at all, which quietly blocked both platforms.
//
// Deliberately OUTSIDE the (app) route group, so it renders with no session,
// no layout chrome and no Supabase call — a reviewer, or a client who has not
// logged in, has to be able to read it.
//
// It describes what the app does TODAY. The health-sync section is written for
// the integration described in docs/HEALTH-SYNC-HANDOFF.md and marked as not
// yet active, because a policy that claims a feature we do not have is worse
// than one that admits the date.

export const metadata = {
  title: "Privacy Policy — Symmetry Personal Training",
  description: "What the Symmetry Personal Training app collects, why, and who can see it.",
};

const UPDATED = "4 August 2026";
const CONTACT = "symmetrypersonaltraining@gmail.com";

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 8px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      color: "#1a1f2e", background: "#fff",
    }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px" }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: "#5b6478", margin: "0 0 26px" }}>
        Symmetry Personal Training · last updated {UPDATED}
      </p>

      <S title="Who this is about">
        <p style={{ marginTop: 0 }}>
          Symmetry Personal Training is a personal training studio run by Dustin Gautreaux.
          This app is used by Dustin and by the clients he trains. It is not a public
          product and it is not sold to anyone. If you are reading this, you are almost
          certainly one of about thirty-five people who train with him.
        </p>
        <p>
          Questions about anything here go to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </S>

      <S title="What the app collects">
        <p style={{ marginTop: 0 }}>Only what it needs to coach you:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li><b>Account</b> — your name, email address, and a password you set.</li>
          <li><b>Training</b> — your programme, the workouts scheduled for you, the sets,
            reps, weights, times and notes you log, and your session history.</li>
          <li><b>Nutrition</b> — your meal plan, what you log against it, foods and recipes
            you save, and photos you attach to a meal.</li>
          <li><b>Body metrics</b> — weight, body fat and measurements, when you or Dustin
            record them.</li>
          <li><b>Photos</b> — progress photos you take, and screenshots you attach to
            feedback. Progress photos are visible to you and to Dustin, and to nobody else
            unless you choose to share one to the group chat.</li>
          <li><b>Messages</b> — what you send to Dustin, and what you post in the group chat.</li>
          <li><b>Scheduling and payments</b> — your sessions, cancellations, and what is
            owed for them. The app does not process card payments and never sees a card
            number.</li>
          <li><b>Feedback</b> — bug reports you file in the app, including any screenshot
            you attach.</li>
        </ul>
        <p>
          The app does not collect your location, your contacts, or your browsing. There is
          no advertising in it, no advertising identifier, and no analytics or tracking
          product of any kind.
        </p>
      </S>

      <S title="Who can see it">
        <ul style={{ paddingLeft: 20, marginTop: 0 }}>
          <li><b>You</b> — everything of yours.</li>
          <li><b>Dustin</b> — your training, nutrition, metrics, photos, messages and
            scheduling, because that is what coaching you requires.</li>
          <li><b>Other clients</b> — only your <i>first name</i> and a count of days
            trained, and only on the community leaderboard and group challenge, and only if
            you turn that on. It is off by default. Nothing about your body, your weight,
            your food or your photos is ever shown to another client. Anything you post in
            the group chat is, obviously, visible to the group.</li>
        </ul>
        <p><b>Your data is never sold, and never shared for advertising or marketing.</b></p>
      </S>

      <S title="Companies that process data for us">
        <p style={{ marginTop: 0 }}>
          The app runs on services that necessarily handle your data on our behalf. They are
          bound to use it only to provide their service:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li><b>Supabase</b> — the database and file storage where everything lives.</li>
          <li><b>Vercel</b> — hosting for the app itself.</li>
          <li><b>Anthropic</b> — the AI features. Text and images you send to an AI feature
            (the coach chat, meal photo analysis, a bug-report screenshot) are sent to
            Anthropic to produce the response, and are not used to train their models.</li>
          <li><b>Google</b> — calendar sync for scheduling, and push notifications if you
            enable them.</li>
          <li><b>Resend</b> and <b>Twilio</b> — email and text messages the app sends you.</li>
        </ul>
      </S>

      <S title="Health and fitness data from other apps">
        <p style={{ marginTop: 0 }}>
          <i>This section describes a feature that is not switched on yet. It is published
          in advance because both app stores require it before the feature can ship.</i>
        </p>
        <p>
          If and when you choose to connect a health app or device — Apple Health, Android
          Health Connect, Garmin, Fitbit or similar — the app will read only the data types
          you approve, which may include steps, workouts, heart rate, sleep and body weight.
          Specifically:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Nothing is read until you connect the source and grant permission, per data
            type.</li>
          <li>It is used for one purpose: showing your training and progress inside this
            app, to you and to Dustin.</li>
          <li>It is <b>never</b> used for advertising or marketing, <b>never</b> sold, and
            <b> never</b> shared with a third party for their own purposes.</li>
          <li>Health data read from Apple Health is not stored in iCloud.</li>
          <li>You can disconnect a source at any time in Settings. Disconnecting stops any
            further reading immediately; ask us and we will delete what was already
            imported.</li>
        </ul>
      </S>

      <S title="How long it is kept, and how to get rid of it">
        <p style={{ marginTop: 0 }}>
          Your data is kept while you are training with Dustin, because the value of it is
          the history. When you stop, ask and it will be deleted — or ask for a copy first
          and you will get one. Individual items (a photo, a message, a logged meal) you can
          delete yourself in the app at any time.
        </p>
        <p>
          Deletion requests go to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and are
          actioned within 30 days.
        </p>
      </S>

      <S title="Security">
        <p style={{ marginTop: 0 }}>
          Access is controlled at the database itself, per row: a client account can only
          read and write its own records, enforced by the database rather than by the app
          asking nicely. Traffic is encrypted in transit. Photos are stored in access-
          controlled buckets.
        </p>
        <p>
          No system is perfect. If something goes wrong that affects your data, you will be
          told directly — not buried in a notice.
        </p>
      </S>

      <S title="Children">
        <p style={{ marginTop: 0 }}>
          The app is not intended for anyone under 16. If a minor trains with the studio,
          their account is set up and overseen by a parent or guardian.
        </p>
      </S>

      <S title="Changes">
        <p style={{ marginTop: 0 }}>
          If this policy changes in a way that affects what is collected or who can see it,
          you will be told in the app before it takes effect. The date at the top always
          reflects the current version.
        </p>
      </S>

      <p style={{ fontSize: 13, color: "#5b6478", borderTop: "1px solid #e3e8f0", paddingTop: 14 }}>
        Symmetry Personal Training · <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
