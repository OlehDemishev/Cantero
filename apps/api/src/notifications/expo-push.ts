/**
 * Expo Push Service client — how notifications reach the Cantero Field app: Expo relays each message
 * to APNs (iOS) or FCM (Android). Contract from docs.expo.dev/push-notifications/sending-notifications
 * (retrieved 2026-09-21): POST up to 100 messages per request; the response's `data` is one ticket per
 * message, in order; a ticket or a later receipt with details.error "DeviceNotRegistered" means stop
 * sending to that token. Receipts are fetched ~15 minutes after sending and expire after 24 hours.
 */

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
export const EXPO_MAX_MESSAGES_PER_REQUEST = 100;
/** "We recommend checking push receipts 15 minutes after sending". */
export const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const RECEIPT_IDS_PER_REQUEST = 300;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped, to open the right screen. */
  data: Record<string, string>;
  sound: "default";
  priority: "default" | "normal" | "high";
  /** Android: the channel the app creates at startup. */
  channelId: string;
}

export type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
export type ExpoReceipt = { status: "ok" } | { status: "error"; message: string; details?: { error?: string } };

export class ExpoPushError extends Error {}

function headers(accessToken: string | undefined): Record<string, string> {
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    // Only needed when "enhanced push security" is turned on for the Expo project.
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

/** Sends messages in chunks of 100; returns one ticket per message, in the same order. */
export async function sendExpoPush(messages: ExpoMessage[], accessToken?: string): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_MAX_MESSAGES_PER_REQUEST) {
    const chunk = messages.slice(i, i + EXPO_MAX_MESSAGES_PER_REQUEST);
    const res = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: { message: string }[] } | null;
    if (!res.ok || !Array.isArray(json?.data) || json.data.length !== chunk.length) {
      throw new ExpoPushError(`Expo push send failed (${res.status})${json?.errors?.[0]?.message ? `: ${json.errors[0].message}` : ""}`);
    }
    tickets.push(...json.data);
  }
  return tickets;
}

export async function fetchExpoReceipts(ticketIds: string[], accessToken?: string): Promise<Record<string, ExpoReceipt>> {
  const receipts: Record<string, ExpoReceipt> = {};
  // Same chunk size Expo's own server SDK (expo-server-sdk) uses for receipt lookups.
  for (let i = 0; i < ticketIds.length; i += RECEIPT_IDS_PER_REQUEST) {
    const res = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({ ids: ticketIds.slice(i, i + RECEIPT_IDS_PER_REQUEST) }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { data?: Record<string, ExpoReceipt> } | null;
    if (!res.ok || !json?.data) throw new ExpoPushError(`Expo push receipts failed (${res.status})`);
    Object.assign(receipts, json.data);
  }
  return receipts;
}

export const isDeviceGone = (r: ExpoTicket | ExpoReceipt): boolean => r.status === "error" && r.details?.error === "DeviceNotRegistered";
