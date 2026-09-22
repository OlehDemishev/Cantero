import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { apiFetch } from "./api-client";

/** Must match ANDROID_CHANNEL_ID in the API's push.service.ts — the channel its messages name. */
const ANDROID_CHANNEL_ID = "alerts";

// Show alerts that arrive while the app is open, too: a crew lead mid-form still wants to know.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken: string | null = null;

export type PushRegistration = "registered" | "denied" | "unavailable";

/**
 * Asks for permission (once — the OS remembers the answer) and registers this phone's Expo push
 * token with the API for the signed-in member. "unavailable" covers the simulator, which gets no
 * push token, and a build without an EAS project id, which Expo needs to issue one (`eas init`).
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) return "unavailable";
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return "unavailable";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Project alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denied";

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiFetch("/notifications/push/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform: Platform.OS === "ios" ? "ios" : "android" }),
  });
  registeredToken = token;
  return "registered";
}

/** On sign-out, before the token is cleared, so a shared phone stops getting this worker's alerts. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await apiFetch("/notifications/push/devices/unregister", { method: "POST", body: JSON.stringify({ token }) }).catch(() => {});
}

/** Field-screen tab an alert type belongs to; anything else just opens its project. */
const TAB_FOR_TYPE: Record<string, string> = {
  rfi_open: "rfi",
  punch_list_open: "punch",
  low_stock: "stock",
  weather_risk: "logs",
};

export interface PushTarget {
  projectId?: string;
  tab?: string;
}

export function targetFor(data: unknown): PushTarget {
  const d = (data ?? {}) as { projectId?: unknown; type?: unknown };
  return {
    ...(typeof d.projectId === "string" ? { projectId: d.projectId } : {}),
    ...(typeof d.type === "string" && TAB_FOR_TYPE[d.type] ? { tab: TAB_FOR_TYPE[d.type] } : {}),
  };
}

/** Calls `onTarget` when the person opens the app from a notification — also when that tap is
 * what launched the app. Each notification is acted on once. */
export function usePushNavigation(onTarget: (target: PushTarget) => void) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const callback = useRef(onTarget);
  callback.current = onTarget;

  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    callback.current(targetFor(last.notification.request.content.data));
  }, [last]);
}
