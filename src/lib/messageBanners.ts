// Which in-app banners a poll of the unread counts should raise.
//
// Extracted from MessageNotifier so the routing rule is unit-testable — this is
// the code that decides whether tapping a banner lands you in the GROUP thread
// or the private 1:1 trainer thread, and it got that wrong once already
// (feedback 626775f9 verification, 2026-07-31).
//
// The rule that broke: the old version compared groupDelta to directDelta and
// rendered whichever won. One group message arriving alongside two direct
// messages in the same 15s window produced a single "2 new messages" banner
// pointing at /messages — the group message vanished, and because the watermark
// advanced anyway it was never announced again.
//
// The rule now: group and direct are DIFFERENT THREADS, so one can never stand
// in for the other. Every thread that gained messages gets its own banner.

export type Banner = {
  text: string;
  href: string;
  /**
   * A person wrote it, so announce it loudly.
   *
   * Dustin, 16 Aug: "the in app notifications for messages I personally send I
   * want more aggressive and obvious so they dont miss those when they do get
   * on the app. Just the ones personally from me in group or to them need to
   * get their attention."
   *
   * The distinction is `messages.sender_kind`: 'coachbot' when the app wrote it,
   * null when a human did. Both land in the same threads, and until now both
   * raised exactly the same 6-second banner — so a nightly automated nudge was
   * given the same weight as something he sat down and typed. Spending the loud
   * treatment on the nudges is precisely how the loud treatment stops working.
   */
  fromPerson?: boolean;
  /**
   * Which notification_preferences row decides whether this may interrupt.
   *
   * Carried on the banner rather than worked out at display time because the
   * banner is built from a feed item that knows its kind, and the thing that
   * shows it does not. Undefined means "no preference governs this" — it shows.
   *
   * 26 Aug: banners had no such field and consulted no preference at all, so a
   * client who had switched the group chat off in Settings still got a
   * full-width banner over her workout for every group post. See MessageNotifier.
   */
  eventKey?: string;
};

export function bannersForDelta(opts: {
  groupDelta: number;
  directDelta: number;
  isClientMode: boolean;
}): Banner[] {
  const { groupDelta, directDelta, isClientMode } = opts;
  const out: Banner[] = [];
  // Group first: a community post is the one a client is most likely to want to
  // see, and it's the one that used to get dropped.
  if (groupDelta > 0) {
    out.push({
      text: groupDelta > 1 ? `${groupDelta} new group messages` : "New group message",
      href: isClientMode ? "/messages?client=group&as=client" : "/messages?client=group",
    });
  }
  if (directDelta > 0) {
    out.push({
      text: directDelta > 1 ? `${directDelta} new messages` : "New message",
      href: isClientMode ? "/messages?as=client" : "/messages",
    });
  }
  return out;
}
