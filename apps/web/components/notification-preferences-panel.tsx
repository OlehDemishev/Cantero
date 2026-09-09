"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NOTIFICATION_TYPES, type NotificationType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { isPushSupported, getExistingSubscription, enablePush, disablePush } from "@/lib/push";
import { resetStateInEffect } from "@/lib/effect-reset";

/** Three small, independent account-notification cards (push, email digest, muted types) — kept
 * in one file since they share the "account" tab and the same `me` data, not because they're one
 * feature. */
export function NotificationPreferencesPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [pushStatus, setPushStatus] = useState<"checking" | "unsupported" | "enabled" | "disabled">(() =>
    isPushSupported() ? "checking" : "unsupported",
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [digestFrequency, setDigestFrequency] = useState<"off" | "daily" | "weekly">("off");
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [mutedTypes, setMutedTypes] = useState<NotificationType[]>([]);
  const [mutedTypesBusy, setMutedTypesBusy] = useState(false);
  const [mutedTypesSaved, setMutedTypesSaved] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => setPushStatus(sub ? "enabled" : "disabled"));
  }, []);

  useEffect(() => {
    if (me) {
      resetStateInEffect(() => {
        setDigestFrequency(me.emailDigestFrequency);
        setMutedTypes(me.mutedNotificationTypes as NotificationType[]);
      });
    }
  }, [me]);

  async function togglePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushStatus === "enabled") {
        await disablePush();
        setPushStatus("disabled");
      } else {
        await enablePush();
        setPushStatus("enabled");
      }
    } catch (err) {
      setPushError(err instanceof Error && err.message === "denied" ? t("pushPermissionDenied") : tc("error"));
    } finally {
      setPushBusy(false);
    }
  }

  async function saveDigestFrequency(next: "off" | "daily" | "weekly") {
    setDigestFrequency(next);
    setDigestBusy(true);
    setDigestSaved(false);
    try {
      await apiFetch("/me/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({ emailDigestFrequency: next }),
      });
      setDigestSaved(true);
      setTimeout(() => setDigestSaved(false), 2000);
    } finally {
      setDigestBusy(false);
    }
  }

  async function toggleMutedType(type: NotificationType) {
    const next = mutedTypes.includes(type) ? mutedTypes.filter((t) => t !== type) : [...mutedTypes, type];
    setMutedTypes(next);
    setMutedTypesBusy(true);
    setMutedTypesSaved(false);
    try {
      await apiFetch("/me/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({ mutedNotificationTypes: next }),
      });
      setMutedTypesSaved(true);
      setTimeout(() => setMutedTypesSaved(false), 2000);
    } finally {
      setMutedTypesBusy(false);
    }
  }

  return (
    <>
      {pushStatus !== "unsupported" && (
        <section className="card mt-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("pushNotifications")}</h2>
          <p className="mb-4 text-xs text-gray-500">{t("pushNotificationsHint")}</p>
          {pushError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pushError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePush}
              disabled={pushBusy || pushStatus === "checking"}
              className={pushStatus === "enabled" ? "btn-secondary" : "btn-primary"}
            >
              {pushBusy
                ? tc("loading")
                : pushStatus === "enabled"
                  ? t("disablePush")
                  : t("enablePush")}
            </button>
            {pushStatus === "enabled" && <span className="text-sm text-green-700">{t("pushEnabled")}</span>}
          </div>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("emailDigest")}</h2>
        <p className="mb-4 text-xs text-gray-500">{t("emailDigestHint")}</p>
        <div className="flex items-center gap-3">
          <select
            className="input w-auto"
            value={digestFrequency}
            disabled={digestBusy}
            onChange={(e) => saveDigestFrequency(e.target.value as "off" | "daily" | "weekly")}
          >
            <option value="off">{t("digestOff")}</option>
            <option value="daily">{t("digestDaily")}</option>
            <option value="weekly">{t("digestWeekly")}</option>
          </select>
          {digestSaved && <span className="text-sm text-green-700">{tc("saved")}</span>}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("mutedNotificationTypes")}</h2>
        <p className="mb-4 text-xs text-gray-500">{t("mutedNotificationTypesHint")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NOTIFICATION_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!mutedTypes.includes(type)}
                disabled={mutedTypesBusy}
                onChange={() => toggleMutedType(type)}
              />
              {t(`notificationType_${type}`)}
            </label>
          ))}
        </div>
        {mutedTypesSaved && <span className="mt-2 inline-block text-sm text-green-700">{tc("saved")}</span>}
      </section>
    </>
  );
}
