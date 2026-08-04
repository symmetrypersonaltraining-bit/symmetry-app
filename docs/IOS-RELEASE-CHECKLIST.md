# Getting Symmetry onto iPhones (TestFlight)

**Why now:** Apple Health cannot be read without an iOS build, and the Apple
Developer account is active — the app was just never completed and distributed.
The build workflow existed but sat in `ios-release-workflow.yaml`, which
**Codemagic never reads**. It only reads `codemagic.yaml`. As of 2026-08-04 the
iOS workflow is merged in and selectable.

Written 2026-08-04. Everything in Part 1 needs a human with the Apple account.

---

## Part 1 — What only you can do (about 45 minutes, once)

### 1. Register the app in App Store Connect

1. appstoreconnect.apple.com → **Apps** → **+** → **New App**
2. Platform **iOS**, name **Symmetry**, primary language English (U.S.)
3. **Bundle ID: `com.symmetry.app`** — must match exactly. If it isn't in the
   dropdown, create it first at developer.apple.com → Certificates, IDs & Profiles
   → Identifiers → **+** → App IDs → App, description "Symmetry", bundle ID
   `com.symmetry.app` explicit.
   **While you're there, tick the HealthKit capability** — doing it now saves a
   second trip when health sync starts.
4. SKU can be anything (`symmetry-app` is fine)
5. After it's created, note the **Apple ID** number on the App Information page —
   a 10-digit number. That goes in step 4 below.

### 2. Create an App Store Connect API key

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+** → name it `codemagic`, access **App Manager**
3. Download the `.p8` file — **you get exactly one download**. Keep it.
4. Note the **Issuer ID** (top of the page) and the **Key ID** (next to the key)

### 3. Wire the key into Codemagic

1. Codemagic → **Teams / Personal account** → **Integrations** → **Developer Portal** → **Connect**
2. Paste the Issuer ID, Key ID, and the `.p8` contents
3. **Name the integration exactly `codemagic_asc`** — the workflow references that
   name and will fail on anything else

### 4. Fill in the Apple ID number

In `codemagic.yaml`, find `APP_STORE_APPLE_ID: ""` in the `ios-testflight`
workflow and put the 10-digit number from step 1 between the quotes. Send it to
me and I'll commit it, or edit it directly on GitHub.

### 5. Create the TestFlight group

App Store Connect → your app → **TestFlight** → **Groups** → **+** → name it
exactly **`Clients`**. Make it an **external** group.

> The first external build needs a light Beta App Review from Apple — usually a
> day or two, and it is not the full App Store review. After that, builds go to
> testers immediately. Internal testing (your own account) needs no review at all,
> so if you want it on your phone tonight, add yourself as an internal tester and
> skip the group for now.

---

## Part 2 — What happens automatically

Run the **Symmetry iOS (TestFlight)** workflow in Codemagic. It will:

- install Capacitor and the speech plugin (CI only, not in `package.json`)
- generate the iOS project from `capacitor.config.ts` — which points at the live
  Vercel URL, so the iPhone app loads the same web app as the Android one and
  updates with every web deploy
- patch `Info.plist` with the microphone and speech-recognition usage strings,
  and set `ITSAppUsesNonExemptEncryption = false` so TestFlight skips the
  export-compliance prompt
- generate the icon set
- sign with the managed profile from `codemagic_asc`
- archive the IPA and upload it to TestFlight, into the `Clients` group

Build number comes from Codemagic's `BUILD_NUMBER`, marketing version is pinned
at 1.0.0. Bump the marketing version in the workflow when it means something.

---

## Part 2b — What the pre-flight already fixed

Checked 2026-08-04 before you run it, so these don't cost you a failed build:

- **Building the workspace, not the project.** The step said
  `build-ipa --project ios/App/App.xcodeproj`. Capacitor's iOS dependencies come
  in through CocoaPods, and `npx cap sync ios` generates `App.xcworkspace` —
  building the bare project fails to link them. Changed to `--workspace`.
- **A blank icon can no longer ship silently.** Both icon steps ended in
  `|| true`, so if generation failed the build carried on and uploaded
  Capacitor's placeholder icon, which Apple rejects. It now fails at the icon
  step, where it is obvious and costs nothing.
- **Verified:** `capacitor-web/index.html` exists, so `npx cap add ios` has a
  webDir to point at; bundle ID in `capacitor.config.ts` is `com.symmetry.app`
  and matches what you register; the Info.plist patch path
  (`ios/App/App/Info.plist`) is right for Capacitor 6; the icon generator pulls
  the badge from the live site, which CI can reach.
- **Known and harmless:** `APP_STORE_APPLE_ID` is empty. Publishing resolves the
  app by bundle ID, so the build will still upload. Fill it in anyway (Part 1,
  step 4) so it is unambiguous.

## Part 3 — Things that will bite

**"No matching profiles found."** The bundle ID in App Store Connect doesn't match
`com.symmetry.app`, or the API key doesn't have App Manager access.

**Apple and web-wrapper apps.** Our app loads a remote URL. Apple rejects apps that
are *only* a website with no native value — guideline 4.2. We're better placed
than most (push notifications, native speech recognition, camera, and HealthKit
coming), but if a rejection mentions 4.2, the answer is to lean on those, not to
argue. Worth knowing before it happens rather than after.

**Privacy policy.** Required at submission. It is live at
`https://symmetry-app-omega.vercel.app/privacy` as of 2026-08-04.

**App Privacy questionnaire.** App Store Connect asks what data you collect before
the first build can be reviewed. Answer it from `/privacy` — health and fitness,
contact info, user content, identifiers; **not** used for tracking, **not** used
for advertising, linked to identity. Getting this wrong is a rejection and it is
purely a form.

**The first upload is the slow one.** Processing after upload takes 15–60 minutes
before the build appears in TestFlight. It is not stuck.

---

## Part 4 — After it's on phones

This is the point at which Apple Health becomes possible. The order from
`docs/HEALTH-SYNC-HANDOFF.md` doesn't change — Health Connect on Android first,
because it needs no store review to test — but Apple stops being blocked.

Android, for symmetry: we currently sideload an unsigned **debug** APK. Health
Connect works that way for testing, but a public Play listing needs the **Health
apps declaration form** and the same privacy policy URL. If TestFlight goes well,
the Play listing is the matching next step.
