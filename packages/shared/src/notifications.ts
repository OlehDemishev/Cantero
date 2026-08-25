import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export const EMAIL_DIGEST_FREQUENCIES = ["off", "daily", "weekly"] as const;
export type EmailDigestFrequency = (typeof EMAIL_DIGEST_FREQUENCIES)[number];

export const updateNotificationPreferencesSchema = z.object({
  emailDigestFrequency: z.enum(EMAIL_DIGEST_FREQUENCIES),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

export const markNotificationReadSchema = z.object({
  notificationKey: z.string().min(1),
});
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;

export const markAllNotificationsReadSchema = z.object({
  notificationKeys: z.array(z.string().min(1)).max(200),
});
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadSchema>;
