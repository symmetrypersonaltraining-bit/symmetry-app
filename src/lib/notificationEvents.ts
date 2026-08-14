// Every kind of push this app can send, in one list.
//
// Dustin, 13 Aug: "what they have a choice of and what i say is built in."
// That sentence is the whole design, so it is encoded here rather than
// re-decided at each send site: an event is either the client's to switch off
// or it is not, and the answer lives next to the event.
//
// Adding a push WITHOUT adding it here is impossible by construction —
// sendPushToUser takes a NotificationEvent, not a string, so a new caller has
// to name its event and therefore has to declare whether it is optional. The
// previous shape let any caller push with no preference check at all simply by
// not knowing preferences existed.

import { COACH_FIRST_NAME } from "@/lib/trainer";

export interface NotificationEventDef {
  /** Stored in notification_preferences.event_key. Never rename in place. */
  key: string;
  /** What a client sees on the settings screen. */
  label: string;
  /** The one-liner under it. */
  description: string;
  /**
   * FORCED events ignore preferences and always send.
   *
   * Keep this list as short as it can honestly be. Every forced event is a
   * reason for somebody to switch the app's notifications off at the OS level,
   * and that takes the payment reminders down with it.
   */
  forced?: boolean;
  /** Only ever sent to the trainer, so it stays off a client's settings screen. */
  trainerOnly?: boolean;
}

type EventName =
  | "MESSAGE_FROM_COACH"
  | "MESSAGE_FROM_CLIENT"
  | "ANNOUNCEMENT"
  | "GROUP_MESSAGE"
  | "REACTION_ON_MY_MESSAGE";

// Annotated rather than `as const`: with `as const` each value narrows to its
// own literal shape, so an event that happens not to set `forced` loses the
// property from its type entirely and the push gate cannot read it.
export const NOTIFICATION_EVENTS: Record<EventName, NotificationEventDef> = {
  MESSAGE_FROM_COACH: {
    key: "message_from_coach",
    label: `Messages from ${COACH_FIRST_NAME}`,
    description: "When your coach sends you a message.",
  },
  MESSAGE_FROM_CLIENT: {
    key: "message_from_client",
    label: "Messages from clients",
    description: "When a client messages you.",
    trainerOnly: true,
  },
  ANNOUNCEMENT: {
    key: "announcement",
    label: "Announcements",
    description: "Gym-wide news. These always come through.",
    // The one genuinely forced event. An announcement is already a full-screen
    // takeover in the app; if it is worth interrupting all 35 people for, it is
    // not something they opted out of last March and forgot about.
    forced: true,
  },
  GROUP_MESSAGE: {
    key: "group_message",
    label: "Group chat",
    description: "New messages in the group chat.",
  },
  REACTION_ON_MY_MESSAGE: {
    key: "reaction_on_my_message",
    label: "Reactions to your messages",
    description: "When someone reacts to something you posted.",
  },
};

export type NotificationEvent = NotificationEventDef;

/** Everything a client can see and toggle on the settings screen. */
export const CLIENT_FACING_EVENTS: NotificationEventDef[] =
  Object.values(NOTIFICATION_EVENTS).filter((e) => !e.trainerOnly);

export function eventByKey(key: string): NotificationEventDef | undefined {
  return Object.values(NOTIFICATION_EVENTS).find((e) => e.key === key);
}
