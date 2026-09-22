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

/** An Expo push token, as expo-notifications' getExpoPushTokenAsync() returns it. */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
export const DEVICE_PLATFORMS = ["ios", "android"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const registerDeviceSchema = z.object({
  token: z.string().max(200).regex(EXPO_PUSH_TOKEN_PATTERN, "Not an Expo push token"),
  platform: z.enum(DEVICE_PLATFORMS),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z.object({ token: z.string().max(200) });
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;

export const EMAIL_DIGEST_FREQUENCIES = ["off", "daily", "weekly"] as const;
export type EmailDigestFrequency = (typeof EMAIL_DIGEST_FREQUENCIES)[number];

/** Every NotificationsService.NotificationItem["type"] value — kept in sync manually since the
 * type union lives in the API (deriving it here would need the API to depend on shared, not the
 * other way around). A member can mute any subset of these. */
export const NOTIFICATION_TYPES = [
  "low_stock",
  "reminder_due",
  "invoice_overdue",
  "rfi_open",
  "punch_list_open",
  "submittal_pending",
  "safety_incident",
  "warranty_claim_open",
  "mention",
  "subcontractor_document_expiring",
  "supplier_document_expiring",
  "worker_certification_expiring",
  "permit_expiring",
  "company_document_expiring",
  "weather_risk",
  "budget_overrun",
  "cost_code_overrun",
  "material_price_changed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const updateNotificationPreferencesSchema = z.object({
  emailDigestFrequency: z.enum(EMAIL_DIGEST_FREQUENCIES).optional(),
  mutedNotificationTypes: z.array(z.enum(NOTIFICATION_TYPES)).optional(),
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
