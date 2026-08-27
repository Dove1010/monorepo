/**
 * Notification channels, templates, and per-user preferences — issue #906.
 *
 * Defines the canonical notification channel and template enums and an
 * in-memory store of per-user, per-template channel opt-outs. By default every
 * channel is enabled for every template; users opt out of specific
 * (template, channel) pairs (e.g. no email for `payment_due`).
 */

export type NotificationChannel = "in_app" | "email" | "push";

export const ALL_CHANNELS: NotificationChannel[] = ["in_app", "email", "push"];

export type NotificationTemplate =
  | "deal_status_changed"
  | "payment_due"
  | "payment_received"
  | "payment_overdue"
  | "kyc_approved"
  | "kyc_rejected"
  | "lease_signing_requested"
  | "lease_fully_signed"
  | "dispute_filed"
  | "dispute_resolved"
  | "reward_validated"
  | "inspection_assigned"
  | "message_received";

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  "deal_status_changed",
  "payment_due",
  "payment_received",
  "payment_overdue",
  "kyc_approved",
  "kyc_rejected",
  "lease_signing_requested",
  "lease_fully_signed",
  "dispute_filed",
  "dispute_resolved",
  "reward_validated",
  "inspection_assigned",
  "message_received",
];

/** A single opt-out: the user does not want `template` delivered on `channel`. */
export interface ChannelOptOut {
  template: NotificationTemplate;
  channel: NotificationChannel;
}

export interface NotificationPreferences {
  userId: string;
  optOuts: ChannelOptOut[];
}

export class InMemoryNotificationPreferenceStore {
  private prefs = new Map<string, ChannelOptOut[]>();

  /** Returns the user's preferences (empty opt-out list when none stored). */
  get(userId: string): NotificationPreferences {
    return { userId, optOuts: [...(this.prefs.get(userId) ?? [])] };
  }

  /** Is `channel` enabled for `template` for this user? Defaults to enabled. */
  isChannelEnabled(
    userId: string,
    template: NotificationTemplate,
    channel: NotificationChannel,
  ): boolean {
    const optOuts = this.prefs.get(userId) ?? [];
    return !optOuts.some((o) => o.template === template && o.channel === channel);
  }

  optOut(userId: string, template: NotificationTemplate, channel: NotificationChannel): void {
    const optOuts = this.prefs.get(userId) ?? [];
    if (!optOuts.some((o) => o.template === template && o.channel === channel)) {
      optOuts.push({ template, channel });
    }
    this.prefs.set(userId, optOuts);
  }

  optIn(userId: string, template: NotificationTemplate, channel: NotificationChannel): void {
    const optOuts = (this.prefs.get(userId) ?? []).filter(
      (o) => !(o.template === template && o.channel === channel),
    );
    this.prefs.set(userId, optOuts);
  }

  reset(userId?: string): void {
    if (userId) this.prefs.delete(userId);
    else this.prefs.clear();
  }
}

export const notificationPreferenceStore = new InMemoryNotificationPreferenceStore();
