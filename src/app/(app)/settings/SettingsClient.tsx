"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme, THEMES, DEPTH_LEVELS } from "@/components/ThemeProvider";
import { AvatarSelf } from "@/components/Avatar";
import PaymentsSettingsCard from "@/components/PaymentsSettingsCard";
import BillingHistory from "@/components/BillingHistory";
import ExperienceSettings from "@/components/ExperienceSettings";
import NotificationSettings from "@/components/NotificationSettings";
import HelpCenter from "@/components/HelpCenter";
import { testRestAlarm } from "@/lib/restAlarm";
import { useTutorialVisibility } from "@/lib/useTutorialVisibility";
import TrainerProfileCard from "@/components/TrainerProfileCard";
import SettingsGroup from "@/components/SettingsGroup";
import TrainerBotSettings from "@/components/TrainerBotSettings";
import TrainerFaceSetCard from "@/components/TrainerFaceSetCard";
import AddTrainerCard from "@/components/AddTrainerCard";

interface Props {
  userEmail: string;
  userName: string;
  isTrainer: boolean;
  isInClientMode: boolean;
  userId: string;
  gcalSyncEnabled?: boolean;
  gcalConnected?: boolean;
  gcalStatus?: string | null;
  tutorialLive?: boolean;
  /** Owner-only controls are not drawn for a trainer who cannot use them. */
  isOwner?: boolean;
}

export default function SettingsClient({ userEmail, userName, isTrainer,
  isInClientMode, userId, gcalSyncEnabled, gcalConnected, gcalStatus, tutorialLive, isOwner }: Props) {
  // Per-trainer, not the app-wide flag above it: one trainer finishing the
  // guide must not take it away from the next one being onboarded.
  const { dismissed: tutorialHidden, hide: hideTutorial, show: showTutorial } = useTutorialVisibility();

  // The old flat layout, one tap away.
  //
  // Dustin, 22 Aug: "go ahead and reorganize... keep it revertable so i can
  // revert in the morning if i dont like it". A git revert needs me; this does
  // not. `classic` makes SettingsGroup render its children straight onto the
  // page exactly as before — same markup, no second copy to drift — so the old
  // Settings is a link at the bottom of the new one.
  const [classic, setClassic] = useState(false);
  useEffect(() => {
    try { setClassic(localStorage.getItem("symmetry_settings_classic") === "1"); } catch { /* fine */ }
  }, []);
  function toggleClassic() {
    const next = !classic;
    setClassic(next);
    try { localStorage.setItem("symmetry_settings_classic", next ? "1" : "0"); } catch { /* fine */ }
  }
  const { theme, setTheme, depth, setDepth } = useTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [gcalSync, setGcalSync] = useState(gcalSyncEnabled ?? false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [gcalBanner, setGcalBanner] = useState<string | null>(gcalStatus ?? null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (gcalBanner) {
      const t = setTimeout(() => setGcalBanner(null), 5000);
      return () => clearTimeout(t);
    }
  }, [gcalBanner]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setPasswordError("Password must be at least 6 characters"); return; }
    setUpdatingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) { setPasswordError(error.message); }
    else { setPasswordSuccess(true); setNewPassword(""); setConfirmPassword(""); setShowChangePassword(false); setTimeout(() => setPasswordSuccess(false), 3000); }
  }

  async function toggleGcalSync(val: boolean) {
    setGcalSync(val);
    const supabase = createClient();
    // Checked. The switch moves on screen first, so an unchecked failure left
    // a trainer believing they had turned calendar sync off — and it kept
    // running, twice a day, overwriting the appointments they had just fixed
    // by hand. Put the switch back rather than leave it lying.
    const { error } = await supabase
      .from("trainer_settings")
      .upsert({ user_id: userId, gcal_sync_enabled: val }, { onConflict: "user_id" })
      .select("user_id");
    if (error) {
      setGcalSync(!val);
      window.alert(`Could not change calendar sync: ${error.message}`);
    }
  }

  const ACCENT_MAP: Record<string, string> = {
    pastel: "#5ec9a3", navy: "#0EA5E9", charcoal: "#555555", forest: "#43A047",
    gunmetal: "#607D8B", purple: "#7B1FA2", orange: "#E64A19", rose: "#E91E63",
    blush: "#FF4D8D", lagoon: "#FF7A59", orchid: "#00B295", berry: "#5A4FCF",
    slatepop: "#FF6B6B", plumdusk: "#E0568A", carbonneon: "#FF5DA2", midnight: "#79C0FF",
  };

  return (
    <div className="space-y-8">

      {gcalBanner && (
        <div style={{ background: gcalBanner === 'connected' ? 'rgba(94,201,163,.15)' : 'rgba(248,113,113,.15)', border: '1px solid ' + (gcalBanner === 'connected' ? '#5ec9a3' : '#f87171'), borderRadius: 12, padding: '12px 16px', color: gcalBanner === 'connected' ? '#5ec9a3' : '#f87171', fontWeight: 600, fontSize: 14 }}>
          {gcalBanner === 'connected' ? 'Google Calendar connected successfully!' : 'Google Calendar connection failed. Please try again.'}
        </div>
      )}

      <SettingsGroup id="you" title="You" sub="Your name, photo, password, and how clients pay you" icon="ti-user" defaultOpen classic={classic}>
      {/* A trainer gets an EDITOR; everyone else keeps the read-only card.
          This card showed a trainer their own name and email as plain text and
          offered no way to change either — and nothing anywhere in the app
          wrote to the trainers table at all, so a trainer could not set a
          photo or a payment handle even in principle. Dustin, 21 Aug: "they
          need to be able to set it up on their own." */}
      {isTrainer && !isInClientMode ? (
        <TrainerProfileCard />
      ) : (
      <section>
        <p className="section-header">Profile</p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <AvatarSelf name={userName} size={48} radius={14} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate" style={{ color: "var(--brand-text)" }}>{userName || "—"}</p>
              <p className="text-sm truncate" style={{ color: "var(--brand-text-secondary)" }}>{userEmail}</p>
            </div>
          </div>
        </div>
      </section>
      )}

        <PaymentsSettingsCard />
        <BillingHistory />

      <section>
        <p className="section-header">Security</p>
        <div className="card p-4">
          <button onClick={() => { setShowChangePassword(!showChangePassword); setPasswordError(""); }} className="flex items-center gap-2 text-sm font-semibold w-full text-left" style={{ color: "var(--brand-text)" }}>
            <i className="ti ti-lock" style={{ color: "var(--brand-primary)" }} />
            Change Password
            <i className={"ti ti-chevron-" + (showChangePassword ? "up" : "down") + " ml-auto text-xs"} style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          {showChangePassword && (
            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} required />
              <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} required />
              {passwordError && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{passwordError}</p>}
              <button type="submit" disabled={updatingPassword} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))" }}>{updatingPassword ? "Updating..." : "Update Password"}</button>
            </form>
          )}
          {passwordSuccess && <p className="mt-3 text-xs font-semibold" style={{ color: "#22c55e" }}>Password updated successfully!</p>}
        </div>
      </section>
      </SettingsGroup>

      <SettingsGroup id="app" title="How the app behaves" sub="Sounds, notifications and colour" icon="ti-adjustments" classic={classic}>
      {/* Switches for the 2026-07-25 polish features: sound, vibration,
          leaderboard opt-in, check-in nudges, plus the trainer-only master
          switch that takes AI nudges live. */}
      <section>
        <p className="section-header">Experience</p>
        <ExperienceSettings isTrainer={isTrainer && !isInClientMode} isOwner={!!isOwner} />

      {/* Per-event push preferences. Sits directly under Experience because
          both answer "how does this app behave for me". */}
      <NotificationSettings isTrainer={isTrainer && !isInClientMode} />
      </section>

      <section>
        <p className="section-header">App Color Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => {
            // Schemes added 2026-08-01 carry a third colour of their own. The
            // older ones read theirs from ACCENT_MAP, which is a lookup table
            // that has to be edited by hand every time a theme is added — so
            // new themes carry their swatch colours inline instead and the map
            // is only a fallback for the ones already in it.
            const a1 = ("a" in t ? t.a : undefined) ?? ACCENT_MAP[t.id] ?? t.primary;
            const a2 = "a2" in t ? t.a2 : undefined;
            return (
              <button key={t.id} onClick={() => setTheme(t.id)} className="rounded-xl p-3 text-left transition-all" style={{ background: t.bg, border: "2px solid " + (theme === t.id ? t.primary : "transparent"), boxShadow: theme === t.id ? "0 0 0 3px " + t.primary + "30, 0 2px 8px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.06)", transform: theme === t.id ? "scale(1.03)" : "scale(1)" }}>
                <div className="w-8 h-8 rounded-lg mb-2 overflow-hidden flex">
                  <div className="flex-1" style={{ background: t.bg }} />
                  <div className="flex-1" style={{ background: t.primary }} />
                  <div className="flex-1" style={{ background: a1 }} />
                  {a2 && <div className="flex-1" style={{ background: a2 }} />}
                </div>
                <div className="text-xs font-semibold" style={{ color: t.primary }}>{t.label}</div>
                {theme === t.id && <div className="text-[10px] mt-0.5 font-medium" style={{ color: t.primary }}>✓ Active</div>}
              </button>
            );
          })}
        </div>

        {/* Depth & glow. Sits directly under the swatches because it changes
            how whichever scheme is selected above looks — putting it in its own
            distant section would make it read as unrelated. */}
        <div className="card p-4 mt-3">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
            Depth &amp; glow
          </p>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            Deepens your colour scheme and puts a glow behind each block.
            Purely visual — nothing moves or changes place.
          </p>
          {/* A segmented row rather than a slider: four named stops that each
              mean something, on a control you can hit with a thumb. A slider
              would imply values in between, and there are none. */}
          <div
            role="radiogroup"
            aria-label="Depth and glow strength"
            className="flex gap-1.5"
          >
            {DEPTH_LEVELS.map((lvl) => {
              const on = depth === lvl.value;
              return (
                <button
                  key={lvl.value}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDepth(lvl.value)}
                  className="flex-1 rounded-xl py-2 px-1 transition-all"
                  style={{
                    background: on ? "var(--brand-primary)" : "var(--brand-bg)",
                    border: "1px solid " + (on ? "var(--brand-primary)" : "var(--brand-border)"),
                    color: on ? "#fff" : "var(--brand-text)",
                    cursor: "pointer",
                  }}
                >
                  <span className="block text-sm font-bold">{lvl.label}</span>
                  <span
                    className="block text-[10px] font-medium mt-0.5"
                    style={{ color: on ? "rgba(255,255,255,0.78)" : "var(--brand-text-secondary)" }}
                  >
                    {lvl.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      </SettingsGroup>

      <SettingsGroup id="connect" title="Calendar and clients" sub="Google Calendar, invites, the install QR" icon="ti-plug" classic={classic}>
      {/* Adding a trainer landed in "Help and about" when Settings was
          regrouped on 22 Aug, purely because it sat next to the install QR in
          the old flat list. Dustin went looking for it and it was not where
          anybody would look. This group is the one about invites. */}
      {isTrainer && !isInClientMode && <AddTrainerCard />}
      {isTrainer && !isInClientMode && (
        <section>
          <p className="section-header">Integrations</p>
          <div className="card p-4 space-y-5">

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                    <i className="ti ti-brand-google mr-1.5" style={{ color: "#4285F4" }} />
                    Google Calendar Sync
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {gcalConnected ? "Connected — 2-way sync active" : "Not connected — click to authorize"}
                  </p>
                </div>
                {gcalConnected ? (
                  <div className="w-11 h-6 rounded-full relative transition-colors" style={{ background: gcalSync ? "var(--brand-primary)" : "var(--brand-border)", cursor: "pointer" }} onClick={() => toggleGcalSync(!gcalSync)}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: gcalSync ? "calc(100% - 20px)" : "4px" }} />
                  </div>
                ) : (
                  <a href="/api/auth/google" className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#4285F4", textDecoration: "none" }}>
                    Connect
                  </a>
                )}
              </div>
              {gcalConnected && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {gcalSync && <button
                    onClick={async () => {
                      const res = await fetch('/api/gcal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                      const j = await res.json();
                      alert('Sync complete: ' + (j.synced ?? 0) + ' sessions, ' + (j.payments ?? 0) + ' payments synced.');
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", cursor: "pointer" }}
                  >
                    Sync Now
                  </button>}
                  {gcalSync && <button
                    onClick={async () => {
                      if (!confirm('This will delete all app calendar events and re-sync from Google Calendar. Continue?')) return;
                      const res = await fetch('/api/gcal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
                      const j = await res.json();
                      alert('Reset sync complete: ' + (j.synced ?? 0) + ' sessions, ' + (j.payments ?? 0) + ' payments synced.');
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(248,113,113,.1)", border: "1px solid #f87171", color: "#f87171", cursor: "pointer" }}
                  >
                    Reset &amp; Re-sync
                  </button>}
                  {/* Rotating the Google credential used to mean finding this
                      app by name on Google's Linked apps page, which never had
                      a name to find. This revokes the grant at Google and
                      clears the stored tokens in one action. */}
                  <button
                    onClick={async () => {
                      if (!confirm('Disconnect Google Calendar?\n\nThis revokes the app\'s access at Google and deletes the stored token. Existing appointments stay in the app, but nothing will sync until you reconnect.')) return;
                      setDisconnecting(true);
                      try {
                        const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
                        const j = await res.json();
                        if (j.ok) { alert('Disconnected. Tap Connect to authorize again with a fresh token.'); router.refresh(); }
                        else { alert('Disconnect failed: ' + (j.error ?? 'unknown error')); }
                      } finally {
                        setDisconnecting(false);
                      }
                    }}
                    disabled={disconnecting}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "transparent", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", cursor: "pointer", opacity: disconnecting ? 0.5 : 1 }}
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              )}
            </div>

            <div className="divider" />

            {/* THIS WAS A SWITCH THAT DID NOT SWITCH ANYTHING.
                "Payment Reminder Notifications — notify clients in-app 1 week
                before payment due", with a toggle whose only action was
                setAutoReminders(!autoReminders): local React state, no write.
                Flip it, navigate away, it was back. The tutorial had a line
                warning new trainers about it, which is the wrong way round.

                It was not removed by wiring it to a column, because there is no
                automatic path behind it to switch on OR off — nothing sends a
                payment reminder on a schedule. /api/reminders/send runs when
                the trainer approves one, and that is the whole mechanism.
                Persisting the toggle would have made a feature that does not
                exist look configurable, which is worse than the dead switch.

                So the screen says what is actually true instead. */}
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                <i className="ti ti-bell mr-1.5" style={{ color: "var(--brand-accent)" }} />
                Payment reminders
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Nothing goes out on its own. You review each reminder on the Payments
                screen and send it — the client sees it in the app once you do.
              </p>
            </div>

          </div>
        </section>
        )}
      </SettingsGroup>

      <SettingsGroup id="bots" title="Bots and AI" sub="The walkthrough, and whether the AI is working" icon="ti-wand" classic={classic}>
      {/* TEST THE REST ALARM.
          It exists because the first version of this shipped, was tried in a
          real session, and did "1 tiny tiny chirp" — and finding that out cost
          a set and ninety seconds of waiting. Five seconds and a button is a
          better way to learn what a particular phone actually does with it.
          Everyone gets it, not just trainers: a client whose alarm is silent
          has the same problem and no way to describe it. */}
      <section>
        <p className="section-header">Rest timer</p>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <i className="ti ti-bell-ringing text-2xl" style={{ color: "var(--brand-primary)" }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Test the rest alarm</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Plays it exactly as it sounds between sets. It uses your media
                volume, so it still rings with the phone on vibrate — turn media
                volume up if you can&rsquo;t hear it.
              </span>
            </span>
            <button
              type="button"
              onClick={() => testRestAlarm()}
              className="btn btn-primary flex-shrink-0"
              style={{ padding: "9px 16px", fontSize: 13 }}
            >
              Test
            </button>
          </div>
        </div>
      </section>

      {/* The end-to-end walkthrough. Only appears once trainer_tutorial_live
          is on, which is why the card and the toggle are in different places:
          the toggle (Experience, trainer only) is how you turn it on, this is
          where a new trainer finds it afterwards. It sits above AI health
          because on somebody's first morning it is the only card that matters. */}
      {isTrainer && !isInClientMode && tutorialLive && (
        <section>
          <p className="section-header">{tutorialHidden ? "Setup guide" : "New here?"}</p>
          <a href="/tutorial" className="card p-4 flex items-center gap-3" style={{ textDecoration: "none" }}>
            <i className="ti ti-school text-2xl" style={{ color: "var(--brand-primary)" }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Set up your app</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Every screen, every setting, start to finish. It reads itself out loud and remembers where you stopped.
              </span>
            </span>
            <i className="ti ti-chevron-right" style={{ color: "var(--brand-text-secondary)" }} />
          </a>

          {/* Hiding is per trainer and reversible, so it belongs next to the
              card rather than behind the app-wide flag in Experience. This is
              the row that undoes it once the guide is off Home. */}
          {tutorialHidden === undefined ? null : (
            <button
              type="button"
              onClick={() => { void (tutorialHidden ? showTutorial() : hideTutorial()); }}
              className="mt-2 text-xs font-semibold"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brand-text-secondary)", textDecoration: "underline" }}
            >
              {tutorialHidden
                ? "Show it on my Home screen again"
                : "I'm done with it — hide it from Home and the sidebar"}
            </button>
          )}
        </section>
      )}

      {isTrainer && !isInClientMode && <TrainerBotSettings />}

      {isTrainer && !isInClientMode && <TrainerFaceSetCard />}

      {/* Is the AI actually working? Every AI surface in this app degrades
          quietly by design — a coach card that fails just does not appear — so
          the only way to find a dead one is to come and look. Trainer only.
          Sits above the QR because it is the one that needs checking. */}
      {isTrainer && !isInClientMode && (
        <section>
          <p className="section-header">AI</p>
          <a href="/settings/ai-health" className="card p-4 flex items-center gap-3" style={{ textDecoration: "none" }}>
            <i className="ti ti-activity-heartbeat text-2xl" style={{ color: "var(--brand-primary)" }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>AI health</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Every AI surface: what has run, what has failed, what has never been used, and the spend against the cap.
              </span>
            </span>
            <i className="ti ti-chevron-right" style={{ color: "var(--brand-text-secondary)" }} />
          </a>
        </section>
      )}
      </SettingsGroup>

      <SettingsGroup id="help" title="Help and about" sub="Getting clients started, help centre, app version" icon="ti-help" classic={classic}>

      {/* Where the install QR lives. Dustin asked "where do I find the qr code
          to have clients download this" — the per-client one only appears on a
          client who has never had a login, so this is the one that works for
          everybody, including the clients already using the app. */}
      <section>
        <p className="section-header">Getting clients set up</p>
        <a href="/install" className="card p-4 flex items-center gap-3" style={{ textDecoration: "none" }}>
          <i className="ti ti-qrcode text-2xl" style={{ color: "var(--brand-primary)" }} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Install QR code</span>
            <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              {isTrainer && !isInClientMode
                ? "Show this to a client and they scan it — works for new and existing clients alike."
                : "Put Symmetry on another phone, or add it to your home screen."}
            </span>
          </span>
          <i className="ti ti-chevron-right" style={{ color: "var(--brand-text-secondary)" }} />
        </a>
      </section>

      <HelpCenter isTrainer={isTrainer && !isInClientMode} />

      <section>
        <p className="section-header">About</p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>App Version</span>
            <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>1.0.0-beta</span>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Built by</span>
            <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Symmetry PT x Claude AI</span>
          </div>
        </div>
      </section>
      </SettingsGroup>

      <section style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={toggleClassic}
          style={{ background: "none", border: "none", padding: 4, cursor: "pointer",
                   font: "inherit", fontSize: 12, textDecoration: "underline",
                   color: "var(--brand-text-secondary)" }}
        >
          {classic ? "Use the new grouped settings" : "Use the old settings layout"}
        </button>
      </section>

      <section>
        <button onClick={handleSignOut} disabled={signingOut} className="btn btn-danger w-full" style={{ justifyContent: "center" }}>
          {signingOut ? <><i className="ti ti-loader animate-spin" />Signing out...</> : <><i className="ti ti-logout" />Sign Out</>}
        </button>
      </section>

    </div>
  );
}
